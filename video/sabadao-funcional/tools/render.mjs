// Render an HTML/canvas timeline frame by frame with headless Chromium.
//
// The page must expose window.__ready (Promise), window.renderFrame(t) and
// window.VIDEO = {width, height, fps, frames}. The page's folder is served
// over a local HTTP server (canvas pixels stay readable, no file:// taint).
//
// Usage:
//   node tools/render.mjs --page project/index.html --workers 4 [--out output/frames]
//        [--frames 135,225,390] [--from 0 --to 449] [--query covertest]
// Frames are written as <out>/%05d.png (frame index, t = i / fps).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const page = path.resolve(args.page || "project/index.html");
const outDir = path.resolve(args.out || "output/frames");
const workers = Math.max(1, parseInt(args.workers || "4", 10));

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g").toString().trim();
  return createRequire(path.join(root, "noop.js"))("playwright");
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg",
  ".json": "application/json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".m4a": "audio/mp4", ".webp": "image/webp" };
function serve(dir) {
  const srv = createServer(async (req, res) => {
    try {
      const p = path.join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!p.startsWith(dir)) throw new Error("outside root");
      const body = await readFile(p);
      res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv)));
}

const { chromium } = await loadPlaywright();
const srv = await serve(path.dirname(page));
const url = `http://127.0.0.1:${srv.address().port}/${path.basename(page)}?render${args.query ? "&" + args.query : ""}`;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-gpu-vsync", "--force-color-profile=srgb", "--font-render-hinting=none"],
});

async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", e => console.error("page error:", e.message));
  p.on("console", m => { if (m.type() === "error") console.error("console:", m.text()); });
  await p.goto(url);
  await p.evaluate(() => window.__ready);
  return p;
}

const first = await openPage();
const V = await first.evaluate(() => window.VIDEO);
let frames;
if (args.frames) frames = String(args.frames).split(",").map(Number);
else {
  const from = parseInt(args.from || "0", 10), to = parseInt(args.to ?? String(V.frames - 1), 10);
  frames = Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

let next = 0, done = 0;
const t0 = Date.now();
async function work(p) {
  while (next < frames.length) {
    const f = frames[next++];
    const b64 = await p.evaluate(t => {
      window.renderFrame(t);
      return document.getElementById("c").toDataURL("image/png").split(",")[1];
    }, f / V.fps);
    await writeFile(path.join(outDir, String(f).padStart(5, "0") + ".png"), Buffer.from(b64, "base64"));
    done++;
    if (done % 30 === 0 || done === frames.length) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r${done}/${frames.length} frames  ${(done / el).toFixed(1)} fps  ${el.toFixed(0)}s`);
    }
  }
}
const pages = [first];
for (let i = 1; i < Math.min(workers, frames.length); i++) pages.push(await openPage());
await Promise.all(pages.map(work));
process.stdout.write("\n");
await browser.close();
srv.close();
