// Records docs/demo.{webm,mp4,gif} and the docs screenshots against a running app (`npm run dev`).
// One-off tools, kept out of the workspaces: `npm i --no-save playwright ffmpeg-static && npx playwright install chromium`
// Then: `npx tsx scripts/record-demo.mts` (URL=http://localhost:5173 by default).
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { chromium, type Page } from 'playwright';
import { SITES, TICK_MS, nextAlertState, severityOf, simulateReading, waterLevelCm, type Severity } from '../shared/src/index.ts';

const APP_URL = process.env.URL ?? 'http://localhost:5173';
const DOCS = fileURLToPath(new URL('../docs', import.meta.url));
const level = (i: number, t: number) => waterLevelCm(SITES[i], simulateReading(SITES[i], t).distanceCm);

// The simulator is deterministic, so find a load time where roads are already closed
// and the first new alert fires ~24 s after the page opens.
function findStart(): { t0: number; alertAt: number } {
  for (let t0 = Math.ceil(Date.now() / TICK_MS) * TICK_MS + 15_000; ; t0 += TICK_MS) {
    const crit = (t: number) => SITES.filter((_, i) => severityOf(level(i, t)) === 'critical').length;
    if (crit(t0) < 3 || crit(t0 + 25_000) < 2) continue;
    const alerted: Severity[] = SITES.map((_, i) => severityOf(level(i, t0)));
    for (let t = t0 + TICK_MS; t < t0 + 40_000; t += TICK_MS) {
      const raised = SITES.some((_, i) => {
        const s = nextAlertState(alerted[i], level(i, t));
        alerted[i] = s.alerted;
        return s.raised;
      });
      if (raised) {
        if (t - t0 >= 24_000 && t - t0 <= 30_000) return { t0, alertAt: t };
        break;
      }
    }
  }
}

const pause = (p: Page, ms: number) => p.waitForTimeout(ms);
async function glide(p: Page, selector: string) {
  const box = (await p.locator(selector).first().boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
}

const { t0, alertAt } = findStart();
console.log('load at', new Date(t0).toLocaleTimeString(), 'alert at', new Date(alertAt).toLocaleTimeString());
await new Promise((r) => setTimeout(r, t0 - Date.now() + 500));

const browser = await chromium.launch();
const video = await browser.newContext({ viewport: { width: 1280, height: 860 }, recordVideo: { dir: DOCS, size: { width: 1280, height: 860 } } });
// Headless video has no mouse pointer: draw one so viewers can follow the clicks.
await video.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid #fff;pointer-events:none;transition:transform .15s;left:-50px;top:-50px';
    document.body.append(dot);
    addEventListener('mousemove', (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.6)'; }, true);
    addEventListener('mouseup', () => { dot.style.transform = 'none'; }, true);
  });
});
const shots = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const recordingStart = Date.now();
const v = await video.newPage();
const s = await shots.newPage();
await Promise.all([v.goto(APP_URL), s.goto(APP_URL)]);
await v.locator('.site-marker').first().waitFor();
const blankSeconds = String((Date.now() - recordingStart) / 1000); // trimmed from the video

// 1. Intro
await pause(v, 5000);
await glide(v, '[aria-label="Dismiss introduction"]');
await pause(v, 600);
await v.click('[aria-label="Dismiss introduction"]');
await pause(v, 1200);
// 2. Map: hover a couple of sites
for (const sel of ['.site-marker.normal', '.site-marker.warning, .site-marker.watch']) {
  await glide(v, sel);
  await pause(v, 1500);
}
// 3. Click a critical site, explore the chart
await glide(v, '.site-marker.critical');
await pause(v, 500);
await v.locator('.site-marker.critical').first().click();
await pause(v, 2500);
await glide(v, '.recharts-surface');
await v.mouse.move(1180, 470, { steps: 40 });
await pause(v, 2000);
const before = await v.locator('[aria-live] li').count();
await v.click('aside [aria-label="Close details"]');
// 4. Wait for the new alert, then open it
await v.waitForFunction((n) => document.querySelectorAll('[aria-live] li').length > n, before, { timeout: 40_000 });
await pause(v, 2500);
await glide(v, '[aria-live] li button');
await pause(v, 600);
await v.click('[aria-live] li button');
await pause(v, 4000);
await video.close();
const raw = await v.video()!.path();

// Screenshots: overview with alerts, then the drawer
await s.locator('[aria-live] li').first().waitFor({ timeout: 40_000 });
await pause(s, 1000);
await s.screenshot({ path: `${DOCS}/overview.png` });
await s.locator('.site-marker.critical').first().click();
await pause(s, 1500);
await s.mouse.move(1300, 470);
await pause(s, 500);
await s.screenshot({ path: `${DOCS}/site-detail.png` });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(APP_URL);
await pause(phone, 2500);
await phone.click('[aria-label="Dismiss introduction"]');
await pause(phone, 800);
await phone.screenshot({ path: `${DOCS}/phone.png` });

await browser.close();

// Encode without the blank frames before the page loaded; the gif is kept small (under 5 MB) for the README.
const encode = (...args: string[]) => execFileSync(ffmpeg!, ['-loglevel', 'error', '-y', '-ss', blankSeconds, '-i', raw, '-an', ...args]);
encode('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', `${DOCS}/demo.webm`);
encode('-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${DOCS}/demo.mp4`);
encode('-vf', 'fps=6,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', `${DOCS}/demo.gif`);
rmSync(raw);
console.log('Wrote docs/demo.{webm,mp4,gif} and screenshots');
