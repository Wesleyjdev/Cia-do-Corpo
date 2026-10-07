// Renderiza uma página HTML/canvas quadro a quadro em Chromium headless (Playwright).
//
// Contrato da página (veja example/index.html):
//   window.ready            Promise resolvida quando fontes/imagens/dados carregaram
//   window.renderFrame(t)   desenha o quadro do tempo t (s); só pode depender de t
//   window.DURATION         (opcional) duração em s, usada se --duration/--frames faltarem
// A página é aberta com ?render=1 (use isso para esconder UI de preview).
//
//   node render.mjs --page example/index.html                   -> output/frames/f_00000.png ...
//   node render.mjs --page example/index.html --stills 1,4.5     -> output/still_01.00s.png ...
//   node render.mjs --page example/index.html --sheet 0.5        -> output/contact_sheet.jpg
//
// Opções: --out output  --fps 30  --width 1080 --height 1920  --selector canvas
//         --duration <s> | --frames <n>  --workers 4  --root <pasta servida (padrão: pasta da página)>
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { extname, join, dirname, resolve, relative, sep } from "node:path";

const args = {};
process.argv.slice(2).forEach((v, i, arr) => {
  if (v.startsWith("--")) args[v.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true;
});
if (!args.page) { console.error("uso: node render.mjs --page caminho/index.html [opções]"); process.exit(1); }

const PAGE = resolve(args.page);
const ROOT = resolve(args.root || dirname(PAGE));
const OUT = resolve(args.out || "output");
const FPS = +(args.fps || 30), WIDTH = +(args.width || 1080), HEIGHT = +(args.height || 1920);
const SEL = args.selector || "canvas";
const WORKERS = +(args.workers || 4);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4" };
const server = createServer(async (req, res) => {
  try {
    const p = resolve(ROOT, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (p !== ROOT && !p.startsWith(ROOT + sep)) throw new Error("fora da raiz");
    res.writeHead(200, { "content-type": MIME[extname(p).toLowerCase()] || "application/octet-stream" });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/${relative(ROOT, PAGE).split(sep).join("/")}?render=1`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-gpu", "--force-color-profile=srgb", "--disable-lcd-text"],
});
async function newPage() {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  page.on("pageerror", e => console.error("erro na página:", e.message));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}
async function shoot(page, t, path, type = "png") {
  await page.evaluate(t => window.renderFrame(t), t);
  await page.locator(SEL).first().screenshot({ path, type, ...(type === "jpeg" ? { quality: 92 } : {}) });
}

await mkdir(OUT, { recursive: true });
const first = await newPage();
const duration = args.frames ? +args.frames / FPS : +(args.duration || (await first.evaluate(() => window.DURATION)) || 0);
if (!duration) { console.error("defina --duration, --frames ou window.DURATION na página"); process.exit(1); }
const N = args.frames ? +args.frames : Math.round(duration * FPS);

if (args.stills) {
  for (const s of String(args.stills).split(",")) {
    const p = join(OUT, `still_${(+s).toFixed(2).padStart(5, "0")}s.png`);
    await shoot(first, Math.round(+s * FPS) / FPS, p);
    console.log(p);
  }
} else if (args.sheet) {
  const step = +args.sheet, dir = join(OUT, "sheet");
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  let i = 0;
  for (let t = 0; t < duration; t += step) await shoot(first, Math.round(t * FPS) / FPS, join(dir, `s_${String(i++).padStart(3, "0")}.jpg`), "jpeg");
  const cols = Math.min(i, 9), tw = 270, th = Math.round(tw * HEIGHT / WIDTH / 2) * 2;
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, "s_%03d.jpg"),
    "-vf", `scale=${tw}:${th},tile=${cols}x${Math.ceil(i / cols)}`, "-frames:v", "1", join(OUT, "contact_sheet.jpg")], { stdio: "inherit" });
  console.log(join(OUT, "contact_sheet.jpg"));
} else {
  const dir = join(OUT, "frames");
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const t0 = Date.now();
  let next = 0, done = 0;
  const pages = [first, ...(await Promise.all(Array.from({ length: Math.max(0, WORKERS - 1) }, newPage)))];
  await Promise.all(pages.map(async page => {
    while (next < N) {
      const f = next++;
      await shoot(page, f / FPS, join(dir, `f_${String(f).padStart(5, "0")}.png`));
      if (++done % 30 === 0 || done === N) console.log(`${done}/${N} quadros  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }));
  console.log(`quadros em ${dir} (${N} @ ${FPS} fps). Monte com: ./mux.sh ${relative(process.cwd(), dir)} audio.mp3 video.mp4 ${FPS}`);
}
await browser.close();
server.close();
