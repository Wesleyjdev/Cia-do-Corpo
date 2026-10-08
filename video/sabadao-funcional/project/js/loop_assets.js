/* Transparent loop assets (30 s, 30 fps) rendered with the same code as the
 * reel: ?asset=logo_orange | logo_white | leaves
 *  - logo_orange: the reel's top logo (orange fill, white outline, -5 deg),
 *    without the drop shadow, centred at ~80% of a 1500x1500 canvas
 *  - logo_white: the final-art logo (white, light sweep every 3 s)
 *  - leaves: the reel's bottom-corner fronds, same place in a 1080x1920 frame
 * Loop: window.SF_LOOP = 30 snaps all periods to divisors of 30 s.
 */
(() => {
  "use strict";
  const SF = window.SF;
  const DEG = Math.PI / 180;
  const q = new URLSearchParams(location.search);
  const asset = q.get("asset") || "logo_orange";
  const canvas = document.getElementById("c");
  if (asset === "leaves") { canvas.width = 1080; canvas.height = 1920; }
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const lo = mk(1460, 1160), log = lo.getContext("2d");
  const lt = mk(1460, 1160), ltg = lt.getContext("2d");
  const LOGO_W = 1200;            // ~80% of 1500

  function logoOrange(t) {
    // identical steps to topLogo() in reel.js (minus the drop shadow)
    const lc = SF.renderLogo(t, { sway: 1, birdIn: 1, birdAmp: 1, arcP: 1, baseP: 1, sweep: null });
    ltg.globalCompositeOperation = "source-over";
    ltg.clearRect(0, 0, lt.width, lt.height);
    ltg.drawImage(lc, 0, 0);
    ltg.globalCompositeOperation = "source-in";
    ltg.fillStyle = "#ED670E";
    ltg.fillRect(0, 0, lt.width, lt.height);
    log.clearRect(0, 0, lo.width, lo.height);
    const r = 9;
    for (let a = 0; a < 16; a++) log.drawImage(lc, Math.cos(a * Math.PI / 8) * r, Math.sin(a * Math.PI / 8) * r);
    log.drawImage(lt, 0, 0);
    place(lo, -5);
  }
  function logoWhite(t) {
    // the final-art logo: white, same motion, light sweep every 3 s
    const lc = SF.renderLogo(t, { sway: 1, birdIn: 1, birdAmp: 1, arcP: 1, baseP: 1, sweep: (t % 3.0) / 1.2 - 0.15 });
    place(lc, 0);
  }
  function place(src, rot) {
    const s = LOGO_W / 1132;
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(rot * DEG);
    g.scale(s, s);
    g.translate(-(SF.LC.x + SF.LOX), -(SF.LC.y + SF.LOY));
    g.drawImage(src, 0, 0);
    g.restore();
  }
  function leaves(t) {
    // identical to cornerLeaves() in reel.js; sway period 3.1 s -> 3.0 s (10 per loop)
    const sw = Math.sin(t * 2 * Math.PI / 3.0);
    g.save();
    g.globalAlpha = 0.95;
    SF.frond(g, SF.FR.warmB, -170, 2010, -32 + 2.5 * sw, 0.9, { blur: 2 });
    SF.frond(g, SF.FR.warmB, 1250, 2030, 210 - 2.5 * sw, 0.95, { blur: 2 });
    g.restore();
  }

  function renderFrame(t) {
    g.clearRect(0, 0, W, H);
    if (asset === "leaves") leaves(t);
    else if (asset === "logo_white") logoWhite(t);
    else logoOrange(t);
  }
  window.VIDEO = { width: W, height: H, fps: 30, duration: 30, frames: 900 };
  window.renderFrame = renderFrame;
  window.__ready = window.__ready.then(() => { renderFrame(0); return true; });
})();
