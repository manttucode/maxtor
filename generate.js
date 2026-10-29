// const puppeteer = require('puppeteer-core');
// const chromium = require('@sparticuz/chromium');
// const fs = require('fs');
// const path = require('path');

// const URL = process.env.CATALOGUE_URL || 'https://maxtorfitness.com/catalouge/catalouge.html';
// const OUT = path.join(__dirname, 'output');
// const DATE = new Date().toISOString().slice(0, 10);

// (async () => {
//   fs.mkdirSync(OUT, { recursive: true });

//   console.log('Launching browser…');
//   const browser = await puppeteer.launch({
//     args: chromium.args,
//     defaultViewport: chromium.defaultViewport,
//     executablePath: await chromium.executablePath(),
//     headless: chromium.headless,
//     protocolTimeout: 60 * 60 * 1000,
//   });

//   const page = await browser.newPage();
//   await page.setViewport({ width: 1400, height: 900 });
//   page.setDefaultTimeout(60 * 60 * 1000);

//   console.log('Opening', URL);
//   await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });

//   console.log('Waiting for catalogue pages (up to 60 min)…');
//   const deadline = Date.now() + 60 * 60 * 1000;
//   let ready = false;
//   let lastLog = '';

//   while (Date.now() < deadline) {
//     const state = await page.evaluate(() => {
//       const overlay = document.getElementById('overlay');
//       const pages = document.querySelectorAll('#book .page');
//       const status = document.getElementById('status');
//       const err = document.querySelector('.error-box');
//       return {
//         overlayOn: !!(overlay && overlay.classList.contains('on')),
//         pageCount: pages.length,
//         statusText: status ? status.textContent.trim() : '',
//         hasError: !!err,
//         errorText: err ? err.textContent.trim().slice(0, 400) : '',
//       };
//     });

//     const line = `pages=${state.pageCount} overlayOn=${state.overlayOn} status="${state.statusText}"`;
//     if (line !== lastLog) {
//       console.log(line);
//       lastLog = line;
//     }

//     if (state.hasError) {
//       console.error('Page error:', state.errorText);
//       throw new Error('Catalogue error: ' + state.errorText);
//     }

//     if (state.pageCount > 2 && !state.overlayOn) {
//       ready = true;
//       break;
//     }
//     if (state.pageCount > 10) {
//       ready = true;
//       break;
//     }

//     await new Promise((r) => setTimeout(r, 5000));
//   }

//   if (!ready) {
//     try {
//       fs.writeFileSync(path.join(OUT, 'debug-page.html'), await page.content());
//       await page.screenshot({ path: path.join(OUT, 'debug.png'), fullPage: true });
//     } catch (_) {}
//     throw new Error('Catalogue did not finish building within 60 minutes.');
//   }

//   const pageCount = await page.$$eval('#book .page', (els) => els.length);
//   console.log(`Catalogue ready with ${pageCount} pages. Waiting for images/fonts…`);
//   await new Promise((r) => setTimeout(r, 15000));
//   try {
//     await page.evaluate(() => document.fonts.ready);
//   } catch (_) {}

//   console.log('Rendering PDF…');
//   const dated = path.join(OUT, `maxtor-catalogue-${DATE}.pdf`);
//   const latest = path.join(OUT, 'latest.pdf');

//   await page.pdf({
//     path: dated,
//     format: 'A4',
//     landscape: true,
//     printBackground: true,
//     margin: { top: 0, right: 0, bottom: 0, left: 0 },
//     preferCSSPageSize: true,
//     timeout: 60 * 60 * 1000,
//   });

//   fs.copyFileSync(dated, latest);
//   await browser.close();

//   console.log('Saved', dated);
//   console.log('Saved', latest);
// })().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });



const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const URL = process.env.CATALOGUE_URL || 'https://maxtorfitness.com/catalouge/catalouge.html';
const OUT = path.join(__dirname, 'output');
const DATE = new Date().toISOString().slice(0, 10);
const BATCH = Number(process.env.PDF_BATCH || 5);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('Launching browser…');
  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-networking',
      '--js-flags=--max-old-space-size=350',
    ],
    defaultViewport: { width: 1200, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    protocolTimeout: 60 * 60 * 1000,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
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
    throw new Error('Catalogue did not finish building within 60 minutes.');
  }

  const total = await page.$$eval('#book .page', (els) => els.length);
  console.log(`Catalogue ready with ${total} pages. Batch size=${BATCH}`);

  // Hide toolbar / overlay
  await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) toolbar.style.display = 'none';
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.classList.remove('on');
      overlay.style.display = 'none';
    }
    document.body.classList.add('exporting');
  });

  // Show all pages and force image load
  console.log('Loading all product images…');
  await page.evaluate(() => {
    document.querySelectorAll('#book .slot, #book .page').forEach((el) => {
      el.style.display = '';
    });
  });

  const imageStats = await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('#book img'));
    await Promise.all(
      imgs.map((img) => {
        try {
          if (img.loading === 'lazy') img.loading = 'eager';
          if (img.dataset && img.dataset.src && !img.getAttribute('src')) {
            img.src = img.dataset.src;
          }
        } catch (_) {}
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 10000);
        });
      })
    );
    const ok = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
    const bad = imgs.length - ok;
    return { total: imgs.length, ok, bad };
  });

  console.log(
    `Images: total=${imageStats.total} loaded=${imageStats.ok} failed/empty=${imageStats.bad}`
  );
  await new Promise((r) => setTimeout(r, 5000));

  const merged = await PDFDocument.create();

  for (let start = 0; start < total; start += BATCH) {
    const end = Math.min(start + BATCH, total);
    console.log(`PDF batch ${start + 1}–${end} of ${total}`);

    await page.evaluate((s, e) => {
      const pages = Array.from(document.querySelectorAll('#book .page'));
      pages.forEach((p, i) => {
        const wrap = p.closest('.slot') || p;
        wrap.style.display = i >= s && i < e ? 'block' : 'none';
      });
    }, start, end);

    await page.evaluate(async (s, e) => {
      const pages = Array.from(document.querySelectorAll('#book .page')).slice(s, e);
      const imgs = pages.flatMap((p) => Array.from(p.querySelectorAll('img')));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 8000);
          });
        })
      );
    }, start, end);

    await new Promise((r) => setTimeout(r, 2000));

    const buf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    const part = await PDFDocument.load(buf);
    const copied = await merged.copyPages(part, part.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }

  const dated = path.join(OUT, `maxtor-catalogue-${DATE}.pdf`);
  const latest = path.join(OUT, 'latest.pdf');
  fs.writeFileSync(dated, Buffer.from(await merged.save()));
  fs.copyFileSync(dated, latest);

  await browser.close();
  console.log('Saved', dated);
  console.log('Saved', latest);
  console.log(`Merged PDF page count target was ${total} source pages`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
