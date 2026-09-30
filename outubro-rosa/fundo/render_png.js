// Exporta os SVGs desta pasta para PNG no tamanho nativo (Chromium via Playwright).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname, browser = await chromium.launch();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
    const page = await browser.newPage({ viewport: { width: +w, height: +h } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
    await page.screenshot({ path: path.join(dir, f.replace('.svg', '.png')), omitBackground: true });
    await page.close();
  }
  await browser.close();
})();
