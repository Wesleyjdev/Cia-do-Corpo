// Render the motion flyer frame by frame in headless Chromium and mux with ffmpeg.
//
//   node render.mjs                     -> output/cia-pink-mov.mp4 (1080x1920, 30 fps, H.264 + AAC)
//   node render.mjs --stills 4,8,15     -> output/still_04.00s.png ...
//   node render.mjs --sheet 1           -> output/contact_sheet.jpg (one frame every N seconds)
//   options: --workers 4  --crf 16
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "output");
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]] : a), []));
const FPS = 30;
const WORKERS = +(args.workers || 4);
const AUDIO = JSON.parse(await readFile(join(ROOT, "data/audio.json"), "utf8"));
const N = AUDIO.n_frames;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ttf": "font/ttf", ".mp3": "audio/mpeg" };
const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(ROOT)) throw new Error("bad path");
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html?render=1`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-gpu", "--force-color-profile=srgb", "--disable-lcd-text"],
});
async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", e => console.error("pageerror:", e.message));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}
async function shoot(page, t, path, type = "png") {
  await page.evaluate(t => window.renderFrame(t), t);
  return page.locator("#c").screenshot({ path, type, ...(type === "jpeg" ? { quality: 92 } : {}) });
}

await mkdir(OUT, { recursive: true });
if (args.stills) {
  const page = await newPage();
  for (const s of String(args.stills).split(",")) {
    const t = Math.round(+s * FPS) / FPS;
    const p = join(OUT, `still_${(+s).toFixed(2).padStart(5, "0")}s.png`);
    await shoot(page, t, p);
    console.log("still", p);
  }
} else if (args.sheet) {
  const step = +args.sheet, page = await newPage(), dir = join(OUT, "sheet");
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  let i = 0;
  for (let t = 0; t <= N / FPS; t += step) await shoot(page, Math.min(t, (N - 1) / FPS), join(dir, `s_${String(i++).padStart(3, "0")}.jpg`), "jpeg");
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, "s_%03d.jpg"), "-vf", `scale=270:480,tile=${Math.min(i, 9)}x${Math.ceil(i / 9)}`, "-frames:v", "1", join(OUT, "contact_sheet.jpg")], { stdio: "inherit" });
  console.log("sheet", join(OUT, "contact_sheet.jpg"));
} else {
  const dir = join(OUT, "frames");
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const t0 = Date.now();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const page = await newPage();
    while (next < N) {
      const f = next++;
      await shoot(page, f / FPS, join(dir, `f_${String(f).padStart(5, "0")}.png`));
      if (++done % 30 === 0) console.log(`${done}/${N} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }));
  const mp4 = join(OUT, "cia-pink-mov-21-dias.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error",
    "-framerate", String(FPS), "-i", join(dir, "f_%05d.png"),
    "-i", join(ROOT, "assets/audio.mp3"),
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", String(args.crf || 16), "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-c:a", "aac", "-b:a", "256k", "-t", (N / FPS).toFixed(4), "-movflags", "+faststart", mp4], { stdio: "inherit" });
  if (r.status !== 0) process.exitCode = 1;
  console.log("video", mp4);
}
await browser.close();
server.close();
