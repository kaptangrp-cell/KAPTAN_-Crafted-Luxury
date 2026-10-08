// Renders endcard.html to renders/kaptan-endcard-1080p.webm, frame-exact (no realtime capture).
// Usage: node render-endcard.mjs   (needs playwright-core + a Playwright chromium & ffmpeg in ~/Library/Caches/ms-playwright)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(homedir(), 'Library/Caches/ms-playwright');
const FPS = 30;
const out = path.join(here, 'renders/kaptan-endcard-1080p.webm');

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? path.join(cache, 'chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(path.join(here, 'endcard.html')).href + '?render');
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => window.TOTAL);
const frames = Math.round((total / 1000) * FPS);

const ff = spawn(process.env.FFMPEG ?? path.join(cache, 'ffmpeg-1011/ffmpeg-mac'), [
  '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
  '-c:v', 'libvpx', '-b:v', '12M', '-qmin', '0', '-qmax', '20', '-deadline', 'good', '-cpu-used', '1', '-auto-alt-ref', '0', out,
], { stdio: ['pipe', 'ignore', 'inherit'] });
ff.on('exit', code => { if (code) { console.error('ffmpeg exited', code); process.exit(1); } });

for (let f = 0; f < frames; f++) {
  await page.evaluate(ms => window.seek(ms), (f * 1000) / FPS);
  const png = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (f === Math.round(frames * 0.45)) await page.screenshot({ path: path.join(here, 'renders/endcard-still-tagline.png') });
  if (f === frames - 30) await page.screenshot({ path: path.join(here, 'renders/endcard-still-emblem.png') });
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log(`wrote ${out} (${frames} frames @ ${FPS}fps)`);
