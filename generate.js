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
const fs = require('fs');
const path = require('path');

const URL = process.env.CATALOGUE_URL || 'https://maxtorfitness.com/catalouge/catalouge.html';
const OUT = path.join(__dirname, 'output');
const DATE = new Date().toISOString().slice(0, 10);
const EXPORT_TIMEOUT_MS = Number(process.env.PDF_EXPORT_TIMEOUT_MS || 90 * 60 * 1000); // 90 min

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
      '--js-flags=--max-old-space-size=400',
    ],
    defaultViewport: { width: 1400, height: 900 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    protocolTimeout: 2 * 60 * 60 * 1000, // 2 hours
  });

  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: 1400, height: 900 });
  page.setDefaultTimeout(2 * 60 * 60 * 1000);

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning' || t === 'log') {
      const text = msg.text();
      if (/pdf|export|canvas|image|error|fail/i.test(text)) {
        console.log('PAGE:', text.slice(0, 200));
      }
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
        hasBtn: !!document.getElementById('btnPdf'),
      };
    });

    const line = `pages=${state.pageCount} overlayOn=${state.overlayOn} btnPdf=${state.hasBtn} status="${state.statusText}"`;
    if (line !== lastLog) {
      console.log(line);
      lastLog = line;
    }

    if (state.hasError) throw new Error('Catalogue error: ' + state.errorText);
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
  console.log(`Catalogue ready with ${total} pages. Starting in-page PDF export…`);

  // Give images a bit more time before export (same as a slow local run)
  await page.evaluate(() => {
    document.querySelectorAll('img').forEach((img) => {
      try {
        if (img.loading === 'lazy') img.loading = 'eager';
        if (img.dataset?.src) img.src = img.dataset.src;
      } catch (_) {}
    });
  });
  await new Promise((r) => setTimeout(r, 10000));

  // Capture PDF blob when the page's own exporter creates it
  await page.evaluate(() => {
    window.__maxtorPdfBlob = null;
    window.__maxtorPdfError = null;

    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      try {
        if (obj && typeof Blob !== 'undefined' && obj instanceof Blob) {
          if (obj.type === 'application/pdf' || obj.size > 50000) {
            window.__maxtorPdfBlob = obj;
          }
        }
      } catch (_) {}
      return orig(obj);
    };

    // Also intercept <a download> clicks that use blob: URLs
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
        if (a && a.href && a.href.startsWith('blob:')) {
          // blob already captured via createObjectURL in most exporters
        }
      },
      true
    );
  });

  // Click the same button you use locally
  const clicked = await page.evaluate(() => {
    const btn = document.getElementById('btnPdf');
    if (!btn) return false;
    btn.disabled = false;
    btn.click();
    return true;
  });

  if (!clicked) {
    // Fallback: try common labels
    const alt = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('button, a.btn, [role="button"]'));
      const btn = nodes.find((n) => /pdf|download/i.test(n.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!alt) throw new Error('Could not find PDF export button (btnPdf)');
  }

  console.log('Export started — waiting for PDF blob (up to 90 min)…');

  const waitStart = Date.now();
  let gotBlob = false;

  while (Date.now() - waitStart < EXPORT_TIMEOUT_MS) {
    const status = await page.evaluate(() => {
      const overlay = document.getElementById('overlay');
      const ovMsg = document.getElementById('ovMsg');
      return {
        hasBlob: !!(window.__maxtorPdfBlob && window.__maxtorPdfBlob.size > 0),
        size: window.__maxtorPdfBlob ? window.__maxtorPdfBlob.size : 0,
        overlayOn: !!(overlay && overlay.classList.contains('on')),
        msg: ovMsg ? ovMsg.textContent.trim() : '',
        err: window.__maxtorPdfError || null,
      };
    });

    if (status.err) throw new Error(String(status.err));

    if (status.hasBlob) {
      console.log('PDF blob ready, size=', status.size);
      gotBlob = true;
      break;
    }

    if (status.msg) {
      console.log('Export progress:', status.msg);
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!gotBlob) {
    throw new Error('Timed out waiting for in-page PDF blob. Check PAGE: logs above.');
  }

  // Read blob → base64 → file
  const b64 = await page.evaluate(async () => {
    const blob = window.__maxtorPdfBlob;
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  });

  const pdfBuffer = Buffer.from(b64, 'base64');
  if (pdfBuffer.length < 1000) {
    throw new Error('PDF buffer too small: ' + pdfBuffer.length);
  }

  const dated = path.join(OUT, `maxtor-catalogue-${DATE}.pdf`);
  const latest = path.join(OUT, 'latest.pdf');
  fs.writeFileSync(dated, pdfBuffer);
  fs.copyFileSync(dated, latest);

  await browser.close();
  console.log('Saved', dated, '(' + pdfBuffer.length + ' bytes)');
  console.log('Saved', latest);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
