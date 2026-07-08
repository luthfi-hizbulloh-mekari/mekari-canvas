#!/usr/bin/env bash
# Mekari Canvas CLI — Agent publish helper
set -euo pipefail

CONFIG="${HOME}/.canvas/config.json"
MANIFEST_FILE="${HOME}/.canvas/publish-manifest.json"
SKILL_DIR="${HOME}/.cursor/skills/mekari-canvas"

die() { echo "mekari-canvas: $*" >&2; exit 1; }

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
  case "${file##*.}" in
    md) echo md ;;
    html|htm) echo html ;;
    *)
      if head -c 2048 "$file" | grep -qiE '<html|<!DOCTYPE'; then echo html; else echo md; fi
      ;;
  esac
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

cmd_setup() {
  local code="${1:-}" manifest_url="${2:-}"
  [[ -n "$code" ]] || die "usage: mekari-canvas setup <code> [manifest-url]"
  require_jq

  if [[ -z "$manifest_url" ]]; then
    manifest_url="https://mekari-canvas.vercel.app/setup/manifest.json"
  fi

  local manifest api_base exchange_url
  manifest=$(curl -sf "$manifest_url")
  api_base=$(echo "$manifest" | jq -r '.apiBase')
  exchange_url=$(echo "$manifest" | jq -r '.exchangeUrl')

  local resp token
  resp=$(curl -sf -X POST \
    -H "Content-Type: application/json" \
    -d "{\"code\": \"$code\", \"label\": \"CLI\"}" \
    "$api_base$exchange_url")
  token=$(echo "$resp" | jq -r '.token')
  api_base=$(echo "$resp" | jq -r '.apiBase // empty')
  [[ -z "$api_base" || "$api_base" == "null" ]] && api_base=$(echo "$manifest" | jq -r '.apiBase')

  mkdir -p "$(dirname "$CONFIG")" "$SKILL_DIR"

  echo "$manifest" | jq -c '.files[]' | while read -r entry; do
    rel=$(echo "$entry" | jq -r '.path')
    url=$(echo "$entry" | jq -r '.url')
    dest="$SKILL_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    curl -sf "${api_base}${url}" -o "$dest"
    if [[ "$rel" == scripts/* ]]; then
      chmod +x "$dest"
    fi
  done

  mkdir -p "$(dirname "$CONFIG")"
  jq -n --arg apiBase "$api_base" --arg token "$token" '{apiBase: $apiBase, token: $token}' > "$CONFIG"
  chmod 600 "$CONFIG"
  echo "Setup complete. Token saved to $CONFIG"
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
  local kind content slug
  kind=$(detect_kind "$file")
  content=$(cat "$file")

  if [[ "$force_new" == false && -z "$replace_slug" ]]; then
    replace_slug=$(read_manifest_slug "$file" || true)
  fi

  local payload
  if [[ -n "$replace_slug" ]]; then
    payload=$(jq -n --arg content "$content" --arg kind "$kind" --arg slug "$replace_slug" \
      '{content: $content, kind: $kind, replaceSlug: $slug}')
  else
    payload=$(jq -n --arg content "$content" --arg kind "$kind" '{content: $content, kind: $kind}')
  fi

  local resp
  resp=$(api POST /api/publish -d "$payload")
  slug=$(echo "$resp" | jq -r '.slug')
  write_manifest_slug "$file" "$slug"
  echo "${API_BASE}/s/${slug}"
}

cmd_list() {
  load_config
  api GET /api/shares | jq -r '.shares[] | "\(.slug)\t\(.kind)\t\(.updatedAt)"' | column -t -s $'\t' 2>/dev/null \
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

  setup <code> [manifest-url]   One-time setup (exchange code, install skill)
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
