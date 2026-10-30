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

const CATALOGUE_URL = process.env.CATALOGUE_URL || 'https://maxtorfitness.com/catalouge/catalouge.html';
const OUT = path.join(__dirname, 'output');
const DATE = new Date().toISOString().slice(0, 10);

const EXPORT_TIMEOUT_MS = Number(process.env.PDF_EXPORT_TIMEOUT_MS || 90 * 60 * 1000);
const MIN_PDF_BYTES     = Number(process.env.MIN_PDF_BYTES || 500 * 1024);

// Throttling
const IMAGE_DELAY_MS      = Number(process.env.IMAGE_DELAY_MS || 1500);    // per request during load
const IMAGE_CACHE_DELAY_MS = Number(process.env.IMAGE_CACHE_DELAY_MS || 300); // between cache downloads

// Retry
const IMAGE_RETRY_MAX     = Number(process.env.IMAGE_RETRY_MAX || 5);
const IMAGE_RETRY_BASE_MS = Number(process.env.IMAGE_RETRY_BASE_MS || 5000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function contentTypeFor(url) {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.png'))  return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif'))  return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg'))  return 'image/svg+xml';
  if (lower.endsWith('.avif')) return 'image/avif';
  return 'application/octet-stream';
}

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
    protocolTimeout: 2 * 60 * 60 * 1000,
  });

  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: 1400, height: 900 });
  page.setDefaultTimeout(2 * 60 * 60 * 1000);

  // Realistic headers to reduce bot-detection-related 429s
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
    'accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,' +
      'image/avif,image/webp,image/apng,*/*;q=0.8',
  });

  // ---------- PHASE 1: load page with throttled interception ----------
  await page.setRequestInterception(true);
  let imageQueue = Promise.resolve();

  const initialRequestHandler = (req) => {
    if (req.resourceType() === 'image') {
      imageQueue = imageQueue
        .then(() => sleep(IMAGE_DELAY_MS))
        .then(() => req.continue())
        .catch(() => req.continue().catch(() => {}));
    } else {
      req.continue().catch(() => {});
    }
  };
  page.on('request', initialRequestHandler);

  page.on('console', (msg) => {
    const text = msg.text();
    if (/pdf|export|canvas|Rendering|error|fail|429/i.test(text)) {
      console.log('PAGE:', text.slice(0, 180));
    }
  });

  page.on('response', (res) => {
    if (res.status() === 429) {
      console.log('429:', res.url().slice(0, 120));
    }
  });

  console.log('Opening', CATALOGUE_URL);
  await page.goto(CATALOGUE_URL, { waitUntil: 'domcontentloaded', timeout: 180000 });

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
    if (state.pageCount > 2 && !state.overlayOn) { ready = true; break; }
    if (state.pageCount > 10) { ready = true; break; }
    await sleep(5000);
  }

  if (!ready) throw new Error('Catalogue did not finish building.');

  const total = await page.$$eval('#book .page', (els) => els.length);
  console.log(`Catalogue ready with ${total} pages`);

  // ---------- PHASE 2: eager-load all images ----------
  console.log('Eager-loading images…');
  await page.evaluate(() => {
    document.querySelectorAll('img').forEach((img) => {
      try {
        if (img.loading === 'lazy') img.loading = 'eager';
        if (img.dataset && img.dataset.src && img.src !== img.dataset.src) {
          img.src = img.dataset.src;
        }
      } catch (_) {}
    });
  });

  // Wait until every <img> is complete (loaded or errored)
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = img.onerror = resolve;
            })
      )
    );
  });
  await sleep(2000);

  // ---------- PHASE 3: collect every image URL ----------
  console.log('Collecting image URLs…');
  const imageUrls = await page.evaluate(() => {
    const urls = new Set();
    const add = (u) => {
      if (!u || u.startsWith('data:') || u.startsWith('blob:')) return;
      try { urls.add(new URL(u, location.href).href); } catch (_) {}
    };

    document.querySelectorAll('img').forEach((img) => {
      add(img.src);
      if (img.dataset && img.dataset.src) add(img.dataset.src);
      if (img.srcset) {
        img.srcset.split(',').forEach((part) => {
          const u = part.trim().split(/\s+/)[0];
          add(u);
        });
      }
    });

    document.querySelectorAll('#book *').forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const matches = bg.match(/url\(([^)]+)\)/g);
        if (matches) {
          matches.forEach((m) => {
            const inner = m.replace(/^url\(|\)$/g, '').replace(/["']/g, '');
            add(inner);
          });
        }
      }
    });

    return Array.from(urls);
  });

  console.log(`Found ${imageUrls.length} unique image URLs to cache`);

  // ---------- PHASE 4: download each image once, with retry/backoff ----------
  const imageCache = new Map();
  let cachedCount = 0;
  let failedCount = 0;
  const UAS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  for (const url of imageUrls) {
    let success = false;

    for (let attempt = 0; attempt < IMAGE_RETRY_MAX; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'accept-language': 'en-US,en;q=0.9',
            'user-agent': UAS,
            'referer': CATALOGUE_URL,
          },
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after')) || 0;
          const wait = retryAfter > 0
            ? retryAfter * 1000
            : IMAGE_RETRY_BASE_MS * Math.pow(2, attempt);
          console.log(
            `429 ${url.slice(-70)} — wait ${wait}ms ` +
            `(attempt ${attempt + 1}/${IMAGE_RETRY_MAX})`
          );
          await sleep(wait);
          continue;
        }

        if (res.status === 404) {
          console.log(`404 ${url.slice(-70)} — skipping (missing on server)`);
          break;
        }

        if (!res.ok) {
          console.log(`HTTP ${res.status} ${url.slice(-70)} — retrying…`);
          await sleep(IMAGE_RETRY_BASE_MS * (attempt + 1));
          continue;
        }

        const buf = Buffer.from(await res.arrayBuffer());
        imageCache.set(url, {
          body: buf,
          contentType: res.headers.get('content-type') || contentTypeFor(url),
        });
        success = true;
        cachedCount++;
        break;
      } catch (err) {
        console.log(`Fetch error ${url.slice(-70)}: ${err.message}`);
        await sleep(IMAGE_RETRY_BASE_MS * (attempt + 1));
      }
    }

    if (!success) failedCount++;
    await sleep(IMAGE_CACHE_DELAY_MS);
  }

  console.log(`Image cache: ${cachedCount} cached, ${failedCount} failed`);

  // ---------- PHASE 5: serve images from cache during export ----------
  page.removeAllListeners('request');
  imageQueue = Promise.resolve();

  page.on('request', (req) => {
    const reqUrl = req.url();
    const entry = imageCache.get(reqUrl);

    if (entry) {
      req.respond({
        status: 200,
        contentType: entry.contentType,
        body: entry.body,
      }).catch(() => req.continue().catch(() => {}));
      return;
    }

    if (req.resourceType() === 'image') {
      // Unexpected image (not in cache) — still throttle to avoid a burst
      imageQueue = imageQueue
        .then(() => sleep(IMAGE_DELAY_MS))
        .then(() => req.continue())
        .catch(() => req.continue().catch(() => {}));
    } else {
      req.continue().catch(() => {});
    }
  });

  // ---------- PHASE 6: hook blob + jsPDF ----------
  await page.evaluate(() => {
    window.__maxtorPdfBlob = null;

    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      try {
        if (obj instanceof Blob && (obj.type === 'application/pdf' || obj.size > 20000)) {
          window.__maxtorPdfBlob = obj;
        }
      } catch (_) {}
      return orig(obj);
    };

    function patchJsPDF(JsPDF) {
      if (!JsPDF || JsPDF.__maxtorPatched) return;
      const proto = JsPDF.prototype;
      const origSave = proto.save;
      const origOutput = proto.output;

      proto.save = function () {
        try { window.__maxtorPdfBlob = this.output('blob'); } catch (_) {}
        return origSave.apply(this, arguments);
      };
      proto.output = function (type) {
        const result = origOutput.apply(this, arguments);
        try {
          if (type === 'blob' && result instanceof Blob) {
            window.__maxtorPdfBlob = result;
          }
        } catch (_) {}
        return result;
      };
      JsPDF.__maxtorPatched = true;
    }

    try {
      if (window.jspdf && window.jspdf.jsPDF) patchJsPDF(window.jspdf.jsPDF);
      if (window.jsPDF) patchJsPDF(window.jsPDF);
    } catch (_) {}
  });

  await page.evaluate(() => { window.__maxtorPdfBlob = null; });

  const clicked = await page.evaluate(() => {
    const btn = document.getElementById('btnPdf');
    if (!btn) return false;
    btn.disabled = false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('btnPdf not found');

  console.log('Export started — waiting for FINAL PDF only…');

  // ---------- PHASE 7: wait for final PDF ----------
  const waitStart = Date.now();
  let accepted = false;

  while (Date.now() - waitStart < EXPORT_TIMEOUT_MS) {
    const status = await page.evaluate((minSize, totalPages) => {
      const overlay = document.getElementById('overlay');
      const ovMsg = document.getElementById('ovMsg');
      const msg = ovMsg ? ovMsg.textContent.trim() : '';
      const blob = window.__maxtorPdfBlob;
      const size = blob ? blob.size : 0;

      const pageMatch = msg.match(/page\s+(\d+)\s+of\s+(\d+)/i);
      const current = pageMatch ? Number(pageMatch[1]) : 0;
      const ofTotal = pageMatch ? Number(pageMatch[2]) : totalPages;

      const doneByMsg =
        /complete|done|finished|saved|download ready/i.test(msg) ||
        (current > 0 && ofTotal > 0 && current >= ofTotal);

      const overlayOff = !(overlay && overlay.classList.contains('on'));

      return {
        size, msg, current, ofTotal,
        ready:
          size >= minSize &&
          (doneByMsg || (overlayOff && size >= minSize && current >= ofTotal)),
      };
    }, MIN_PDF_BYTES, total);

    if (status.msg) {
      console.log(
        `Export: "${status.msg}" blob=${status.size} ` +
        `page=${status.current}/${status.ofTotal}`
      );
    }

    if (status.size > 0 && status.size < MIN_PDF_BYTES) {
      await page.evaluate(() => { window.__maxtorPdfBlob = null; });
    }

    if (status.ready) {
      console.log('Final PDF accepted, size=', status.size);
      accepted = true;
      break;
    }

    await sleep(5000);
  }

  if (!accepted) {
    throw new Error(
      'Timed out waiting for final PDF (>= ' + MIN_PDF_BYTES +
      ' bytes after full export)'
    );
  }

  // ---------- PHASE 8: save PDF ----------
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
  console.log('PDF buffer bytes=', pdfBuffer.length);

  const dated = path.join(OUT, `maxtor-catalogue-${DATE}.pdf`);
  const latest = path.join(OUT, 'latest.pdf');
  fs.writeFileSync(dated, pdfBuffer);
  fs.copyFileSync(dated, latest);

  await browser.close();
  console.log('Saved', dated);
  console.log('Saved', latest);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
