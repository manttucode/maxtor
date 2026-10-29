const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const RUN_KEY = process.env.RUN_KEY || '';

let running = false;
let lastStatus = { state: 'idle', at: null, error: null };

app.get('/', (req, res) => {
  res.json({
    service: 'maxtor-catalogue',
    running,
    lastStatus,
    endpoints: {
      status: '/status',
      run: '/run?key=YOUR_RUN_KEY',
    },
  });
});

app.get('/status', (req, res) => {
  res.json({ running, lastStatus });
});

/**
 * cron-job.org (or manual browser) calls this.
 * Returns 202 immediately; PDF generation continues in the background.
 */
app.get('/run', (req, res) => {
  const key = req.query.key || '';
  if (!RUN_KEY || key !== RUN_KEY) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (running) {
    return res.status(409).json({ ok: false, error: 'already running', lastStatus });
  }

  running = true;
  lastStatus = { state: 'started', at: new Date().toISOString(), error: null };

  res.status(202).json({
    ok: true,
    message: 'catalogue generation started',
    at: lastStatus.at,
  });

  const child = spawn('node', [path.join(__dirname, 'run-once.js')], {
    env: process.env,
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    console.error('Spawn error:', err);
    running = false;
    lastStatus = {
      state: 'failed',
      at: new Date().toISOString(),
      error: String(err.message || err),
    };
  });

  child.on('exit', (code) => {
    running = false;
    lastStatus = {
      state: code === 0 ? 'success' : 'failed',
      at: new Date().toISOString(),
      error: code === 0 ? null : `exit code ${code}`,
    };
    console.log('Job finished:', lastStatus);
  });
});

app.listen(PORT, () => {
  console.log(`Maxtor catalogue service listening on port ${PORT}`);
});
