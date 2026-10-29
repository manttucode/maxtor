# Maxtor Catalogue PDF Cron

Generates the live product catalogue PDF and uploads it to Hostinger via FTP.

**Stack:** Render free Web Service + cron-job.org (no GitHub Actions, no VPS)

## Files

| File | Role |
|------|------|
| `server.js` | Express app — `/run` starts job, returns 202 immediately |
| `run-once.js` | Runs generate + upload once |
| `generate.js` | Puppeteer: open catalogue HTML → PDF |
| `upload-and-cleanup.js` | FTP upload + delete old PDFs |
| `package.json` | Dependencies |

## Render Web Service

1. New → **Web Service** (free)
2. Build: `npm install`
3. Start: `npm start`
4. Environment variables:

```
RUN_KEY=your-long-secret
CATALOGUE_URL=https://maxtorfitness.com/catalouge/catalouge.html
FTP_HOST=31.220.110.9
FTP_USER=u397286968.maxtorfitness.com
FTP_PASSWORD=your-ftp-password
FTP_DIR=/public_html/catalouge/pdfs
```

## Trigger URL

```
https://YOUR-APP.onrender.com/run?key=YOUR_RUN_KEY
```

Returns `202` immediately; PDF builds in the background (can take 30–60 min).

## cron-job.org

- URL: the `/run?key=...` URL above
- Method: GET
- Schedule: every 3 days (or as needed)

## Hostinger

Create folder: `public_html/catalouge/pdfs/`

Public link: `https://maxtorfitness.com/catalouge/pdfs/latest.pdf`

## Local test

```bash
npm install
export CATALOGUE_URL=https://maxtorfitness.com/catalouge/catalouge.html
export FTP_HOST=...
export FTP_USER=...
export FTP_PASSWORD=...
export FTP_DIR=/public_html/catalouge/pdfs
node run-once.js
```
