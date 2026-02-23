# Split Flux Icon Spec

Base source:
- `/Users/mac/Desktop/Echo/src/assets/icons/echo-split-flux.svg`

## Export Sizes

Export square PNG assets at:
- `1024x1024`
- `512x512`
- `256x256`
- `128x128`
- `64x64`
- `32x32`
- `16x16`

## Layout Rules

- Artboard: `1024x1024`
- Background shape frame: `x=68, y=68, w=888, h=888, r=210`
- Outer safety margin: `68px` (6.6%)
- Primary symbol visual center: `512,512`
- Symbol max bounds: `x=262..762`, `y=339..685`

## Small-Size Legibility

When exporting `32px` and `16px`:
- Keep the symbol stroke visually >= `1.75px` at target size.
- Reduce blur/glow intensity by ~30% to avoid bloom.
- Preserve open stroke terminals so the infinity silhouette does not merge.

## Platform Notes

- macOS (`.icns`): use rounded-square source as-is; keep alpha channel clean.
- Windows (`.ico`): include at least `16, 24, 32, 48, 64, 128, 256`.
- Linux desktop icon (`.png`): prefer `256` and `512` for launcher crispness.
- Installer assets: always export from vector source; avoid upscaling from PNG.
