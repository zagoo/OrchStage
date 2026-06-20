# Orch8 Console — End-to-End tests

Two complementary layers, both run against a **live `orch8-server`** (no mocks).

| Layer | Runner | Env | What it proves | Command |
|---|---|---|---|---|
| **Live API / contract** | Vitest | node | The UI's real API client + types + `validateSequence` against the live OpenAPI surface: handshake, save/export round-trip, validation parity, execution feedback. | `npm run test:e2e` |
| **Browser** | Playwright | Chromium | The real UI journeys: connect via the same-origin proxy, live-data render, the create-instance modal, the structure-first canvas editor. | `npm run test:e2e:browser` |

## Prerequisites

1. A running `orch8-server`. Default target `http://localhost:8080` (override the
   API layer with `ORCH8_E2E_URL`, and the browser layer's proxy with
   `ORCH8_API_URL`, which `vite.config.ts` reads).
2. `npm install`, then `npx playwright install chromium` for the browser layer.

Both layers **degrade gracefully**: the API suite skips itself (with a console
note) if the server is unreachable; Playwright reuses an already-running dev
server or starts one.

## Layout

```
e2e/
  live/                 # Vitest, *.live.spec.ts — talks to the server directly (node fetch)
    server.ts           #   client config + reachability gate + cleanup tracker
    fixtures.ts         #   synthesized DAGs (linear, every-type, nested, massive, invalid)
    handshake.live.spec.ts
    roundtrip.live.spec.ts
    validation-parity.live.spec.ts
    execution.live.spec.ts
  browser/              # Playwright, *.spec.ts — drives Chromium via the dev proxy
    seed.ts             #   pre-seeds the persisted connection
    connect.spec.ts  sequences.spec.ts  instances.spec.ts  canvas.spec.ts
```

## Notes

- The API layer **creates and deletes** its sequences (cleanup in `afterAll`).
  Instances it starts are **not** deleted — the server exposes no instance-delete
  endpoint, so a handful of terminal test instances accumulate. This is expected.
- Test data is tenant `acme`, namespace `default`, with innocuous `noop` handlers
  so executions have no real side effects.
