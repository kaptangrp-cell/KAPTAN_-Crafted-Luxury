# KAPTAN Dynamic Collection Film

Deliverable: KAPTAN-Dynamic-Collection-5min-1080p.mp4

- Authored duration: 300 seconds (10 products, 30 seconds each).
- Format: landscape 1920×1080, 24 fps, H.264 MP4, silent, web fast-start.
- Left half: five-item product list with current product highlighted; list changes after product five.
- Right half: overlapping shuffled cards (0–10s), orbital carousel (10–18s), swipe demonstration (18–24s), original product video (24–30s) where available; otherwise photo detail.
- MP4 is a passive video. Swipe motion is demonstrated; there are no interactive controls in the export.
- All products, prices and source URLs were read from the published KAPTAN catalog on 13 November 2026. Prices and availability can change; the store remains authoritative.
- Product titles are shortened for readability; full originals are retained in manifest.json.
- Source images preserve their original printed labels, including German text.
- Graphic palette: #000000, #0d0d0d, #1a1a1a, #c9a227, #f9f6ee and neutral secondary text.
- Fonts: the store's installed Inter and Playfair Display fonts, converted losslessly from WOFF2 to TTF for rendering.
- Real product photography and clips are used; no generated products or fabricated prices.
- Existing source clips are sampled at normal speed, with source audio omitted.

## Rebuild
Python 3.9+, Pillow, imageio-ffmpeg, fonttools and brotli.
The current machine dependencies are in /tmp/kaptan-video-libs.
Run `PYTHONPATH=/tmp/kaptan-video-libs python3 render.py` from this folder.
`python3 render.py --preview` writes representative stills.
The renderer evaluates frames deterministically and streams to FFmpeg without holding the film in memory.

Files: catalog.json (public catalog snapshot), manifest.json (asset provenance), assets/ (original downloaded assets and fonts), prepare.py (asset preparation), render.py (timeline and render), check-*.jpg (render checkpoints).
