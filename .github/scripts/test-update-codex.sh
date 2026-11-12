#!/usr/bin/env bash
set -euo pipefail

repo="${PWD}"
test_dir="$(mktemp -d)"
trap 'rm -rf "${test_dir}"' EXIT

# GitHub is mocked; all file changes stay in temporary fixtures.
gh() { printf '%s\n' "${MOCK_CODEX_VERSION}"; }
export -f gh
export GITHUB_OUTPUT=/dev/null

release_notes() {
  awk -v heading="## $1" '
    $0 == heading { found = 1; next }
    found && /^## / { exit }
    found { print }
  ' "$2"
}

# Production runs GNU sed on Linux; support BSD sed for local macOS tests.
if [ "$(uname -s)" = Darwin ]; then
  sed() {
    if [ "${1:-}" = -i ]; then
      shift
      command sed -i '' "$@"
    else
      command sed "$@"
    fi
  }
  export -f sed
fi

for pending in populated empty absent; do
  fixture="${test_dir}/${pending}"
  mkdir -p "${fixture}/codex_habitat"
  cp codex_habitat/{Dockerfile,config.yaml} "${fixture}/codex_habitat/"
  (
    cd "${fixture}"
    current="$(sed -n 's/^ARG CODEX_VERSION="\(.*\)"$/\1/p' codex_habitat/Dockerfile)"
    addon="$(sed -n 's/^version: "\(.*\)"$/\1/p' codex_habitat/config.yaml)"
    IFS=. read -r major minor patch <<< "${current}"
    export MOCK_CODEX_VERSION="${major}.${minor}.$((patch + 1))"
    IFS=. read -r addon_major addon_minor addon_patch <<< "${addon}"
    next="${addon_major}.${addon_minor}.$((addon_patch + 1))"
    changelog=codex_habitat/CHANGELOG.md
    {
      printf '# Changelog\n\n'
      if [ "${pending}" != absent ]; then
        printf '## Unreleased\n\n'
        if [ "${pending}" = populated ]; then
          printf '%s\n\n' '- Pending fix.' '### Documentation' '- Pending guide.'
        fi
      fi
      printf '## %s\n\n- Existing release.\n' "${addon}"
    } > "${changelog}"

    bash "${repo}/.github/scripts/update-codex.sh"
    test "$(grep -c '^## Unreleased$' "${changelog}")" -eq 1
    test "$(grep -c "^## ${next}$" "${changelog}")" -eq 1
    grep -Fq -- "- Codex CLI ${current} → [${MOCK_CODEX_VERSION}]" "${changelog}"
    if grep -Fq 'Released automatically' "${changelog}"; then
      echo 'Repeated auto-release boilerplate must not return.' >&2
      exit 1
    fi
    test -z "$(release_notes Unreleased "${changelog}")"
    notes="$(release_notes "${next}" "${changelog}")"
    if [ "${pending}" = populated ]; then
      grep -Fq -- '- Pending fix.' <<< "${notes}"
      grep -Fq -- '- Pending guide.' <<< "${notes}"
    fi

    before="$(cksum "${changelog}" codex_habitat/{Dockerfile,config.yaml})"
    bash "${repo}/.github/scripts/update-codex.sh"
    test "$(cksum "${changelog}" codex_habitat/{Dockerfile,config.yaml})" = "${before}"

    export MOCK_CODEX_VERSION="${major}.${minor}.$((patch + 2))"
    bash "${repo}/.github/scripts/update-codex.sh"
    test "$(grep -c '^## Unreleased$' "${changelog}")" -eq 1
    test -z "$(release_notes Unreleased "${changelog}")"
    test "$(release_notes "${next}" "${changelog}")" = "${notes}"
    test "$(grep -c '^- Existing release\.$' "${changelog}")" -eq 1
    if [ "${pending}" = populated ]; then
      test "$(grep -c '^- Pending fix\.$' "${changelog}")" -eq 1
      test "$(grep -c '^- Pending guide\.$' "${changelog}")" -eq 1
    fi
    printf 'PASS: %s Unreleased notes, unchanged retry, and no carry-over on the next update.\n' "${pending}"
  )
done

(
  cd "${test_dir}/absent"
  printf 'version: "1.00.0"\n' > codex_habitat/config.yaml
  if MOCK_CODEX_VERSION=999.0.0 bash "${repo}/.github/scripts/update-codex.sh" > "${test_dir}/error" 2>&1; then
    echo 'An invalid add-on version must be rejected before updating.' >&2
    exit 1
  fi
  grep -Fq 'Could not read CODEX_VERSION' "${test_dir}/error"
)
printf '%s\n' 'PASS: updater rejects an add-on version with leading zeros.'
