#!/usr/bin/env bash
set -euo pipefail

publisher="${PWD}/.github/scripts/publish-release.sh"
test_dir="$(mktemp -d)"
trap 'rm -rf "${test_dir}"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export MOCK_ARGS="${test_dir}/release-args" MOCK_NOTES="${test_dir}/release-notes"
export MOCK_RELEASE_EXISTS=false

gh() {
  case "$1 $2" in
    'release view')
      [ "${MOCK_RELEASE_EXISTS}" = true ] || return 1
      printf '%s\n' 'Existing release notes.'
      ;;
    'release create')
      printf '%s\n' "$@" > "${MOCK_ARGS}"
      cat > "${MOCK_NOTES}"
      ;;
    *) return 99 ;;
  esac
}
export -f gh

git init -q "${test_dir}/repo"
cd "${test_dir}/repo"
git config user.name Bruvv
git config user.email bruvv@users.noreply.github.com

# An inherited release must never win over the fresh project's version.
mkdir -p home_assistant_codex_app codex_habitat
printf 'version: "1.0.0"\n' > home_assistant_codex_app/config.yaml
git add .
git commit -qm 'Inherited application'
legacy_commit="$(git rev-parse HEAD)"
printf 'version: "0.9.0"\n' > codex_habitat/config.yaml
git add .
git commit -qm 'New project path'
printf 'version: "1.0.0"\n' > codex_habitat/config.yaml
printf '# Changelog\n\n## Unreleased\n\n## 1.0.0\n\n- Fresh release.\n' > codex_habitat/CHANGELOG.md
git add .
git commit -qm 'Fresh release'
release_commit="$(git rev-parse HEAD)"
printf '\n# Later configuration change\n' >> codex_habitat/config.yaml
git add .
git commit -qm 'Later change without a version bump'

VERSION=1.0.0 bash "${publisher}"
grep -Fxq -- "${release_commit}" "${MOCK_ARGS}"
grep -Fxq -- '--latest=true' "${MOCK_ARGS}"
grep -Fxq -- '- Fresh release.' "${MOCK_NOTES}"
printf '%s\n' 'PASS: release uses the new version-bump commit and matching notes.'

before="$(cksum "${MOCK_ARGS}" "${MOCK_NOTES}")"
MOCK_RELEASE_EXISTS=true VERSION=1.0.0 bash "${publisher}"
test "$(cksum "${MOCK_ARGS}" "${MOCK_NOTES}")" = "${before}"
printf '%s\n' 'PASS: publishing an existing release does not duplicate or replace it.'

git tag v1.0.0 "${legacy_commit}"
if VERSION=1.0.0 bash "${publisher}" > "${test_dir}/error" 2>&1; then
  echo 'A conflicting release tag must be rejected.' >&2
  exit 1
fi
grep -Fq 'Fix the tag by hand.' "${test_dir}/error"
test "$(git rev-parse v1.0.0)" = "${legacy_commit}"
printf '%s\n' 'PASS: a conflicting tag is rejected, never moved.'

for invalid in 01.0.0 1.00.0 1.0.01 1.0; do
  if VERSION="${invalid}" bash "${publisher}" > "${test_dir}/error" 2>&1; then
    echo "Invalid stable version ${invalid} must be rejected." >&2
    exit 1
  fi
  grep -Fq 'without leading zeros' "${test_dir}/error"
done
printf '%s\n' 'PASS: malformed stable SemVer versions are rejected.'
