# Performance measurement and keyboard accessibility

The local editor supports focused canvas-node inspection with Enter/Space, visible keyboard focus, quick-find with Ctrl/Cmd K, literal search over IDs/names/kinds/technology/owner/tags/description, arrow-key result navigation, Enter selection, and Escape dialog dismissal. Stable IDs are used for selection; keyboard actions do not rename entities or bypass transactions.

## Repeatable synthetic measurements

```sh
npm run benchmark
npm run build
npm run test:performance
```

The fixture contains **500 components and 1,500 relationships**, within canonical limits, with synthetic semantics and positions. The Node benchmark records validation, atomic edit, semantic diff, and search over 20 iterations after warmup. The browser test uses an isolated data store and ephemeral listener, imports the fixture, and measures real render, search, and edit/save durations.

Reports go into ignored `artifacts/performance.json` and `artifacts/performance-browser.json`. They record runtime, platform, CPU/build conditions, fixture size, and actual timings. No user architecture or provider settings are used. The optional Node output argument must remain inside the ignored artifacts directory.

Set `ARCHWAY_BROWSER_DIST` for an isolated build; `ARCHWAY_BROWSER_PATH` explicitly selects Chromium. Windows discovers Chrome/Edge as in other browser suites. See [development](development.md) for portable browser setup and temporary-file isolation.

These are measured local diagnostics, not latency promises, operational telemetry, cost estimates, or proof of scalability on another device. CI does not enforce arbitrary timing thresholds; it verifies the flows run and saves the measurements. Compare repeated runs under the same hardware, browser, fixture, and build conditions before choosing an optimization.

The keyboard and milestone browser suites are available with `npm run test:milestones`; existing interactions remain checked by `npm run test:browser`.
