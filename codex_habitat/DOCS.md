# Codex Habitat user guide

## Install and sign in

Add `https://github.com/bruvv/codex-habitat` under **Settings → Apps → App Store**,
then install and start **Codex Habitat**. Enable **Show in sidebar** and open it.

Choose **Sign in with Device Code**. Open the displayed URL on another device
and enter the temporary code. Browser-callback sign-in cannot reliably return
to the isolated add-on container. Never share a device code.

An **OpenAI API key** is an alternative, billed separately from a ChatGPT
subscription. Paste it only into the hidden sign-in prompt—not a configuration
file, issue, or chat. Sign-in and Codex settings persist in the add-on's private
configuration folder.

## Settings

Change settings in **Codex Habitat → Configuration**, then restart the add-on.
A restart starts a fresh terminal session with the new settings; navigating
away and back does not.

| Setting | Default | Effect |
| --- | --- | --- |
| **Model** | GPT-6.1 Sol | Overrides the startup model. `default` keeps the model saved with Codex's `/model`. Model access depends on your account. |
| **Reasoning effort** | xhigh | `low`, `medium`, `high`, `xhigh`, `max`, or `ultra`. Higher effort is slower and uses more of your plan. `default` keeps Codex's own or saved setting. |
| **Terminal font size** | 14 | Text size, from 10 to 24. |
| **Terminal scrollback** | 5,000 | History lines retained in the browser and tmux, from 1,000 to 50,000. |
| **Terminal theme** | Dark | Dark or light terminal colors. |
| **Session persistence** | On | Keeps the live Codex session running when you leave the sidebar. |
| **Preserve terminal history** | On | Uses an inline transcript instead of a full-screen terminal view. Recommended for scrolling long reviews. |
| **Patch compatibility mode** | On | Uses the add-on container boundary instead of nested Bubblewrap so normal patches work on Home Assistant OS. Does not change command approvals. |
| **Skip command approvals** | Off | Starts new sessions with command approvals disabled. Only enable with backups and careful review. When off, a saved Codex approval policy still applies. |
| **Confirm reload actions** | On | Instructs Codex to request approval before reloads. Off removes the extra conversational confirmation for requested changes, not Codex's command approval policy. |
| **Context7 documentation** | On | Hosted library/framework documentation lookups, without a required API key. |
| **Context7 API key (optional)** | Empty | Paste a key for higher limits; leave empty for anonymous access. |
| **Codex memories** | Off | Enables memories at startup. Off leaves any saved `/memories` choice unchanged. |
| **Terminal file transfer** | Off | Enables uploads/downloads with `trz`/`tsz`. Can interfere with long pastes; leave off unless needed. |
| **Allow Home Assistant control actions** | Off | Enables configuration checks and supported reloads through the helper. |
| **Allow Home Assistant Core restart** | Off | Allows the helper to restart Core after a successful configuration check. Requires control actions. |

Context7 uses `https://mcp.context7.com/mcp`; no plugin, npm installation, or
separate browser sign-in is needed. Anonymous access has lower rate limits.
Get an optional key at [context7.com](https://context7.com), paste it into the
masked Configuration field, save, and restart the add-on. The key is passed
through an environment variable, not saved to Codex TOML or command arguments.
Masking is not encryption: protect add-on settings and backups as credentials.

Documentation queries are sent to an external service. Codex is instructed not
to send secrets or private Home Assistant configuration, and to acknowledge
outages/rate limits rather than claim a lookup succeeded. These instructions
are not a data-loss prevention boundary. Turn **Context7 documentation** off to
disable the bundled connection. User-managed MCP servers are unchanged; the
name `habitat_context7` is reserved for this add-on's session configuration.
This integrates the hosted MCP tools, not the Context7 plugin's bundled skill.

Use `/model` in Codex to see models available to your account. To keep your
in-session model and effort across add-on restarts, set both **Model** and
**Reasoning effort** to `default`.

Astra, Sol, and Terra models in the selector support effort up to `ultra`;
Luna models support up to `max`. A higher selection is lowered to the model's
maximum and logged. With Model set to `default`, this check uses the model
saved in Codex; with no saved model, Codex chooses its own default.

## Safe editing and Home Assistant actions

Every new Codex session is instructed to inspect existing automations before
changing them, prefer native Home Assistant functionality, and avoid unnecessary
custom integrations. These rules are supplied at startup; the add-on does not
create or overwrite an `AGENTS.md` in your configuration.

Take a backup and a Git checkpoint before significant edits. Start with:

```text
Review my Home Assistant configuration without editing files.
Show the exact files and diff before applying changes. Do not restart anything.
```

To use configuration checks or reloads, enable **Allow Home Assistant control
actions** and restart the add-on. Enable **Allow Home Assistant Core restart**
separately if needed. No user-managed token, IP address, or host setup is required.

The `codex-habitat-ha` helper supports:

- `status` and `check` for connectivity and configuration validation.
- `reload automation|script|scene|group|template|custom-templates|core|dashboard-resources`.
- `restart`, which refuses to proceed unless the configuration check passes.
- `state <entity_id> [...]` reads 1–20 light, media-player, remote, Adaptive Lighting switch, or the legacy `automation.licht_overgangen_3_seconden` states, returning selected attributes only.
- `areas`, `media-devices`, and `device-info <entity_id>` inspect media-player/remote devices and their area assignments.
- `device-area <entity_id> <area_id>` assigns the entire device to an existing area and verifies the result; conflicting entity-area overrides prevent the change.
- `bluetooth-info <entry_id>` and `bluetooth-mode <entry_id> <auto|active|passive>` inspect or change a loaded local `hci` adapter through native options flows. The adapter must support passive scanning and expose the mode options form. Changes verify both the saved mode and runtime requested mode; actual scanning may differ from the requested mode.

The optional `presence-policy`, `presence-policy-test`, `bedroom-policy`, and
`bedroom-policy-test` commands are household-specific diagnostics, not bundled
automation policies. Presence diagnostics require
`/homeassistant/custom_templates/huisbeleid.jinja` with `slaper_alleen_thuis`;
tests also require the `nr_yaml_auto_laadmelding` automation in
`/homeassistant/automations.yaml`. Bedroom diagnostics require
`/homeassistant/custom_templates/slaapkamerbeleid.jinja` with
`tv_blokkeert_muziek` and `tv_vrij_voor_slaapmuziek`, and the matching entity
IDs used by the scripts. Missing or incompatible configuration causes failure;
these commands do not install or modify it. Live commands evaluate loaded
templates; tests evaluate disk templates against fixed fixtures via the template
API, without device actions. Both test commands exit unsuccessfully if any
scenario fails. Reload custom templates after editing them before comparing
live and test results.

Codex is instructed to explain actions and request approval for reloads and
restarts. **Confirm reload actions** can remove the extra conversational reload
confirmation; Core restarts still require approval in the instructions.
**Skip command approvals** is the separate global override for command prompts.

These are helper preferences, not enforced permissions for code inside the
container: it can access the Home Assistant administrator API credential.
The add-on does not request host networking, the Docker socket, full host
access, or Supervisor-management API access.

Reloading Lovelace resources does not reload dashboard YAML or storage
configuration. Refresh the browser after dashboard changes.

## Terminal history and clipboard

Leave **Session persistence** and **Preserve terminal history** on to keep a
live session and scroll long output. Use the mouse wheel, trackpad, touch
scrolling, or the gold history rail. Increase **Terminal scrollback** only if
5,000 lines is not enough.

**Ctrl+C interrupts Codex; it is not copy.** tmux owns normal mouse selection,
so use a modifier for browser selection:

| Platform | Copy | Paste |
| --- | --- | --- |
| Windows, Linux, ChromeOS | Hold **Shift** and drag; selection is copied automatically. **Ctrl+Insert** also copies. | **Ctrl+Shift+V** or **Shift+Insert**. Plain Ctrl+V is sent to Codex. |
| macOS | Hold **Option ⌥** and drag; selection is copied automatically. **Cmd+C** also copies. | **Cmd+V**. |

On touch devices, use the usual long-press selection and paste gestures.
Multi-line pastes arrive as one message; review them before pressing Enter.
To reuse a normal tmux selection without the clipboard, press **Ctrl-b**, then
**]**. If long pastes are garbled, turn **Terminal file transfer** off.

## File transfer

Enable **Terminal file transfer** and restart. Transfers run from a shell,
not the Codex prompt:

- **Upload:** press **Ctrl-b**, then **u** for the file picker. Files land in
  `/homeassistant`; press Enter after the upload to return to Codex.
- **Shell:** press **Ctrl-b**, then **c**. Run `trz` to upload, or `tsz <file>`
  to download. Change directory first to upload elsewhere. Drag-and-drop onto
  a shell prompt also starts an upload.
- **Return:** press **Ctrl-b**, then **0** to return to the original window.

Turn transfer off again if it interferes with pasting. For many files, upload
a ZIP archive. If the picker never appears, try opening Home Assistant over
HTTPS, for example through Nabu Casa.

## Troubleshooting

### Patches fail with a Bubblewrap error

Leave **Patch compatibility mode** on and restart the add-on. It starts Codex
with `--sandbox danger-full-access`, using the container as the boundary.
A session switched with `/approvals` can still be in `workspace-write`; choose
**Full Access** there or restart the add-on. This does not disable command approvals.

### Model unavailable

Choose another model in Configuration, or use `default` and select an available
model with `/model`. Adding a selector entry does not grant account access.

### Optional MCP startup warning

For `MCP startup incomplete` or `dataAnalyticsWidgets` errors, run
`codex mcp list`. If no MCP servers are configured and Codex reads your files,
the optional-client warning does not block normal file work.

### Deprecated memory setting

Restart the add-on. Startup migrates `[features].memory_tool` to
`[features].memories` in the saved Codex configuration.

For other problems, report the add-on version and exact error. Remove tokens,
API keys, device codes, private URLs, and personal configuration first.

## Updates and maintenance

Read the [changelog](CHANGELOG.md) before updating from the App Store.

The scheduled updater checks for a stable Codex release every six hours.
It updates the pinned Codex CLI and matching code-mode host, bumps the add-on
patch version, and validates amd64 and aarch64 images on an update branch.
Only a successful run advances `main` and publishes a release. A failed build
leaves `main` unchanged. New model selector entries still require a manual change.

For maintainers:

- `config.yaml` is the source of truth for the add-on version. Stable releases
  use [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH` for breaking
  changes, backward-compatible features, and fixes, respectively. The matching
  changelog heading is `## X.Y.Z` and the Git tag is `vX.Y.Z`.
- Put pending changes under `## Unreleased` in `CHANGELOG.md`. The updater moves
  them into the next version once and adds one short upstream release link.
- A manual release needs a matching version in `config.yaml` and numbered
  changelog section. Run **Publish Codex Habitat release** from `main`; the
  workflow tags the version-bump commit and uses that section as its notes.
- Keep detailed user instructions in this guide, not both READMEs.
- Review [CONTRIBUTING.md](../CONTRIBUTING.md) before submitting changes.
