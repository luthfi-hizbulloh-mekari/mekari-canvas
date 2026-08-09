#!/usr/bin/env bash
# Mekari Canvas CLI — Agent publish helper
set -euo pipefail

CONFIG="${HOME}/.canvas/config.json"
MANIFEST_FILE="${HOME}/.canvas/publish-manifest.json"
DEFAULT_MANIFEST_URL="https://mekari-canvas.vercel.app/setup/manifest.json"
TOKEN_VALID=0
TOKEN_REJECTED=1
TOKEN_INCONCLUSIVE=2
CURL_API=(--connect-timeout 10 --max-time 60)
CURL_UPLOAD=(--connect-timeout 10 --speed-limit 1024 --speed-time 120)

die() { echo "mekari-canvas: $*" >&2; exit 1; }

is_api_base() {
  [[ "$1" =~ ^https?://[^/?#[:space:]]+$ ]] && return 0
  return 1
}

require_jq() {
  command -v jq >/dev/null 2>&1 || die "jq is required"
}

load_config() {
  require_jq
  [[ -f "$CONFIG" ]] || die "not set up — run: mekari-canvas setup <code>"
  API_BASE=$(jq -r '.apiBase // empty' "$CONFIG")
  TOKEN=$(jq -r '.token // empty' "$CONFIG")
  [[ -n "$API_BASE" && -n "$TOKEN" ]] || die "invalid config at $CONFIG"
}

http() {
  local method="$1" url="$2" body_file error_file
  shift 2
  body_file=$(mktemp)
  error_file=$(mktemp)
  HTTP_ERROR=""
  HTTP_STATUS=$(curl -sS -o "$body_file" -w '%{http_code}' -X "$method" "$@" "$url" 2>"$error_file") || {
    HTTP_ERROR=$(<"$error_file")
    HTTP_ERROR=${HTTP_ERROR//"$url"/[request URL]}
    if [[ -n "${TOKEN:-}" ]]; then HTTP_ERROR=${HTTP_ERROR//"$TOKEN"/[redacted]}; fi
    rm -f "$body_file" "$error_file"; HTTP_STATUS=000; HTTP_BODY=""; return 1
  }
  HTTP_BODY=$(<"$body_file")
  rm -f "$body_file" "$error_file"
}

error_message() { # body fallback
  jq -r --arg fallback "$2" \
    'if type == "object" and (.error | type) == "string" and (.error | length) > 0
     then .error else $fallback end' <<<"$1" 2>/dev/null || printf '%s' "$2"
}

api() {
  local method="$1" path="$2" message
  shift 2
  if ! http "$method" "$API_BASE$path" "${CURL_API[@]}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "$@"; then
    die "request failed (HTTP $HTTP_STATUS; $method $path): $HTTP_ERROR"
  fi
  if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
    message=$(error_message "$HTTP_BODY" "request failed")
    die "$message (HTTP $HTTP_STATUS; $method $path)"
  fi
  printf '%s' "$HTTP_BODY"
}

detect_kind() {
  local file="$1"
  local extension
  extension=$(printf '%s' "${file##*.}" | tr '[:upper:]' '[:lower:]')
  case "$extension" in
    md) echo md ;;
    html|htm) echo html ;;
    zip) echo trace ;;
    *)
      if head -c 2048 "$file" | grep -qiE '<html|<!DOCTYPE'; then echo html; else echo md; fi
    ;;
  esac
}

publish_request() {
  local payload="$1"
  if ! http POST "$API_BASE/api/publish" "${CURL_API[@]}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload"; then
    die "publish failed (HTTP $HTTP_STATUS; POST /api/publish): $HTTP_ERROR"
  fi
}

stage_trace_upload() {
  local file="$1" upload upload_id upload_url
  upload=$(api POST /api/trace-uploads)
  upload_id=$(echo "$upload" | jq -r '.uploadId // empty')
  upload_url=$(echo "$upload" | jq -r '.uploadUrl // empty')
  [[ -n "$upload_id" && -n "$upload_url" ]] || die "invalid trace upload response"
  local upload_auth=()
  if [[ "$upload_url" == "$API_BASE/api/trace-uploads/"* ]]; then
    upload_auth=(-H "Authorization: Bearer $TOKEN")
  fi
  if ! http PUT "$upload_url" "${CURL_UPLOAD[@]}" \
    ${upload_auth[@]+"${upload_auth[@]}"} \
    -H "Content-Type: application/zip" --upload-file "$file"; then
    die "trace upload failed (HTTP $HTTP_STATUS)"
  fi
  if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
    die "trace upload failed (HTTP $HTTP_STATUS)"
  fi
  printf '%s' "$upload_id"
}

abs_path() {
  local file="$1"
  printf '%s/%s' "$(cd "$(dirname "$file")" && pwd)" "$(basename "$file")"
}

manifest_update() { # jq args...
  local tmp
  mkdir -p "$(dirname "$MANIFEST_FILE")"
  [[ -f "$MANIFEST_FILE" ]] || echo '{}' > "$MANIFEST_FILE"
  tmp=$(mktemp)
  if ! jq "$@" "$MANIFEST_FILE" > "$tmp"; then
    rm -f "$tmp"
    die "could not update $MANIFEST_FILE"
  fi
  mv "$tmp" "$MANIFEST_FILE"
}

read_manifest_slug() {
  local file="$1"
  require_jq
  [[ -f "$MANIFEST_FILE" ]] || return 1
  local abs
  abs=$(abs_path "$file")
  jq -r --arg p "$abs" '.[$p] // empty' "$MANIFEST_FILE"
}

write_manifest_slug() {
  local file="$1" slug="$2"
  require_jq
  local abs
  abs=$(abs_path "$file")
  manifest_update --arg p "$abs" --arg s "$slug" '.[$p] = $s'
}

remove_manifest_slug() {
  local slug="$1"
  require_jq
  [[ -f "$MANIFEST_FILE" ]] || return 0
  manifest_update --arg s "$slug" 'with_entries(select(.value != $s))'
}

write_config() {
  local api_base="$1" token="$2" config_dir tmp
  config_dir=$(dirname "$CONFIG")
  mkdir -p "$config_dir"
  tmp=$(mktemp "$config_dir/.config.json.XXXXXX")

  if [[ -f "$CONFIG" ]]; then
    if ! jq --arg apiBase "$api_base" --arg token "$token" \
      '. + {apiBase: $apiBase, token: $token}' "$CONFIG" > "$tmp"; then
      rm -f "$tmp"
      die "could not update config at $CONFIG"
    fi
  else
    if ! jq -n --arg apiBase "$api_base" --arg token "$token" \
      '{apiBase: $apiBase, token: $token}' > "$tmp"; then
      rm -f "$tmp"
      die "could not create config at $CONFIG"
    fi
  fi

  if ! chmod 600 "$tmp" || ! mv "$tmp" "$CONFIG"; then
    rm -f "$tmp"
    die "could not secure config at $CONFIG"
  fi
}

validate_saved_token() {
  local api_base="$1" token="$2"
  if ! http GET "$api_base/api/shares" "${CURL_API[@]}" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json"; then
    return "$TOKEN_INCONCLUSIVE"
  fi
  if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
    return "$TOKEN_VALID"
  fi
  if [[ "$HTTP_STATUS" == 401 || "$HTTP_STATUS" == 403 ]]; then
    return "$TOKEN_REJECTED"
  fi
  return "$TOKEN_INCONCLUSIVE"
}

cmd_setup() {
  local code="${1:-}" manifest_url="${2:-}"
  [[ -n "$code" ]] || die "usage: mekari-canvas setup <code> [manifest-url]"
  require_jq

  if [[ -z "$manifest_url" ]]; then
    manifest_url="$DEFAULT_MANIFEST_URL"
  fi
  [[ "$manifest_url" =~ ^https?://[^/?#[:space:]]+([/?#].*)?$ ]] \
    || die "invalid setup manifest URL"

  local existing_api_base="" existing_token=""
  if [[ -f "$CONFIG" ]]; then
    jq -e 'type == "object"' "$CONFIG" >/dev/null 2>&1 \
      || die "invalid JSON config at $CONFIG"
    existing_api_base=$(jq -r \
      'if (.apiBase | type) == "string" then .apiBase else empty end' "$CONFIG")
    existing_token=$(jq -r \
      'if (.token | type) == "string" then .token else empty end' "$CONFIG")
  fi

  if [[ -n "$existing_api_base" && -n "$existing_token" ]]; then
    existing_api_base=${existing_api_base%/}
    if ! is_api_base "$existing_api_base"; then
      echo "Existing Publisher API config has an invalid API base; exchanging the new Setup code." >&2
      existing_api_base=""
    fi
  fi

  if [[ -n "$existing_api_base" && -n "$existing_token" ]]; then
    local validation_result
    validate_saved_token "$existing_api_base" "$existing_token" \
      && validation_result=$TOKEN_VALID \
      || validation_result=$?
    case "$validation_result" in
      "$TOKEN_VALID")
        chmod 600 "$CONFIG"
        echo "Setup complete. Existing Publisher API token is valid and was preserved."
        return 0
        ;;
      "$TOKEN_REJECTED")
        echo "Existing Publisher API token was rejected; exchanging the new Setup code." >&2
        ;;
      "$TOKEN_INCONCLUSIVE")
        chmod 600 "$CONFIG"
        echo "Could not validate the existing Publisher API token; it was preserved and the Setup code was not exchanged." >&2
        return 0
        ;;
      *)
        die "unexpected token validation result: $validation_result"
        ;;
    esac
  fi

  local manifest api_base exchange_url
  if ! http GET "$manifest_url" "${CURL_API[@]}"; then
    die "could not fetch setup manifest"
  fi
  [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]] \
    || die "could not fetch setup manifest (HTTP $HTTP_STATUS)"
  manifest="$HTTP_BODY"
  api_base=$(jq -er \
    'select(type == "object") | .apiBase | select(type == "string" and length > 0)' \
    <<<"$manifest") || die "invalid setup manifest"
  exchange_url=$(jq -er \
    'select(type == "object") | .exchangeUrl | select(type == "string" and length > 0)' \
    <<<"$manifest") || die "invalid setup manifest"
  api_base=${api_base%/}
  is_api_base "$api_base" || die "invalid API base in setup manifest"
  [[ "$exchange_url" == /* && "$exchange_url" != //* ]] \
    || die "invalid exchange URL in setup manifest"

  local payload response token response_api_base
  payload=$(jq -n --arg code "$code" \
    '{code: $code, label: "Mekari Canvas (shared)"}')
  if ! http POST "$api_base$exchange_url" "${CURL_API[@]}" \
    -H "Content-Type: application/json" \
    -d "$payload"; then
    die "could not reach setup exchange"
  fi
  response="$HTTP_BODY"
  if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
    local message
    message=$(error_message "$response" "setup exchange failed")
    die "$message (HTTP $HTTP_STATUS)"
  fi

  token=$(jq -r \
    'if type == "object" and (.token | type) == "string" then .token else empty end' \
    <<<"$response") || die "invalid setup exchange response"
  response_api_base=$(jq -r \
    'if type == "object" and (.apiBase | type) == "string" then .apiBase else empty end' \
    <<<"$response") || die "invalid setup exchange response"
  [[ -n "$token" ]] || die "invalid setup exchange response"
  if [[ -n "$response_api_base" ]]; then
    api_base=${response_api_base%/}
    is_api_base "$api_base" || die "invalid API base in setup exchange response"
  fi

  write_config "$api_base" "$token"
  echo "Setup complete. Shared Publisher API token saved to $CONFIG"
}

publish_payload() { # Empty kind means Title-only; title_set distinguishes omit from clear.
  local kind="$1" ref="$2" edit_slug="$3" title="$4" title_set="$5" base
  if [[ "$kind" == trace ]]; then
    base=$(jq -n --arg uploadId "$ref" '{kind: "trace", uploadId: $uploadId}')
  elif [[ -n "$kind" ]]; then
    base=$(jq -n --arg content "$ref" --arg kind "$kind" '{content: $content, kind: $kind}')
  else
    base='{}'
  fi
  jq -n --argjson base "$base" --arg slug "$edit_slug" --arg title "$title" \
    --argjson titleSet "$title_set" \
    '$base
      + (if $slug == "" then {} else {editSlug: $slug} end)
      + (if $titleSet then {title: $title} else {} end)'
}

cmd_publish() {
  local force_new=false edit_slug="" title="" title_set=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --new) force_new=true; shift ;;
      --title)
        [[ $# -ge 2 ]] || die "--title requires a value"
        title="$2"; title_set=true; shift 2
        ;;
      -*) die "unknown flag: $1" ;;
      *) break ;;
    esac
  done
  local file="${1:-}"
  [[ -n "$file" && -f "$file" ]] || die "usage: mekari-canvas publish [--new] [--title <title>] <file>"

  load_config
  local kind slug upload_id="" content=""
  kind=$(detect_kind "$file")

  if [[ "$force_new" == false ]]; then
    edit_slug=$(read_manifest_slug "$file" || true)
  fi

  if [[ "$kind" == trace ]]; then
    upload_id=$(stage_trace_upload "$file")
  else
    content=$(<"$file")
  fi

  local payload
  payload=$(publish_payload "$kind" "${upload_id:-$content}" "$edit_slug" "$title" "$title_set")
  publish_request "$payload"
  local error_code
  error_code=$(echo "$HTTP_BODY" | jq -r '.code // empty' 2>/dev/null || true)
  if [[ "$HTTP_STATUS" == 404 && "$error_code" == share_not_found && -n "$edit_slug" ]]; then
    remove_manifest_slug "$edit_slug"
    edit_slug=""
    if [[ "$kind" == trace ]]; then
      # The failed commit consumes its immutable staged upload; retry with a fresh one.
      upload_id=$(stage_trace_upload "$file")
    fi
    payload=$(publish_payload "$kind" "${upload_id:-$content}" "" "$title" "$title_set")
    publish_request "$payload"
  fi
  if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
    local message
    message=$(error_message "$HTTP_BODY" "publish failed")
    die "$message (HTTP $HTTP_STATUS)"
  fi

  slug=$(echo "$HTTP_BODY" | jq -r '.slug // empty')
  [[ -n "$slug" ]] || die "invalid publish response"
  write_manifest_slug "$file" "$slug"
  echo "${API_BASE}/s/${slug}"
}

cmd_list() {
  load_config
  api GET /api/shares \
    | jq -r '.shares[] | [.slug, (.title // ""), .kind, .updatedAt, (.expiresAt // "permanent")] | @tsv' \
    | column -t -s $'\t'
}

cmd_delete() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "usage: mekari-canvas delete <slug>"
  load_config
  api DELETE "/api/shares/${slug}"
  remove_manifest_slug "$slug"
  echo "deleted /s/${slug}"
}

cmd_edit() {
  local slug="${1:-}" title="" title_set=false file=""
  [[ -n "$slug" ]] || die "usage: mekari-canvas edit <slug> [--title <title>] [file]"
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title)
        [[ $# -ge 2 ]] || die "--title requires a value"
        title="$2"; title_set=true; shift 2
        ;;
      -*) die "unknown flag: $1" ;;
      *)
        [[ -z "$file" ]] || die "usage: mekari-canvas edit <slug> [--title <title>] [file]"
        file="$1"; shift
        ;;
    esac
  done
  [[ "$title_set" == true || -n "$file" ]] \
    || die "edit requires --title or an Artifact file"
  [[ -z "$file" || -f "$file" ]] || die "Artifact file not found: $file"

  load_config
  local kind="" upload_id="" content="" payload published_slug
  if [[ -n "$file" ]]; then
    kind=$(detect_kind "$file")
    if [[ "$kind" == trace ]]; then
      upload_id=$(stage_trace_upload "$file")
    else
      content=$(<"$file")
    fi
  fi

  payload=$(publish_payload "$kind" "${upload_id:-$content}" "$slug" "$title" "$title_set")
  publish_request "$payload"
  if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
    local message
    message=$(error_message "$HTTP_BODY" "edit failed")
    die "$message (HTTP $HTTP_STATUS)"
  fi

  published_slug=$(echo "$HTTP_BODY" | jq -r '.slug // empty')
  [[ -n "$published_slug" ]] || die "invalid publish response"
  if [[ -n "$file" ]]; then
    write_manifest_slug "$file" "$published_slug"
  fi
  echo "${API_BASE}/s/${published_slug}"
}

usage() {
  cat <<EOF
mekari-canvas — Mekari Canvas Agent publish

  setup <code> [manifest-url]   Reuse or exchange the shared Publisher API token
  publish [--new] [--title T] <file>     Publish or auto-Edit Share
  edit <slug> [--title T] [file]         Edit Title and/or Artifact
  list                          List your Shares
  delete <slug>                 Delete a Share
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    setup) cmd_setup "$@" ;;
    publish) cmd_publish "$@" ;;
    list) cmd_list "$@" ;;
    delete) cmd_delete "$@" ;;
    edit) cmd_edit "$@" ;;
    ""|help|-h|--help) usage ;;
    *) die "unknown command: $cmd (try: mekari-canvas help)" ;;
  esac
}

main "$@"
