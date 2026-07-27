# Notes from video-shotcraft

Reference: https://github.com/Vincentwei1021/video-shotcraft

## What we borrowed (ideas, not code)

1. **Staged pipeline with explicit artifacts** — product brief → plan → capture → implement → QA.  
   Mapped here to `scenario → script → record → edit-plan → final`.

2. **Agent skill as the orchestration surface** — `skills/auto-demo-video/SKILL.md` tells coding agents which docs/commands to run, instead of stuffing everything into a chat prompt.

3. **Shot / scene cards as vocabulary** — shotcraft’s 100+ recipe cards inspire our `steps[].kind` + optional `highlight` flags. We stay thinner: kinds are executable, not pure motion design.

4. **Capture before expensive assembly** — do not invent selectors in Remotion; capture truth from the product first.

5. **QA stills** — recommend `npx remotion still` (or ffmpeg frame extract) after packaging.

## What we do differently

| | video-shotcraft | auto-demo-video |
|---|---|---|
| Primary footage | Screenshots + Remotion 2.5D | Playwright live session |
| Interaction | Simulated | Real click/type/agent |
| Edit telemetry | Manual storyboard | `meta.log` + `clicks.json` |
| Zoom | Post / 2.5D page camera | In-page edge-clamped camera at capture |
| Audio library | Large SFX/BGM pack | Out of scope (v0) |

## Attribution

video-shotcraft is independently licensed by its authors. This project does not vendor their assets or Remotion demos. When combining both tools in a production, respect Remotion’s license and shotcraft’s LICENSE.
