/* Cia Pink Mov 21 Dias – motion flyer (1080x1920, 30 fps).
 *
 * Deterministic timeline: renderFrame(t) paints the frame for time t (seconds)
 * and depends on nothing but t + the preloaded assets. render.mjs drives it
 * frame by frame in headless Chromium; open index.html in a browser to preview.
 *
 * Scenes (amarradas às batidas de data/audio.json):
 *   A 0.00–3.85  "CORRE QUE AINDA DÁ TEMPO!" neon, letra a letra, rack focus
 *   B 3.26–6.45  círculo neon + anel de espectro + logo Pink Mov, zoom para dentro
 *   C 6.00–8.25  dentro do círculo: OUTUBRO ROSA + tarja, pinceladas no ritmo
 *   D 7.90–fim   recuo de câmera, massa rosa, mulher sobe, composição final
 */
(() => {
"use strict";

const W = 1080, H = 1920, FPS = 30, TAU = Math.PI * 2;
const AU = window.AUDIO;
const DUR = AU.n_frames / FPS;

// ------------------------------------------------------------------ palette (colhida da arte)
const PINK = [246, 4, 92];
const PINK_CORE = "#ff3f8f";
const PINK_DEEP = [184, 0, 63];
const ORANGE = "#f86302";
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ------------------------------------------------------------------ math / easing
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, a, b) => clamp((t - a) / (b - a));
const eOutCubic = x => 1 - Math.pow(1 - x, 3);
const eOutQuint = x => 1 - Math.pow(1 - x, 5);
const eOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const eInCubic = x => x * x * x;
const eInOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eInOutSine = x => -(Math.cos(Math.PI * x) - 1) / 2;
const eOutBack = (x, s = 1.70158) => (x <= 0 ? 0 : 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2));
// deterministic hash noise
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ audio helpers
const BEATS = AU.beats;
const T = {                     // beat-locked cue points (confirmed against the analysis)
  groove: 3.262, preA: 5.782, preB: 6.037, impact: 7.895, land: 9.741,
  call: 10.205, sub: 10.67, consc: 11.598, capsule: 12.063, small: 13.468, drop: 14.5,
};
function af(t) { return AU.frames[clamp(Math.floor(t * FPS), 0, AU.frames.length - 1)]; }
function pulseAt(t, times, k = 8) {
  let v = 0;
  for (const b of times) { const d = t - b; if (d >= 0 && d < 1.5) v = Math.max(v, Math.exp(-d * k)); }
  return v;
}
// heartbeat: "lub" on the beat, softer "dub" 0.16 s later
function heart(t) {
  let v = 0;
  for (const b of BEATS) {
    const d = t - b;
    if (d < 0) break;
    if (d < 0.7) v = Math.max(v, Math.exp(-d * 9) + (d > 0.16 ? 0.45 * Math.exp(-(d - 0.16) * 11) : 0));
  }
  return v;
}
function energy(t) { const f = af(t); return clamp(f.rms * 0.8 + f.bass * 0.4, 0, 1.3); }
// floating "boat" sway after the landing: rigid rotation about the hidden base + vertical drift,
// out of phase, 2 bars per cycle; scale breathing (±1 %) peaks every other beat
const BEAT = 60 / AU.bpm, SWAY_P = 8 * BEAT;
function sway(t) {
  const env = eInOutSine(P(t, 9.741, 9.741 + 1.4));
  const ph = TAU * (t - 9.741) / SWAY_P;
  const rot = env * (1.5 * Math.PI / 180) * Math.sin(ph);
  return {
    rot, dy: env * 9 * Math.sin(ph + 1.9),
    sc: 1 + env * 0.01 * Math.cos(TAU * (t - 9.741) / (2 * BEAT)),
    headDx: rot * 520,                                      // horizontal travel of the head (for counter-parallax)
  };
}

// ------------------------------------------------------------------ canvases
const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const emis = mk(W, H), ex = emis.getContext("2d");          // emissive buffer -> bloom
const half = mk(W / 2, H / 2), hx = half.getContext("2d");
const half2 = mk(W / 2, H / 2), h2x = half2.getContext("2d");
const tmp = mk(W, H), tx = tmp.getContext("2d");
const tmp2 = mk(W, H), t2x = tmp2.getContext("2d");

// ------------------------------------------------------------------ assets
const IMG = {};
const SRC = {
  plate: "assets/bg_plate.jpg", paperFine: "assets/tex/paper_fine.jpg", worn: "assets/tex/worn.png",
  band: "assets/tex/stroke_band.png", pa: "assets/tex/stroke_pink_a.png",
  pb: "assets/tex/stroke_pink_b.png", pc: "assets/tex/stroke_pink_c.png",
  oa: "assets/tex/stroke_orange_a.png", ob: "assets/tex/stroke_orange_b.png",
  woman: "assets/woman.png", logoPM: "assets/logo_pinkmov.webp", logoCDC: "assets/logo_ciadocorpo.png",
};
for (let i = 0; i < 8; i++) SRC["g" + i] = `assets/tex/grain_${i}.png`;
const CDC_BOX = [98, 106, 744, 430];                      // transparent padding trimmed at draw time only
const WOMAN = { s: 0.4712, x: 190.4, y: 511.9 };            // cutout scale/placement in the final comp
const PIVOT = { x: 540, y: 1118 };                          // sway pivot: cutout base centre, hidden by the band

let womanFX, womanRim, wornFull, grainPat = [];

function load() {
  const ps = Object.entries(SRC).map(([k, u]) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => rej(u); im.src = u;
  }));
  const fonts = ["165px Bebas", "500 32px Mont", "600 36px Mont", "700 32px Mont", "800 32px Mont", "italic 900 50px Mont"]
    .map(f => document.fonts.load(f, "AÁÃÇÊÉÍÓÕÚaãçéêíóõú"));
  return Promise.all([...ps, ...fonts]).then(prep);
}

function prep() {
  const w = IMG.woman;
  // colour-matched woman: slight grade + bottom fade (the photo ends at the thighs)
  womanFX = mk(w.width, w.height);
  const c = womanFX.getContext("2d");
  c.filter = "brightness(0.94) contrast(1.06) saturate(1.05)";
  c.drawImage(w, 0, 0);
  c.filter = "none";
  c.globalCompositeOperation = "destination-out";
  const g = c.createLinearGradient(0, 1500, 0, 1760);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
  c.fillStyle = g; c.fillRect(0, 1500, w.width, w.height - 1500);
  // pink rim light: silhouette minus a shifted, blurred silhouette = edge band
  womanRim = mk(w.width, w.height);
  const r = womanRim.getContext("2d");
  r.drawImage(womanFX, 0, 0);
  r.globalCompositeOperation = "source-in";
  r.fillStyle = rgba(PINK, 1); r.fillRect(0, 0, w.width, w.height);
  r.globalCompositeOperation = "destination-out";
  r.filter = "blur(10px)";
  r.drawImage(womanFX, 14, 18);
  r.filter = "none";
  r.globalCompositeOperation = "source-over";
  for (let i = 0; i < 8; i++) grainPat.push(ctx.createPattern(IMG["g" + i], "repeat"));
  // wear mask tiled to the full frame once (destination-in is unbounded, so it must be a single draw)
  wornFull = mk(W, H);
  const wc = wornFull.getContext("2d"), th = W * 0.25;
  for (let y = 0, i = 0; y < H; y += th, i++) wc.drawImage(IMG.worn, (i % 2) * -260, y, W + 260, th);
}

// ------------------------------------------------------------------ drawing helpers
function withBlur(c, b, fn) {
  c.save();
  if (b > 0.25) c.filter = `blur(${b.toFixed(2)}px)`;
  fn(c);
  c.restore();
}

// camera: anchor (cx,cy) maps to (cx+ox*d, cy+oy*d); scale s^d  (d = layer depth -> parallax)
function cam(c, k, d = 1) {
  const s = Math.pow(k.s, d);
  c.translate(k.cx + k.ox * d, k.cy + k.oy * d);
  c.scale(s, s);
  c.translate(-k.cx, -k.cy);
}

function drawStroke(c, img, x0, y0, x1, y1, thick, p, alpha = 1, blur = 0) {
  if (p <= 0 || alpha <= 0) return;
  const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
  const h = img.height * (len / img.width) * thick;
  c.save();
  c.translate(x0, y0); c.rotate(ang);
  c.beginPath(); c.rect(-20, -h, (len + 40) * p, 2 * h); c.clip();
  c.globalAlpha *= alpha;
  if (blur > 0.25) c.filter = `blur(${blur}px)`;
  c.drawImage(img, 0, -h / 2, len, h);
  c.restore();
}

function bloom(gain) {
  hx.clearRect(0, 0, W / 2, H / 2);
  hx.drawImage(emis, 0, 0, W / 2, H / 2);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [r, a] of [[2, 0.55], [7, 0.6], [20, 0.55], [48, 0.45], [110, 0.3]]) {
    h2x.clearRect(0, 0, W / 2, H / 2);
    h2x.filter = `blur(${r}px)`;
    h2x.drawImage(half, 0, 0);
    h2x.filter = "none";
    ctx.globalAlpha = a * gain;
    ctx.drawImage(half2, 0, 0, W, H);
  }
  ctx.restore();
}

function background(t, k, glow) {
  // gym clean plate: slow push-in 1.00 -> 1.08 over the piece + a small share of the scene camera
  // (slower than the front layers) + counter-sway to the woman
  const sw = sway(t);
  const open = eOutCubic(P(t, 0.0, 2.6));                   // focuses/brightens with the text rack focus
  const s = lerp(1, 1.08, eInOutSine(t / DUR)) * Math.pow(k.s, 0.12);
  const xf = c => {
    c.translate(540 + k.ox * 0.25 - sw.headDx * 0.12, 960 + k.oy * 0.25 - sw.dy * 0.12);
    c.scale(s, s);
    c.translate(-620, -1102);
  };
  ctx.save(); xf(ctx);
  if (open < 1) ctx.filter = `blur(${(9 * (1 - open)).toFixed(2)}px)`;
  ctx.drawImage(IMG.plate, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "soft-light";             // fine crumpled paper over the gym
  ctx.globalAlpha = 0.13;
  ctx.drawImage(IMG.paperFine, 0, 0);
  ctx.restore();
  if (open < 1) { ctx.fillStyle = `rgba(3,1,4,${(0.4 * (1 - open)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  // darker toward the bottom (copy legibility)
  const bg = ctx.createLinearGradient(0, 1000, 0, H);
  bg.addColorStop(0, "rgba(5,2,6,0)"); bg.addColorStop(0.5, "rgba(5,2,6,0.45)"); bg.addColorStop(1, "rgba(5,2,6,0.8)");
  ctx.fillStyle = bg; ctx.fillRect(0, 1000, W, H - 1000);
  for (const g of glow) {
    if (g.a <= 0) continue;
    const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    gr.addColorStop(0, rgba(g.c || PINK, g.a));
    gr.addColorStop(0.45, rgba(g.c || PINK, g.a * 0.35));
    gr.addColorStop(1, rgba(g.c || PINK, 0));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
}

function finish(t, frame) {
  // vignette
  const v = ctx.createRadialGradient(540, 900, 380, 540, 960, 1280);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.65, "rgba(0,0,0,0.2)"); v.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // fine grain (cycled tiles, deterministic offset)
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = 0.32;
  ctx.translate(-Math.floor(hash(frame) * 400), -Math.floor(hash(frame + 99) * 300));
  ctx.fillStyle = grainPat[frame % 8];
  ctx.fillRect(0, 0, W + 400, H + 300);
  ctx.restore();
}

// ------------------------------------------------------------------ circle + spectrum ring
function circleBody(c, x, y, r, interior = 0.93) {
  const g = c.createRadialGradient(x, y - r * 0.15, r * 0.05, x, y, r);
  g.addColorStop(0, `rgba(30,6,18,${interior})`);
  g.addColorStop(0.7, `rgba(22,3,12,${interior})`);
  g.addColorStop(0.93, `rgba(60,3,28,${interior})`);
  g.addColorStop(1, `rgba(120,4,50,${interior})`);
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}

function ring(c, em, x, y, r, t, amp, k = 1) {
  // main neon tube
  c.save();
  c.lineCap = "round";
  c.lineWidth = Math.max(3, r * 0.03);
  c.strokeStyle = em ? rgba(PINK, 0.95 * k) : `rgba(255,92,158,${k})`;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  if (!em) {           // hot core
    c.lineWidth = Math.max(1.2, r * 0.009);
    c.strokeStyle = `rgba(255,214,232,${0.85 * k})`;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  }
  // thin sound-wave ring of radial spikes (mirrored spectrum, heartbeat on the beats)
  if (amp > 0) {
    const f0 = af(t).spec, f1 = af(t - 1 / FPS).spec, f2 = af(t - 2 / FPS).spec;
    const hb = heart(t), en = energy(t);
    const N = 132, base = r * 1.085;
    c.lineWidth = Math.max(1.5, r * 0.0085);
    c.strokeStyle = em ? rgba(PINK, 0.8 * k) : `rgba(255,120,175,${0.95 * k})`;
    c.beginPath();
    for (let i = 0; i < N; i++) {
      const m = i <= N / 2 ? i : N - i;                       // mirror around vertical axis
      const bin = Math.min(47, Math.floor((m / (N / 2)) * 44) + 1);
      const v = f0[bin] * 0.5 + f1[bin] * 0.3 + f2[bin] * 0.2;
      const wob = 0.75 + 0.25 * Math.sin(i * 1.7 + t * 3);
      const len = r * (0.012 + amp * (v * v * 0.17 * (0.6 + en) + hb * 0.055 * wob));
      const a = -Math.PI / 2 + (i / N) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      c.moveTo(x + ca * base, y + sa * base);
      c.lineTo(x + ca * (base + len), y + sa * (base + len));
    }
    c.stroke();
    // inner hairline
    c.lineWidth = Math.max(1, r * 0.004);
    c.beginPath(); c.arc(x, y, base - r * 0.025, 0, TAU); c.stroke();
  }
  c.restore();
}

// ------------------------------------------------------------------ text helpers
function letters(c, str) {
  const out = [];
  for (let i = 0; i < str.length; i++) out.push({ ch: str[i], x: c.measureText(str.slice(0, i)).width, w: c.measureText(str[i]).width });
  return out;
}

// worn condensed title -> drawn into tmp2 then masked with the wear texture
function wornText(fn, alpha = 1) {
  t2x.save();
  t2x.setTransform(1, 0, 0, 1, 0, 0);
  t2x.clearRect(0, 0, W, H);
  t2x.restore();
  t2x.save();
  fn(t2x);
  t2x.restore();
  t2x.save();
  t2x.globalCompositeOperation = "destination-in";
  t2x.drawImage(wornFull, 0, 0);
  t2x.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(tmp2, 0, 0);
  ctx.restore();
}

// skewed black tag (echoes the date tags of the art)
function tag(c, x, y, w, h, p, fill) {
  const sk = h * 0.22;
  c.save();
  c.beginPath(); c.rect(x - sk - 4, y - 4, (w + 2 * sk + 8) * p, h + 8); c.clip();
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x + sk, y); c.lineTo(x + w + sk, y); c.lineTo(x + w - sk, y + h); c.lineTo(x - sk, y + h); c.closePath();
  c.fill();
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ================================================================== SCENE A — chamada neon
const A_LINES = [{ s: "CORRE QUE", y: 455 }, { s: "AINDA DÁ", y: 610 }, { s: "TEMPO!", y: 765 }];
function sceneA(t) {
  if (t > 3.9) return;
  const xo = P(t, T.groove, 3.85);
  const k = { s: lerp(1, 1.07, eInOutSine(P(t, 0, 3.3))) * (1 + 0.6 * eInCubic(xo)), cx: 540, cy: 610, ox: 0, oy: 0 };
  const rack = 13 * (1 - eInOutCubic(P(t, 0.1, 2.8)));               // global rack focus
  const exBlur = 46 * eOutCubic(xo);
  const fade = 1 - eInOutCubic(xo);
  const gp = 0.85 + 0.9 * pulseAt(t, [0.035, 0.499, 1.416, 2.078, 2.334, 2.635], 7);
  let idx = 0;
  for (const c of [ctx, ex]) {
    c.save(); cam(c, k);
    c.font = "165px Bebas"; c.textBaseline = "alphabetic";
    idx = 0;
    for (const L of A_LINES) {
      const tw = c.measureText(L.s).width, x0 = 540 - tw / 2;
      for (const g of letters(c, L.s)) {
        if (g.ch === " ") continue;
        const st = 0.12 + idx * 0.072; idx++;
        const a = eOutCubic(P(t, st, st + 0.8));
        if (a <= 0) continue;
        const b = 24 * (1 - a) + rack + exBlur;
        const sc = 1.22 - 0.22 * a;
        c.save();
        c.globalAlpha = a * fade * (c === ctx ? 1 : clamp(gp, 0, 1.6) * 0.9);
        if (b > 0.3) c.filter = `blur(${b.toFixed(2)}px)`;
        c.translate(x0 + g.x + g.w / 2, L.y - 55 + (1 - a) * 26);
        c.scale(sc, sc);
        c.fillStyle = c === ctx ? PINK_CORE : rgba(PINK, 1);
        c.fillText(g.ch, -g.w / 2, 55);
        c.restore();
      }
    }
    c.restore();
  }
}

// ================================================================== CIRCLE state across B/C/D
const CB = { x: 540, y: 900, r: 330 };
const CD = { x: 540, y: 852, r: 220 };
function zoomB(t) {                                     // camera scale for scene B (push-in, then dive in)
  const push = lerp(1, 1.1, eInOutSine(P(t, T.groove, T.preA)));
  const z = P(t, T.preA, 6.45);
  return push * Math.pow(11, eInCubic(z));
}
function popB(t) { const p = P(t, T.groove, T.groove + 0.6); return { s: lerp(0.32, 1, eOutBack(p, 2.4)), b: 22 * (1 - eOutCubic(p)), a: eOutCubic(P(t, T.groove, T.groove + 0.18)) }; }
function pullD(t) { return eOutExpo(P(t, T.impact, T.impact + 0.55)); }
// final-comp camera: vertical parallax pan (+ loop drift for the back layers only, so the
// copy spacing and safe zones stay fixed while the woman sways)
function camD(t, withLoop = true) {
  const p = eOutCubic(P(t, T.impact, 10.2));
  const loop = withLoop ? P(t, T.drop, DUR) : 0;
  const land = pulseAt(t, [T.land], 10) * 0.012;
  return {
    s: 1 + 0.06 * (1 - p) + 0.014 * eInOutSine(loop) + land, cx: 540, cy: 900,
    ox: Math.sin(t * 0.9) * 4 * loop, oy: 150 * (1 - p) + Math.sin(t * 1.3) * 5 * loop,
  };
}
function circleD(t) {
  const k = camD(t);
  const breathe = t > T.drop ? 1 + 0.012 * Math.sin((t - T.drop) * TAU / 1.9) : 1;
  const pr = pullD(t);
  const r = lerp(1500, CD.r, pr) * breathe * Math.pow(k.s, 0.6);
  const y = lerp(960, CD.y, pr) + k.oy * 0.6;
  const sw = sway(t);
  return { x: CD.x + k.ox * 0.6 - sw.headDx * 0.3, y: y - sw.dy * 0.35, r };
}

// ================================================================== SCENE B — círculo + logo
function sceneB(t) {
  if (t < T.groove || t > 6.5) return;
  const zs = zoomB(t), pop = popB(t);
  const r = CB.r * pop.s * zs;
  const zv = eInCubic(P(t, T.preA, 6.45));
  const dof = pop.b + 34 * zv;                         // things rushing past the lens go soft
  const flash = 1 + 1.6 * pulseAt(t, [T.groove], 4.5) + 0.8 * pulseAt(t, [T.preA, T.preB], 7);
  const amp = (0.6 + 0.6 * energy(t)) * pop.s;
  withBlur(ctx, dof * 0.5, c => { c.globalAlpha = pop.a; circleBody(c, CB.x, CB.y, r); });
  withBlur(ctx, dof, c => { c.globalAlpha = pop.a; ring(c, false, CB.x, CB.y, r, t, amp); });
  withBlur(ex, dof, c => { c.globalAlpha = pop.a; ring(c, true, CB.x, CB.y, r, t, amp, Math.min(1.8, flash)); });
  // logo Cia Pink Mov inside the circle
  const pl = eOutCubic(P(t, 3.45, 4.35));
  if (pl > 0) {
    const lw = r * 1.42, lh = lw * IMG.logoPM.height / IMG.logoPM.width;
    const s = lerp(0.82, 1, pl);
    withBlur(ctx, 20 * (1 - pl) + 40 * zv, c => {
      c.globalAlpha = pl * (1 - eInCubic(P(t, 6.1, 6.45)));
      c.translate(CB.x, CB.y + r * 0.02); c.scale(s, s);
      c.drawImage(IMG.logoPM, -lw / 2, -lh / 2, lw, lh);
    });
    withBlur(ex, 6 + 20 * (1 - pl), c => {
      c.globalAlpha = pl * 0.32 * (1 - zv);
      c.translate(CB.x, CB.y + r * 0.02); c.scale(s, s);
      c.drawImage(IMG.logoPM, -lw / 2, -lh / 2, lw, lh);
    });
  }
}

// ================================================================== SCENE C — dentro do círculo
const C_STROKES = [
  { img: "pa", t: T.preB, d: 0.3, a: [-160, 1330], b: [1240, 760], th: 1.2, al: 0.95 },
  { img: "pb", t: 6.513, d: 0.26, a: [1240, 520], b: [-120, 900], th: 1.1, al: 0.85 },
  { img: "oa", t: 6.978, d: 0.22, a: [-80, 1480], b: [1160, 1140], th: 1.4, al: 1 },
  { img: "pc", t: 7.43, d: 0.24, a: [1180, 1560], b: [-80, 1300], th: 1.3, al: 0.85 },
  { img: "ob", t: 7.43, d: 0.2, a: [-60, 640], b: [980, 420], th: 1.6, al: 0.9 },
];
function sceneC(t) {
  if (t < 6.0 || t > 8.3) return;
  const pin = P(t, 6.0, 6.75), pc = pullD(t);
  const cs = lerp(0.42, 1, eOutCubic(pin)) * lerp(1, 1.07, eInOutSine(P(t, 6.75, T.impact))) * lerp(1, 0.18, pc);
  const ci = circleD(t);                                // when pulling back, content shrinks into the circle
  const cx = lerp(540, ci.x, pc), cy = lerp(960, ci.y, pc);
  const blurIn = 26 * (1 - eOutCubic(P(t, 6.0, 6.9)));
  const blurOut = 30 * eOutCubic(pc);
  const alpha = eOutCubic(P(t, 6.0, 6.35)) * (1 - eOutCubic(P(t, T.impact, T.impact + 0.3)));
  if (alpha <= 0) return;
  ctx.save();
  if (pc > 0) { ctx.beginPath(); ctx.arc(ci.x, ci.y, ci.r, 0, TAU); ctx.clip(); }
  // inner glow pulsing with the beat
  const hb = heart(t);
  const g = ctx.createRadialGradient(cx, cy - 80 * cs, 0, cx, cy, 900 * cs);
  g.addColorStop(0, rgba(PINK, (0.30 + 0.18 * hb) * alpha)); g.addColorStop(1, rgba(PINK, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const xf = c => { c.translate(cx, cy); c.scale(cs, cs); c.translate(-540, -960); };
  // strokes crossing on the beats (behind the title)
  for (const s of C_STROKES) {
    const p = eOutCubic(P(t, s.t, s.t + s.d));
    const drift = (t - s.t) * 14;
    for (const c of [ctx, ex]) {
      c.save(); xf(c);
      c.translate(drift * 0.6, -drift * 0.3);
      drawStroke(c, IMG[s.img], s.a[0], s.a[1], s.b[0], s.b[1], s.th, p, alpha * (c === ctx ? s.al : 0.22), blurIn + blurOut);
      c.restore();
    }
  }
  // OUTUBRO / ROSA – white, condensed, worn
  const l1 = eOutCubic(P(t, 6.0, 6.8)), l2 = eOutCubic(P(t, 6.12, 6.95));
  wornText(c => {
    xf(c);
    c.font = "300px Bebas"; c.textAlign = "center"; c.fillStyle = "#fff";
    c.shadowColor = "rgba(90,0,35,0.6)"; c.shadowBlur = 30; c.shadowOffsetY = 10;
    withBlur(c, 22 * (1 - l1) + blurIn * 0.4 + blurOut, cc => { cc.globalAlpha = l1; cc.fillText("OUTUBRO", 540 + (1 - l1) * 0, 905 + (1 - l1) * 30); });
    withBlur(c, 22 * (1 - l2) + blurIn * 0.4 + blurOut, cc => { cc.globalAlpha = l2; cc.fillText("ROSA", 540, 1160 + (1 - l2) * 30); });
  }, alpha);
  // black tag with the subtitle
  const pt = eOutCubic(P(t, 6.5, 6.9)), ptx = eOutCubic(P(t, 6.62, 7.15));
  ctx.save(); xf(ctx);
  withBlur(ctx, blurOut, c => {
    c.globalAlpha = alpha;
    tag(c, 150, 1205, 780, 124, pt, "rgba(6,4,7,0.94)");
    c.font = "600 40px Mont"; c.textAlign = "center"; c.fillStyle = "#fff";
    withBlur(c, 12 * (1 - ptx), cc => {
      cc.globalAlpha = alpha * ptx;
      cc.fillText("Projeto Feminino de", 540, 1257);
      cc.fillText("Emagrecimento e Autocuidado.", 540, 1306);
    });
  });
  ctx.restore();
  ctx.restore();
}

// ================================================================== SCENE D — composição final
const D = {
  pm: { x: 58, y: 262, w: 262 },
  cdc: { x: 800, y: 268, w: 222 },
  callY: 513,                                   // 52 px: 864 px wide, accent top 50 px under the logos
  band: { cy: 1118, w: 1180, rot: -0.035 },
  titleY: 1118,
  tagY: 1251, consY: 1412, capY: 1460, smallY: 1632,   // >= 40 px between blocks, all above y 1640
};
const D_BACK = [
  { img: "pa", t: T.impact, d: 0.32, a: [-180, 1520], b: [1260, 640], th: 1.25, al: 0.9 },
  { img: "pb", t: 8.359, d: 0.28, a: [560, 760], b: [1250, 420], th: 1.0, al: 0.8 },
  { img: "pc", t: 8.824, d: 0.26, a: [-140, 1000], b: [560, 640], th: 1.1, al: 0.7 },
];
const D_FRONT = [
  { img: "oa", t: T.impact, d: 0.26, a: [-90, 1090], b: [330, 880], th: 1.6, al: 1 },
  { img: "ob", t: 8.359, d: 0.24, a: [840, 700], b: [1150, 520], th: 1.8, al: 1 },
  { img: "pb", t: 8.824, d: 0.3, a: [1300, 1640], b: [700, 1930], th: 1.2, al: 0.95 },
  { img: "pa", t: 8.359, d: 0.3, a: [-260, 1960], b: [420, 1700], th: 1.2, al: 0.95 },
  { img: "ob", t: 9.276, d: 0.22, a: [760, 1910], b: [1140, 1720], th: 1.6, al: 0.9 },
];

function sceneD(t, frame) {
  if (t < T.impact) return;
  const k = camD(t);
  const kf = camD(t, false);
  const ci = circleD(t);
  const pr = pullD(t);
  const hb = heart(t);
  const en = energy(t);
  const alive = t > 16.0 ? 0.35 : 1;                 // music ends ~16 s: ring calms, keeps breathing

  // back strokes
  for (const s of D_BACK) {
    const p = eOutCubic(P(t, s.t, s.t + s.d));
    for (const c of [ctx, ex]) {
      c.save(); cam(c, k, 0.5);
      drawStroke(c, IMG[s.img], s.a[0], s.a[1], s.b[0], s.b[1], s.th, p, c === ctx ? s.al : 0.18, 2.5);
      c.restore();
    }
  }
  // circle (it is the same circle the camera was inside of)
  circleBody(ctx, ci.x, ci.y, ci.r, 0.9);
  const flash = 1 + 1.4 * pulseAt(t, [T.impact], 4) + 0.5 * pulseAt(t, [T.land, T.capsule, T.small], 6);
  const amp = (0.55 + 0.6 * en) * alive + (t > 16 ? 0.25 + 0.15 * Math.sin(t * 3.3) : 0);
  withBlur(ctx, 10 * (1 - pr), c => ring(c, false, ci.x, ci.y, ci.r, t, amp));
  withBlur(ex, 10 * (1 - pr), c => ring(c, true, ci.x, ci.y, ci.r, t, amp, Math.min(1.9, flash * (0.85 + 0.25 * hb * alive))));

  // woman rises from behind the mass, lands on the 9.74 beat
  const pw = P(t, 8.3, T.land);
  if (pw > 0) {
    const yo = 980 * (1 - eOutBack(pw, 0.75));
    const b = 16 * (1 - eOutCubic(pw));
    const ww = IMG.woman.width * WOMAN.s, wh = IMG.woman.height * WOMAN.s;
    const sw = sway(t);
    const swf = c => { c.translate(PIVOT.x, PIVOT.y + sw.dy); c.rotate(sw.rot); c.scale(sw.sc, sw.sc); c.translate(-PIVOT.x, -PIVOT.y); };
    ctx.save(); cam(ctx, kf, 0.85); swf(ctx);
    withBlur(ctx, b, c => c.drawImage(womanFX, WOMAN.x, WOMAN.y + yo, ww, wh));
    ctx.globalCompositeOperation = "lighter";
    withBlur(ctx, b, c => { c.globalAlpha = 0.5 + 0.25 * hb * alive; c.drawImage(womanRim, WOMAN.x, WOMAN.y + yo, ww, wh); });
    ctx.restore();
    // she occludes the glow behind her
    ex.save(); cam(ex, kf, 0.85); swf(ex);
    ex.globalCompositeOperation = "destination-out";
    withBlur(ex, b + 3, c => c.drawImage(womanFX, WOMAN.x, WOMAN.y + yo, ww, wh));
    ex.restore();
  }

  // pink mass rising from below (soft, defocused edges)
  const pm = eOutCubic(P(t, T.impact, 8.85));
  const yTop = lerp(H + 260, 1018, pm);
  tx.clearRect(0, 0, W, H);
  tx.save();
  const g = tx.createRadialGradient(540, yTop + 760, 120, 540, yTop + 760, 900);
  g.addColorStop(0, rgba(PINK_DEEP, 0.95)); g.addColorStop(0.62, rgba(PINK_DEEP, 0.8));
  g.addColorStop(0.84, rgba(PINK, 0.5)); g.addColorStop(1, rgba(PINK, 0));
  tx.fillStyle = g; tx.fillRect(0, 0, W, H);
  // brushy crest so the mass reads as paint, not a gradient
  tx.globalAlpha = 0.55;
  tx.drawImage(IMG.pa, -200, yTop + 50, 1500, 150);
  tx.drawImage(IMG.pb, 180, yTop + 10, 1100, 90);
  // keep the lower area dark for the copy
  tx.globalAlpha = 1;
  const d = tx.createLinearGradient(0, 1258, 0, 1398);
  d.addColorStop(0, "rgba(14,3,9,0)"); d.addColorStop(1, "rgba(14,3,9,0.9)");
  tx.fillStyle = d; tx.fillRect(0, 1258, W, H - 1258);
  tx.restore();
  ctx.save(); cam(ctx, kf, 1.0);
  ctx.filter = "blur(26px)"; ctx.drawImage(tmp, 0, 0); ctx.filter = "none";
  ctx.restore();
  ex.save(); cam(ex, kf, 1.0); ex.globalAlpha = 0.14; ex.filter = "blur(30px)"; ex.drawImage(tmp, 0, 0); ex.restore();

  // title band + OUTUBRO ROSA built bottom-up
  const pbnd = eOutCubic(P(t, 8.75, 9.3));
  const bd = D.band, bh = IMG.band.height * (bd.w / IMG.band.width);
  const bx0 = 540 - bd.w / 2;
  ctx.save(); cam(ctx, kf, 1.1);
  ctx.translate(540, bd.cy); ctx.rotate(bd.rot); ctx.translate(-540, -bd.cy);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  drawStroke(ctx, IMG.band, bx0, bd.cy, bx0 + bd.w, bd.cy, 1, pbnd, 1);
  ctx.restore();
  // shimmer passing over the band in the loop
  for (const st of [14.6, 16.1]) {
    const sp = P(t, st, st + 1.1);
    if (sp <= 0 || sp >= 1) continue;
    tx.clearRect(0, 0, W, H);
    tx.save();
    drawStroke(tx, IMG.band, bx0, bd.cy, bx0 + bd.w, bd.cy, 1, 1, 1);
    tx.globalCompositeOperation = "source-in";
    const sx = lerp(-300, 1400, eInOutSine(sp));
    const sg = tx.createLinearGradient(sx - 160, 0, sx + 160, 0);
    sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, "rgba(255,225,240,0.75)"); sg.addColorStop(1, "rgba(255,255,255,0)");
    tx.fillStyle = sg; tx.fillRect(0, 0, W, H);
    tx.restore();
    ctx.globalCompositeOperation = "lighter"; ctx.drawImage(tmp, 0, 0); ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
  ex.save(); cam(ex, kf, 1.1); ex.translate(540, bd.cy); ex.rotate(bd.rot); ex.translate(-540, -bd.cy);
  drawStroke(ex, IMG.band, bx0, bd.cy, bx0 + bd.w, bd.cy, 1, pbnd, 0.2); ex.restore();

  if (t > 8.95) {
    wornText(c => {
      cam(c, kf, 1.1);
      c.translate(540, bd.cy); c.rotate(bd.rot); c.translate(-540, -bd.cy);
      const bt = IMG.band.height * 0.59 * (bd.w / IMG.band.width) / 2;            // half visible band thickness
      c.beginPath(); c.rect(-100, bd.cy - 400, W + 200, 400 + bt + 6); c.clip();   // letters emerge from the band's lower edge
      c.font = "186px Bebas"; c.fillStyle = "#fff";
      const s = "OUTUBRO ROSA", tw = c.measureText(s).width, x0 = 540 - tw / 2;
      c.shadowColor = "rgba(80,0,30,0.55)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
      let i = 0;
      for (const L of letters(c, s)) {
        if (L.ch === " ") continue;
        const st = 9.0 + i * 0.038; i++;
        const p = P(t, st, st + 0.36);
        if (p <= 0) continue;
        const e = eOutBack(p, 1.3);
        c.save();
        if (p < 1) c.filter = `blur(${(14 * (1 - eOutCubic(p))).toFixed(2)}px)`;
        c.fillText(L.ch, x0 + L.x, D.titleY + 64 + (1 - e) * 150);
        c.restore();
      }
    });
  }

  // front strokes (edges only, never over the copy)
  for (const s of D_FRONT) {
    const p = eOutCubic(P(t, s.t, s.t + s.d));
    for (const c of [ctx, ex]) {
      c.save(); cam(c, kf, 1.4);
      drawStroke(c, IMG[s.img], s.a[0], s.a[1], s.b[0], s.b[1], s.th, p, c === ctx ? s.al : 0.3, 0);
      c.restore();
    }
  }

  // logos in the corners (exact files, never redrawn)
  const pl = eOutCubic(P(t, T.impact + 0.05, T.impact + 0.6));
  if (pl > 0) {
    const s = lerp(1.18, 1, pl), b = 18 * (1 - pl);
    const lp = IMG.logoPM, lh = D.pm.w * lp.height / lp.width;
    withBlur(ctx, b, c => {
      c.globalAlpha = pl;
      c.translate(D.pm.x + D.pm.w / 2, D.pm.y + lh / 2); c.scale(s, s);
      c.drawImage(lp, -D.pm.w / 2, -lh / 2, D.pm.w, lh);
    });
    const [sx, sy, sw, sh] = CDC_BOX, ch = D.cdc.w * sh / sw;
    withBlur(ctx, b, c => {
      c.globalAlpha = pl;
      c.translate(D.cdc.x + D.cdc.w / 2, D.pm.y + lh / 2); c.scale(s, s);
      c.drawImage(IMG.logoCDC, sx, sy, sw, sh, -D.cdc.w / 2, -ch / 2, D.cdc.w, ch);
    });
  }

  // CORRE QUE AINDA DÁ TEMPO! — typed at the top
  if (t > T.call) {
    const call = "CORRE QUE AINDA DÁ TEMPO!";
    const n = Math.min(call.length, Math.floor((t - T.call) / 0.024) + 1);
    const gp = 0.9 + 0.9 * pulseAt(t, [T.small], 3.5) + 0.25 * hb * alive;
    for (const c of [ctx, ex]) {
      c.save(); cam(c, kf, 1.15);
      c.font = "italic 900 52px Mont"; c.textBaseline = "alphabetic";
      const tw = c.measureText(call).width, x0 = 540 - tw / 2;
      const Ls = letters(c, call);
      for (let i = 0; i < n; i++) {
        const age = t - (T.call + i * 0.024);
        const fl = Math.exp(-age * 9);
        c.save();
        c.globalAlpha = c === ctx ? 1 : clamp(0.85 * gp + fl, 0, 2);
        c.fillStyle = c === ctx ? (fl > 0.3 ? "#ffd3e6" : PINK_CORE) : rgba(PINK, 1);
        c.fillText(Ls[i].ch, x0 + Ls[i].x, D.callY);
        c.restore();
      }
      // typing cursor
      if (c === ctx && t < 11.2 && Math.floor(t * 4) % 2 === 0) {
        const cx = n < call.length ? x0 + Ls[n].x : x0 + tw + 6;
        c.fillStyle = PINK_CORE; c.fillRect(cx, D.callY - 41, 5, 48);
      }
      c.restore();
    }
  }

  // subtitle in the black tag
  const ps = eOutCubic(P(t, T.sub, T.sub + 0.35)), pst = eOutCubic(P(t, T.sub + 0.08, T.sub + 0.5));
  if (ps > 0) {
    ctx.save(); cam(ctx, kf, 1.15);
    tag(ctx, 200, D.tagY, 680, 96, ps, "rgba(7,4,8,0.95)");
    ctx.font = "600 34px Mont"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    withBlur(ctx, 10 * (1 - pst), c => {
      c.globalAlpha = pst;
      c.fillText("Projeto Feminino de", 540, D.tagY + 37 + (1 - pst) * 10);
      c.fillText("Emagrecimento e Autocuidado.", 540, D.tagY + 79 + (1 - pst) * 10);
    });
    ctx.restore();
  }

  // awareness line (secondary)
  const pc = eOutCubic(P(t, T.consc, T.consc + 0.5));
  if (pc > 0) {
    ctx.save(); cam(ctx, kf, 1.15);
    withBlur(ctx, 12 * (1 - pc), c => {
      c.globalAlpha = pc;
      c.font = "500 32px Mont"; c.textAlign = "center"; c.fillStyle = "#ffe1ec";
      c.fillText("Conscientização e Prevenção do Câncer de Mama.", 540, D.consY + (1 - pc) * 14);
    });
    ctx.restore();
  }

  // capsule with the QR notice (text only) – pops on the 12.06 beat
  const pk = P(t, T.capsule, T.capsule + 0.5);
  if (pk > 0) {
    const s = lerp(0.55, 1, eOutBack(pk, 2.0)), a = eOutCubic(P(t, T.capsule, T.capsule + 0.15));
    const cw = 760, chh = 107, cx = 540, cy = D.capY + chh / 2;
    const glowK = 0.75 + 1.2 * pulseAt(t, [T.capsule], 5) + 0.2 * hb * alive;
    for (const c of [ctx, ex]) {
      c.save(); cam(c, kf, 1.15);
      c.translate(cx, cy); c.scale(s, s);
      c.globalAlpha = a;
      roundRect(c, -cw / 2, -chh / 2, cw, chh, chh / 2);
      if (c === ctx) { c.fillStyle = "rgba(14,5,10,0.93)"; c.fill(); }
      c.lineWidth = 3.5; c.strokeStyle = c === ctx ? "#ff4f98" : rgba(PINK, clamp(glowK, 0, 2) * 0.8); c.stroke();
      if (c === ctx) {
        const pt = eOutCubic(P(t, T.capsule + 0.08, T.capsule + 0.45));
        c.globalAlpha = a * pt;
        c.font = "700 34px Mont"; c.textAlign = "center"; c.fillStyle = "#fff";
        c.fillText("Escaneie o QR Code na Recepção", 0, 41 - chh / 2);
        c.fillText("da Sua Academia.", 0, 85 - chh / 2);
      }
      c.restore();
    }
  }

  // fine print
  const pf = eOutCubic(P(t, T.small, T.small + 0.4));
  if (pf > 0) {
    ctx.save(); cam(ctx, kf, 1.15);
    withBlur(ctx, 10 * (1 - pf), c => {
      c.globalAlpha = pf;
      c.font = "500 32px Mont"; c.textAlign = "center"; c.fillStyle = "rgba(255,255,255,0.93)";
      c.fillText("Projeto válido para alunas ativas.", 540, D.smallY);
    });
    ctx.restore();
  }
}

// ================================================================== frame
function renderFrame(t) {
  const frame = Math.round(t * FPS);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
  ctx.fillStyle = "#070508"; ctx.fillRect(0, 0, W, H);
  ex.setTransform(1, 0, 0, 1, 0, 0); ex.clearRect(0, 0, W, H);

  // background camera follows whichever scene leads
  let bk;
  if (t < T.groove) bk = { s: 1, cx: 540, cy: 960, ox: 0, oy: 0 };
  else if (t < T.impact) bk = { s: zoomB(t), cx: 540, cy: 960, ox: 0, oy: 0 };
  else bk = camD(t);
  const en = energy(t), hb = heart(t);
  const glow = [];
  if (t < T.groove + 0.4) glow.push({ x: 540, y: 610, r: 760, a: (0.10 + 0.07 * hb) * (1 - P(t, T.groove, T.groove + 0.4)) });
  if (t >= T.groove && t < 8.3) glow.push({ x: 540, y: 900, r: 900, a: (0.14 + 0.1 * hb) * popB(t).a });
  if (t >= T.impact) glow.push({ x: 540, y: 860, r: 980, a: 0.12 + 0.08 * hb * (t > 16 ? 0.3 : 1) });
  background(t, bk, glow);

  sceneA(t);
  sceneB(t);
  sceneC(t);
  sceneD(t, frame);

  const flash = 1 + 0.5 * pulseAt(t, [T.groove, T.impact], 5);
  bloom(1.05 * flash);
  finish(t, frame);
}

window.renderFrame = renderFrame;
window.DURATION = DUR;
window.ready = load().then(() => { renderFrame(0); return true; });

// ------------------------------------------------------------------ browser preview
const q = new URLSearchParams(location.search);
if (!q.has("render")) {
  document.body.classList.add("preview");
  const aud = document.getElementById("aud"), scrub = document.getElementById("scrub"), tc = document.getElementById("tc");
  let playing = false;
  const show = t => { renderFrame(Math.round(t * FPS) / FPS); tc.textContent = t.toFixed(2) + "s"; scrub.value = t; };
  window.ready.then(() => show(q.has("t") ? +q.get("t") : 0));
  scrub.oninput = () => { aud.currentTime = +scrub.value; show(+scrub.value); };
  document.getElementById("play").onclick = () => {
    playing = !playing;
    if (playing) { aud.play(); (function loop() { if (!playing) return; show(aud.currentTime); if (!aud.ended) requestAnimationFrame(loop); })(); }
    else aud.pause();
  };
}
})();
