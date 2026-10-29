const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

const URL = process.env.CATALOGUE_URL || 'https://maxtorfitness.com/catalouge/catalouge.html';
const OUT = path.join(__dirname, 'output');
const DATE = new Date().toISOString().slice(0, 10);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('Launching browser…');
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    protocolTimeout: 60 * 60 * 1000,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.setDefaultTimeout(60 * 60 * 1000);

  console.log('Opening', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });

  console.log('Waiting for catalogue pages (up to 60 min)…');
  const deadline = Date.now() + 60 * 60 * 1000;
  let ready = false;
  let lastLog = '';

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const overlay = document.getElementById('overlay');
      const pages = document.querySelectorAll('#book .page');
      const status = document.getElementById('status');
      const err = document.querySelector('.error-box');
      return {
        overlayOn: !!(overlay && overlay.classList.contains('on')),
        pageCount: pages.length,
        statusText: status ? status.textContent.trim() : '',
        hasError: !!err,
        errorText: err ? err.textContent.trim().slice(0, 400) : '',
      };
    });

    const line = `pages=${state.pageCount} overlayOn=${state.overlayOn} status="${state.statusText}"`;
    if (line !== lastLog) {
      console.log(line);
      lastLog = line;
    }

    if (state.hasError) {
      console.error('Page error:', state.errorText);
      throw new Error('Catalogue error: ' + state.errorText);
    }

    if (state.pageCount > 2 && !state.overlayOn) {
      ready = true;
      break;
    }
    if (state.pageCount > 10) {
      ready = true;
      break;
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!ready) {
    try {
      fs.writeFileSync(path.join(OUT, 'debug-page.html'), await page.content());
      await page.screenshot({ path: path.join(OUT, 'debug.png'), fullPage: true });
    } catch (_) {}
    throw new Error('Catalogue did not finish building within 60 minutes.');
  }

  const pageCount = await page.$$eval('#book .page', (els) => els.length);
  console.log(`Catalogue ready with ${pageCount} pages. Waiting for images/fonts…`);
  await new Promise((r) => setTimeout(r, 15000));
  try {
    await page.evaluate(() => document.fonts.ready);
  } catch (_) {}

  console.log('Rendering PDF…');
  const dated = path.join(OUT, `maxtor-catalogue-${DATE}.pdf`);
  const latest = path.join(OUT, 'latest.pdf');

  await page.pdf({
    path: dated,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
    timeout: 60 * 60 * 1000,
  });

  fs.copyFileSync(dated, latest);
  await browser.close();

  console.log('Saved', dated);
  console.log('Saved', latest);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
