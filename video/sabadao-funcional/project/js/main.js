/* Sabadão Funcional 11ª Edição: motion flyer 1080x1920, 15 s.
 *
 * Deterministic timeline: every frame depends only on t (seconds) and the
 * audio analysis in audio.js (window.AUDIO). The renderer calls
 * window.renderFrame(t) and grabs the canvas.
 *
 * Open index.html?play in a browser (served over http) for a live preview
 * with sound; index.html?t=7.5 shows a single frame.
 */
(() => {
  "use strict";
  const W = 1080, H = 1920;
  const A = window.AUDIO, M = window.MANIFEST;
  const FPS = A.fps, DUR = 15.0;
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  // ------------------------------------------------------------ palette (PSD)
  const C = {
    orange: "#fd7007",      // vibrant orange (brush behind the logo)
    orangeLt: "#fb892a",
    orangeTag: "#c74300",   // tag text: 4.9:1 on the white pill
    leafDeep: "#b3320a",    // reddish orange of the leaves
    leafTip: "#ef5a10",
    burnt: "196,62,8",       // vivid burnt orange behind text (white = 5.2:1)
    bandEdge: "236,90,12",   // brighter orange at the band ends
    sky: M.colors.sky_low,
    sand: M.colors.sand,
    white: "#ffffff",
  };

  // ------------------------------------------------------------ beats/timeline
  const B = A.beats;
  const T = {
    groove: B[5],               // 2.708 groove entry
    tag: B[7],                  // 3.667 "11ª EDIÇÃO"
    impact: B[13],              // 6.545 biggest hit -> woman
    final: B[17],               // 8.464 final composition
    logoLand: B[18],            // 8.944
    slogan: B[19],              // 9.423
    date: B[21],                // 10.383
    local: B[22],               // 10.862
    complete: B[23],            // 11.342
    drop: B[29],                // 14.220 last hit
  };
  window.TIMELINE = T;

  // ------------------------------------------------------------ math helpers
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, x) => a + (b - a) * x;
  const prog = (t, s, d) => clamp((t - s) / d);
  const eOutCubic = x => 1 - Math.pow(1 - x, 3);
  const eOutQuint = x => 1 - Math.pow(1 - x, 5);
  const eOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  const eInCubic = x => x * x * x;
  const eInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const backOut = (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
  const smooth = x => x * x * (3 - 2 * x);
  const DEG = Math.PI / 180;
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const frameOf = t => clamp(Math.floor(t * FPS), 0, A.frames - 1);
  const band = (name, t) => A.per_frame[name][frameOf(t)];
  // decaying pulse on recent beats, weighted by beat strength
  function beatPulse(t, decay = 0.22, from = 0) {
    let v = 0;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (b > t) break;
      if (b < from) continue;
      v = Math.max(v, A.beat_strength[i] * Math.exp(-(t - b) / decay));
    }
    return v;
  }

  // ------------------------------------------------------------ canvases
  function mk(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  function loadImg(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("image " + src));
      i.src = src;
    });
  }
  const L = "assets/layers/";
  const IMG = {};
  const P = M.logo.parts;

  // tint a white mask image to a fill (colour or gradient factory)
  function tint(img, fill) {
    const c = mk(img.width, img.height), g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = typeof fill === "function" ? fill(g, c.width, c.height) : fill;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ------------------------------------------------------------ palm fronds
  // procedural fronds (reconstructed from the art's leaves), cached
  function buildFrond(len, seed, deep, tip, curl = 1) {
    const r = mulberry32(seed);
    const w = Math.ceil(len * 1.08), h = Math.ceil(len * 0.86);
    const c = mk(w, h), g = c.getContext("2d");
    const ox = len * 0.03, oy = h * 0.42;
    const ctl = { x: ox + len * 0.5, y: oy - len * 0.16 * curl }, end = { x: ox + len, y: oy + len * 0.10 * curl };
    const pt = s => ({
      x: (1 - s) * (1 - s) * ox + 2 * (1 - s) * s * ctl.x + s * s * end.x,
      y: (1 - s) * (1 - s) * oy + 2 * (1 - s) * s * ctl.y + s * s * end.y,
    });
    const tan = s => {
      const dx = 2 * (1 - s) * (ctl.x - ox) + 2 * s * (end.x - ctl.x);
      const dy = 2 * (1 - s) * (ctl.y - oy) + 2 * s * (end.y - ctl.y);
      const m = Math.hypot(dx, dy);
      return { x: dx / m, y: dy / m };
    };
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, deep);
    grad.addColorStop(1, tip);
    const n = 19;
    for (let side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const s = 0.05 + 0.95 * (i / (n - 1)) + (r() - 0.5) * 0.015;
        const p = pt(s), d = tan(s);
        const ang = (64 - 30 * s + (r() - 0.5) * 8) * DEG * side;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const dir = { x: d.x * ca - d.y * sa, y: d.x * sa + d.y * ca };
        const Ls = len * 0.44 * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * s)), 0.7) * (1 - 0.3 * s) * (0.88 + r() * 0.24);
        const droop = len * 0.06 * (0.5 + s) * (side > 0 ? 1 : 0.6);
        const e = { x: p.x + dir.x * Ls, y: p.y + dir.y * Ls + droop };
        const pn = { x: -dir.y, y: dir.x };
        const wb = Ls * (0.10 + r() * 0.03);           // broad blade
        const a1 = { x: p.x + dir.x * Ls * 0.35, y: p.y + dir.y * Ls * 0.35 + droop * 0.15 };
        const a2 = { x: p.x + dir.x * Ls * 0.75, y: p.y + dir.y * Ls * 0.75 + droop * 0.55 };
        g.beginPath();
        g.moveTo(p.x - pn.x * wb * 0.25, p.y - pn.y * wb * 0.25);
        g.bezierCurveTo(a1.x - pn.x * wb * 1.1, a1.y - pn.y * wb * 1.1, a2.x - pn.x * wb * 0.6, a2.y - pn.y * wb * 0.6, e.x, e.y);
        g.bezierCurveTo(a2.x + pn.x * wb * 0.5, a2.y + pn.y * wb * 0.5, a1.x + pn.x * wb * 0.9, a1.y + pn.y * wb * 0.9, p.x + pn.x * wb * 0.25, p.y + pn.y * wb * 0.25);
        g.closePath();
        g.globalAlpha = 0.9 + r() * 0.1;
        g.fillStyle = grad;
        g.fill();
        // darker midrib for definition
        g.globalAlpha = 0.28;
        g.strokeStyle = "#6e1a04";
        g.lineWidth = Math.max(1, wb * 0.12);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.quadraticCurveTo(a2.x, a2.y, e.x, e.y);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.strokeStyle = grad;
    g.lineCap = "round";
    g.lineWidth = len * 0.013;
    g.beginPath();
    g.moveTo(ox, oy);
    g.quadraticCurveTo(ctl.x, ctl.y, end.x, end.y);
    g.stroke();
    c.ox = ox; c.oy = oy;
    return c;
  }

  // draw a frond: base at (x,y), rotation deg, scale, blur px, sway amp deg
  function frond(g, f, x, y, rot, sc, opt = {}) {
    const { blur = 0, alpha = 1, flip = false } = opt;
    g.save();
    g.translate(x, y);
    g.rotate(rot * DEG);
    g.scale(sc * (flip ? -1 : 1), sc);
    if (blur > 0.3) g.filter = `blur(${(blur / sc).toFixed(1)}px)`;
    g.globalAlpha = alpha;
    g.drawImage(f, -f.ox, -f.oy);
    g.restore();
  }

  // ------------------------------------------------------------ palm warp
  // per-pixel displacement of the logo palm: rotation that grows with height
  // above the trunk anchor (trunk almost rigid, hill rigid) + leaf flutter
  // perpendicular to each leaf with phase by direction.
  let PW = null;
  function initPalm() {
    const img = IMG.palm, m = 70;
    const w = img.width + 2 * m, h = img.height + 2 * m;
    const src = mk(img.width, img.height).getContext("2d");
    src.drawImage(img, 0, 0);
    const sa = src.getImageData(0, 0, img.width, img.height).data;
    const alpha = new Float32Array(img.width * img.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = sa[i * 4 + 3];
    // anchors in palm-local px (part stored at 0.6 of the 2000 px logo)
    const cx = 312, cy = 214, bx = 372, by = 548, R = 330;
    const n = w * h;
    const wgt = new Float32Array(n), fl = new Float32Array(n), ph = new Float32Array(n),
      px_ = new Float32Array(n), py_ = new Float32Array(n);
    for (let Y = 0; Y < h; Y++) {
      for (let X = 0; X < w; X++) {
        const i = Y * w + X, x = X - m, y = Y - m;
        let k = (by - y) / (by - cy);
        k = k <= 0 ? 0 : k < 1 ? smooth(k) : 1 + (k - 1) * 0.9;
        wgt[i] = k;
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) / R;
        const f = Math.max(0, r - 0.22);
        fl[i] = y > by - 30 ? 0 : Math.pow(f, 1.35);
        const th = Math.atan2(dy, dx);
        ph[i] = th;
        px_[i] = -Math.sin(th); py_[i] = Math.cos(th);
      }
    }
    const out = mk(w, h), og = out.getContext("2d");
    const id = og.createImageData(w, h);
    for (let i = 0; i < n; i++) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 255; id.data[i * 4 + 2] = 255; }
    PW = { img, m, w, h, alpha, sw: img.width, sh: img.height, bx, by, wgt, fl, ph, px_, py_, out, og, id };
  }
  function warpPalm(t, amp = 1) {
    const p = PW, d = p.id.data;
    const wind = 0.75 * Math.sin(t * 2 * Math.PI / 2.7) + 0.25 * Math.sin(t * 2 * Math.PI / 1.13 + 1.1);
    const a = 3.0 * DEG * wind * amp;            // up to ~3 deg at the crown
    const fa = 9 * amp;                           // leaf tip flutter (px)
    const w1 = t * 2 * Math.PI / 1.05;
    for (let Y = 0, i = 0; Y < p.h; Y++) {
      for (let X = 0; X < p.w; X++, i++) {
        const x = X - p.m, y = Y - p.m;
        const phi = a * p.wgt[i];
        // inverse rotation about the trunk anchor
        const vx = x - p.bx, vy = y - p.by;
        const c2 = 1 - phi * phi * 0.5;
        let sx = p.bx + vx * c2 + phi * vy;
        let sy = p.by + vy * c2 - phi * vx;
        const f = p.fl[i];
        if (f > 0) {
          const s = fa * f * Math.sin(w1 + 2.1 * p.ph[i] + 0.6 * f);
          sx -= s * p.px_[i]; sy -= s * p.py_[i];
        }
        // bilinear alpha sample
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        let av = 0;
        if (x0 >= -1 && y0 >= -1 && x0 < p.sw && y0 < p.sh) {
          const fx = sx - x0, fy = sy - y0;
          const g = (xx, yy) => (xx < 0 || yy < 0 || xx >= p.sw || yy >= p.sh ? 0 : p.alpha[yy * p.sw + xx]);
          av = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
        }
        d[i * 4 + 3] = av;
      }
    }
    p.og.putImageData(p.id, 0, 0);
    return p.out;
  }

  // ------------------------------------------------------------ logo layer
  const LOX = 150, LOY = 60, LW = 1460, LH = 1160;   // logo canvas, logo-space offset
  const LC = { x: 596, y: 557 };                       // visual centre (logo space)
  let logoC, logoG, letC, letG, tmpC, tmpG;
  const BIRDS = [
    { k: "bird_l1", ph: 0.0, from: [-520, 160] },
    { k: "bird_l2", ph: 1.7, from: [-420, 260] },
    { k: "bird_l3", ph: 3.1, from: [-600, 320] },
    { k: "bird_r1", ph: 0.9, from: [520, -120] },
    { k: "bird_r2", ph: 2.4, from: [600, -40] },
  ];

  function drawPart(g, k, dx = 0, dy = 0) {
    const p = P[k];
    g.drawImage(IMG[k], p.x + LOX + dx, p.y + LOY + dy);
  }

  // o: {sway, birdIn (0..1), birdAmp, arcP, baseP, sweep (-1..2 or null), cia}
  function renderLogo(t, o) {
    const g = logoG;
    g.clearRect(0, 0, LW, LH);
    // arc: revealed by a conic sweep around the sun centre
    if (o.arcP > 0) {
      const a = P.arc;
      tmpG.clearRect(0, 0, tmpC.width, tmpC.height);
      tmpG.drawImage(IMG.arc, 0, 0);
      if (o.arcP < 1) {
        tmpG.globalCompositeOperation = "destination-in";
        const cg = tmpG.createConicGradient(Math.PI * 0.62, 640 - a.x, 560 - a.y);
        const e = eOutCubic(o.arcP) * 0.42;
        cg.addColorStop(0, "rgba(0,0,0,1)");
        cg.addColorStop(Math.max(0, e - 0.03), "rgba(0,0,0,1)");
        cg.addColorStop(e, "rgba(0,0,0,0)");
        cg.addColorStop(1, "rgba(0,0,0,0)");
        tmpG.fillStyle = cg;
        tmpG.fillRect(0, 0, a.w, a.h);
        tmpG.globalCompositeOperation = "source-over";
      }
      g.save();
      g.globalAlpha = o.arcAlpha ?? 1;
      g.drawImage(tmpC, 0, 0, a.w, a.h, a.x + LOX, a.y + LOY, a.w, a.h);
      g.restore();
    }
    // palm (warped)
    const pc = warpPalm(t, o.sway);
    g.drawImage(pc, P.palm.x + LOX - PW.m, P.palm.y + LOY - PW.m);
    // birds: curved flight in, then small looping orbits, flapping wings
    for (const b of BIRDS) {
      const p = P[b.k];
      const k = clamp(o.birdIn);
      const e = eOutCubic(k);
      // quadratic bezier from off-logo to home, bulging upward
      const sx = b.from[0], sy = b.from[1];
      const cx = sx * 0.35, cy = Math.min(sy, 0) - 160;
      const u = 1 - e;
      let ox = u * u * sx + 2 * u * e * cx;
      let oy = u * u * sy + 2 * u * e * cy;
      const amp = o.birdAmp;
      ox += amp * (16 * Math.sin(t * 0.95 + b.ph) + 7 * Math.sin(t * 2.1 + b.ph * 2));
      oy += amp * (9 * Math.sin(t * 1.6 + b.ph * 1.3));
      const flap = Math.sin(t * 2 * Math.PI * 2.6 + b.ph * 2.2);
      const sY = 0.62 + 0.42 * flap;     // wings up (1.04) <-> down (0.2)
      const sX = 0.96 - 0.06 * flap;
      const bxc = p.x + p.w / 2 + LOX + ox, byc = p.y + p.h * 0.78 + LOY + oy;
      const al = clamp(k * 3);
      if (al <= 0) continue;
      g.save();
      g.globalAlpha = al;
      g.translate(bxc, byc);
      g.rotate((b.from[0] < 0 ? 1 : -1) * (1 - e) * 14 * DEG + Math.sin(t * 1.3 + b.ph) * 4 * DEG);
      g.scale(sX, sY);
      g.drawImage(IMG[b.k], -p.w / 2, -p.h * 0.78);
      g.restore();
    }
    // letters (rigid) + light sweep
    letG.clearRect(0, 0, LW, LH);
    drawPart(letG, "sabadao");
    drawPart(letG, "funcional");
    g.drawImage(letC, 0, 0);
    // base brush: drawn left -> right
    if (o.baseP > 0) {
      const p = P.base;
      tmpG.clearRect(0, 0, tmpC.width, tmpC.height);
      tmpG.drawImage(IMG.base, 0, 0);
      if (o.baseP < 1) {
        const e = eOutCubic(o.baseP) * (p.w + 80);
        tmpG.globalCompositeOperation = "destination-in";
        const lg = tmpG.createLinearGradient(e - 80, 0, e, 0);
        lg.addColorStop(0, "rgba(0,0,0,1)");
        lg.addColorStop(1, "rgba(0,0,0,0)");
        tmpG.fillStyle = lg;
        tmpG.fillRect(0, 0, p.w, p.h);
        tmpG.globalCompositeOperation = "source-over";
      }
      g.drawImage(tmpC, 0, 0, p.w, p.h, p.x + LOX, p.y + LOY, p.w, p.h);
    }
    // light sweep glow travelling over the letters
    if (o.sweep != null && o.sweep > -0.3 && o.sweep < 1.3) {
      tmpG.clearRect(0, 0, tmpC.width, tmpC.height);
      tmpG.drawImage(letC, 0, 0, LW, LH, 0, 0, LW, LH);
      tmpG.globalCompositeOperation = "destination-in";
      const x = lerp(-200, LW + 200, o.sweep);
      const lg = tmpG.createLinearGradient(x - 160, 0, x + 160, 120);
      lg.addColorStop(0, "rgba(0,0,0,0)");
      lg.addColorStop(0.5, "rgba(0,0,0,1)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      tmpG.fillStyle = lg;
      tmpG.fillRect(0, 0, LW, LH);
      tmpG.globalCompositeOperation = "source-over";
      g.save();
      g.globalCompositeOperation = "lighter";
      g.filter = "blur(14px)";
      g.globalAlpha = 0.9;
      g.drawImage(tmpC, 0, 0, LW, LH, 0, 0, LW, LH);
      g.filter = "blur(4px)";
      g.globalAlpha = 0.6;
      g.drawImage(tmpC, 0, 0, LW, LH, 0, 0, LW, LH);
      g.restore();
    }
    return logoC;
  }

  // place the logo canvas: centre (x,y) on screen, scale, blur, alpha, glow
  function placeLogo(g, lc, x, y, s, o = {}) {
    const { blur = 0, alpha = 1, glow = 0.35, shadow = 0.4, rot = 0 } = o;
    if (alpha <= 0) return;
    g.save();
    g.translate(x, y);
    g.rotate(rot * DEG);
    g.scale(s, s);
    g.translate(-(LC.x + LOX), -(LC.y + LOY));
    g.globalAlpha = alpha;
    if (blur > 0.4) g.filter = `blur(${(blur / s).toFixed(1)}px)`;
    if (shadow > 0) {
      g.shadowColor = `rgba(110,30,0,${shadow})`;
      g.shadowBlur = 40 * s;
      g.shadowOffsetY = 14 * s;
    }
    g.drawImage(lc, 0, 0);
    g.shadowColor = "transparent";
    if (glow > 0) {
      g.globalCompositeOperation = "screen";
      g.globalAlpha = alpha * glow;
      g.filter = `blur(${((22 + blur) / s).toFixed(1)}px)`;
      g.drawImage(lc, 0, 0);
    }
    g.restore();
  }

  // ------------------------------------------------------------ backgrounds
  function solarBackground(g, t, cam) {
    // radial orange plate with a hot core behind the logo
    const cx = 540 + cam.x * 0.2, cy = 900 + cam.y * 0.2;
    const rg = g.createRadialGradient(cx, cy, 40, cx, cy, 1250);
    rg.addColorStop(0, "#ff8418");
    rg.addColorStop(0.35, C.orange);
    rg.addColorStop(0.75, "#e9520a");
    rg.addColorStop(1, "#b8360a");
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    // big sun disc low right (as in the event cover) with bloom
    const sx = 860 + cam.x * 0.35, sy = 1560 + cam.y * 0.35, sr = 430;
    const pulse = 0.5 * beatPulse(t, 0.3);
    g.save();
    g.globalCompositeOperation = "screen";
    const bl = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 2.2);
    bl.addColorStop(0, `rgba(255,200,80,${0.35 + 0.15 * pulse})`);
    bl.addColorStop(1, "rgba(255,160,40,0)");
    g.fillStyle = bl;
    g.fillRect(0, 0, W, H);
    g.restore();
    const sg = g.createLinearGradient(sx, sy - sr, sx, sy + sr);
    sg.addColorStop(0, "#ffe066");
    sg.addColorStop(0.55, "#ffb92e");
    sg.addColorStop(1, "#ff9010");
    g.fillStyle = sg;
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();
    // sea lines over the sun (PSD wave lines)
    const wv = IMG.waves;
    g.save();
    g.globalAlpha = 0.55;
    g.drawImage(wv, 70 + cam.x * 0.4, 1640 + cam.y * 0.4, wv.width * 0.9, wv.height * 0.9);
    g.restore();
  }

  function rays(g, t, x, y, s, alpha) {
    if (alpha <= 0) return;
    const kick = band("kick", t), low = band("low", t);
    const pulse = beatPulse(t, 0.2);
    const n = 20, R = 980 * s * (1 + 0.10 * pulse + 0.05 * kick);
    g.save();
    g.translate(x, y);
    g.rotate(t * 5 * DEG);
    g.globalCompositeOperation = "screen";
    g.globalAlpha = alpha * (0.32 + 0.30 * pulse + 0.08 * low);
    const rg = g.createRadialGradient(0, 0, 60 * s, 0, 0, R);
    rg.addColorStop(0, "rgba(255,236,190,0.8)");
    rg.addColorStop(0.45, "rgba(255,210,130,0.3)");
    rg.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = rg;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, wdt = (Math.PI / n) * (0.55 + 0.25 * Math.sin(i * 1.7));
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, R * (i % 2 ? 0.82 : 1), a0 - wdt / 2, a0 + wdt / 2);
      g.closePath();
      g.fill();
    }
    // core glow
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, 520 * s);
    cg.addColorStop(0, `rgba(255,210,120,${0.42 + 0.2 * pulse})`);
    cg.addColorStop(1, "rgba(255,170,70,0)");
    g.fillStyle = cg;
    g.globalAlpha = alpha;
    g.beginPath();
    g.arc(0, 0, 520 * s, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // light particles (deterministic)
  const PARTS = (() => {
    const r = mulberry32(99), a = [];
    for (let i = 0; i < 80; i++) a.push({ x: r() * W, y: r() * H, s: 0.8 + r() * 2.6, v: 12 + r() * 45, ph: r() * 6.28, z: 0.3 + r() * 1.2 });
    return a;
  })();
  function particles(g, t, alpha, cam, avoid = null) {
    if (alpha <= 0) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const p of PARTS) {
      const y = ((p.y - t * p.v + cam.y * p.z * 0.3) % H + H) % H;
      const x = p.x + Math.sin(t * 0.7 + p.ph) * 18 + cam.x * p.z * 0.3;
      if (avoid && y > avoid[0] && y < avoid[1]) continue;
      const tw = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.3 + p.ph * 3), 2);
      const r = p.s * (1.6 + p.z);
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
      gr.addColorStop(0, `rgba(255,244,210,${0.42 * tw * alpha})`);
      gr.addColorStop(1, "rgba(255,200,120,0)");
      g.fillStyle = gr;
      g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    g.restore();
  }

  // tinted dry-brush stroke drawn on along its length
  function brush(g, img, x, y, w, h, rot, p, alpha = 1) {
    if (p <= 0 || alpha <= 0) return;
    const e = eOutCubic(clamp(p));
    g.save();
    g.translate(x, y);
    g.rotate(rot * DEG);
    g.globalAlpha = alpha;
    const sw = img.width * e;
    if (sw > 1) g.drawImage(img, 0, 0, sw, img.height, -w / 2, -h / 2, w * e, h);
    g.restore();
  }

  // ------------------------------------------------------------ text helpers
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function tagPill(g, x, y, s, rot, alpha) {
    if (alpha <= 0 || s <= 0.01) return;
    g.save();
    g.translate(x, y);
    g.rotate(rot * DEG);
    g.scale(s, s);
    g.globalAlpha = alpha;
    g.font = "800 38px Montserrat";
    const txt = "11ª EDIÇÃO";
    const tw = g.measureText(txt).width;
    const w = tw + 48, h = 60;
    g.shadowColor = "rgba(90,25,0,0.45)";
    g.shadowBlur = 18;
    g.shadowOffsetY = 6;
    g.fillStyle = C.white;
    roundRect(g, -w / 2, -h / 2, w, h, 14);
    g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = C.orangeTag;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(txt, 0, 3);
    g.restore();
  }

  function calendarIcon(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.strokeStyle = C.white; g.fillStyle = C.white;
    g.lineWidth = 4.2; g.lineJoin = "round"; g.lineCap = "round";
    roundRect(g, 0, 6, 52, 46, 7); g.stroke();
    g.beginPath(); g.moveTo(0, 18); g.lineTo(52, 18); g.stroke();
    g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 11); g.moveTo(38, 0); g.lineTo(38, 11); g.stroke();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      if (r === 2 && c === 3) continue;
      g.fillRect(8 + c * 10.5, 25 + r * 8.5, 5.5, 5);
    }
    g.restore();
  }

  function pinIcon(g, x, y, s, pulse) {
    g.save();
    g.translate(x, y);
    // pulse ring on the ground
    if (pulse > 0) {
      for (const k of [0, 0.5]) {
        const q = (pulse + k) % 1;
        g.save();
        g.globalAlpha = 0.55 * (1 - q);
        g.strokeStyle = C.white;
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(0, 0, 10 + 34 * q * s, (4 + 12 * q) * s, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
    g.scale(s, s);
    g.fillStyle = C.white;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-6, -14, -24, -28, -24, -46);
    g.arc(0, -46, 24, Math.PI, 0);
    g.bezierCurveTo(24, -28, 6, -14, 0, 0);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(0, -46, 9.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // text revealed by a soft left->right wipe with slide + blur
  function revealText(g, txt, x, y, font, p, opt = {}) {
    if (p <= 0) return;
    const { align = "left", skew = 0, shadow = true, color = C.white } = opt;
    const e = eOutQuint(clamp(p));
    g.save();
    g.font = font;
    g.textAlign = align;
    g.textBaseline = "alphabetic";
    g.translate(x + (1 - e) * -40, y);
    if (skew) g.transform(1, 0, Math.tan(skew * DEG), 1, 0, 0);
    g.globalAlpha = clamp(p * 2.2);
    if (p < 1) g.filter = `blur(${((1 - e) * 10).toFixed(1)}px)`;
    if (shadow) { g.shadowColor = "rgba(40,10,0,0.55)"; g.shadowBlur = 14; g.shadowOffsetY = 4; }
    g.fillStyle = color;
    g.fillText(txt, 0, 0);
    g.restore();
  }

  // ------------------------------------------------------------ scenes
  const FR = {};   // cached fronds

  // Scene A (0 -> impact): solar plate, logo hero, rays, brush, fronds
  // opt.bg: draw only the background (portal sequence draws logo/tag itself)
  function sceneLogo(g, t, opt = {}) {
    // camera: slow continuous push-in up to the impact
    const dive = 0;
    const push = 1 + 0.07 * eInOut(prog(t, 0, T.impact));
    const cam = { s: push * (1 + 1.4 * dive), x: 0, y: -30 * dive };
    const bgFade = opt.bg ? 1 - eOutCubic(prog(t, T.impact, 0.4)) : 1;
    solarBackground(g, t, cam);

    const lx = 540, ly = 905;
    // rack focus: logo emerges from blur
    const focus = eOutCubic(prog(t, 0.15, T.groove - 0.15));
    const pop = prog(t, T.groove, 0.5);
    const popS = pop > 0 ? 1 + 0.10 * Math.sin(Math.PI * Math.min(1, pop * 1.4)) * (1 - pop) : 1;
    const beat = 0.03 * beatPulse(t, 0.16, T.groove);       // scale pulse on beats
    const intro = 0.02 * beatPulse(t, 0.25) * (t < T.groove ? 1 : 0);
    const s0 = lerp(0.62, 0.78, eOutCubic(prog(t, 0, T.groove)));
    const ls = s0 * popS * (1 + beat + intro) * cam.s;

    // rays + big brush behind logo (after groove)
    rays(g, t, lx, ly - 40 * cam.s, cam.s * (0.85 + 0.15 * focus), clamp(prog(t, T.groove - 0.2, 0.5)) * (1 - dive) * bgFade);
    g.save();
    g.translate(lx, ly);
    g.scale(cam.s, cam.s);
    g.translate(-lx, -ly);
    brush(g, IMG.brushBigLt, lx - 10, ly + 40, 1380, 500, -10, prog(t, T.groove, 0.55), 0.55 * bgFade);
    brush(g, IMG.brushBig, lx + 40, ly + 140, 1200, 300, -14, prog(t, T.groove + 0.12, 0.5), 0.9 * bgFade);
    g.restore();

    // mid fronds (reddish), slight sway, frame corners
    const sw = Math.sin(t * 2 * Math.PI / 3.1);
    const midBlur = 6 * (1 - focus) + 1.5;
    g.save();
    g.translate(540, 960); g.scale(cam.s * 1.02, cam.s * 1.02); g.translate(-540, -960);
    frond(g, FR.deepA, -60, 70, 16 + 2.5 * sw, 0.78, { blur: midBlur });
    frond(g, FR.deepB, 1140, 170, 166 - 3 * sw, 0.82, { blur: midBlur });
    frond(g, FR.deepB, -110, 1620, -18 - 2 * sw, 0.88, { blur: midBlur });
    frond(g, FR.deepA, 1180, 1440, 198 + 2.5 * sw, 0.82, { blur: midBlur });
    g.restore();

    if (opt.bg) {
      particles(g, t, 1, { x: 0, y: 0 });
      return;
    }
    // logo
    const birdIn = prog(t, 0.6, 2.4);
    const lc = renderLogo(t, {
      sway: 1 + 0.25 * band("energy", t),
      birdIn, birdAmp: 1,
      arcP: prog(t, 0.5, 1.6),
      baseP: prog(t, T.groove - 0.1, 0.6),
      sweep: t > T.groove ? ((t - T.groove) % 2.4) / 1.1 - 0.15 : null,
      cia: false,
    });
    const blur = lerp(42, 0, focus) + 26 * dive;
    placeLogo(g, lc, lx, ly + 20 * (1 - focus), ls, {
      blur, alpha: clamp(prog(t, 0.05, 0.6)), glow: 0.32 + 0.6 * Math.max(0, 1 - pop * 1.8) * (pop > 0 ? 1 : 0) + 0.25 * beatPulse(t, 0.18, T.groove),
      shadow: 0.35 * focus,
    });

    // "11ª EDIÇÃO" pops on its beat, attached to the logo
    const tp = prog(t, T.tag, 0.45);
    const tagX = lx + (980 - LC.x) * ls, tagY = ly + 20 * (1 - focus) + (1010 - LC.y) * ls;
    tagPill(g, tagX, tagY, (tp > 0 ? backOut(tp, 2.2) : 0) * ls / 0.78 * 1.05, -7, clamp(tp * 3) * (1 - dive));

    // foreground fronds: huge, very blurred, drifting out as focus comes in
    const fg = eOutCubic(prog(t, 0, 3.2));
    frond(g, FR.warmC, lerp(-260, -820, fg), lerp(-40, -380, fg), 38 + 3 * sw, 1.45, { blur: 34, alpha: 0.95 });
    frond(g, FR.warmC, lerp(1360, 1900, fg), lerp(1880, 2300, fg), 216 - 3 * sw, 1.5, { blur: 38, alpha: 0.95 });

    particles(g, t, 0.55 + 0.45 * focus, { x: 0, y: 0 });
  }

  // Scene C (final composition)
  const FINAL = {
    logo: { x: 540, y: 646, s: 0.60 },
    cia: { cx: 540, top: 258, h: 92 },
    photoTop: 676,
    slogan: { y1: 1268, y2: 1352 },
    date: { y: 1468 },
    local: { y1: 1541, y2: 1595 },
  };

  function sceneFinal(g, t, opt = {}) {
    const lt = t - T.final;
    const rise = eOutExpo(prog(lt, 0, 1.1));
    const hold = prog(t, T.complete, DUR - T.complete);
    // sky (far), slow parallax
    const skyY = -40 + 260 * (1 - rise) - 14 * hold;
    g.drawImage(IMG.sky, 0, skyY, W, IMG.sky.height);
    // sun top-right with bloom (decorative zone)
    const fl = beatPulse(t, 0.4, T.drop - 0.01) * (t >= T.drop ? 1 : 0);
    const sp = 0.15 * beatPulse(t, 0.25, T.final);
    g.save();
    g.globalCompositeOperation = "screen";
    const sx = 905, sy = 150 + 120 * (1 - rise);
    let rg = g.createRadialGradient(sx, sy, 20, sx, sy, 760);
    rg.addColorStop(0, `rgba(255,236,170,${0.95})`);
    rg.addColorStop(0.18, `rgba(255,200,90,${0.55 + sp + 0.25 * fl})`);
    rg.addColorStop(1, "rgba(255,150,50,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    g.restore();
    g.fillStyle = "#fff6dc";
    g.beginPath(); g.arc(sx, sy, 62, 0, Math.PI * 2); g.fill();

    // sand + group photo (mid), push-in during the hold
    const ph = IMG.photo;
    const pScale = 1.0 + 0.035 * eInOut(hold);
    const py = FINAL.photoTop + 340 * (1 - rise);
    g.drawImage(IMG.sand, 0, py + 420 + 40 * (1 - rise), W, IMG.sand.height);
    g.save();
    g.translate(540, py + 300);
    g.scale(pScale, pScale);
    if (rise < 1) g.filter = `blur(${(14 * (1 - rise)).toFixed(1)}px)`;
    g.drawImage(ph, -ph.width / 2, -300);
    g.restore();

    // big orange brush behind the logo
    const sw = Math.sin(t * 2 * Math.PI / 3.1);
    const lp = prog(t, T.logoLand - 0.25, 0.6);
    brush(g, IMG.brushBig, 520, 640 + 20 * (1 - eOutCubic(lp)), 1420, 560, -11, prog(t, T.final + 0.12, 0.6), 0.97);
    // second lighter pass for texture
    brush(g, IMG.brushBigLt, 600, 520, 1100, 330, -16, prog(t, T.final + 0.3, 0.6), 0.45);

    // rays behind logo, subtle in the final
    const L0 = FINAL.logo;
    rays(g, t, L0.x + 60, L0.y - 60, 0.75, 0.42 * eOutCubic(lp));

    // top fronds (frame the sun and the top safe zone)
    frond(g, FR.deepA, -70, 40, 22 + 2.2 * sw, 0.78, { blur: 1.2 });
    frond(g, FR.warmB, -60, 300, 2 - 2 * sw, 0.58, { blur: 2.5 });
    frond(g, FR.deepB, 1150, 20, 156 - 2.5 * sw, 0.8, { blur: 1.2 });

    // logo: already at its final place (it travels there through the portal)
    if (!opt.noLogo) finalLogo(g, t);
    // tag pill
    const tp = prog(t, T.logoLand + 0.24, 0.45);
    tagPill(g, L0.x + (980 - LC.x) * L0.s, L0.y + (1010 - LC.y) * L0.s, tp > 0 ? backOut(tp, 2.2) * 1.0 : 0, -7, clamp(tp * 3));
    // Cia do Corpo mark (top, inside the safe zone)
    const cp = prog(t, T.logoLand, 0.6);
    if (cp > 0) {
      const cia = P.cia, ch = FINAL.cia.h, cs = ch / cia.h;
      g.save();
      g.globalAlpha = clamp(cp * 2);
      if (cp < 1) g.filter = `blur(${(10 * (1 - eOutCubic(cp))).toFixed(1)}px)`;
      g.shadowColor = "rgba(20,40,90,0.35)"; g.shadowBlur = 12;
      g.drawImage(IMG.cia, FINAL.cia.cx - cia.w * cs / 2, FINAL.cia.top + 12 * (1 - eOutCubic(cp)), cia.w * cs, ch);
      g.restore();
    }

    // ---- slogan on a burnt-orange brush band
    const sp1 = prog(t, T.slogan - 0.12, 0.45);
    brush(g, IMG.brushBand, 540, (FINAL.slogan.y1 + FINAL.slogan.y2) / 2 - 28, 1070, 290, -2.5, sp1, 1);
    revealText(g, "A PRAIA É O PALCO.", 540, FINAL.slogan.y1, "68px Knewave", prog(t, T.slogan, 0.5), { align: "center", skew: -8 });
    revealText(g, "VOCÊ É A ENERGIA!", 540, FINAL.slogan.y2, "80px Knewave", prog(t, T.slogan + 0.14, 0.5), { align: "center", skew: -8 });
    brush(g, IMG.brushUnder, 548, FINAL.slogan.y2 + 22, 640, 30, -2.5, prog(t, T.slogan + 0.32, 0.4), 1);

    // ---- info panel (burnt gradient) + bottom decoration
    const ip = eOutCubic(prog(t, T.date - 0.2, 0.5));
    if (ip > 0) {
      const top = 1395 + 60 * (1 - ip);
      const gr = g.createLinearGradient(0, top, 0, H);
      gr.addColorStop(0, `rgba(${C.burnt},0)`);
      gr.addColorStop(0.07, `rgba(${C.burnt},${0.95 * ip})`);
      gr.addColorStop(0.42, `rgba(${C.burnt},${0.95 * ip})`);
      gr.addColorStop(0.7, `rgba(${C.bandEdge},${0.95 * ip})`);
      gr.addColorStop(1, `rgba(255,140,30,${0.9 * ip})`);
      g.fillStyle = gr;
      g.fillRect(0, top, W, H - top);
    }
    // bottom fronds + wave lines (decorative zone below the info)
    g.save();
    g.globalAlpha = 0.7;
    g.drawImage(IMG.waves, -40, 1745, IMG.waves.width * 0.95, IMG.waves.height * 0.95);
    g.restore();
    const bIn = eOutCubic(prog(t, T.final + 0.2, 0.9));
    frond(g, FR.warmB, -140 - 200 * (1 - bIn), 2030, -24 + 2 * sw, 1.2, { blur: 1.5 });
    frond(g, FR.warmB, 1220 + 200 * (1 - bIn), 2040, 202 - 2 * sw, 1.25, { blur: 1.5 });
    brush(g, IMG.brushStreak, 300, 1880, 760, 60, -14, prog(t, T.final + 0.4, 0.5), 0.9);
    brush(g, IMG.brushStreak, 860, 1690, 520, 44, -14, prog(t, T.final + 0.55, 0.5), 0.8);

    // date + local, each on its beat, as one centred column
    g.font = "800 48px Montserrat";
    const dTxt = "24 DE OUTUBRO ÀS 07H";
    const dw = g.measureText(dTxt).width;
    g.font = "800 46px Montserrat";
    const lw = Math.max(g.measureText("PRAIA DE CASA CAIADA").width, g.measureText("EM FRENTE AO QUARTEL").width);
    const colW = 74 + Math.max(dw, lw);
    const x0 = Math.round((W - colW) / 2), tx = x0 + 74;
    const dp = prog(t, T.date, 0.5);
    if (dp > 0) {
      const ie = backOut(clamp(dp * 1.4), 2.0);
      g.save();
      g.globalAlpha = clamp(dp * 3);
      g.translate(x0 + 26, FINAL.date.y - 18);
      g.scale(ie, ie);
      calendarIcon(g, -26, -30, 1);
      g.restore();
    }
    revealText(g, dTxt, tx, FINAL.date.y, "800 48px Montserrat", dp);
    const lp2 = prog(t, T.local, 0.5);
    if (lp2 > 0) {
      const drop = eOutCubic(clamp(lp2 * 1.6));
      const bounce = t > T.complete ? 0.06 * Math.sin((t - T.complete) * 2 * Math.PI / 1.92) : 0;
      const pulse = t > T.complete ? ((t - T.complete) / 1.92) % 1 : 0;
      g.save();
      g.globalAlpha = clamp(lp2 * 3);
      pinIcon(g, x0 + 26, FINAL.local.y2 - 4 - 50 * (1 - drop), 1.0 + bounce, pulse);
      g.restore();
    }
    revealText(g, "PRAIA DE CASA CAIADA", tx, FINAL.local.y1, "800 46px Montserrat", lp2);
    revealText(g, "EM FRENTE AO QUARTEL", tx, FINAL.local.y2, "800 46px Montserrat", prog(t, T.local + 0.1, 0.5));

    particles(g, t, 0.55, { x: 0, y: 0 }, [1150, 1620]);

    // final hit accent: warm flare from the sun, never covering the text
    if (fl > 0) {
      g.save();
      g.globalCompositeOperation = "screen";
      g.globalAlpha = 0.35 * fl;
      const fg2 = g.createRadialGradient(sx, sy, 0, sx, sy, 600);
      fg2.addColorStop(0, "rgba(255,240,200,1)");
      fg2.addColorStop(1, "rgba(255,200,120,0)");
      g.fillStyle = fg2;
      g.fillRect(0, 0, W, 900);
      g.restore();
    }
  }

  function finalLogoState(t) {
    return { x: FINAL.logo.x, y: FINAL.logo.y, s: FINAL.logo.s * (1 + 0.015 * beatPulse(t, 0.16, T.logoLand)) };
  }
  function finalLogo(g, t, arcAlpha = 1) {
    const lc = renderLogo(t, {
      sway: 0.7, birdIn: 1, birdAmp: 0.7, arcP: 1, baseP: 1, arcAlpha,
      sweep: t > T.complete ? ((t - T.complete) % 3.0) / 1.2 - 0.15 : null,
    });
    const L = finalLogoState(t);
    placeLogo(g, lc, L.x, L.y, L.s, { blur: 0, alpha: 1, glow: 0.22, shadow: 0.45 });
  }

  // ------------------------------------------------------------ v2 glance: the logo's sun becomes a portal
  const ARC = { x: 573.6, y: 513.0, r: 276.7, a0: 176, a1: 283, w: 22 };   // logo arc (logo space, deg)
  const PORTAL = {
    cx: 580, cy: 1815, r: 475,         // the sun circle (rises in the lower half, behind the logo)
    k: 0.9,                            // photo scale
    face: { x: 636, y: 1412 },         // where the face anchor lands
    plateDy: 60,                       // beach plate sits a bit lower (depth + sand line continuity)
  };
  const P0 = () => T.impact, P1 = () => T.final;

  // hero logo placement (as in scene A after the groove) at time t
  function heroLogoState(t) {
    const push = 1 + 0.07 * eInOut(prog(t, 0, T.impact));
    const beat = 0.03 * beatPulse(t, 0.16, T.groove);
    return { x: 540, y: 905, s: 0.78 * (1 + beat) * push };
  }
  // logo travels from the hero spot to its final place on the impact
  function portalLogoState(t) {
    const k = eOutQuint(prog(t, P0(), 0.85));
    const a = heroLogoState(t), b = finalLogoState(t);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k), k };
  }
  function arcOnScreen(L) {
    return { x: L.x + (ARC.x - LC.x) * L.s, y: L.y + (ARC.y - LC.y) * L.s, r: ARC.r * L.s, w: ARC.w * L.s };
  }
  // ring morph state: m = 0 (logo arc) .. 1 (full sun circle)
  function ringState(t) {
    const p0 = P0(), p1 = P1();
    let m, L = portalLogoState(t);
    if (t < p1 - 0.02) m = eOutExpo(prog(t, p0, 0.6));
    else m = 1 - eInOut(prog(t, p1 - 0.02, 0.47));
    const A = arcOnScreen(L);
    const pulse = beatPulse(t, 0.2, p0) * m;
    const mid = (ARC.a0 + ARC.a1) / 2, half = (ARC.a1 - ARC.a0) / 2;
    return {
      m, L,
      x: lerp(A.x, PORTAL.cx, m), y: lerp(A.y, PORTAL.cy, m),
      r: lerp(A.r, PORTAL.r, m) * (1 + 0.014 * pulse),
      w: lerp(A.w, 10, m),
      a0: (mid - lerp(half, 180, m)) * DEG, a1: (mid + lerp(half, 180, m)) * DEG,
      pulse,
    };
  }

  function sunRing(g, R, t, alpha) {
    if (alpha <= 0) return;
    const full = R.m > 0.999;
    g.save();
    g.globalAlpha = alpha;
    g.lineCap = "round";
    // bloom
    g.globalCompositeOperation = "screen";
    g.filter = `blur(${(18 + 14 * R.pulse).toFixed(1)}px)`;
    g.strokeStyle = `rgba(255,214,120,${0.85})`;
    g.lineWidth = R.w * 3.2;
    g.beginPath(); g.arc(R.x, R.y, R.r, R.a0, R.a1); g.stroke();
    g.filter = "none";
    g.globalCompositeOperation = "source-over";
    // core ring
    g.shadowColor = "rgba(255,190,80,0.9)";
    g.shadowBlur = 22 + 18 * R.pulse;
    g.strokeStyle = "#fff8e6";
    g.lineWidth = R.w;
    g.beginPath(); g.arc(R.x, R.y, R.r, R.a0, R.a1); g.stroke();
    g.shadowColor = "transparent";
    // outer tick ring (sun "crown"), rotating, pulsing on the beat
    if (R.m > 0.6) {
      const ta = clamp((R.m - 0.6) / 0.4) * (0.65 + 0.35 * R.pulse);
      const n = 96, r0 = R.r + 22, rot = t * 0.25;
      g.globalAlpha = alpha * ta;
      g.strokeStyle = "#ffe7b0";
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const len = (i % 4 === 0 ? 20 : 9) * (1 + 0.6 * R.pulse);
        g.moveTo(R.x + Math.cos(a) * r0, R.y + Math.sin(a) * r0);
        g.lineTo(R.x + Math.cos(a) * (r0 + len), R.y + Math.sin(a) * (r0 + len));
      }
      g.stroke();
    }
    g.restore();
  }

  // woman photo transform (rigid only): rise in, boat-like sway, push-in, exit slide
  function womanXform(t) {
    const p0 = P0(), p1 = P1(), lt = t - p0;
    const enter = eOutExpo(prog(t, p0 + 0.1, 0.55));
    const push = 1 + 0.05 * eInOut(prog(t, p0, p1 - p0));
    const drift = -14 * eInOut(prog(t, p0, p1 - p0));          // slow upward camera drift
    const rot = 1.5 * Math.sin(lt * 2 * Math.PI / 2.4 + 0.4);
    const dy = 10 * Math.sin(lt * 2 * Math.PI / 2.4 + 2.0);
    const ex = eInCubic(prog(t, p1 - 0.06, 0.24));               // fast exit to the right
    return {
      x: PORTAL.face.x + 1500 * ex, y: PORTAL.face.y + 220 * (1 - enter) + dy + drift * 1.35,
      rot: rot * (1 - ex) + 6 * ex, s: PORTAL.k * push, enter, ex, drift, push,
      alpha: clamp(prog(t, p0 + 0.1, 0.22)),
      blur: 16 * (1 - eOutCubic(prog(t, p0 + 0.1, 0.5))),
    };
  }

  function drawWomanCut(g, X, extraDx = 0, alpha = 1) {
    const Wm = window.WOMAN;
    g.save();
    g.globalAlpha = alpha;
    g.translate(X.x + extraDx, X.y);
    g.rotate(X.rot * DEG);
    g.scale(X.s, X.s);
    g.translate(-Wm.face[0], -Wm.face[1]);
    if (X.blur > 0.4) g.filter = `blur(${(X.blur / X.s).toFixed(1)}px)`;
    g.shadowColor = "rgba(90,30,0,0.35)";
    g.shadowBlur = 30;
    g.shadowOffsetY = 12;
    g.drawImage(IMG.wcut, Wm.cut.x, Wm.cut.y);
    g.restore();
  }

  function drawPortal(g, t) {
    const R = ringState(t);
    const p0 = P0(), p1 = P1();
    const X = womanXform(t);
    // flash + sun rays behind the circle, reacting to the beats
    const on = clamp(R.m * 1.4) * (1 - eInCubic(prog(t, p1, 0.4)));
    rays(g, t, R.x, R.y, 1.0 * (0.4 + 0.6 * R.m), on * 0.9);
    const flash = Math.exp(-Math.max(0, t - p0) / 0.25) * (t >= p0 ? 1 : 0);
    if (flash > 0.01) {
      g.save();
      g.globalCompositeOperation = "screen";
      const fg = g.createRadialGradient(R.x, R.y, 0, R.x, R.y, 900);
      fg.addColorStop(0, `rgba(255,236,190,${0.8 * flash})`);
      fg.addColorStop(1, "rgba(255,180,80,0)");
      g.fillStyle = fg;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
    // inside the circle: the beach of her own photo, defocused -> sharp, warm
    const plateA = clamp(prog(t, p0 + 0.05, 0.25)) * (1 - clamp(prog(t, p1 - 0.02, 0.25)));
    if (plateA > 0 && R.r > 4) {
      const Wm = window.WOMAN;
      g.save();
      g.beginPath(); g.arc(R.x, R.y, R.r - R.w * 0.3, 0, Math.PI * 2); g.clip();
      g.fillStyle = "#f4b070";
      g.globalAlpha = plateA;
      g.fillRect(R.x - R.r, R.y - R.r, R.r * 2, R.r * 2);
      const pf = eOutCubic(prog(t, p0 + 0.05, 0.6));
      g.translate(PORTAL.face.x + (R.x - PORTAL.cx), PORTAL.face.y + PORTAL.plateDy + X.drift + (R.y - PORTAL.cy));
      const ps = PORTAL.k * X.push * (1 + 0.12 * (1 - pf)) * (R.r / PORTAL.r);
      g.scale(ps, ps);
      g.translate(-Wm.face[0], -Wm.face[1]);
      if (pf < 1) g.filter = `blur(${(22 * (1 - pf) / ps).toFixed(1)}px)`;
      g.drawImage(IMG.wplate, 0, 0);
      g.restore();
      // warm falloff towards the rim: depth, and she pops off the bright sand
      g.save();
      g.globalAlpha = plateA;
      g.beginPath(); g.arc(R.x, R.y, R.r, 0, Math.PI * 2); g.clip();
      const vg = g.createRadialGradient(R.x, R.y - R.r * 0.25, R.r * 0.35, R.x, R.y, R.r);
      vg.addColorStop(0, "rgba(214,90,20,0)");
      vg.addColorStop(1, "rgba(214,90,20,0.38)");
      g.fillStyle = vg;
      g.fillRect(R.x - R.r, R.y - R.r, R.r * 2, R.r * 2);
      g.restore();
    }
    sunRing(g, R, t, clamp(R.m * 6) * (R.m < 1 && t > p1 ? 1 - eInCubic(prog(t, p1 + 0.35, 0.12)) : 1));
    // the woman: above the circle so arm, hand and cap break its edge;
    // below the circle centre she stays inside it
    if (X.alpha > 0 && X.ex < 1) {
      g.save();
      if (X.ex <= 0) {
        g.beginPath();
        g.rect(0, 0, W, R.y);
        g.arc(R.x, R.y, R.r, 0, Math.PI * 2);
        g.clip();
      }
      // motion-blur trail on the exit
      if (X.ex > 0) {
        for (let i = 7; i >= 1; i--) drawWomanCut(g, { ...X, blur: 8 + 12 * X.ex }, -i * 32 * X.ex, 0.13 * X.alpha);
      }
      drawWomanCut(g, { ...X, blur: X.blur + 12 * X.ex }, 0, X.alpha * (1 - 0.6 * X.ex));
      g.restore();
    }
  }

  // logo during the portal: travels to its final place; its arc hands over to the ring
  function portalLogo(g, t) {
    const p0 = P0(), p1 = P1();
    const L = portalLogoState(t);
    const k = L.k;
    const R = ringState(t);
    // arc visible before the morph and again once the ring has folded back into it
    let arcAlpha = 1 - clamp(prog(t, p0, 0.08));
    if (t > p1) arcAlpha = clamp(prog(t, p1 + 0.35, 0.12));
    const lc = renderLogo(t, {
      sway: lerp(1 + 0.25 * band("energy", t), 0.7, k), birdIn: 1, birdAmp: lerp(1, 0.7, k),
      arcP: 1, baseP: 1, arcAlpha, sweep: null,
    });
    const hero = 1 - k;
    placeLogo(g, lc, L.x, L.y, L.s, {
      blur: 0, alpha: 1, glow: lerp(0.32 + 0.25 * beatPulse(t, 0.18, T.groove), 0.22, k), shadow: lerp(0.35, 0.45, k),
    });
    // the "11ª EDIÇÃO" tag leaves with the hero logo (it pops again in the final layout)
    const tf = 1 - eOutCubic(prog(t, p0, 0.3));
    if (tf > 0) tagPill(g, L.x + (980 - LC.x) * L.s, L.y + (1010 - LC.y) * L.s, L.s / 0.78 * 1.05 * (0.6 + 0.4 * tf), -7, tf * hero);
  }

  // lighter leaf sweep: fronds near the top and bottom edges + streaks, so the
  // portal stays readable while the foreground still sweeps
  function leafSweepLight(g, t, t0, dur, dir) {
    const p = prog(t, t0, dur);
    if (p <= 0 || p >= 1) return;
    const e = eInOut(p);
    const xs = dir > 0 ? lerp(W + 900, -1100, e) : lerp(-900, W + 1100, e);
    const off = [[0, -240, 1.7, 26], [-160, 2080, 1.8, 30], [220, 1150, 1.25, 18]];
    off.forEach(([dx, y, sc, rot], j) => {
      for (let k = 0; k < 3; k++) {
        const tx = xs + dx * dir + k * 80 * dir;
        frond(g, k ? FR.deepC : FR.warmC, tx, y, dir > 0 ? 180 + rot : rot, sc, { blur: (j === 2 ? 28 : 20) + k * 10, alpha: (k ? 0.3 : 0.95) * (j === 2 ? 0.75 : 1) });
      }
    });
    brush(g, IMG.brushStreak, xs + 200 * dir, 760, 1400, 70, -14, 1, 0.8);
    brush(g, IMG.brushStreak, xs - 100 * dir, 1540, 1200, 60, -14, 1, 0.65);
  }

  // soft diagonal wipe: draws src canvas over g, revealed left -> right
  let finC = null, finG = null;
  function softWipe(g, src, t, t0, dur) {
    const e = eInOut(prog(t, t0, dur));
    if (e <= 0) return;
    if (e >= 1) { g.drawImage(src, 0, 0); return; }
    const edge = lerp(-700, W + 700, e);
    finG.save();
    finG.globalCompositeOperation = "destination-in";
    const gr = finG.createLinearGradient(edge - 330, 380, edge + 330, -380 + 0);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    // gradient axis tilted like the old wipe (edge leans right at the top)
    finG.setTransform(1, 0, -0.27, 1, 0.27 * 960, 0);
    finG.fillStyle = gr;
    finG.fillRect(-2000, -100, W + 4000, H + 200);
    finG.restore();
    g.drawImage(src, 0, 0);
  }

  // ------------------------------------------------------------ frame
  function renderFrame(t) {
    t = clamp(t, 0, DUR);
    const g = ctx;
    g.save();
    g.clearRect(0, 0, W, H);
    const s1 = T.impact - 0.24, s1d = 0.62;   // trigger sweep (leaves cross the logo)
    const s2 = T.final - 0.30, s2d = 0.66;    // sweep to the final composition
    const pEnd = T.final + 0.5;               // ring folded back into the logo arc
    if (t < T.impact) {
      sceneLogo(g, t);
      if (t >= s1) leafSweepLight(g, t, s1 - 0.12, s1d + 0.2, 1);
    } else if (t < pEnd) {
      // background: solar plate, then the final layout wiping in softly
      sceneLogo(g, t, { bg: true });
      if (t >= s2) {
        finG.setTransform(1, 0, 0, 1, 0, 0);
        finG.clearRect(0, 0, W, H);
        sceneFinal(finG, Math.max(t, T.final), { noLogo: true });
        softWipe(g, finC, t, s2, s2d);
      }
      drawPortal(g, t);
      portalLogo(g, t);
      if (t < s1 + s1d + 0.2) leafSweepLight(g, t, s1 - 0.12, s1d + 0.2, 1);
      if (t >= s2) leafSweepLight(g, t, s2 - 0.12, s2d + 0.2, -1);
    } else {
      sceneFinal(g, t);
    }
    // gentle vignette for depth
    const vg = g.createRadialGradient(540, 900, 600, 540, 960, 1300);
    vg.addColorStop(0, "rgba(60,15,0,0)");
    vg.addColorStop(1, "rgba(60,15,0,0.16)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ------------------------------------------------------------ boot
  async function init() {
    const list = {
      sky: L + M.sky, sand: L + M.sand, photo: L + M.photo, waves: L + M.waves,
      wcut: L + window.WOMAN.cut.src, wplate: L + window.WOMAN.plate,
      bBig: L + M.brush.big, bBand: L + M.brush.band, bUnder: L + M.brush.under, bStreak: L + M.brush.streak,
    };
    for (const k in P) list[k] = L + P[k].src;
    await Promise.all(Object.entries(list).map(async ([k, s]) => { IMG[k] = await loadImg(s); }));
    await Promise.all(["68px Knewave", "800 48px Montserrat", "800 38px Montserrat"].map(f => document.fonts.load(f, "AÉÇÃÊª")));
    // tinted brushes
    IMG.brushBig = tint(IMG.bBig, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, "#f25a06"); gr.addColorStop(0.5, C.orange); gr.addColorStop(1, "#ff8f2a");
      return gr;
    });
    IMG.brushBigLt = tint(IMG.bBig, "#ff9a3c");
    IMG.brushBand = tint(IMG.bBand, (g, w) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, `rgba(${C.bandEdge},0.96)`);
      gr.addColorStop(0.2, `rgba(${C.burnt},0.97)`);
      gr.addColorStop(0.8, `rgba(${C.burnt},0.97)`);
      gr.addColorStop(1, `rgba(${C.bandEdge},0.96)`);
      return gr;
    });
    IMG.brushUnder = tint(IMG.bUnder, "#ffc04a");
    IMG.brushStreak = tint(IMG.bStreak, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "rgba(255,120,20,0)"); gr.addColorStop(0.3, "#ff7a14"); gr.addColorStop(1, "#ffb347");
      return gr;
    });
    FR.deepA = buildFrond(900, 1, "#8f2406", C.leafDeep, 1);
    FR.deepB = buildFrond(760, 2, "#9a2a07", "#d4460c", 0.8);
    FR.deepC = buildFrond(1000, 3, "#a62c08", "#e2520e", 1.1);
    FR.warmA = buildFrond(820, 4, C.leafDeep, C.leafTip, 1);
    FR.warmB = buildFrond(640, 5, "#c53d0a", "#ff7a1c", 0.9);
    FR.warmC = buildFrond(1000, 6, "#b8360a", "#f86a14", 1.2);
    logoC = mk(LW, LH); logoG = logoC.getContext("2d");
    letC = mk(LW, LH); letG = letC.getContext("2d");
    tmpC = mk(LW, LH); tmpG = tmpC.getContext("2d");
    initPalm();
    finC = mk(W, H); finG = finC.getContext("2d");
  }

  window.renderFrame = renderFrame;
  window.VIDEO = { width: W, height: H, fps: FPS, duration: DUR, frames: Math.round(DUR * FPS) };
  window.__ready = init().then(() => {
    const q = new URLSearchParams(location.search);
    if (q.has("play")) {
      document.body.classList.add("preview");
      const au = new Audio("assets/src/musica.m4a");
      const start = () => {
        au.currentTime = 0; au.play();
        const loop = () => { renderFrame(au.currentTime); if (!au.paused) requestAnimationFrame(loop); };
        loop();
      };
      canvas.addEventListener("click", start);
      renderFrame(0);
    } else {
      if (!q.has("render")) document.body.classList.add("preview");
      renderFrame(parseFloat(q.get("t") || "13"));
    }
    return true;
  });
})();
