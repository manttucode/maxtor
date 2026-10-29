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

// A4 landscape points (72 dpi)
const PAGE_W = 841.89;
const PAGE_H = 595.28;

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
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--js-flags=--max-old-space-size=350',
    ],
    defaultViewport: { width: 1400, height: 900 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    protocolTimeout: 60 * 60 * 1000,
  });

  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: 1400, height: 900 });
  page.setDefaultTimeout(60 * 60 * 1000);

  page.on('requestfailed', (req) => {
    const u = req.url();
    if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u)) {
      console.log('IMG FAIL:', u.slice(0, 120), req.failure()?.errorText || '');
    }
  });

  console.log('Opening', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });

  console.log('Waiting for catalogue pages…');
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
        errorText: err ? err.textContent.trim().slice(0, 300) : '',
      };
    });

    const line = `pages=${state.pageCount} overlayOn=${state.overlayOn} status="${state.statusText}"`;
    if (line !== lastLog) {
      console.log(line);
      lastLog = line;
    }

    if (state.hasError) throw new Error(state.errorText);
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

  if (!ready) throw new Error('Catalogue did not finish building.');

  const total = await page.$$eval('#book .page', (els) => els.length);
  console.log(`Ready: ${total} pages`);

  // Hide UI chrome
  await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) toolbar.style.display = 'none';
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.classList.remove('on');
      overlay.style.display = 'none';
    }
    document.body.classList.add('exporting');
    document.querySelectorAll('#book .slot, #book .page').forEach((el) => {
      el.style.display = '';
    });
  });

  // Eager-load images
  console.log('Waiting for images to load…');
  await page.evaluate(() => {
    document.querySelectorAll('#book img').forEach((img) => {
      try {
        if (img.loading === 'lazy') img.loading = 'eager';
        if (img.dataset?.src) img.src = img.dataset.src;
      } catch (_) {}
    });
  });

  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('#book img'));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 12000);
          })
      )
    );
  });

  const stats = await page.$$eval('#book img', (imgs) => {
    const ok = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
    const sample = imgs.slice(0, 3).map((i) => ({
      src: (i.currentSrc || i.src || '').slice(0, 80),
      w: i.naturalWidth,
      complete: i.complete,
    }));
    return { total: imgs.length, ok, bad: imgs.length - ok, sample };
  });
  console.log('Image stats:', JSON.stringify(stats));

  await new Promise((r) => setTimeout(r, 3000));

  // Screenshot each .page → JPEG → PDF page (WYSIWYG, includes images)
  const pdf = await PDFDocument.create();
  const handles = await page.$$('#book .page');

  for (let i = 0; i < handles.length; i++) {
    console.log(`Screenshot page ${i + 1}/${handles.length}`);

    // Scroll into view so lazy layouts paint
    await handles[i].evaluate((el) => {
      const wrap = el.closest('.slot') || el;
      wrap.style.display = 'block';
      el.scrollIntoView({ block: 'center' });
    });
    await new Promise((r) => setTimeout(r, 400));

    let shot;
    try {
      shot = await handles[i].screenshot({
        type: 'jpeg',
        quality: 82,
      });
    } catch (err) {
      console.log('Screenshot failed for page', i + 1, err.message);
      continue;
    }

    const img = await pdf.embedJpg(shot);
    const pageDoc = pdf.addPage([PAGE_W, PAGE_H]);
    pageDoc.drawImage(img, {
      x: 0,
      y: 0,
      width: PAGE_W,
      height: PAGE_H,
    });

    // free memory pressure
    if ((i + 1) % 10 === 0 && global.gc) {
      try {
        global.gc();
      } catch (_) {}
    }
  }

  const dated = path.join(OUT, `maxtor-catalogue-${DATE}.pdf`);
  const latest = path.join(OUT, 'latest.pdf');
  fs.writeFileSync(dated, Buffer.from(await pdf.save()));
  fs.copyFileSync(dated, latest);

  await browser.close();
  console.log('Saved', dated);
  console.log('Saved', latest);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
