import http from 'http';
import crypto from 'crypto';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT         = process.env.PORT           || 9000;
const SECRET       = process.env.WEBHOOK_SECRET || '';
const GIT_PAT      = process.env.GIT_PAT        || '';
const ORIGIN_URL   = process.env.ORIGIN_URL     || '';
const POLARION_URL = process.env.POLARION_URL   || '';
const REPO_DIR     = process.env.REPO_DIR       || '/repo';

if (!GIT_PAT || !ORIGIN_URL || !POLARION_URL) {
  console.error('[webhook] GIT_PAT, ORIGIN_URL and POLARION_URL are required');
  process.exit(1);
}

function withAuth(url) {
  return url.replace('https://', `https://x-access-token:${GIT_PAT}@`);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', ...opts }).toString().trim();
}

function setRemotes() {
  run(`git remote set-url origin   ${withAuth(ORIGIN_URL)}`,   { cwd: REPO_DIR });
  run(`git remote set-url polarion ${withAuth(POLARION_URL)}`, { cwd: REPO_DIR });
}

function initRepo() {
  if (!fs.existsSync(path.join(REPO_DIR, '.git'))) {
    console.log(`[webhook] cloning ${ORIGIN_URL} ...`);
    run(`git clone ${withAuth(ORIGIN_URL)} ${REPO_DIR}`);
    run(`git remote add polarion ${withAuth(POLARION_URL)}`, { cwd: REPO_DIR });
    console.log('[webhook] clone complete');
  } else {
    setRemotes();
    console.log('[webhook] repo exists, remotes refreshed');
  }
}

try {
  run('git config --global user.email "webhook@kontracts.pro"');
  run('git config --global user.name "Webhook"');
  initRepo();
} catch (err) {
  console.error('[webhook] startup error:', err.message);
  process.exit(1);
}

// ── signature verification ─────────────────────────────────────────────────

function verifySignature(body, sig) {
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

// ── sync (fetch → push) ────────────────────────────────────────────────────

let syncing = false;

function log(msg) {
  process.stdout.write(msg + '\n');
}

function syncToPolarion() {
  if (syncing) {
    log('[webhook] sync already in progress, skipping');
    return;
  }
  syncing = true;
  try {
    setRemotes();
  } catch (err) {
    syncing = false;
    log(`[webhook] setRemotes failed: ${err.message}`);
    return;
  }
  log('[webhook] starting: git fetch origin && git push polarion main');
  exec(
    'git fetch origin && git push polarion origin/main:refs/heads/main',
    { cwd: REPO_DIR },
    (err, stdout, stderr) => {
      syncing = false;
      const out = (stdout + stderr).trim();
      if (err) {
        log(`[webhook] sync FAILED\n${out}`);
      } else {
        log(`[webhook] sync OK\n${out || '(no output)'}`);
      }
    }
  );
}

// ── HTTP server ────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404).end();
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const sig = req.headers['x-hub-signature-256'] || '';
    if (!verifySignature(body, sig)) {
      res.writeHead(401).end('Unauthorized');
      return;
    }

    if (req.headers['x-github-event'] !== 'push') {
      res.writeHead(200).end('Ignored');
      return;
    }

    let payload;
    try { payload = JSON.parse(body); } catch {
      res.writeHead(400).end('Bad Request');
      return;
    }

    if (payload.ref !== 'refs/heads/main') {
      res.writeHead(200).end('Ignored: not main');
      return;
    }

    res.writeHead(202).end('Accepted');
    syncToPolarion();
  });
});

server.listen(PORT, () => console.log(`[webhook] ${ORIGIN_URL} → listening on :${PORT}`));
