# auto-demo-video

**Scenario → script → Playwright cinematic record → smart edit → final MP4**

Reusable toolkit for product demo videos of **real web apps** (live clicks, typing, agents), with edge-aware zoom at capture time and highlight cutting driven by recording telemetry.

> Related: [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) (shot recipe cards + Remotion stills) — see [docs/shotcraft-notes.md](docs/shotcraft-notes.md) for what we learned and how the tools complement each other.

## Install

```bash
git clone https://github.com/cubeplexai/auto-demo-video.git
cd auto-demo-video
npm install
```

Optional agent skill:

```bash
npx skills add cubeplexai/auto-demo-video
# or symlink skills/auto-demo-video into your agent skills dir
```

## Quick start

```bash
# 1) Plan from a use-case scenario
node bin/adv.mjs plan \
  --scenario examples/cubeplex/scenario.yaml \
  --code-root /path/to/your/app \
  --out runs/demo/01-plan

# 2) Record (needs running app + credentials)
export BASE_URL=http://127.0.0.1:3000
export DEMO_EMAIL=...
export DEMO_PASSWORD=...
node bin/adv.mjs record \
  --script runs/demo/01-plan/script.json \
  --out runs/demo/02-record

# 3) Edit highlights (compress waits, keep payoffs)
node bin/adv.mjs edit \
  --meta runs/demo/02-record/meta.json \
  --out runs/demo/03-edit \
  --target-sec 90

# 4) Render final
node bin/adv.mjs render \
  --plan runs/demo/03-edit/edit-plan.json \
  --out runs/demo/04-render \
  --export runs/demo/final.mp4
```

Or one shot:

```bash
node bin/adv.mjs all --scenario examples/cubeplex/scenario.yaml --out runs/demo
```

## Pipeline

| Stage | Artifact | Role |
|---|---|---|
| **plan** | `script.json` | Scenario + code scan → record script |
| **record** | `session.webm`, `meta.json`, `clicks.json` | Raw material with cinematic zoom |
| **edit** | `edit-plan.json` | Segments, speed, transitions, captions |
| **render** | `final.mp4` | ffmpeg cut/speed/concat/endcard/subs |

Details: [docs/pipeline.md](docs/pipeline.md)

## Scenario format

See [schemas/scenario.schema.json](schemas/scenario.schema.json) and [examples/cubeplex/scenario.yaml](examples/cubeplex/scenario.yaml).

Step kinds: `navigate` · `click` · `type` · `send_message` · `wait_idle` · `wait_ms` · `screenshot` · `open_panel` · `assert_text` · `custom`

## Adapters

Product-specific auth / workspace selection:

- `generic-web` — default  
- `cubeplex` — Team Workspace selection (skips Personal)

## Cinematic camera

In-page zoom (~2×) with **edge clamping** (sidebar clicks hug the left), click ripple, and a fake cursor (headless has no OS cursor in Playwright video). Coordinates are converted page↔screen so multi-zoom (composer → send) stays aligned.

## Env

```bash
BASE_URL=
DEMO_EMAIL=
DEMO_PASSWORD=
DEMO_OTP=                 # optional
REDIS_URL=                # optional, email_otp:{email} hash field code
WORKSPACE_NAMES=Team Workspace,test
FORBIDDEN_WORKSPACES=Personal
HEADLESS=1
AGENT_TIMEOUT_MS=300000
COMPOSER_PLACEHOLDER=     # override chat input placeholder
DEMO_CTA=github.com/you/repo
```

Copy to `config.env` in the working directory.

## Status

**v0.1** — usable MVP for CubePlex-style demos; edit heuristics are deterministic (no ML). Remotion packaging remains optional and external.

## License

Apache-2.0
