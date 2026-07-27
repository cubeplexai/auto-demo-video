# auto-demo-video

**Scenario → script → Playwright cinematic record → smart edit → final MP4**

A **generic** toolkit for product demo videos of real web apps: live clicks/typing, optional agent waits, edge-aware zoom at capture time, and highlight cutting from recording telemetry.

**Product-specific behavior does not live here.** Put scenarios, credentials, and adapters in *your* app or marketing repo; point this tool at them.

> Complements [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) (shot cards + Remotion stills). See [docs/shotcraft-notes.md](docs/shotcraft-notes.md).

## Install

```bash
git clone https://github.com/cubeplexai/auto-demo-video.git
cd auto-demo-video
npm install
```

Agent skill (optional):

```bash
npx skills add cubeplexai/auto-demo-video
```

## Quick start

```bash
# Plan from a scenario living in *your* project
node bin/adv.mjs plan \
  --scenario /path/to/your-product/demos/scenario.yaml \
  --code-root /path/to/your-product \
  --out runs/demo/01-plan

export BASE_URL=http://127.0.0.1:3000
export DEMO_EMAIL=...
export DEMO_PASSWORD=...

node bin/adv.mjs record --script runs/demo/01-plan/script.json --out runs/demo/02-record
node bin/adv.mjs edit   --meta runs/demo/02-record/meta.json --target-sec 90 --out runs/demo/03-edit
node bin/adv.mjs render --plan runs/demo/03-edit/edit-plan.json --export runs/demo/final.mp4
```

One shot:

```bash
node bin/adv.mjs all --scenario /path/to/scenario.yaml --out runs/demo
```

## What belongs where

| In **this** repo | In **your** product/marketing repo |
|---|---|
| Planner, recorder, editor, renderer | `scenario.yaml` use cases & copy |
| Generic Playwright step runner | Selectors, prompts, brand captions |
| Built-in `generic-web` adapter only | External `adapter.mjs` (login, tenancy, workspace pick) |
| Cinematic zoom engine | Credentials, seed tenants, `storage-state.json` |
| Schemas + CLI | CI job that calls `adv all` |

## External adapters

Only built-in adapter: **`generic-web`**.

For anything product-specific (workspace picker, SSO, org slug, chat placeholder):

```yaml
# your-product/demos/scenario.yaml
adapter: ./adapters/my-app.mjs   # path relative to cwd when you run adv
adapterOptions:                   # free-form; only your adapter reads this
  homePath: /app
  pickLabel: Production
```

See [examples/external-adapter.example.mjs](examples/external-adapter.example.mjs).

```js
// your-product/adapters/my-app.mjs
export default {
  loginPath: '/login',
  async afterLogin(page, { baseUrl, adapterOptions }) { /* ... */ },
  composerPlaceholders: ['Your product composer placeholder'],
  custom: { /* named hooks for kind: custom */ },
}
```

## Pipeline

| Stage | Artifact |
|---|---|
| **plan** | `script.json` |
| **record** | `session.webm`, `meta.json`, `clicks.json` |
| **edit** | `edit-plan.json` |
| **render** | `final.mp4` |

Details: [docs/pipeline.md](docs/pipeline.md)

## Scenario / script schemas

- [schemas/scenario.schema.json](schemas/scenario.schema.json)
- [schemas/script.schema.json](schemas/script.schema.json)
- [schemas/edit-plan.schema.json](schemas/edit-plan.schema.json)

Minimal example: [examples/generic/scenario.yaml](examples/generic/scenario.yaml)

Step kinds: `navigate` · `click` · `type` · `send_message` · `wait_idle` · `wait_ms` · `screenshot` · `open_panel` · `assert_text` · `custom`

## Env (generic)

```bash
BASE_URL=
DEMO_EMAIL=
DEMO_PASSWORD=
DEMO_OTP=              # optional
REDIS_URL=             # optional OTP helper
HEADLESS=1
AGENT_TIMEOUT_MS=300000
COMPOSER_PLACEHOLDER=  # chat input placeholder if not via adapter
ADV_REQUIRE_CREDS=1    # set 0 when using storageState-only auth
DEMO_CTA=              # endcard line
```

## License

Apache-2.0
