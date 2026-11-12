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

default_instructions="$(get_instructions true)"
relaxed_instructions="$(get_instructions false)"

grep -Fq 'Ask for command approval before any reload or restart.' <<< "$default_instructions"
grep -Fq 'proceed without asking for a separate confirmation' <<< "$relaxed_instructions"
grep -Fq 'Always ask for approval before a Home Assistant Core restart.' <<< "$relaxed_instructions"
grep -Fq 'Run codex-habitat-ha check before a Core restart' <<< "$relaxed_instructions"
if grep -Fq 'Ask for command approval before any reload or restart.' <<< "$relaxed_instructions"; then
  echo 'Reload confirmation was not disabled' >&2
  exit 1
fi
