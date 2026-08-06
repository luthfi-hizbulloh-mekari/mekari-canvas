#!/usr/bin/env bash
# Mekari Canvas CLI — Agent publish helper
set -euo pipefail

CONFIG="${HOME}/.canvas/config.json"
MANIFEST_FILE="${HOME}/.canvas/publish-manifest.json"
DEFAULT_MANIFEST_URL="https://mekari-canvas.vercel.app/setup/manifest.json"
TOKEN_VALID=0
TOKEN_REJECTED=1
TOKEN_INCONCLUSIVE=2

die() { echo "mekari-canvas: $*" >&2; exit 1; }

is_api_base() {
  [[ "$1" =~ ^https?://[^/?#[:space:]]+$ ]]
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

api() {
  local method="$1" path="$2"
  shift 2
  curl -sf -X "$method" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "$API_BASE$path" "$@"
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
  local payload="$1" response_file
  response_file=$(mktemp)
  PUBLISH_STATUS=$(curl -sS -o "$response_file" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$API_BASE/api/publish")
  PUBLISH_BODY=$(<"$response_file")
  PUBLISH_ERROR_CODE=$(echo "$PUBLISH_BODY" | jq -r '.code // empty' 2>/dev/null || true)
  rm -f "$response_file"
}

stage_trace_upload() {
  local file="$1" upload upload_url
  upload=$(api POST /api/trace-uploads)
  TRACE_UPLOAD_ID=$(echo "$upload" | jq -r '.uploadId // empty')
  upload_url=$(echo "$upload" | jq -r '.uploadUrl // empty')
  [[ -n "$TRACE_UPLOAD_ID" && -n "$upload_url" ]] || die "invalid trace upload response"

  local curl_args=(-sf -H "Content-Type: application/zip" --upload-file "$file")
  if [[ "$upload_url" == "$API_BASE/api/trace-uploads/"* ]]; then
    curl_args+=(-H "Authorization: Bearer $TOKEN")
  fi
  curl "${curl_args[@]}" "$upload_url" >/dev/null
}

read_manifest_slug() {
  local file="$1"
  require_jq
  [[ -f "$MANIFEST_FILE" ]] || return 1
  local abs
  abs=$(cd "$(dirname "$file")" && pwd)/$(basename "$file")
  jq -r --arg p "$abs" '.[$p] // empty' "$MANIFEST_FILE"
}

write_manifest_slug() {
  local file="$1" slug="$2"
  require_jq
  mkdir -p "$(dirname "$MANIFEST_FILE")"
  local abs
  abs=$(cd "$(dirname "$file")" && pwd)/$(basename "$file")
  if [[ -f "$MANIFEST_FILE" ]]; then
    tmp=$(mktemp)
    jq --arg p "$abs" --arg s "$slug" '.[$p] = $s' "$MANIFEST_FILE" > "$tmp"
    mv "$tmp" "$MANIFEST_FILE"
  else
    echo "{\"$abs\": \"$slug\"}" | jq . > "$MANIFEST_FILE"
  fi
}

remove_manifest_slug() {
  local slug="$1"
  require_jq
  [[ -f "$MANIFEST_FILE" ]] || return 0
  tmp=$(mktemp)
  jq --arg s "$slug" 'with_entries(select(.value != $s))' "$MANIFEST_FILE" > "$tmp"
  mv "$tmp" "$MANIFEST_FILE"
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
  local api_base="$1" token="$2" status

  status=$(curl -sS --connect-timeout 10 --max-time 30 \
    -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $token" \
    "$api_base/api/shares") || return "$TOKEN_INCONCLUSIVE"
  if [[ "$status" -ge 200 && "$status" -lt 300 ]]; then
    return "$TOKEN_VALID"
  fi
  if [[ "$status" == 401 || "$status" == 403 ]]; then
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
  manifest=$(curl -fsS --connect-timeout 10 --max-time 30 "$manifest_url") \
    || die "could not fetch setup manifest"
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

  local payload response_with_status status response token response_api_base
  payload=$(jq -n --arg code "$code" \
    '{code: $code, label: "Mekari Canvas (shared)"}')
  response_with_status=$(curl -sS --connect-timeout 10 --max-time 30 \
    -w $'\n%{http_code}' -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$api_base$exchange_url") || die "could not reach setup exchange"
  status=${response_with_status##*$'\n'}
  response=${response_with_status%$'\n'*}

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    local message
    message=$(jq -r \
      'if type == "object" and (.error | type) == "string" and (.error | length) > 0
       then .error else "setup exchange failed" end' \
      <<<"$response" 2>/dev/null) || message="setup exchange failed"
    die "$message (HTTP $status)"
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

cmd_publish() {
  local force_new=false replace_slug=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --new) force_new=true; shift ;;
      --replace) replace_slug="$2"; shift 2 ;;
      -*) die "unknown flag: $1" ;;
      *) break ;;
    esac
  done
  local file="${1:-}"
  [[ -n "$file" && -f "$file" ]] || die "usage: mekari-canvas publish [--new] [--replace <slug>] <file>"

  load_config
  local kind slug upload_id="" content=""
  kind=$(detect_kind "$file")

  if [[ "$force_new" == false && -z "$replace_slug" ]]; then
    replace_slug=$(read_manifest_slug "$file" || true)
  fi

  if [[ "$kind" == trace ]]; then
    stage_trace_upload "$file"
    upload_id="$TRACE_UPLOAD_ID"
  else
    content=$(<"$file")
  fi

  local payload
  if [[ "$kind" == trace ]]; then
    payload=$(jq -n --arg uploadId "$upload_id" --arg slug "$replace_slug" \
      '{kind: "trace", uploadId: $uploadId} + (if $slug == "" then {} else {replaceSlug: $slug} end)')
  else
    payload=$(jq -n --arg content "$content" --arg kind "$kind" --arg slug "$replace_slug" \
      '{content: $content, kind: $kind} + (if $slug == "" then {} else {replaceSlug: $slug} end)')
  fi

  publish_request "$payload"
  if [[ "$PUBLISH_STATUS" == 404 && "$PUBLISH_ERROR_CODE" == share_not_found && -n "$replace_slug" ]]; then
    remove_manifest_slug "$replace_slug"
    replace_slug=""
    if [[ "$kind" == trace ]]; then
      # The failed commit consumes its immutable staged upload; retry with a fresh one.
      stage_trace_upload "$file"
      upload_id="$TRACE_UPLOAD_ID"
      payload=$(jq -n --arg uploadId "$upload_id" '{kind: "trace", uploadId: $uploadId}')
    else
      payload=$(jq -n --arg content "$content" --arg kind "$kind" \
        '{content: $content, kind: $kind}')
    fi
    publish_request "$payload"
  fi
  if [[ "$PUBLISH_STATUS" -lt 200 || "$PUBLISH_STATUS" -ge 300 ]]; then
    local message
    message=$(echo "$PUBLISH_BODY" | jq -r '.error // "publish failed"' 2>/dev/null || true)
    die "$message (HTTP $PUBLISH_STATUS)"
  fi

  slug=$(echo "$PUBLISH_BODY" | jq -r '.slug // empty')
  [[ -n "$slug" ]] || die "invalid publish response"
  write_manifest_slug "$file" "$slug"
  echo "${API_BASE}/s/${slug}"
}

cmd_list() {
  load_config
  api GET /api/shares | jq -r '.shares[] | "\(.slug)\t\(.kind)\t\(.updatedAt)\t\(.expiresAt // \"permanent\")"' | column -t -s $'\t' 2>/dev/null \
    || api GET /api/shares | jq .
}

cmd_delete() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "usage: mekari-canvas delete <slug>"
  load_config
  api DELETE "/api/shares/${slug}"
  remove_manifest_slug "$slug"
  echo "deleted /s/${slug}"
}

cmd_replace() {
  local file="${1:-}" slug="${2:-}"
  [[ -n "$file" && -f "$file" && -n "$slug" ]] || die "usage: mekari-canvas replace <file> <slug>"
  cmd_publish --replace "$slug" "$file"
}

usage() {
  cat <<EOF
mekari-canvas — Mekari Canvas Agent publish

  setup <code> [manifest-url]   Reuse or exchange the shared Publisher API token
  publish [--new] [--replace S] <file>   Publish or replace Share
  list                          List your Shares
  delete <slug>                 Delete a Share
  replace <file> <slug>         Replace specific slug
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
    replace) cmd_replace "$@" ;;
    ""|help|-h|--help) usage ;;
    *) die "unknown command: $cmd (try: mekari-canvas help)" ;;
  esac
}

main "$@"
