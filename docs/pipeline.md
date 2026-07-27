# Pipeline — four stages

```text
scenario.yaml  ──plan──►  script.json  ──record──►  meta.json + session.webm
                                                      │
                                                      ▼
                                              edit-plan.json
                                                      │
                                                      ▼
                                                 final.mp4
```

Product-specific inputs (scenario files, adapters, credentials) live **outside** this package.

## Stage 1 — Plan

```bash
adv plan --scenario /path/to/scenario.yaml --code-root /path/to/app --out runs/job/01-plan
```

- Groups steps into scenes  
- Optional code scan for `data-testid` / placeholders (hints only)  
- Writes `planner-prompt.md` for optional agent polish  

## Stage 2 — Record

```bash
adv record --script runs/job/01-plan/script.json --out runs/job/02-record
# optional: --include-auth | --no-include-auth
```

- Playwright + in-page cinematic camera  
- Auth: generic email/password (+ optional OTP helpers)  
- Product hooks: **external adapter** (`afterLogin`, `custom`, …)  
- **Recording window:** by default setup (login + adapter) is silent; video
  starts only after the session is ready (`record.includeAuth: false`).
  Set `includeAuth: true` / `--include-auth` to film from login.
  Optional `record.startUrl` / `ADV_START_URL` after setup.  

## Stage 3 — Edit

```bash
adv edit --meta runs/job/02-record/meta.json --target-sec 90 --out runs/job/03-edit
```

- Scene heads + payoffs; compress long waits (`speed > 1`)  
- Prefer click windows / highlight scenes  
- Fit to target duration  

## Stage 4 — Render

```bash
adv render --plan runs/job/03-edit/edit-plan.json --export runs/job/final.mp4
```

ffmpeg cut / speed / concat / endcard / captions.

## One shot

```bash
adv all --scenario /path/to/scenario.yaml --out runs/job
```

## Adapters

Built-in: `generic-web` only.

```yaml
adapter: ./adapters/my-app.mjs   # or npm package name
adapterOptions: { }              # opaque to core; for your adapter only
```

See `examples/external-adapter.example.mjs`.
