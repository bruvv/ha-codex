# Changelog

## 1.2.0

- Added allowlisted entity-state reads, media-device and area inspection, and verified device-area assignment.
- Added local Bluetooth scan-mode inspection and verified changes through native Home Assistant options flows.
- Added custom-template reloads.
- Bundled generic helper scripts in the image and added isolated transport tests.
- Removed installation-specific policy diagnostics and entity identifiers from the current source; helper inputs are caller-supplied or discovered from Home Assistant registries.

## 1.1.0

- Enabled hosted Context7 documentation by default with anonymous access, an optional masked API-key setting, and an opt-out switch.

- Added default Codex guidance to inspect existing automations first, prefer native Home Assistant functionality, and avoid unnecessary custom integrations.

## 1.0.0

- First Codex Habitat release: a persistent Codex workspace in the Home Assistant sidebar, with device-code or API-key sign-in.
- Configuration editing, model and reasoning-effort selection, and optional helper-based Home Assistant checks, reloads, and validated restarts.
- Fixed the initial terminal history limit and dark/light theme colors.
- Added readable Configuration labels, one user guide, and concise release notes that do not repeat pending changes.

Control settings are helper preferences, not security boundaries for code inside the container. Back up Home Assistant and review changes before approving them.
