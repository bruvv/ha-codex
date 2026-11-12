#!/usr/bin/env bash
set -euo pipefail

session_file="codex_habitat/session.sh"
bash -n "$session_file"

# Source only the instruction setup, not the login or Codex runtime.
get_instructions() {
  CODEX_HABITAT_CONFIRM_RELOAD_ACTIONS="$1" bash -c '
    source <(sed -n "1,/^cd \/homeassistant/{ /^cd \/homeassistant/d; p; }" "$1") "$2" "$3"
    printf "%s\n" "${CODEX_HABITAT_INSTRUCTIONS}"
  ' _ "$session_file" default inline
}

# Exercise the complete session without login, filesystem changes, or a real CLI.
get_session_args() {
  CODEX_HABITAT_CONTEXT7="$1" CONTEXT7_API_KEY="$2" bash -c '
    cd() { :; }
    codex() { return 0; }
    exec() { printf "%s\n" "$@"; }
    source "$1" default inline
  ' _ "$session_file"
}

anonymous_args="$(get_session_args true '')"
keyed_args="$(get_session_args true 'test-only-secret')"
disabled_args="$(get_session_args false 'test-only-secret')"
grep -Fq 'mcp_servers.habitat_context7={url="https://mcp.context7.com/mcp", enabled=true, required=false}' <<< "$anonymous_args"
grep -Fq 'bearer_token_env_var="CONTEXT7_API_KEY"' <<< "$keyed_args"
grep -Fq 'enabled=false, required=false}' <<< "$disabled_args"
grep -Fq 'Use Context7 for current library and framework documentation.' <<< "$anonymous_args"
if grep -Eq 'test-only-secret|bearer_token_env_var' <<< "$anonymous_args$disabled_args" ||
   grep -Fq 'test-only-secret' <<< "$keyed_args" ||
   grep -Fq 'Use Context7' <<< "$disabled_args"; then
  echo 'Context7 key handling or opt-out failed' >&2
  exit 1
fi

# Older installations without the new option retain the enabled default.
default_args="$(unset CODEX_HABITAT_CONTEXT7 CONTEXT7_API_KEY; bash -c '
  cd() { :; }; codex() { return 0; }; exec() { printf "%s\n" "$@"; }
  source "$1" default inline
' _ "$session_file")"
grep -Fq 'enabled=true, required=false}' <<< "$default_args"

default_instructions="$(get_instructions true)"
relaxed_instructions="$(get_instructions false)"

for instruction in \
  'Always inspect existing automations before changing them.' \
  'Prefer native Home Assistant functionality.' \
  'Avoid unnecessary custom integrations.'; do
  grep -Fq "$instruction" <<< "$default_instructions"
  grep -Fq "$instruction" <<< "$relaxed_instructions"
done

grep -Fq 'Ask for command approval before any reload or restart.' <<< "$default_instructions"
grep -Fq 'proceed without asking for a separate confirmation' <<< "$relaxed_instructions"
grep -Fq 'Always ask for approval before a Home Assistant Core restart.' <<< "$relaxed_instructions"
grep -Fq 'Run codex-habitat-ha check before a Core restart' <<< "$relaxed_instructions"
if grep -Fq 'Ask for command approval before any reload or restart.' <<< "$relaxed_instructions"; then
  echo 'Reload confirmation was not disabled' >&2
  exit 1
fi
