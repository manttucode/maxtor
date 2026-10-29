const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'output');
const FTP_DIR = process.env.FTP_DIR || '/public_html/catalouge/pdfs';

(async () => {
  const client = new ftp.Client(120000);
  client.ftp.verbose = true;

  try {
    if (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASSWORD) {
      throw new Error('Missing FTP_HOST, FTP_USER, or FTP_PASSWORD env vars');
    }

    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false,
    });

    await client.ensureDir(FTP_DIR);
    await client.cd(FTP_DIR);

    if (!fs.existsSync(OUT)) {
      throw new Error('output/ folder missing — generate.js did not run?');
    }

    const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.pdf'));
    if (!files.length) throw new Error('No PDF files in output/');

    for (const file of files) {
      console.log('Uploading', file);
      await client.uploadFrom(path.join(OUT, file), file);
    }

    const remoteList = await client.list();
    const today = new Date().toISOString().slice(0, 10);
    const keep = new Set(['latest.pdf', `maxtor-catalogue-${today}.pdf`]);

    for (const item of remoteList) {
      const name = item.name;
      if (!name || !name.endsWith('.pdf')) continue;
      if (keep.has(name)) continue;
      if (name.startsWith('maxtor-catalogue-')) {
        console.log('Deleting old PDF:', name);
        await client.remove(name);
      }
    }

    console.log('Upload + cleanup done');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    client.close();
  }
})();
