// Records docs/walkthrough.mp4: a narrated 1080p "keynote" walkthrough of every feature (title card, nine chapters,
// recap, outro) with the app framed in a floating browser window, subtitles, a glide cursor, spotlight and zoom.
//
// Frame-exact and stutter-free: the page runs on a virtual clock (Date, timers, requestAnimationFrame and every CSS
// animation are stepped 1/30 s per frame) and each frame is a screenshot, so the result doesn't depend on machine load.
// The app's Socket.IO stream and REST history come from a mirror of server/src/index.ts started here on the same
// virtual clock (same shared simulator, same events), so live data, alerts and the outage demo are deterministic.
//
// One-off tools, kept out of the workspaces: `npm i --no-save playwright ffmpeg-static && npx playwright install chromium`,
// plus the offline Piper TTS (https://github.com/rhasspy/piper) and a voice (en_US-ryan-high was used).
// Start the app (`npm run dev`), then:
//   PIPER=/path/to/piper PIPER_MODEL=/path/to/en_US-ryan-high.onnx npx tsx scripts/record-walkthrough.mts
// Optional env: URL (app, default http://localhost:5173), SERVER (the URL the client was built to use, default
// http://localhost:4000), FFMPEG (default ffmpeg-static), T0 (virtual start time in ms; searched if unset),
// WORK (cache dir for TTS clips and the intermediate video), CRF (final quality, default 26).
// The narration lives in scripts/walkthrough-narration.md (one `### key` section per scene, one line per sentence).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import { chromium, type FrameLocator, type Locator, type Page } from 'playwright';
import { Server } from 'socket.io';
import { SITES, TICK_MS, findSite, nextAlertState, severityOf, simulateHistory, simulateReading, waterLevelCm } from '../shared/src/index.ts';

const APP_URL = (process.env.URL ?? 'http://localhost:5173').replace(/\/$/, '');
const APP_SERVER = (process.env.SERVER ?? 'http://localhost:4000').replace(/\/$/, '');
const FFMPEG = process.env.FFMPEG ?? ffmpegStatic!;
const PIPER = process.env.PIPER ?? 'piper';
const PIPER_MODEL = process.env.PIPER_MODEL;
if (!PIPER_MODEL) throw new Error('Set PIPER_MODEL to a Piper voice .onnx file');
const DOCS = fileURLToPath(new URL('../docs/', import.meta.url));
const WORK = process.env.WORK ?? join(tmpdir(), 'floodwatch-walkthrough');
mkdirSync(WORK, { recursive: true });

const FPS = 30, W = 1920, H = 1080, GAP = 0.35, ACCENT = '#2563EB';
// Desktop window: the app runs at 1600x900 CSS px, drawn at 0.9 under a 40 px title bar.
const APP_W = 1600, APP_H = 900, AS = 0.9, BAR = 40, WIN_X = (W - APP_W * AS) / 2, WIN_Y = 86;
// Phone: 390x844 viewport at 0.92 inside a 12 px bezel.
const PH_S = 0.92, BEZEL = 12, PH_X = 520, PH_Y = Math.round((H - 844 * PH_S - 2 * BEZEL) / 2);

// ---------- 1. Narration: one Piper clip per sentence (cached), exact durations ----------
const SAY: [RegExp, string][] = [
  [/FloodWatch/g, 'Flood Watch'], [/Socket\.IO/g, 'Socket I O'], [/TypeScript/g, 'Type Script'],
  [/Recharts/g, 'Re-charts'], [/REST/g, 'rest'],
];
interface Line { text: string; wav: string; dur: number }
const CAPTION_ONLY = '[caption] '; // subtitle shown without being spoken (the self-introduction), for 2.6 s
const md = readFileSync(fileURLToPath(new URL('walkthrough-narration.md', import.meta.url)), 'utf8').split('<!-- narration -->')[1];
const scenes: Record<string, Line[]> = {};
for (const [, key, body] of md.matchAll(/^### (\S+)\n([\s\S]+?)(?=^### |(?![\s\S]))/gm)) {
  scenes[key] = body.trim().split('\n').map((text) => {
    if (text.startsWith(CAPTION_ONLY)) return { text: text.slice(CAPTION_ONLY.length), wav: '', dur: 2.6 };
    const spoken = SAY.reduce((t, [re, to]) => t.replace(re, to), text);
    const wav = join(WORK, `tts-${createHash('sha1').update(spoken + PIPER_MODEL).digest('hex').slice(0, 12)}.wav`);
    if (!existsSync(wav)) {
      const r = spawnSync(PIPER, ['-m', PIPER_MODEL, '-f', wav, '--length_scale', '1.05', '--sentence_silence', '0.3'], { input: spoken });
      if (r.status !== 0) throw new Error(`piper failed: ${r.stderr}`);
    }
    return { text, wav, dur: pcm(wav).length / 22050 };
  });
}
function pcm(wav: string): Int16Array {
  const b = readFileSync(wav);
  let o = 12;
  while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  if (b.readUInt32LE(24) !== 22050) throw new Error(`${wav}: expected 22050 Hz`);
  return new Int16Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + b.readUInt32LE(o + 4)));
}
console.log(`narration ${Object.values(scenes).flat().filter((l) => l.wav).reduce((s, l) => s + l.dur, 0).toFixed(1)} s in ${Object.values(scenes).flat().length} clips`);

// ---------- 2. Mirror of the server on the virtual clock (same endpoints and events as server/src/index.ts) ----------
const clock = { now: 0 };
function mirror() {
  const http = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', APP_URL);
    const url = new URL(req.url!, 'http://x');
    const m = url.pathname.match(/^\/api\/sites\/([^/]+)\/history$/);
    const json = (code: number, body: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/api/sites') return json(200, SITES.map((site) => ({ ...site, reading: simulateReading(site, clock.now) })));
    if (m && findSite(m[1])) return json(200, simulateHistory(findSite(m[1])!, clock.now, Math.min(Math.max(Number(url.searchParams.get('minutes')) || 30, 1), 180)));
    if (!url.pathname.startsWith('/socket.io')) json(404, { error: 'Not found' });
  });
  // Polling only: every packet goes through page.route, which is how the outage is staged.
  const io = new Server(http, { cors: { origin: APP_URL }, transports: ['polling'] });
  http.listen(0);
  return { io, http, port: () => (http.address() as { port: number }).port };
}

// ---------- 3. Virtual clock + animation stepping, injected into every frame ----------
// Iframes share the top window's clock; __vt.advanceTo(t) fires due timers in time order across frames,
// then rAF callbacks, then moves every CSS animation/transition forward by the same step.
const CLOCK_JS = (t0: number) => `(() => {
  let S;
  if (window.top === window) S = window.__vt = { now: ${t0}, frames: [], seq: 1 };
  else try { S = window.top.__vt; } catch {}
  if (!S) return;
  const RealDate = Date, perf0 = S.now, timers = new Map(), rafs = new Map(), reg = { timers, rafs, win: window, dead: false };
  S.frames.push(reg);
  addEventListener('pagehide', () => { reg.dead = true; });
  class FakeDate extends RealDate { constructor(...a) { a.length ? super(...a) : super(S.now); } static now() { return S.now; } }
  window.Date = new Proxy(FakeDate, { apply: () => new RealDate(S.now).toString() });
  const add = (fn, ms, args, every) => { const id = S.seq++; if (typeof fn === 'function') timers.set(id, { id, fn, args, every, at: S.now + Math.max(every ? 1 : 0, +ms || 0) }); return id; };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, 0);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, +ms || 0));
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = S.seq++; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  Object.defineProperty(performance, 'now', { value: () => S.now - perf0, configurable: true });
  let seed = 7; // seeded Math.random, so reconnect back-off (and anything else random) repeats exactly
  Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  if (window.top !== window) return;
  const step = (doc, dt) => {
    const seen = doc.__wtSeen || (doc.__wtSeen = new WeakSet());
    for (const a of doc.getAnimations()) {
      if (!seen.has(a)) { seen.add(a); a.pause(); a.currentTime = 0; } else a.currentTime = (a.currentTime || 0) + dt;
    }
  };
  S.advanceTo = (target) => {
    const dt = Math.max(0, target - S.now);
    for (let guard = 0; guard < 1e5; guard++) {
      let best = null, owner = null;
      for (const r of S.frames) if (!r.dead) for (const t of r.timers.values()) if (t.at <= target && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) { best = t; owner = r; }
      if (!best) break;
      S.now = Math.max(S.now, best.at);
      if (best.every) best.at += best.every; else owner.timers.delete(best.id);
      try { best.fn(...best.args); } catch (e) { console.error(e); }
    }
    S.now = Math.max(S.now, target);
    for (const r of S.frames) if (!r.dead) {
      const cbs = [...r.rafs.values()]; r.rafs.clear();
      for (const cb of cbs) try { cb(r.win.performance.now()); } catch (e) { console.error(e); }
    }
    for (const r of S.frames) if (!r.dead) try { step(r.win.document, dt); } catch {}
  };
})();`;

// ---------- 4. The keynote wrapper page: canvas, window, phone, cards, captions, cursor, spotlight ----------
const CHAPTERS: [string, string][] = [
  ['A control room at a glance', 'Which roads are under water, right now'],
  ['Severity in numbers', 'Four levels, each a plain road impact'],
  ['The live map', 'Every sensor, coloured by severity'],
  ['Every road, sorted', 'Worst first, A to Z, filtered by zone'],
  ['Inspect a flooded road', 'Depth, 30-minute history, how it is measured'],
  ['Alerts as water rises', 'New warnings, without the spam'],
  ['Live, even when offline', 'Socket.IO stream with an in-browser fallback'],
  ['In the field, on a phone', 'Responsive layout and bottom sheet'],
  ['Under the hood', 'TypeScript end to end, three packages'],
];
const WRAPPER = `<!doctype html><html><head><meta charset="utf-8"><title>FloodWatch walkthrough</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&family=Inter:wght@400;500;600&display=block" rel="stylesheet">
<style>
:root{--ink:#111111;--muted:#6B6B6B;--accent:${ACCENT};--bg:#F4F4F2}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:var(--bg);font-family:Inter,sans-serif;color:var(--ink)}
.abs{position:absolute}
#stage{position:absolute;inset:0;transform-origin:0 0;transition:transform .85s cubic-bezier(.65,0,.35,1)}
.win{left:${WIN_X}px;top:${WIN_Y}px;width:${APP_W * AS}px;height:${APP_H * AS + BAR}px;border-radius:14px;overflow:hidden;background:#0C0A09;
  box-shadow:0 40px 90px rgba(17,17,17,.20),0 12px 28px rgba(17,17,17,.10),0 0 0 1px rgba(17,17,17,.08);transition:opacity .5s}
.bar{height:${BAR}px;background:#FBFBFA;border-bottom:1px solid #E4E4E0;display:flex;align-items:center;padding:0 16px;gap:8px}
.bar i{width:12px;height:12px;border-radius:50%;background:#D5D5D0}
.bar span{margin:0 auto;transform:translateX(-30px);font-size:14px;color:var(--muted);background:#EFEFEC;border-radius:8px;padding:5px 70px;letter-spacing:.01em}
.app{position:relative;width:${APP_W * AS}px;height:${APP_H * AS}px;overflow:hidden}
.app iframe{width:${APP_W}px;height:${APP_H}px;border:0;transform:scale(${AS});transform-origin:0 0;display:block}
.spot{position:absolute;border-radius:14px;box-shadow:0 0 0 3000px rgba(10,10,10,.52),0 0 0 2px var(--accent),0 0 30px 4px rgba(37,99,235,.45);opacity:0;
  transition:left .6s cubic-bezier(.65,0,.35,1),top .6s cubic-bezier(.65,0,.35,1),width .6s cubic-bezier(.65,0,.35,1),height .6s cubic-bezier(.65,0,.35,1),opacity .45s;pointer-events:none}
.spot.on{opacity:1}
.phone{left:${PH_X}px;top:${PH_Y}px;padding:${BEZEL}px;border-radius:58px;background:#111;opacity:0;transition:opacity .5s;
  box-shadow:0 40px 90px rgba(17,17,17,.25),0 0 0 2px #2a2a2a inset}
.phone .screen{width:${390 * PH_S}px;height:${844 * PH_S}px;border-radius:46px;overflow:hidden;background:#0C0A09}
.phone iframe{width:390px;height:844px;border:0;transform:scale(${PH_S});transform-origin:0 0;display:block}
.side{left:${PH_X + 390 * PH_S + 2 * BEZEL + 110}px;top:340px;width:640px;opacity:0;transition:opacity .5s}
.side h2{font-family:'Inter Tight';font-weight:800;font-size:64px;letter-spacing:-.03em;line-height:1.02;margin:0 0 30px}
.side li{font-size:30px;font-weight:500;color:var(--ink);margin:16px 0;list-style:none;display:flex;gap:16px;align-items:center}
.side li:before{content:'';width:10px;height:10px;border-radius:50%;background:var(--accent);flex:none}
.side ul{padding:0;margin:0}
.show{opacity:1!important}
.cursor{left:0;top:0;width:30px;height:30px;z-index:50;transition:transform .9s cubic-bezier(.45,0,.2,1),opacity .3s;pointer-events:none;filter:drop-shadow(0 4px 8px rgba(0,0,0,.35))}
.cursor b{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:3px solid var(--accent);opacity:0}
.cursor.click b{animation:ripple .55s ease-out}
@keyframes ripple{from{opacity:.95;transform:scale(.3)}to{opacity:0;transform:scale(1.5)}}
.key{z-index:60;right:${WIN_X + 30}px;top:${WIN_Y + BAR + 24}px;font:600 26px Inter;color:#fff;background:rgba(17,17,17,.88);border-radius:12px;padding:10px 20px;opacity:0;transition:opacity .25s}
.key kbd{font:600 22px Inter;border:1.5px solid rgba(255,255,255,.7);border-bottom-width:4px;border-radius:8px;padding:2px 10px;margin-right:12px}
#cap,#prog,.key,.side,.card{pointer-events:none}
#cap{left:50%;bottom:34px;transform:translateX(-50%);max-width:1320px;width:max-content;z-index:90;padding:14px 30px;border-radius:20px;
  background:rgba(17,17,17,.88);color:#fff;font:500 28px/1.38 Inter;text-align:center;opacity:0;transition:opacity .22s;letter-spacing:-.003em}
#cap.on{opacity:1}
#prog{left:${WIN_X}px;top:30px;width:${APP_W * AS}px;z-index:80;opacity:0;transition:opacity .4s}
#prog.on{opacity:1}
#prog .lbl{font:600 15px Inter;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:9px;display:flex;gap:12px}
#prog .lbl b{color:var(--accent)}
#prog .segs{display:flex;gap:6px}
#prog .segs i{flex:1;height:4px;border-radius:2px;background:#DEDED9;transition:background .4s}
#prog .segs i.done{background:#9C9C97}
#prog .segs i.cur{background:var(--accent)}
.card{inset:0;z-index:70;background:var(--bg);display:flex;flex-direction:column;justify-content:center;padding:0 220px;opacity:0;transition:opacity .45s;pointer-events:none}
.card.on{opacity:1}
.card .in{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
.t-hero{font-family:'Inter Tight';font-weight:800;font-size:184px;letter-spacing:-.05em;line-height:.95;margin:0}
.t-sub{font-size:42px;color:var(--muted);font-weight:500;margin:34px 0 0;letter-spacing:-.01em}
.t-by{margin-top:70px;font-size:26px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:14px}
.t-by:before{content:'';width:40px;height:3px;background:var(--accent);border-radius:2px}
.c-num{font-family:'Inter Tight';font-weight:800;font-size:170px;color:var(--accent);letter-spacing:-.04em;line-height:1}
.c-title{font-family:'Inter Tight';font-weight:800;font-size:96px;letter-spacing:-.035em;line-height:1.02;margin:18px 0 0}
.c-sub{font-size:36px;color:var(--muted);font-weight:500;margin-top:22px}
.arch{display:grid;grid-template-columns:1fr 70px 1fr 70px 1fr;align-items:stretch;margin-top:56px}
.box{border:2px solid #DCDCD7;border-radius:22px;padding:30px 32px;background:#fff;transition:border-color .4s,box-shadow .4s,opacity .4s}
.box.hi{border-color:var(--accent);box-shadow:0 18px 40px rgba(37,99,235,.16)}
.box.lo{opacity:.45}
.box h3{font-family:'Inter Tight';font-size:40px;margin:0 0 6px;letter-spacing:-.02em}
.box p{margin:0 0 18px;color:var(--muted);font-size:22px}
.box li{font-size:23px;margin:9px 0;list-style:none;font-weight:500}
.box ul{padding:0;margin:0}
.arrow{display:grid;place-items:center;color:#9C9C97;font-size:44px}
.formula{display:flex;gap:28px;margin-top:40px}
.formula div{font:600 30px 'Inter Tight';background:#fff;border:2px solid #DCDCD7;border-radius:16px;padding:16px 26px;transition:border-color .4s,opacity .4s}
.formula div.hi{border-color:var(--accent);color:var(--accent)}
.formula div.lo{opacity:.45}
.recap{display:grid;grid-template-columns:repeat(2,1fr);gap:16px 60px;margin-top:44px}
.recap div{font-size:29px;font-weight:500;display:flex;align-items:center;gap:18px;opacity:0;transform:translateX(-12px);transition:opacity .45s,transform .45s}
.recap div:before{content:'✓';flex:none;width:38px;height:38px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:21px;font-weight:700}
.in.on .recap div{opacity:1;transform:none}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:50px}
.chips span{font:600 21px Inter;padding:9px 18px;border-radius:999px;border:1.5px solid #CFCFCA;background:#fff;opacity:0;transition:opacity .4s}
.in.on .chips span{opacity:1}
.o-url{margin-top:50px;font:700 34px 'Inter Tight';color:var(--accent);letter-spacing:-.01em}
</style></head><body>
<div id="stage">
  <div class="abs win" id="win"><div class="bar"><i></i><i></i><i></i><span>${APP_URL.replace(/^https?:\/\//, '')}</span></div>
    <div class="app"><iframe id="app" name="app" src="${APP_URL}/"></iframe><div class="spot" id="spot"></div></div></div>
  <div class="abs phone" id="phone"><div class="screen"><iframe id="phonef" name="phone"></iframe></div></div>
  <div class="abs side" id="side"><h2>Built for the field</h2><ul><li>Responsive layout, cards stack</li><li>Map and road list sized for a thumb</li><li>Details as a bottom sheet</li><li>Same live data, same alerts</li></ul></div>
  <div class="abs cursor" id="cursor"><b></b><svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5l15 11.2-6.5.9 3.8 7.1-2.8 1.5-3.8-7.2L4 20.3z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
</div>
<div class="abs key" id="key"></div>
<div class="abs card" id="card"></div>
<div class="abs" id="prog"><div class="lbl"></div><div class="segs">${CHAPTERS.map(() => '<i></i>').join('')}</div></div>
<div class="abs" id="cap"></div>
<script>
const $ = (id) => document.getElementById(id);
const CH = ${JSON.stringify(CHAPTERS)};
window.wt = {
  caption(t) { if (t) $('cap').textContent = t; $('cap').classList.toggle('on', !!t); },
  progress(i) {
    $('prog').classList.toggle('on', i != null);
    if (i == null) return;
    $('prog').querySelector('.lbl').innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b>' + CH[i][0];
    [...$('prog').querySelectorAll('i')].forEach((s, j) => { s.className = j < i ? 'done' : j === i ? 'cur' : ''; });
  },
  card(html) { if (html) $('card').innerHTML = html; $('card').classList.toggle('on', !!html); },
  cardOn(sel, on) { document.querySelectorAll(sel).forEach((e) => e.classList.toggle('on', on)); },
  arch(hi) { document.querySelectorAll('[data-a]').forEach((e) => { const h = hi.includes(e.dataset.a); e.classList.toggle('hi', h); e.classList.toggle('lo', hi.length > 0 && !h); }); },
  spot(r) { if (r) Object.assign($('spot').style, { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' }); $('spot').classList.toggle('on', !!r); },
  cursor(x, y, show = true) { $('cursor').style.transform = 'translate(' + (x - 6) + 'px,' + (y - 4) + 'px)'; $('cursor').style.opacity = show ? 1 : 0; },
  click() { const c = $('cursor'); c.classList.remove('click'); void c.offsetWidth; c.classList.add('click'); },
  zoom(tx, ty, s) { $('prog').style.visibility = s === 1 ? '' : 'hidden'; $('stage').style.transform = s === 1 ? '' : 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; },
  mode(m) { $('win').style.opacity = m === 'desktop' ? 1 : 0; ['phone', 'side'].forEach((id) => $(id).classList.toggle('show', m === 'phone')); },
  key(html) { if (html) $('key').innerHTML = html; $('key').style.opacity = html ? 1 : 0; },
  phoneSrc(u) { $('phonef').src = u; },
};
</script></body></html>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const CARD = {
  intro: `<div class="in"><h1 class="t-hero">FloodWatch</h1><p class="t-sub">Real-time flood monitoring for city roads and underpasses</p>
    <div class="t-by">Gaurang Prajapati · Full-stack developer</div></div>`,
  chapter: (i: number) => `<div class="in"><div class="c-num">${String(i + 1).padStart(2, '0')}</div><h2 class="c-title">${esc(CHAPTERS[i][0])}</h2><div class="c-sub">${esc(CHAPTERS[i][1])}</div></div>`,
  arch: `<div class="in" style="margin-top:-30px"><div class="c-num" style="font-size:40px;line-height:1">09 · Under the hood</div><h2 class="c-title" style="font-size:76px">TypeScript end to end, three npm workspaces</h2>
    <div class="arch">
      <div class="box" data-a="shared"><h3>shared/</h3><p>Model and rules, used by both sides</p><ul><li>Sensor model and severity rules</li><li>Deterministic, stateless simulator</li><li>Storms staggered by zone</li><li>Alert hysteresis · Vitest tests</li></ul></div>
      <div class="arrow">→</div>
      <div class="box" data-a="server"><h3>server/</h3><p>Node · Express · Socket.IO</p><ul><li>GET /api/sites</li><li>GET /api/sites/:id/history</li><li>Socket.IO "reading" every 3 s</li></ul></div>
      <div class="arrow">→</div>
      <div class="box" data-a="client"><h3>client/</h3><p>React · Vite · Tailwind CSS</p><ul><li>react-leaflet map, Recharts</li><li>Alerts computed with the shared rule</li><li>Offline: same simulator in-browser</li></ul></div>
    </div>
    <div class="formula"><div data-a="f1">reading = f(site, time)</div><div data-a="f2">depth = sensor height − distance to water</div></div></div>`,
  recap: `<div class="in"><div class="c-num" style="font-size:40px;line-height:1">Recap</div><h2 class="c-title" style="font-size:80px">Everything in this demo</h2>
    <div class="recap">${[
      'Header: live clock and connection status', 'Intro for first-time visitors, remembered', 'KPI cards with 30-minute trends', 'Roads affected right now',
      'Live map with severity markers and tooltips', 'Legend with depth thresholds', 'Road list: worst first or A to Z', 'Zone filters for list and map',
      'Road detail: depth, badge, plain explanation', '30-minute chart with threshold bands', 'Alert feed with anti-spam hysteresis', 'Offline fallback and auto-reconnect',
      'Phone layout with bottom sheet', 'REST API and Socket.IO stream',
    ].map((t, i) => `<div style="transition-delay:${0.25 + i * 0.12}s">${t}</div>`).join('')}</div>
    <div class="chips">${['TypeScript', 'React', 'Vite', 'Tailwind CSS', 'react-leaflet', 'Recharts', 'Node.js', 'Express', 'Socket.IO', 'Vitest', 'npm workspaces']
      .map((t, i) => `<span style="transition-delay:${2 + i * 0.07}s">${t}</span>`).join('')}</div></div>`,
  outro: `<div class="in"><h1 class="t-hero" style="font-size:150px">Gaurang Prajapati</h1><p class="t-sub">Full-stack developer · Available for freelance work</p>
    <div class="o-url">portfolio-black-kappa-91.vercel.app</div></div>`,
};

// ---------- 5. One pass through the film. DRY passes skip screenshots and stop at the alert marker ----------
interface Cue { wav: string; frame: number }
class StopDry extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Rect = { x: number; y: number; width: number; height: number };

async function film(t0: number, dry: boolean, videoOut?: string) {
  clock.now = t0;
  const desk = mirror(), mobile = mirror();
  let blocked = false;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(CLOCK_JS(t0));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.route(`${APP_URL}/__walkthrough`, (r) => r.fulfill({ contentType: 'text/html', body: WRAPPER }));
  // The client talks to APP_SERVER; send each iframe to its own mirror so only the desktop one "goes down".
  await page.route((u) => u.href.startsWith(APP_SERVER), (r) => {
    const isPhone = r.request().frame().name() === 'phone';
    if (blocked && !isPhone) return r.abort('connectionrefused');
    return r.continue({ url: r.request().url().replace(APP_SERVER, `http://localhost:${(isPhone ? mobile : desk).port()}`) });
  });
  await page.goto(`${APP_URL}/__walkthrough`);
  const A = page.frameLocator('#app'), P = page.frameLocator('#phonef');
  const ui = (fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).wt[f as string](...(a as unknown[])), [fn, args] as const);
  const flush = () => page.evaluate(() => (window as any).__vt.advanceTo((window as any).__vt.now));
  const appFrame = () => page.frame({ name: 'app' })!;
  async function settle(what: string, ready: () => Promise<boolean>) {
    for (const end = Date.now() + 90_000; !(await ready().catch(() => false)); await flush(), await sleep(60))
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
  }
  // Load everything with the clock frozen at t0: markers, fonts, map tiles and the live socket.
  await settle('app', () => appFrame().evaluate(() => document.querySelectorAll('.site-marker').length === 25
    && document.fonts.status === 'loaded' && document.querySelector('header span[title]')!.textContent!.includes('Live')
    && document.querySelectorAll('.leaflet-tile').length > 0 && [...document.querySelectorAll('.leaflet-tile')].every((t) => (t as HTMLImageElement).complete)));
  await page.evaluate(() => document.fonts.ready);

  // Frame loop. Frame n shows virtual time t0 + n/FPS and lands at video time (n-1)/FPS.
  let n = 0, lastTick = Math.floor(t0 / TICK_MS);
  const cdp = dry ? null : await ctx.newCDPSession(page);
  const enc = dry ? null : spawn(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', videoOut!], { stdio: ['pipe', 'inherit', 'inherit'] });
  const cues: Cue[] = [];
  const marks: Record<string, number> = {};
  const started = Date.now();
  async function frame() {
    n++;
    const t = t0 + (n * 1000) / FPS;
    clock.now = t;
    await page.evaluate((t) => (window as any).__vt.advanceTo(t), t);
    if (Math.floor(t / TICK_MS) > lastTick) {
      lastTick = Math.floor(t / TICK_MS);
      for (const m of [desk, mobile]) for (const site of SITES) m.io.emit('reading', simulateReading(site, t));
      await sleep(dry ? 40 : 220); // let the long-poll deliver before the next screenshot
      await page.evaluate(() => (window as any).__vt.advanceTo((window as any).__vt.now));
    }
    if (dry) {
      if (process.env.SNAP && n % 60 === 0) await page.screenshot({ path: join(WORK, `snap-${String(n).padStart(5, '0')}.jpg`), quality: 70 });
      return;
    }
    const { data } = await cdp!.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
    if (!enc!.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => enc!.stdin.once('drain', r));
    if (n % 300 === 0) console.log(`  ${(n / FPS).toFixed(0)} s of video, ${((Date.now() - started) / n).toFixed(0)} ms/frame`);
  }
  const holdTo = async (f: number) => { while (n < f) await frame(); };
  const hold = (s: number) => holdTo(n + Math.round(s * FPS));
  async function until(what: string, ok: () => Promise<boolean>, maxS: number) {
    const end = n + maxS * FPS;
    while (!(await ok().catch(() => false))) {
      if (n > end) { console.warn(`  (gave up waiting for ${what})`); return; }
      await frame();
    }
  }
  async function tween(s: number, fn: (p: number) => Promise<unknown>) {
    const frames = Math.round(s * FPS);
    for (let i = 1; i <= frames; i++) {
      const p = i / frames;
      await fn(p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
      await frame();
    }
  }

  // Coordinates: r() is the element's box inside its iframe; stage() maps it onto the canvas (before zoom).
  let zoomState = { tx: 0, ty: 0, s: 1 };
  const r = (l: Locator) => l.evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  const stage = (b: Rect, phone = false): Rect => phone
    ? { x: PH_X + BEZEL + b.x * PH_S, y: PH_Y + BEZEL + b.y * PH_S, width: b.width * PH_S, height: b.height * PH_S }
    : { x: WIN_X + b.x * AS, y: WIN_Y + BAR + b.y * AS, width: b.width * AS, height: b.height * AS };
  async function spot(l: Locator | null, pad = 10) {
    if (!l) return ui('spot', null);
    const b = await r(l);
    return ui('spot', { x: b.x * AS - pad, y: b.y * AS - pad, width: b.width * AS + 2 * pad, height: b.height * AS + 2 * pad });
  }
  let cur = { x: 1560, y: 860 };
  async function point(l: Locator, opts: { dx?: number; dy?: number; phone?: boolean; glide?: number } = {}) {
    const b = stage(await r(l), opts.phone);
    cur = { x: b.x + b.width * (opts.dx ?? 0.5), y: b.y + b.height * (opts.dy ?? 0.5) };
    await ui('cursor', cur.x, cur.y);
    await hold(opts.glide ?? 0.9);
    await page.mouse.move(zoomState.tx + zoomState.s * cur.x, zoomState.ty + zoomState.s * cur.y, { steps: 4 }); // real pointer for hover states
    await flush();
  }
  async function click(l: Locator, opts: Parameters<typeof point>[1] = {}) {
    await point(l, opts);
    await ui('click');
    await page.mouse.click(zoomState.tx + zoomState.s * cur.x, zoomState.ty + zoomState.s * cur.y);
    await flush();
    await hold(0.35);
  }
  async function park(x = 1580, y = 900) {
    cur = { x, y };
    await ui('cursor', x, y);
    await page.mouse.move(x, y);
  }
  async function zoom(l: Locator | null, s = 1.5, cy = 520) {
    if (!l) zoomState = { tx: 0, ty: 0, s: 1 };
    else {
      const b = stage(await r(l));
      zoomState = { s, tx: W / 2 - s * (b.x + b.width / 2), ty: cy - s * (b.y + b.height / 2) };
    }
    await ui('zoom', zoomState.tx, zoomState.ty, zoomState.s);
  }
  const scrollApp = async (to: number, s = 0.8) => {
    const from = await appFrame().evaluate(() => scrollY);
    await tween(s, (p) => appFrame().evaluate((y) => scrollTo(0, y), from + (to - from) * p));
  };
  async function line(key: string, i: number, action?: () => Promise<unknown>, tail = 0) {
    const l = scenes[key][i];
    const start = n;
    cues.push({ wav: l.wav, frame: start });
    await ui('caption', l.text);
    await action?.();
    await holdTo(start + Math.ceil((l.dur + GAP + tail) * FPS));
  }
  async function scene(key: string, actions: (((() => Promise<unknown>) | undefined))[] = []) {
    for (let i = 0; i < scenes[key].length; i++) await line(key, i, actions[i], i === scenes[key].length - 1 ? 0.4 : 0);
    await ui('caption', null);
  }
  async function chapter(i: number, setup?: () => Promise<unknown>) {
    await ui('caption', null);
    await ui('card', CARD.chapter(i));
    await hold(0.5);
    await ui('progress', i);
    await setup?.();
    await hold(1.3);
    await ui('card', null);
    await hold(0.45);
  }

  // Selectors inside the app.
  const header = A.locator('header').first();
  const badge = A.locator('header span[title]');
  const kpis = A.locator('div.grid.grid-cols-2').first();
  const roads = A.locator('section.card').filter({ has: A.locator('h2', { hasText: 'Roads (' }) });
  const feed = A.locator('section.card').filter({ has: A.locator('h2', { hasText: 'Alert feed' }) });
  const drawer = A.locator('aside[role="dialog"]');
  const alertItems = A.locator('[aria-live] li');
  // A marker of a severity well inside the map, clear of the legend (bottom left) and the edges.
  async function marker(sev: string) {
    const map = await r(A.locator('.leaflet-container'));
    let best: Locator | null = null, bestD = Infinity;
    for (const m of await A.locator(`.site-marker.${sev}`).all()) {
      const b = await r(m);
      const ok = b.x > map.x + 330 && b.x < map.x + map.width - 120 && b.y > map.y + 120 && b.y < map.y + map.height - 80;
      const d = Math.hypot(b.x - (map.x + map.width * 0.55), b.y - (map.y + map.height * 0.5));
      if (ok && d < bestD) { best = m; bestD = d; }
    }
    return best ?? A.locator(`.site-marker.${sev}`).first();
  }

  // ===== The film =====
  await ui('cursor', cur.x, cur.y, false);
  await ui('card', CARD.intro);
  await hold(0.6);
  await scene('intro');
  await hold(0.4);

  // 01 A control room at a glance
  await chapter(0);
  await ui('cursor', cur.x, cur.y, true);
  await scene('c1', [
    undefined,
    undefined,
    () => spot(A.locator('section[aria-label="About this dashboard"]')),
    async () => {
      await spot(null);
      await click(A.locator('[aria-label="Dismiss introduction"]'));
      await hold(0.6);
      await click(A.locator('[aria-label="What is this dashboard?"]'));
      await hold(0.9);
      await click(A.locator('[aria-label="Dismiss introduction"]'));
      await ui('phoneSrc', `${APP_URL}/`); // loads hidden; the intro is dismissed by now, so the phone skips it
    },
    async () => {
      await spot(header.locator(':scope > div').nth(1), 12);
      await point(badge, { glide: 1 });
    },
  ]);
  await spot(null);

  // 02 Severity in numbers
  await chapter(1, () => park());
  const kpi = (i: number) => kpis.locator(':scope > div').nth(i);
  await scene('c2', [
    () => spot(kpis, 12),
    async () => { await spot(null); await zoom(kpi(0), 1.75, 470); await hold(1.2); await point(kpi(0).locator('.recharts-responsive-container'), { glide: 0.8 }); },
    async () => { await zoom(null); await hold(0.5); await spot(kpi(4), 10); await point(kpi(4), { dx: 0.3, dy: 0.45 }); },
  ]);
  await spot(null);

  // 03 The live map (scroll a little so the whole map fits the window)
  await chapter(2, async () => { await park(); await scrollApp(48, 0.6); });
  let crit = await marker('critical');
  await scene('c3', [
    () => spot(A.locator('.leaflet-container'), 4),
    async () => { await spot(null); crit = await marker('critical'); await zoom(crit, 1.8, 520); await hold(2.2); await zoom(null); },
    async () => {
      await hold(0.4);
      // Leaflet opens tooltips on the icon's mouseover; dispatch it so it doesn't depend on hit-testing through the scaled iframe.
      let prev: Locator | null = null;
      for (const [sev, wait] of [['critical', 1.6], ['warning', 1.2], ['watch', 0]] as const) {
        const m = await marker(sev);
        await point(m, { glide: prev ? 0.8 : 0.9 });
        await prev?.dispatchEvent('mouseout');
        await m.dispatchEvent('mouseover');
        await flush();
        await hold(wait);
        prev = m;
      }
    },
    async () => { await A.locator('.site-marker').first().dispatchEvent('mouseout'); await A.locator('.leaflet-tooltip').evaluateAll((ts) => ts.forEach((t) => t.remove())); await park(1500, 300); await spot(A.getByText('Water on the road', { exact: true }).locator('..'), 8); },
  ]);
  await spot(null);

  // 04 Every road, sorted
  await chapter(3, () => park());
  const sortBtn = roads.locator('header button');
  await scene('c4', [
    async () => { await spot(roads, 6); await point(roads.locator('li').first().locator('.rounded-full').first()); },
    async () => { await spot(sortBtn, 8); await click(sortBtn); await hold(1.6); await click(sortBtn); },
    async () => {
      const zone = (await roads.locator('li').first().locator('span.block.text-\\[13px\\]').innerText()).split(' · ')[0];
      await spot(roads, 6);
      await click(roads.getByRole('button', { name: zone, exact: true }));
      await spot(null);
      await hold(1.6);
      await click(roads.getByRole('button', { name: 'All zones', exact: true }));
    },
  ]);
  await spot(null);

  // 05 Inspect a flooded road
  await chapter(4, () => park());
  const section = (i: number) => drawer.locator('section').nth(i);
  await scene('c5', [
    async () => { await click(roads.locator('li button').first()); await hold(0.6); await park(1500, 300); },
    () => spot(section(0), 10),
    async () => { await spot(null); await zoom(section(1), 1.45, 500); await hold(0.9); await spot(section(1), 8); },
    async () => {
      await point(section(1).locator('.recharts-surface'), { dx: 0.55, dy: 0.5 });
      await hold(0.8);
      await point(section(1).locator('.recharts-surface'), { dx: 0.82, dy: 0.5, glide: 1.2 });
    },
    async () => { await zoom(null); await spot(section(2), 10); await point(section(2).locator('dl > div').nth(1), { dy: 0.95, glide: 1.1 }); },
    () => point(section(2).locator('dl > div').first(), { dy: 0.95, glide: 1.1 }),
    async () => {
      await spot(null);
      await ui('key', '<kbd>Esc</kbd>closes the panel');
      await hold(0.9);
      await page.keyboard.press('Escape');
      await flush();
      await hold(1);
      await ui('key', null);
    },
  ]);

  // 06 Alerts as water rises
  await chapter(5, () => park());
  let before = 0;
  await line('c6', 0, async () => {
    before = await alertItems.count();
    await spot(feed, 6);
    await point(feed.locator('header'), { dx: 0.7 });
  });
  marks.alertWait = n;
  if (dry) {
    await browser.close();
    for (const m of [desk, mobile]) { m.io.close(); m.http.close(); }
    throw Object.assign(new StopDry(), { marks });
  }
  await until('a new alert', async () => (await alertItems.count()) > before, 12);
  await line('c6', 1, async () => { await spot(alertItems.first(), 4); await point(alertItems.first(), { dx: 0.4, glide: 0.7 }); });
  await line('c6', 2, () => spot(feed, 6));
  await line('c6', 3, async () => {
    await spot(null);
    await click(alertItems.first().locator('button'), { dx: 0.4 });
    await hold(1.6);
    await click(drawer.locator('header button[aria-label="Close details"]'));
  }, 0.4);
  await ui('caption', null);

  // 07 Live, even when offline
  await chapter(6, async () => { await park(); await scrollApp(0, 0.5); });
  const isLive = async () => ((await badge.textContent()) ?? '').includes('Live');
  await scene('c7', [
    async () => { await zoom(header.locator(':scope > div').nth(1), 1.6, 330); await hold(0.9); await spot(badge, 8); },
    async () => {
      await hold(0.6);
      blocked = true;
      for (const s of desk.io.of('/').sockets.values()) s.conn.close(); // the server "goes down": the client sees the transport close
      await hold(0.3);
      await spot(badge, 8); // the badge text changes width
    },
    undefined,
    async () => { blocked = false; },
  ]);
  await until('the socket to reconnect', isLive, 8);
  await spot(badge, 8);
  await hold(1);
  await spot(null);
  await zoom(null);
  await hold(0.6);

  // 08 In the field, on a phone
  await chapter(7, async () => { await ui('mode', 'phone'); await park(1100, 900); });
  const phoneFrame = () => page.frame({ name: 'phone' })!;
  await scene('c8', [
    undefined,
    async () => {
      const to = await phoneFrame().evaluate(() => document.querySelector('ul.divide-y')!.getBoundingClientRect().top + scrollY - 110);
      await tween(2.4, (p) => phoneFrame().evaluate((y) => scrollTo(0, y), to * p));
    },
    () => click(P.locator('ul.divide-y li button').first(), { phone: true, dx: 0.4 }),
    async () => { await hold(0.6); await click(P.locator('button.fixed.inset-0'), { phone: true, dx: 0.5, dy: 0.04 }); },
  ]);

  // 09 Under the hood, recap, outro
  await ui('card', CARD.chapter(8));
  await ui('cursor', cur.x, cur.y, false);
  await hold(0.5);
  await ui('progress', 8);
  await hold(1.3);
  await ui('card', CARD.arch);
  await hold(0.6);
  await scene('c9', [
    () => ui('arch', ['shared', 'server', 'client']),
    () => ui('arch', ['shared']),
    () => ui('arch', ['f1']),
    () => ui('arch', ['f2']),
    () => ui('arch', ['server', 'client']),
  ]);
  await ui('progress', null);
  await ui('card', CARD.recap);
  await hold(0.3);
  await ui('cardOn', '#card .in', true);
  await scene('recap');
  await hold(2.2);
  await ui('card', CARD.outro);
  await hold(0.6);
  await scene('outro');
  await hold(1.6);

  enc!.stdin.end();
  await new Promise((res) => enc!.on('close', res));
  await browser.close();
  desk.http.close(); mobile.http.close();
  desk.io.close(); mobile.io.close();
  return { cues, frames: n, marks };
}

// ---------- 6. Pick a start time so a fresh alert lands right on "There's one now" ----------
const level = (i: number, t: number) => waterLevelCm(SITES[i], simulateReading(SITES[i], t).distanceCm);
function alertTimes(t0: number, spanS: number) {
  const alerted = SITES.map((_, i) => severityOf(level(i, t0)));
  const out: number[] = [];
  for (let k = Math.floor(t0 / TICK_MS) + 1; k * TICK_MS <= t0 + spanS * 1000; k++)
    SITES.forEach((_, i) => {
      const s = nextAlertState(alerted[i], level(i, k * TICK_MS));
      alerted[i] = s.alerted;
      if (s.raised) out.push((k * TICK_MS - t0) / 1000);
    });
  return out;
}
function pickStart(at: number, spanS: number) {
  const from = Math.ceil(Date.now() / 60_000) * 60_000;
  for (let t0 = from; t0 < from + 12 * 3_600_000; t0 += 1000) {
    const a = alertTimes(t0, spanS);
    const hit = a.some((x) => x > at + 0.3 && x < at + 1.4);
    const quiet = !a.some((x) => x > at - 12 && x <= at + 0.3);
    const earlier = a.filter((x) => x < at - 20).length >= 2;
    let crit = true;
    for (let t = t0; crit && t < t0 + spanS * 1000; t += TICK_MS) crit = SITES.some((_, i) => severityOf(level(i, t)) === 'critical');
    if (hit && quiet && earlier && crit) return t0;
  }
  throw new Error('no start time found: relax the pickStart rules');
}

let t0 = Number(process.env.T0);
if (!t0) {
  const base = Math.ceil(Date.now() / 60_000) * 60_000;
  console.log('dry run to time the alert scene...');
  const dry = await film(base, true).catch((e) => { if (e instanceof StopDry) return e as StopDry & { marks: Record<string, number> }; throw e; });
  const at = (dry as { marks: Record<string, number> }).marks.alertWait / FPS;
  t0 = pickStart(at, at + 150);
  console.log(`alert wait at ${at.toFixed(1)} s; T0=${t0} (${new Date(t0).toLocaleTimeString()})`);
  if (process.env.DRY_ONLY) process.exit(0);
}
const raw = join(WORK, 'walkthrough-video.mp4');
const { cues: allCues, frames } = await film(t0, false, raw);
const cues = allCues.filter((c) => c.wav); // caption-only lines stay silent

// ---------- 7. Narration track (clips placed at their frames) and mux ----------
const track = new Int16Array(Math.ceil((frames / FPS) * 22050));
for (const c of cues) {
  const s = pcm(c.wav), at = Math.round((c.frame / FPS) * 22050);
  track.set(s.subarray(0, Math.max(0, track.length - at)), at);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + track.byteLength, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(22050, 24); hdr.writeUInt32LE(44100, 28);
hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(track.byteLength, 40);
const audio = join(WORK, 'walkthrough-audio.wav');
writeFileSync(audio, Buffer.concat([hdr, Buffer.from(track.buffer)]));
const out = join(DOCS, 'walkthrough.mp4');
const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', raw, '-i', audio, '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF ?? '26', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-af', 'aresample=48000', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', out], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('ffmpeg mux failed');
spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', process.env.POSTER_AT ?? '1.2', '-i', out, '-frames:v', '1', join(DOCS, 'walkthrough-poster.png')], { stdio: 'inherit' });
console.log(`Wrote docs/walkthrough.mp4 (${(frames / FPS).toFixed(1)} s) and docs/walkthrough-poster.png; T0=${t0}`);
writeFileSync(join(WORK, 'cues.json'), JSON.stringify({ t0, frames, cues: allCues.map((c) => ({ ...c, s: c.frame / FPS })) }, null, 1));
