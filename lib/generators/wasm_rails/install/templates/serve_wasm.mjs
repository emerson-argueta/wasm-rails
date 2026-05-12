#!/usr/bin/env node
// Static file server for local WASM testing.
// Sets the COOP/COEP headers required for SharedArrayBuffer (and therefore Atomics).

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 3100;
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, '../public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain',
  '.map':  'application/json',
};

const SAB_HEADERS = {
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

const server = createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = resolve(PUBLIC, '.' + urlPath);

  if (urlPath === '/' || urlPath === '') {
    filePath = resolve(PUBLIC, 'wasm_shell.html');
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    if (!extname(urlPath)) {
      filePath = resolve(PUBLIC, 'wasm_shell.html');
    }
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 Not Found: ${urlPath}`);
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  Object.entries(SAB_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');

  if (urlPath === '/wasm/service_worker.js') {
    res.setHeader('Service-Worker-Allowed', '/');
  }

  try {
    const body = readFileSync(filePath);
    res.writeHead(200);
    res.end(body);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(e.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Budget Clear WASM test server');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  SharedArrayBuffer headers: ✓');
  console.log('  Serving from: client/public/');
  console.log('');
  console.log('  Open http://localhost:3100 — first boot downloads ruby+stdlib.wasm (34MB)');
  console.log('  Subsequent loads are instant (cached by Service Worker).');
  console.log('');
});
