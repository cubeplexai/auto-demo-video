# Polish stage (FocuSee-like packaging)

Turn a raw Playwright recording into a share-ready demo frame:

1. **Post zoom** from `clicks.json` (edge-clamped crop → scale)  
2. **Window chrome** — content in a rounded rectangle floating on a soft wallpaper  

Inspired by tools like [FocuSee](https://focusee.imobie.com/) (auto zoom + window layout). This is a programmable subset, not a GUI clone.

## Usage

```bash
# From a record take
adv polish --meta runs/job/02-record/meta.json --export runs/job/polished.mp4

# From arbitrary video + clicks
adv polish --video session.webm --clicks clicks.json --out runs/polish

# Chrome only (no zoom)
adv polish --video session.mp4 --no-zoom --export out.mp4
```

## How zoom works

For each click at time `t` and page coords `(x, y)`:

- Window ≈ `[t − 0.45s, t + 1.3s]`  
- Crop a `viewport/scale` rectangle, edge-biased if near screen borders  
- Scale crop to content size (default 1600×900)  
- Non-click intervals stay full-frame (letterboxed into content size)  

Segments are concatenated, then placed on wallpaper with a rounded alpha mask.

## Options

| Flag / option | Default | Meaning |
|---|---|---|
| `--zoom-scale` | `2` | Peak digital zoom |
| `--no-zoom` | off | Skip zoom track |
| `--no-chrome` | off | Skip wallpaper/window |

## Pipeline placement

```text
record → (optional edit/render for cuts)
      ↘ polish  → polished.mp4
```

Prefer polishing **raw** `meta.masterVideo` so click timestamps stay aligned.  
If you need both highlight cuts *and* chrome, polish first or re-time clicks (future work).

## Limits (vs FocuSee)

| FocuSee | Here |
|---|---|
| Continuous mouse-follow pan | Discrete zoom windows on clicks |
| 3D tilt / motion blur | Not yet |
| Cursor style pack + SFX | Capture-time cinematic cursor only |
| Webcam / captions ASR | Out of scope |
| GUI timeline to tweak zoom | Edit `zoom-timeline.json` / re-run |

## Output

```text
out/
  polished.mp4
  polish.json
  zoom-timeline.json
  polish-work/          # intermediate segments + chrome assets
```
