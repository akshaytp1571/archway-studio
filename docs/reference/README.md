# Generated schemas and executable examples

These references are generated from [the model schemas](../../shared/model.ts) and [synthetic templates](../../shared/templates.ts), never from a user's live data.

| Reference                                               | Purpose                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| [Project schema](project.schema.json)                   | Canonical exported project document                             |
| [Change-request schema](change-request.schema.json)     | Accepted transaction input, including optional/defaulted fields |
| [Commerce example](../examples/commerce.project.json)   | Deterministic synthetic project at revision zero                |
| [Add-cache example](../examples/add-cache.changes.json) | A valid two-operation batch for that example                    |

```sh
npm run docs:generate
npm run docs:check
```

Do not hand-edit generated files. Review their diffs when a schema or template changes. [The generator](../../scripts/generate-docs.ts) uses the canonical project output schema and the change input schema; dates/IDs in the example are deterministic.

[Documentation tests](../../tests/documentation.test.ts) parse the examples through Zod, check final semantic validity, verify patch preservation, and compare schemas with the HTTP endpoint. A separate [link checker](../../scripts/check-docs.ts) checks local Markdown destinations, not remote URLs or heading anchors.

JSON Schema alone cannot check that an edge points to a real component or a position references a live ID. Use [the semantic engine](../../shared/model.ts) or the [preview API](../api.md) for that validation.
