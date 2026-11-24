// Docs screenshots only (no video), against a running app: `npx tsx scripts/shots.mts` (URL, OUT env vars).
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP_URL = process.env.URL ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? fileURLToPath(new URL('../docs', import.meta.url));
const browser = await chromium.launch();

const s = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await s.goto(APP_URL);
await s.waitForTimeout(2500);
if (process.env.INTRO) await s.screenshot({ path: `${OUT}/intro.png` });
await s.click('[aria-label="Dismiss introduction"]');
await s.waitForTimeout(1500);
await s.screenshot({ path: `${OUT}/overview.png` });
await s.locator('.site-marker.critical').first().click();
await s.waitForTimeout(2000);
await s.screenshot({ path: `${OUT}/site-detail.png` });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(APP_URL);
await phone.waitForTimeout(2500);
await phone.click('[aria-label="Dismiss introduction"]');
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${OUT}/phone.png` });
if (process.env.INTRO) {
  await phone.screenshot({ path: `${OUT}/phone-full.png`, fullPage: true });
  await phone.locator('.site-marker.critical').first().click();
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: `${OUT}/phone-detail.png` });
}
await browser.close();
