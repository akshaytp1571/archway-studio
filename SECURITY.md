# Security policy and deployment boundary

Archway 0.1.x is a **local, single-user MVP**. It is not a hardened hosted service. Repository privacy is not application authentication.

## Current protections

- The application server binds to IPv4 loopback (`127.0.0.1`).
- Host and Origin checks reject unexpected hosts and cross-origin browser requests.
- Production-mode web assets use a restrictive Content Security Policy.
- JSON requests have a 5 MB limit; schemas constrain model sizes and value lengths.
- Semantic validation rejects duplicate IDs, dangling references, and stale layout references.
- Applied batches check an expected revision and write a complete project atomically.
- Provider keys are not returned by the settings API or embedded in the browser bundle.
- SVG output escapes user text; Mermaid is exported as plain text rather than rendered as trusted HTML.

These are useful defenses, **not authentication or project authorization**. Local processes can still call the API. The `source` label in change history is bookkeeping, not an authenticated identity. MCP annotations are client hints, not permission enforcement.

## Sensitive data

Project models, history, and undo snapshots can reveal business architecture. Provider settings contain a plain-text API key when one is configured. Treat the entire data directory as sensitive.

- Keep data and backups outside Git. Never attach a real model/settings document to an issue.
- Use operating-system access controls and encrypted storage/backups where needed.
- Do not treat POSIX file mode hints as a Windows credential vault.
- Do not put real keys in examples, source files, screenshots, shell history, or logs.
- Rotate a key if it is accidentally disclosed; removing it from the latest commit is not sufficient.

See [configuration](docs/configuration.md) for storage locations, environment variables, and key-clearing behavior.

## Model-provider boundary

Free-form planning sends the prompt and current architecture to the configured provider. Recipes do not call an LLM. Configure only providers you trust with that data.

Provider base URLs are operator-controlled HTTP/HTTPS URLs. This is acceptable only under the local trusted-operator assumption; a hosted implementation needs SSRF controls, URL/network policy, request limits, encrypted credentials, and per-project authorization.

Treat provider output and architecture descriptions as untrusted. JSON/schema/reference validation does not prove that a proposed design is desirable or that model instructions were followed. Review proposed operations, especially deletions, before apply. The preview/apply recommendation is not an authorization gate enforced against every external client.

## Persistence and concurrency

A single process serializes changes per project. Multiple processes sharing one data directory are not coordinated and can race. Atomic rename does not replace a distributed lock or database transaction. Run one writer per data directory and protect backups.

## Before public hosting

At minimum, design and implement authentication, project-level permissions, explicit agent mutation policy, CSRF/session controls as applicable, rate limits, encrypted secrets, SSRF protections, durable database transactions, operational monitoring, safe audit records, and migration/backup procedures.

Do not “enable hosting” by merely binding to `0.0.0.0`, tunneling the existing port, removing Origin checks, or treating a private GitHub repository as an access-control layer.

## Reporting a vulnerability

Do not disclose exploitable details or credentials in an ordinary issue. If GitHub private vulnerability reporting is enabled, use the repository's Security tab. Otherwise contact [the maintainer](https://github.com/akshaytp1571) privately to arrange a confidential channel. Do not assume a public issue is an appropriate substitute.

Provide a minimal reproduction using synthetic data, affected version/commit, impact, and relevant logs with secrets removed. There is no formal response SLA for this MVP.
