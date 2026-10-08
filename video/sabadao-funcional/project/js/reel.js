/* Sabadão Funcional: talking-head reel (IMG_1688.MOV), 1080x1920, 30 fps.
 *
 * Same language as the model video (Funcional_video_2): animated logo on
 * top, karaoke captions (word lights up when spoken), jump cuts alternating
 * 100% / 115% framing, whip pans with directional blur + warm light leak,
 * zoom-blur punch, palm-leaf sweeps, and the approved 15 s final layout
 * (window.SF from main.js) entered through a leaf cover.
 * Deterministic: frame = f(t); source frames come from project/reel_src.
 */
(() => {
  "use strict";
  const W = 1080, H = 1920, FPS = 30;
  const R = window.REEL;
  const SF = window.SF;
  const { clamp, lerp, prog, eOutCubic, eOutQuint, eOutExpo, eInCubic, eInOut, backOut } = SF.ease;
  const DEG = Math.PI / 180;
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  // ------------------------------------------------------------ music beats
  // reel t -> song time = t + song_offset; beat grid of the song (125.1 BPM),
  // phase taken from the approved 15 s analysis
  const BEAT = 0.47968, B0 = (window.AUDIO.beats[0] + 64.579 - R.song_offset) % BEAT;
  const beatPulse = (t, decay = 0.18) => {
    const k = Math.floor((t - B0) / BEAT);
    const tb = B0 + k * BEAT;
    return t >= tb ? Math.exp(-(t - tb) / decay) : 0;
  };

  // ------------------------------------------------------------ edit (EDL)
  const SEG = R.segments;                 // audio/video segments (from reel_prep.py)
  const FACE = { ele: [480, 560], ela: [520, 760], dois: [560, 900] };
  // framing cuts: [t, zoom]; jump cuts snapped to the beat grid
  const FRAMING = [
    [0.00, 1.00], [2.70, 1.15], [3.751, 1.00], [5.19, 1.15], [6.07, 1.00],
    [7.04, 1.00], [8.548, 1.15], [9.86, 1.00], [10.52, 1.15], [11.906, 1.00],
    [13.825, 1.15], [16.223, 1.00], [17.26, 1.00],
  ];
  // transitions between people (and to the final art)
  const TR = [
    { kind: "whip", t0: 2.38, tc: 2.70, t1: 2.90, dir: -1 },   // ele -> ela
    { kind: "leaf", t0: 6.62, tc: 7.04, t1: 7.42, dir: 1 },    // ela -> ele
    { kind: "punch", t0: 9.80, tc: 9.86, t1: 9.96 },           // jump cut (removed words)
    { kind: "whip", t0: 10.40, tc: 10.52, t1: 10.70, dir: 1 }, // ele -> ela
    { kind: "whip", t0: 17.14, tc: 17.26, t1: 17.40, dir: -1 },// ela -> os dois
    { kind: "final", t0: 18.80, tc: R.final_cut, t1: 19.62, dir: -1 },
  ];

  function segAt(t) {
    for (const s of SEG) if (t < s.t1) return s;
    return SEG[SEG.length - 1];
  }
  function framingAt(t) {
    let i = 0;
    while (i + 1 < FRAMING.length && FRAMING[i + 1][0] <= t) i++;
    const [t0, z] = FRAMING[i];
    const t1 = i + 1 < FRAMING.length ? FRAMING[i + 1][0] : R.final_cut;
    return z * (1 + 0.03 * clamp((t - t0) / (t1 - t0)));   // slow push inside each shot
  }
  // source frame for segment s at reel time t (clamped to its clean range)
  function srcFrame(s, t) {
    const src = clamp(s.src0 + (t - s.t0), s.clean[0], s.clean[1] - 1 / FPS);
    return Math.round(src * FPS);
  }

  // ------------------------------------------------------------ frames cache
  const cache = new Map();
  function loadFrame(i) {
    if (cache.has(i)) return cache.get(i);
    const p = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("frame " + i));
      im.src = `reel_src/${String(i).padStart(4, "0")}.jpg`;
    });
    cache.set(i, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return p;
  }

  // draw a source frame with framing (zoom about the face), offset and blur
  const tmp = mk(W, H), tg = tmp.getContext("2d");
  function drawShot(g, img, who, zoom, o = {}) {
    const { dx = 0, hblur = 0, rblur = 0 } = o;
    const [fx, fy] = FACE[who];
    const place = (gg, extraS = 1, ox = 0) => {
      gg.save();
      gg.translate(fx + dx + ox, fy);
      gg.scale(zoom * extraS, zoom * extraS);
      gg.translate(-fx, -fy);
      gg.drawImage(img, 0, 0, W, H);
      // whip: the frame wraps around horizontally so no empty edge shows
      const off = dx + ox;
      if (Math.abs(off) > 1) gg.drawImage(img, off > 0 ? -W : W, 0, W, H);
      gg.restore();
    };
    if (hblur < 1 && rblur < 0.004) { place(g); return; }
    // running average of shifted / scaled copies = directional or zoom blur
    tg.clearRect(0, 0, W, H);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1) - 0.5;
      tg.globalAlpha = 1 / (i + 1);
      place(tg, 1 + rblur * (k + 0.5), hblur * k);
    }
    tg.globalAlpha = 1;
    g.drawImage(tmp, 0, 0);
  }

  function lightLeak(g, a, x = 900, y = 700) {
    if (a <= 0.01) return;
    g.save();
    g.globalCompositeOperation = "screen";
    const gr = g.createRadialGradient(x, y, 0, x, y, 1300);
    gr.addColorStop(0, `rgba(255,214,140,${0.95 * a})`);
    gr.addColorStop(0.35, `rgba(255,140,40,${0.7 * a})`);
    gr.addColorStop(1, "rgba(240,90,10,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ------------------------------------------------------------ top logo
  // the animated logo of the approved video (palm in the wind, birds),
  // orange with a thin white outline as in the model; fixed top-right so it
  // never covers a face
  const TOPLOGO = { x: 872, y: 400, w: 340, rot: -5 };
  const lo = mk(1460, 1160), log = lo.getContext("2d");
  const lt = mk(1460, 1160), ltg = lt.getContext("2d");
  function topLogo(g, t, alpha = 1) {
    if (alpha <= 0) return;
    const lc = SF.renderLogo(t, { sway: 1, birdIn: 1, birdAmp: 1, arcP: 1, baseP: 1, sweep: null });
    // orange fill
    ltg.globalCompositeOperation = "source-over";
    ltg.clearRect(0, 0, lt.width, lt.height);
    ltg.drawImage(lc, 0, 0);
    ltg.globalCompositeOperation = "source-in";
    ltg.fillStyle = "#ED670E";
    ltg.fillRect(0, 0, lt.width, lt.height);
    // white outline: the white logo shifted around, under the orange one
    log.clearRect(0, 0, lo.width, lo.height);
    const r = 9;
    for (let a = 0; a < 16; a++) log.drawImage(lc, Math.cos(a * Math.PI / 8) * r, Math.sin(a * Math.PI / 8) * r);
    log.drawImage(lt, 0, 0);
    const s = TOPLOGO.w / 1132;
    g.save();
    g.globalAlpha = alpha;
    g.translate(TOPLOGO.x, TOPLOGO.y);
    g.rotate(TOPLOGO.rot * DEG);
    g.scale(s, s);
    g.translate(-(SF.LC.x + SF.LOX), -(SF.LC.y + SF.LOY));
    g.shadowColor = "rgba(60,20,0,0.35)";
    g.shadowBlur = 24;
    g.shadowOffsetY = 8;
    g.drawImage(lo, 0, 0);
    g.restore();
  }

  // ------------------------------------------------------------ captions
  // [word, start] per phrase (reel time); phrase shows until next phrase.
  // Lines split with "/". Keywords: k = 1 (yellow + pop).
  const CAP = [
    { t: 0.00, w: [["E", 0.07], ["aí,", 0.17], ["você", 0.33], ["está", 0.49], ["preparado", 0.83], "/", ["para", 1.21], ["sair", 1.37], ["da", 1.49], ["rotina", 1.63]] },
    { t: 1.87, w: [["e", 1.87], ["treinar", 1.97], ["de", 2.15], ["verdade?", 2.25]] },
    { t: 2.72, w: [["Então", 2.75], ["prepara", 3.10], ["aí:", 3.50]] },
    { t: 3.70, w: [["dia", 3.70], ["24", 4.00, 1], ["de", 4.46, 1], ["outubro,", 4.58, 1], "/", ["às", 5.08], ["7h", 5.24], ["da", 5.64], ["manhã,", 5.82]] },
    { t: 6.10, w: [["temos", 6.18], ["um", 6.54], ["encontro", 6.64], ["marcado.", 6.80]] },
    { t: 7.06, w: [["É", 7.08], ["o", 7.22], ["Funcional", 7.32, 1], "/", ["da", 7.70], ["Cia", 7.82], ["do", 8.00], ["Corpo,", 8.10]] },
    { t: 8.40, w: [["que", 8.40], ["vai", 8.54], ["ser", 8.64], ["na", 8.78], ["orla", 8.90], "/", ["de", 9.10], ["Casa", 9.24], ["Caiada,", 9.46]] },
    { t: 9.88, w: [["na", 9.90], ["praia", 10.10], ["do", 10.26], ["Quartel.", 10.32, 1]] },
    { t: 10.56, w: [["Então", 10.60], ["chama", 10.96], ["a", 11.14], ["galera,", 11.20]] },
    { t: 11.68, w: [["prepara", 11.70], ["a", 11.94], ["disposição", 12.02], "/", ["e", 12.74], ["vem", 12.86], ["com", 13.02], ["a", 13.12], ["gente.", 13.20]] },
    { t: 13.76, w: [["Garanta", 13.78], ["seu", 14.12], ["ingresso", 14.26, 1], "/", ["com", 14.74], ["os", 14.84], ["professores", 15.00], ["da", 15.46], ["Cia", 15.62]] },
    { t: 16.16, w: [["e", 16.18], ["com", 16.34], ["as", 16.46], ["meninas", 16.56], "/", ["da", 16.82], ["recepção.", 16.90]] },
    { t: 17.50, w: [["Esperando", 17.56], ["vocês.", 18.16], "/", ["Bora", 18.50, 1], ["treinar!", 18.72, 1]] },
  ];
  const CAPY = 1352;            // baseline of the last line (2 lines: 1280 / 1352)
  const FONT = "800 60px Montserrat";
  function captions(g, t) {
    if (t >= R.final_cut - 0.12) return;
    let i = -1;
    for (let k = 0; k < CAP.length; k++) if (CAP[k].t <= t) i = k;
    if (i < 0) return;
    const ph = CAP[i];
    const appear = eOutCubic(prog(t, ph.t, 0.12));
    g.save();
    g.font = FONT;
    g.textBaseline = "alphabetic";
    g.lineJoin = "round";
    // layout lines
    const lines = [[]];
    for (const w of ph.w) { if (w === "/") lines.push([]); else lines[lines.length - 1].push(w); }
    const space = g.measureText(" ").width;
    const lh = 72;
    lines.forEach((ln, li) => {
      // keywords get room for their pop (1.12x) so they never touch neighbours
      const widths = ln.map(w => g.measureText(w[0]).width * (w[2] ? 1.12 : 1));
      const total = widths.reduce((a, b) => a + b, 0) + space * (ln.length - 1);
      let x = 540 - total / 2;
      const y = CAPY - (lines.length - 1 - li) * lh + 10 * (1 - appear);
      ln.forEach((w, wi) => {
        const [txt, ws, key] = w;
        const spoken = t >= ws;
        const a = (spoken ? 1 : 0.38) * appear;
        let s = 1;
        if (key && spoken) {
          const p = prog(t, ws, 0.26);
          s = 1 + 0.12 * Math.sin(Math.PI * p);
        }
        const cx = x + widths[wi] / 2;
        g.save();
        g.globalAlpha = a;
        g.translate(cx, y);
        g.scale(s, s);
        g.textAlign = "center";
        // reference style: white letter, orange outline, soft shadow;
        // keywords entirely orange (fill + darker orange outline)
        const hl = key && spoken;
        g.shadowColor = "rgba(50,18,0,0.5)";
        g.shadowBlur = 12;
        g.shadowOffsetY = 4;
        g.strokeStyle = hl ? "#B84500" : "#E8650C";
        g.lineWidth = 10;
        g.strokeText(txt, 0, 0);
        g.shadowColor = "transparent";
        g.fillStyle = hl ? "#FF7A14" : "#FFFFFF";
        g.fillText(txt, 0, 0);
        g.restore();
        x += widths[wi] + space;
      });
    });
    g.restore();
  }

  // ------------------------------------------------------------ info chips
  // only when the information is spoken; texts exactly as in the final art
  const CHIPS = [
    { t: 3.98, d: 1.15, txt: "24 DE OUTUBRO", icon: "cal" },
    { t: 5.22, d: 0.80, txt: "ÀS 07H", icon: "clock" },
    { t: 9.22, d: 0.60, txt: "PRAIA DE CASA CAIADA", icon: "pin" },
    { t: 10.30, d: 0.45, txt: "EM FRENTE AO QUARTEL", icon: "pin" },
  ];
  function clockIcon(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.lineWidth = 4.2; g.lineCap = "round";
    g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 0); g.lineTo(8, 5); g.stroke();
    g.restore();
  }
  function chips(g, t) {
    for (const c of CHIPS) {
      const p = prog(t, c.t, 0.32), out = prog(t, c.t + c.d, 0.18);
      if (p <= 0 || out >= 1) continue;
      const s = backOut(p, 2.0) * (1 - 0.15 * out);
      g.save();
      g.globalAlpha = clamp(p * 3) * (1 - out);
      g.translate(540, 1150);
      g.scale(s, s);
      g.font = "800 36px Montserrat";
      const tw = g.measureText(c.txt).width;
      const w = tw + 48 + 46, h = 64;
      g.shadowColor = "rgba(60,20,0,0.4)"; g.shadowBlur = 16; g.shadowOffsetY = 6;
      g.fillStyle = "#ffffff";
      SF.roundRect(g, -w / 2, -h / 2, w, h, 16);
      g.fill();
      g.shadowColor = "transparent";
      g.fillStyle = "#c74300"; g.strokeStyle = "#c74300";
      const ix = -w / 2 + 34;
      if (c.icon === "cal") { g.save(); g.translate(ix - 13, -14); g.scale(0.5, 0.5); g.strokeStyle = g.fillStyle = "#c74300"; SF_cal(g); g.restore(); }
      else if (c.icon === "clock") clockIcon(g, ix, 0, 0.8);
      else { g.save(); g.translate(ix, 20); g.scale(0.62, 0.62); pinPath(g); g.restore(); }
      g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(c.txt, ix + 26, 3);
      g.restore();
    }
  }
  function SF_cal(g) {      // calendar glyph (same drawing as the final art, recoloured)
    g.lineWidth = 4.6; g.lineJoin = "round"; g.lineCap = "round";
    SF.roundRect(g, 0, 6, 52, 46, 7); g.stroke();
    g.beginPath(); g.moveTo(0, 18); g.lineTo(52, 18); g.stroke();
    g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 11); g.moveTo(38, 0); g.lineTo(38, 11); g.stroke();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { if (r === 2 && c === 3) continue; g.fillRect(8 + c * 10.5, 25 + r * 8.5, 5.5, 5); }
  }
  function pinPath(g) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-6, -14, -24, -28, -24, -46);
    g.arc(0, -46, 24, Math.PI, 0);
    g.bezierCurveTo(24, -28, 6, -14, 0, 0);
    g.closePath(); g.fill();
    g.globalCompositeOperation = "destination-out";
    g.beginPath(); g.arc(0, -46, 9.5, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "source-over";
  }

  // ------------------------------------------------------------ decoration
  function cornerLeaves(g, t, alpha) {
    if (alpha <= 0) return;
    const sw = Math.sin(t * 2 * Math.PI / 3.1);
    g.save();
    g.globalAlpha = alpha;
    SF.frond(g, SF.FR.warmB, -170, 2010, -32 + 2.5 * sw, 0.9, { blur: 2 });
    SF.frond(g, SF.FR.warmB, 1250, 2030, 210 - 2.5 * sw, 0.95, { blur: 2 });
    g.restore();
  }

  // ------------------------------------------------------------ frame
  async function renderFrame(t) {
    const g = ctx;
    g.save();
    g.clearRect(0, 0, W, H);
    const tr = TR.find(x => t >= x.t0 && t < x.t1);

    if (t >= R.final_cut) {
      // the approved final composition, on the same beat as in the 15 s video
      const a = R.approved_final + (t - R.final_cut);
      SF.sceneFinal(g, a);
      const vg = g.createRadialGradient(540, 900, 600, 540, 960, 1300);
      vg.addColorStop(0, "rgba(60,15,0,0)");
      vg.addColorStop(1, "rgba(60,15,0,0.16)");
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    } else {
      const s = segAt(t);
      let A = s, tA = t;
      // during a transition, before the cut, keep the outgoing segment
      if (tr && (tr.kind === "whip" || tr.kind === "leaf") && t < tr.tc) { A = SEG[SEG.indexOf(segAt(tr.tc)) - 1]; tA = t; }
      const img = await loadFrame(srcFrame(A, tA));
      const z = framingAt(t);
      let o = {};
      if (tr && tr.kind === "whip") {
        if (t < tr.tc) { const p = eInCubic(prog(t, tr.t0, tr.tc - tr.t0)); o = { dx: tr.dir * 520 * p, hblur: 420 * p }; }
        else { const q = eOutCubic(prog(t, tr.tc, tr.t1 - tr.tc)); o = { dx: -tr.dir * 520 * (1 - q), hblur: 420 * (1 - q) }; }
      } else if (tr && tr.kind === "punch") {
        const q = 1 - Math.abs(t - tr.tc) / 0.1;
        o = { rblur: 0.10 * clamp(q) };
      }
      drawShot(g, img, A.who, z * (tr && tr.kind === "punch" && t >= tr.tc ? 1 + 0.06 * (1 - eOutCubic(prog(t, tr.tc, 0.1))) : 1), o);
      SF.particles(g, t, 0.35, { x: 0, y: 0 });
      cornerLeaves(g, t, 0.95);
      captions(g, t);
      chips(g, t);
      topLogo(g, t, 1);
    }
    // transitions on top
    if (tr) {
      if (tr.kind === "whip") lightLeak(g, Math.exp(-Math.abs(t - tr.tc) / 0.07) * 0.9, tr.dir > 0 ? 160 : 920, 820);
      if (tr.kind === "leaf") SF.leafWave(g, t, tr.t0, tr.tc - 1 / 60, tr.t1, tr.dir);
      if (tr.kind === "final") {
        SF.leafWave(g, t, tr.t0, tr.tc - 1 / 60, tr.t1, tr.dir);
        lightLeak(g, Math.exp(-Math.abs(t - tr.tc) / 0.09) * 0.8, 540, 900);
      }
    }
    g.restore();
  }

  window.VIDEO = { width: W, height: H, fps: FPS, duration: R.duration, frames: Math.round(R.duration * FPS) };
  window.renderFrame = renderFrame;
  window.__ready = window.__ready.then(async () => {
    await document.fonts.load("800 60px Montserrat", "ÀÉÇÃ");
    const q = new URLSearchParams(location.search);
    if (!q.has("render")) await renderFrame(parseFloat(q.get("t") || "4.3"));
    return true;
  });
})();
