# Configuration and data privacy

Configuration is handled by [the server entry](../server/index.ts), [provider settings](../server/provider.ts), and [browser checks](../tests/browser.ts). The app does not automatically load a dotenv file.

## Runtime settings

| Setting                                             | Default                                           | Meaning                                                                |
| --------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `PORT`                                              | `4317`                                            | Integer 1024–65535; server still binds to `127.0.0.1`                  |
| `ARCHWAY_DATA_DIR`                                  | A data directory under the repository             | Project documents, history/undo content, and provider settings         |
| `ARCHWAY_LLM_BASE_URL`                              | OpenAI `/v1` URL if no other configuration exists | OpenAI-compatible HTTP/HTTPS base URL; `/chat/completions` is appended |
| `ARCHWAY_LLM_MODEL`                                 | `gpt-4.1-mini`                                    | Model identifier for chat completions                                  |
| `ARCHWAY_LLM_API_KEY`                               | Empty                                             | Optional for compatible local providers                                |
| `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY` | Fallback aliases                                  | Used only when the corresponding Archway variable is absent            |

Explicit provider settings saved through the UI/API take precedence over environment settings, including a deliberately disabled saved configuration.

An environment key or base URL enables environment-driven planning. A model name alone does not enable a provider. The UI/API can save an enabled keyless local provider configuration.

PowerShell example using placeholders:

```powershell
$env:ARCHWAY_LLM_BASE_URL = 'https://api.openai.com/v1'
$env:ARCHWAY_LLM_MODEL = 'gpt-4.1-mini'
$env:ARCHWAY_LLM_API_KEY = 'replace-with-your-own-key'
npm run start
```

POSIX shell:

```sh
export ARCHWAY_LLM_BASE_URL='https://api.openai.com/v1'
export ARCHWAY_LLM_MODEL='gpt-4.1-mini'
export ARCHWAY_LLM_API_KEY='replace-with-your-own-key'
npm run start
```

Do not paste real secrets into a committed script or shared shell transcript. A local provider needs its documented `/v1` base URL and an actual installed model identifier; Archway does not install or start a model server.

## Provider settings contract

`PUT /api/settings/provider` accepts `baseUrl`, `model`, optional `apiKey`, and optional `enabled` (defaults true).

- Omitting `apiKey` preserves the previously configured key.
- Sending `apiKey: ""` clears the saved key.
- Sending `enabled: false` disables the saved configuration without falling back to environment credentials.
- `GET /api/settings/provider` returns base URL, model, `configured`, `hasApiKey`, and configuration `source`; it never returns the key.
- `configured` means enabled/configured, not reachable or successfully tested.

The provider must support chat completions and `response_format: {"type":"json_object"}`. Archway validates returned plans and graph references; it does not guarantee every compatible model will produce a useful plan.

## Storage boundary

The data directory contains a project-document subdirectory and a provider-settings document. Project storage includes history and undo snapshots; exports contain only the canonical model.

The repository's [ignore rules](../.gitignore) exclude normal data, environment secrets, dependencies, builds, logs, and artifacts. A custom data directory inside another repository path might not be ignored automatically; choose an external private location and verify before staging.

Provider keys are stored in plain JSON with a restrictive file mode hint where supported. This is not encryption and not a Windows credential vault. Backups may contain both architecture history and keys. Protect them and never publish them.

Run one writer process per data directory. Do not edit raw stored documents while the server is writing them. Prefer canonical JSON export/import or the revision-checked API for normal changes.

## Browser-only test settings

| Setting                | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `ARCHWAY_BROWSER_PATH` | Explicit installed Chromium browser executable; takes precedence over discovery                       |
| `ARCHWAY_BROWSER_DIST` | Alternate built-asset directory for the isolated browser suite; default is the normal compiled output |

These settings do not change the live application's data directory or bind address. Browser tests use a temporary store and a local mock provider. See [development](development.md).

## Data sent to a provider

A planning request includes the user's prompt, project ID/revision/name/description, components and their properties/metadata, relationships, boundaries, and view summaries. It does not send a screenshot or provider key as model content. The key is used only for provider authorization.

Recipes have no LLM request. Do not call a provider “private” or “offline” merely because the UI is local: a configured remote provider receives the architecture context. See [security](../SECURITY.md) before using confidential data.
