---
name: auto-demo-video
description: >
  Build product demo videos from use-case scenarios: plan a record script,
  Playwright cinematic recording, smart highlight edit, ffmpeg render.
  Use for automated product demos of real web apps. Product-specific adapters
  and scenarios must live outside this package.
---

# auto-demo-video

Generic pipeline for **live** product demos.

## Hard rule

**Do not add product-specific logic into the auto-demo-video repository**
(workspace names, brand prompts, tenancy pickers, app testids).  
Keep those in the consumer app / marketing repo and pass them via:

- `scenario.yaml` (steps, captions, prompts)  
- `adapter: ./path/to/adapter.mjs` + `adapterOptions`  
- env credentials / `storage-state.json`  

## Commands

```bash
adv plan   --scenario <yaml> [--code-root <dir>]
adv record --script <script.json>
adv edit   --meta <meta.json> [--target-sec 90]
adv render --plan <edit-plan.json>
adv all    --scenario <yaml> --out runs/job
```

## Adapters

Built-in: **`generic-web` only**.

External:

```yaml
adapter: ./demos/adapter.mjs
adapterOptions:
  # free-form for your adapter
```

Shape: `export default { loginPath?, isAuthed?, afterLogin?, custom?, composerPlaceholders? }`.

## Workflow

1. Author scenario + optional external adapter in the **product** repo.  
2. `adv plan` → review `script.json`.  
3. Set `BASE_URL` + credentials (or storage state).  
4. `adv record` → inspect meta/screens.  
5. `adv edit` → `adv render` → `final.mp4`.  
6. Optional Remotion packaging in another project.

## Docs

- `docs/pipeline.md`  
- `docs/shotcraft-notes.md`  
- `schemas/*.json`  
