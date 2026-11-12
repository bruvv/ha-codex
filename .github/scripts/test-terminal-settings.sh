#!/usr/bin/env bash
set -euo pipefail

run_file="codex_habitat/run.sh"
test_dir="$(mktemp -d)"
cleanup() {
  local socket
  for socket in "${test_dir}"/tmux-*; do
    command tmux -S "${socket}" kill-server 2>/dev/null || true
  done
  rm -rf "${test_dir}"
}
trap cleanup EXIT

for THEME in dark light; do
  # Source only the color mapping, not the add-on startup.
  # shellcheck disable=SC1090,SC2016
  source <(sed -n '/^case "${THEME}" in/,/^esac/p' "${run_file}")
  printf '%s' "${TERMINAL_THEME}" | jq -e '
    type == "object" and
    (.background != .foreground) and (.background != .cursor) and
    ([.background, .foreground, .cursor, .selectionBackground] |
      all(.[]; test("^#[0-9a-fA-F]{6}$")))
  ' >/dev/null
  if [ "${THEME}" = light ]; then
    printf '%s' "${TERMINAL_THEME}" | jq -e '.background == "#ffffff"' >/dev/null
  fi
done
printf '%s\n' 'PASS: dark and light themes supply valid, readable color objects.'

export MODEL=default TERMINAL_MODE=inline PERSIST=true
SESSION_NAME=history-test
printf -v config_path '%q' "${PWD}/codex_habitat/tmux.conf"

# Use a private socket so tests never touch an existing tmux server.
tmux() { command tmux -S "${TEST_TMUX_SOCKET}" "$@"; }
export -f tmux

load_command() {
  # shellcheck disable=SC1090,SC2016
  source <(sed -n '/^if \[ "${PERSIST}" = "true" \]; then/,/^fi/p' "${run_file}")
}

for SCROLLBACK in 1000 5000 50000; do
  export TEST_TMUX_SOCKET="${test_dir}/tmux-${SCROLLBACK}"
  load_command
  # Run the generated command headlessly with a harmless placeholder session.
  COMMAND="${COMMAND//\/etc\/codex-habitat-tmux.conf/${config_path}}"
  COMMAND="${COMMAND/new-session -A/new-session -d}"
  COMMAND="${COMMAND/\/usr\/local\/bin\/codex-habitat-session default inline; exec bash -l/sleep 60}"
  bash -c "${COMMAND}"
  test "$(tmux display-message -p -t "${SESSION_NAME}" '#{history_limit}')" = "${SCROLLBACK}"
  tmux kill-server
  printf 'PASS: first tmux session has %s history lines.\n' "${SCROLLBACK}"
done

export PERSIST=false
load_command
test "${COMMAND}" = 'exec /usr/local/bin/codex-habitat-session default inline'
printf '%s\n' 'PASS: non-persistent sessions still launch directly.'
