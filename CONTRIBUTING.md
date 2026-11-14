# Contributing to Codex Habitat

Thank you for helping improve Codex Habitat. Please review and understand every
change before submitting it, test it in a Home Assistant OS environment when
possible, and describe its user-facing effect clearly.

## Privacy review before pushing

Keep shared code, examples, tests, documentation, and release notes generic.
Never publish real household entity IDs, device names, area assignments,
automation IDs, custom template names or contents, private paths, or credentials.
Accept installation-specific identifiers as caller input or discover them through
Home Assistant registries; do not embed a user's household policies in the app.
Use synthetic fixtures in tests. Review the complete staged diff, including new
files and build inputs, before every push—not only before releases.

`NOG TE VERWERKEN NOOIT UPLOADEN/` is a private, local-only update inbox.
Never stage, force-add, upload, package, or attach that directory or its raw
contents. Keep it excluded from Git and Docker contexts. Read and compare its
files locally, then port only reviewed, generic changes into the public source;
preserve existing validation and privacy fixes. Leave household-specific code
and the original inbox files private. Run the helper/privacy tests and inspect
the staged diff before pushing or releasing.

## Open Home Foundation contributions

If Codex Habitat is proposed to an Open Home Foundation project, the person opening
an issue or pull request must personally review and understand the contribution
and communicate with maintainers in their own words. Do not use an autonomous
agent to create issues, pull requests, or maintainer responses. AI may help
with grammar, clarity, or research, but the contributor remains responsible for
technical accuracy and every submitted change.

See the [Open Home Foundation AI policy](https://developers.home-assistant.io/docs/ai_policy/).
