# KAPTAN Brand Launch Reel — Production Notes

## Deliverables
| File | Format | Notes |
|---|---|---|
| KAPTAN-Launch-Reel-Vertical-DE.mp4 | 1080×1920, 30 fps, 30 s | German on-screen captions, music |
| KAPTAN-Launch-Reel-Vertical-EN.mp4 | 1080×1920, 30 fps, 30 s | English on-screen captions, music |
| KAPTAN-Launch-Website-16x9-EN.mp4 | 1920×1080, 30 fps, 30 s | Fully readable without sound |
| KAPTAN-Launch-Cover-*.jpg | 1080×1920 / 1920×1080 | Cover frames (bag + line) |
| KAPTAN-Launch-VO-DE.srt / -EN.srt | SRT | Voiceover script with timings, also usable as subtitle files |
| KAPTAN-Launch-Source.zip | HTML/JS/Python | Editable source (see below) |

All captions sit inside platform-safe margins (vertical: text between y 230–1560 px, 90 px side margins).

## Storyboard (all versions)
| Time | Visual | DE caption | EN caption |
|---|---|---|---|
| 0–3 s | Blurred glow of the star candle holder, gold rule draws | Dein Alltag / verdient mehr. | Your everyday / deserves more. |
| 3–6 s | KAPTAN laptop bag on black, gold light sweep → texture push-in | KAPTAN Leder · Lederbegleiter für jeden Weg. | KAPTAN Leather · Leather essentials for everyday journeys. |
| 6–10 s | Heart candle holder → fire bowl lamp → camel salt lamp (real product footage) | KAPTAN Salzlampen · Salzlampen für ein wärmeres Zuhause. | KAPTAN Salt Lamps · Salt accents for a warmer home. |
| 10–12.25 s | Man leaving café with laptop | Auf dem Weg zur Arbeit · Praktisch durchdacht. | Heading to work · Practical by purpose. |
| 12.25–14.5 s | Walking with the leather bag | Unterwegs · Details, die zählen. | On the move · Considered details. |
| 14.5–16.75 s | Star candle holder lit | Ein Geschenk mit Bedeutung · Persönliche Antworten – vor und nach der Bestellung. | A thoughtful gift · A human answer, before and after your order. |
| 16.75–19 s | Fire bowl lamp on bedside table | Nach Hause kommen · Für dich da – auch nach dem Kauf. | Coming home · Care beyond checkout. |
| 19–25 s | Bag hero, slow push, light sweep | Gemacht für deinen Weg. / Gebaut, um deins zu werden. | Made for the journey. / Built to become yours. |
| 25–30 s | Logo reveal | Lerne KAPTAN kennen. / Finde deinen Begleiter für jeden Tag. / kaptangrp.com | Meet KAPTAN. / Find your everyday companion. / kaptangrp.com |

## Claims check
Every line traces to kaptangrp.com wording: "Made for the journey. Built to become yours.", "Find your everyday companion", "Considered details / Practical by purpose / Care beyond checkout", "Your questions deserve a human answer, before and after your order", "salt accents for a warmer home", gift use ("Housewarming Gifts", "Gift Giving"). No material grades, origin, health, testimonial, certification or guarantee claims are made.

## Still to do (not rendered)
1. **Voiceover** — no text-to-speech or recording was available in this session. Record DE and EN from the SRT files (≈ 75 words each, calm and warm, ~130 wpm), then mix: `ffmpeg -i reel.mp4 -i vo.wav -filter_complex "[0:a]volume=0.35[m];[m][1:a]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac out.mp4`
2. **Music licence** — the reels use the KAPTAN brand track (supplied by you, from 0:20). Confirm it is licensed for commercial use on Instagram, TikTok and your website, or swap it for a licensed track (audio-only re-mux, no re-render).
3. **More real product footage** — clean (text-free) versions of the laptop-bag film and close-ups of the belt and mini wallet would improve the 3–10 s section. The laptop bag also does not appear as a product on the website yet.

## Editable source
Unzip KAPTAN-Launch-Source.zip, copy your four clips into ./clips and run ./extract_frames.sh, then:
```
npm install          # fonts + playwright
python3 gen_launch.py v_de v_en h_en     # edit TEXT / MEDIA / CSS at the top first
node render3.js launch_v_de             # writes 6 scene MP4s; concat + add music as in build.sh
```
