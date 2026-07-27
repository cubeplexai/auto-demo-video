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

## Stage 1 — Plan

**Input:** product use-case (`scenario.yaml`) + optional code tree  
**Output:** `script.json` (record-ready steps), `planner-prompt.md` (for agents)

```bash
adv plan --scenario examples/cubeplex/scenario.yaml --code-root /path/to/app
```

The planner:

1. Groups steps into scenes  
2. Scans code for `data-testid` / placeholders (selector hints)  
3. Emits captions stubs  
4. Writes an agent prompt if you want LLM polish before recording  

## Stage 2 — Record (raw material)

**Input:** `script.json` + credentials env  
**Output:** `session.webm`, `meta.json` (timeline), `clicks.json`, screenshots  

```bash
adv record --script runs/.../script.json --out runs/job/02-record
```

Recording uses Playwright + in-page **cinematic camera** (edge-clamped ~2× zoom, ripple, fake cursor).  
Product-specific login/workspace logic lives in **adapters** (`generic-web`, `cubeplex`).

## Stage 3 — Edit

**Input:** `meta.json` (+ clicks)  
**Output:** `edit-plan.json` — segments with start/end, speed, transitions  

```bash
adv edit --meta runs/job/02-record/meta.json --target-sec 90
```

Heuristics:

- Keep scene heads + payoffs; compress long mid-scene waits (`speed: 4`)  
- Prefer highlight scenes / click windows  
- Fit to target duration by dropping waits then truncating  

## Stage 4 — Render

**Input:** `edit-plan.json`  
**Output:** `final.mp4` (+ clean + srt)  

```bash
adv render --plan runs/job/03-edit/edit-plan.json --export runs/job/final.mp4
```

ffmpeg cuts, speeds, concatenates, optional endcard, burns captions.

## One shot

```bash
adv all --scenario examples/cubeplex/scenario.yaml --out runs/demo1
```

## Relationship to Remotion / video-shotcraft

| Tool | Strength |
|---|---|
| **auto-demo-video** | Live product interaction, real agents, selector-driven scripts, smart cut from telemetry |
| **Remotion** | Titles, lower-thirds, brand packaging on top of exported MP4 |
| **video-shotcraft** | Shot recipe cards, 2.5D cinematic stills, SFX/BGM methodology |

Use shotcraft’s *pipeline discipline* (design before expensive shots) and Remotion for packaging; use this tool for **true UI demos**.
