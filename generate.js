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
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--js-flags=--max-old-space-size=350',
    ],
    defaultViewport: { width: 1200, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    protocolTimeout: 60 * 60 * 1000,
  });

  const page = await browser.newPage();
  await page.setBypassCSP(true);
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

  // Show all pages
  await page.evaluate(() => {
    document.querySelectorAll('#book .slot, #book .page').forEach((el) => {
      el.style.display = '';
    });
  });

  console.log('Loading + embedding product images…');

  // Force eager load
  await page.evaluate(() => {
    document.querySelectorAll('#book img').forEach((img) => {
      try {
        if (img.loading === 'lazy') img.loading = 'eager';
        if (img.dataset?.src && !img.getAttribute('src')) img.src = img.dataset.src;
        if (img.dataset?.lazySrc && !img.getAttribute('src')) img.src = img.dataset.lazySrc;
      } catch (_) {}
    });
  });

  await new Promise((r) => setTimeout(r, 8000));

  // Embed each image as data URL so PDF includes pixels
  const embedStats = await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('#book img'));
    let ok = 0;
    let fail = 0;

    for (const img of imgs) {
      const src = img.currentSrc || img.src;
      if (!src) {
        fail++;
        continue;
      }
      if (src.startsWith('data:')) {
        ok++;
        continue;
      }
      try {
        const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error('http ' + res.status);
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        img.src = dataUrl;
        img.removeAttribute('srcset');
        ok++;
      } catch (_) {
        try {
          if (img.naturalWidth > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            img.src = canvas.toDataURL('image/jpeg', 0.85);
            img.removeAttribute('srcset');
            ok++;
          } else {
            fail++;
          }
        } catch (__) {
          fail++;
        }
      }
    }
    return { total: imgs.length, ok, fail };
  });

  console.log(
    `Embed images: total=${embedStats.total} ok=${embedStats.ok} fail=${embedStats.fail}`
  );
  await new Promise((r) => setTimeout(r, 3000));

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

    await new Promise((r) => setTimeout(r, 1500));

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
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
