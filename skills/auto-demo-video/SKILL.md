---
name: auto-demo-video
description: >
  Build product demo videos from use-case scenarios: plan a record script from
  scenario + code, Playwright cinematic recording, smart highlight edit, ffmpeg
  render. Use when the user wants automated product demos, screen recordings of
  real app flows, highlight reels from meta/clicks, or says "auto-demo-video" / "adv".
---

# auto-demo-video

Reusable pipeline for **live** product demos (not screenshot-only promos).

## Commands

From a checkout of this repo (or global `adv` after `npm i -g`):

```bash
adv plan   --scenario <yaml> [--code-root <app>]
adv record --script <script.json>
adv edit   --meta <meta.json> [--target-sec 90]
adv render --plan <edit-plan.json>
adv all    --scenario <yaml> --out runs/job
```

Read `docs/pipeline.md` for stage contracts. Schemas live in `schemas/`.

## When to use which tool

- **Live multi-step product UI** (login, chat, sandbox, panels) → this skill.  
- **Cinematic stills / 2.5D brand film** → consider video-shotcraft + Remotion.  
- **Titles/lower-thirds packaging** of our `final.mp4` → Remotion project.

## Agent workflow

1. Collect or write `scenario.yaml` (see `examples/`).  
2. `adv plan` — review `script.json`; optionally refine with code scan hints.  
3. Ensure env: `BASE_URL`, `DEMO_EMAIL`, `DEMO_PASSWORD` (OTP/redis if needed).  
4. `adv record` — inspect `meta.json` timeline + screenshots before editing.  
5. `adv edit` — inspect `edit-plan.json` segments (waits should be speed>1).  
6. `adv render` — ship `final.mp4`.  
7. Optional: wrap with Remotion intro/outro.

## Adapters

- `generic-web` — login + navigate  
- `cubeplex` — Team/test workspace selection (never Personal)

Add new adapters under `src/adapters/` and register in `src/adapters/index.mjs`.

## Guardrails

- Prefer real `data-testid` / placeholders from the app code.  
- Do not claim unreleased features in captions.  
- Never demo with real customer PII; use seed tenants.  
- Cinematic zoom uses **page-space** coordinates after CSS camera transform.
