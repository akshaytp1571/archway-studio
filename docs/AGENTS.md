# Documentation-specific agent instructions

These instructions apply to this documentation directory and supplement [the root agent instructions](../AGENTS.md). They describe how to edit documentation, not permission to operate a user's architecture.

- Read the relevant implementation and tests before asserting a contract or behavior. Do not infer features from a screenshot, roadmap, or another architecture tool.
- Keep the [architecture](architecture.md), [model](model.md), [API](api.md), [configuration](configuration.md), and [development](development.md) guides consistent with source.
- The runtime integration guide is [agent integration](agent-integration.md). It is intentionally not named AGENTS.md, to avoid case-insensitive instruction-file collisions on Windows.
- Regenerate machine-readable schema/example files using the documented generator. Never hand-edit generated references or use real user data as an example.
- Distinguish canonical output schemas from accepted-input schemas. JSON Schema defaults are annotations; semantic graph validation still runs separately.
- Preserve stable-ID, per-view layout, atomic-batch, preview/read-only, and expected-revision semantics in examples.
- Clearly label abbreviated/conceptual payloads versus runnable fixture documents. Check runnable examples through tests.
- Explicitly separate implemented behavior, known limitations, and proposed roadmap work. Do not invent hosting security, C4 fidelity, runtime health/cost measurements, or successful live-provider inference.
- Explain confidentiality and plain-text provider storage honestly. Never publish keys, raw settings, private architecture models, or unsanitized screenshots.
- Prefer repository-relative links with clear labels. Run documentation generation/drift, local-link, and formatting checks after edits.
- CI templates are not active workflows. Do not claim a hosted CI run passed unless one actually ran; do not broaden credentials or switch publishing accounts to enable CI without authorization.
- Keep setup examples portable, specify required commands/browser dependencies, and do not disrupt a running user instance to validate documentation.
