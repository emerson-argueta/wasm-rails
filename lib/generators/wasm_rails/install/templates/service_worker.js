// Service Worker — Rails runs entirely here.
// SQLite via @sqlite.org/sqlite-wasm (synchronous OO1 API, OPFS-backed).
// Ruby+Rails via @ruby/wasm-wasi. No Web Worker relay, no SharedArrayBuffer.

import { DefaultRubyVM } from '@ruby/wasm-wasi/dist/browser';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

// Injected at build time by esbuild define — changes on every build.
// Used to detect when a new SW version has been deployed and force clients to reload.
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const CACHE_VERSION = `wasm-rails-sw-${BUILD_ID}`;

const BYPASS_PREFIXES = ['/wasm/', '/assets/', '/packs/', '/icon', '/favicon', '/robots.txt', '/wasm_shell', '/auth.html'];

function isAsset(pathname) {
  return BYPASS_PREFIXES.some(p => pathname.startsWith(p));
}

function broadcast(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage(msg)));
}

// ── IndexedDB persistence (fallback when OPFS sync handles unavailable) ───────

const IDB_NAME       = 'wasm-rails-sqlite';
const IDB_STORE      = 'db';
const IDB_KEY        = 'main';
const IDB_IMPORT_KEY = 'pending_import';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const idb = await idbOpen();
    return new Promise(resolve => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => { idb.close(); resolve(req.result || null); };
      req.onerror  = () => { idb.close(); resolve(null); };
    });
  } catch { return null; }
}

async function idbSet(key, bytes) {
  try {
    const idb = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    idb.close();
  } catch (e) {
    console.warn('[sw] IDB set failed:', e.message);
  }
}

async function idbDel(key) {
  try {
    const idb = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    idb.close();
  } catch {}
}

// Keep old names as aliases so existing call-sites don't change.
const idbLoad      = () => idbGet(IDB_KEY);
const idbSaveBytes = (b) => idbSet(IDB_KEY, b);

// ── SQLite ────────────────────────────────────────────────────────────────────

// Set in initSQLite when using IDB-backed in-memory DB; null when OPFS handles it.
let persistDb = null;

async function initSQLite() {
  broadcast({ type: 'progress', step: 'Initializing SQLite…' });

  const sqlite3 = await sqlite3InitModule({
    locateFile: (path) => `/wasm/${path}`,
    print: () => {},
    printErr: (msg) => { if (!msg.includes('pragma')) console.warn('[sqlite3]', msg); },
  });

  let db;
  try {
    // OPFS SAH Pool VFS — synchronous, truly persistent.
    const pool = await sqlite3.installOpfsSAHPoolVfs({ directory: '.wasm-rails', initialCapacity: 6 });

    // Apply pending import before opening — pool.importDb requires the db to be closed.
    const importBytes = await idbGet(IDB_IMPORT_KEY);
    if (importBytes) {
      try {
        await pool.importDb('/wasm-rails.db', importBytes);
        await idbDel(IDB_IMPORT_KEY);
        console.log('[sw] Applied pending import to OPFS');
      } catch (ie) {
        console.warn('[sw] Pending import failed:', ie.message);
      }
    }

    db = new pool.OpfsSAHPoolDb('/wasm-rails.db');
    console.log('[sw] SQLite OPFS SAH Pool opened (persistent)');
  } catch (e) {
    // OPFS sync handles unavailable — use in-memory DB with IndexedDB serialization.
    console.warn('[sw] OPFS unavailable, using IndexedDB-backed in-memory DB');
    db = new sqlite3.oo1.DB();

    // Pending import takes priority over the regular IDB backup.
    const importBytes = await idbGet(IDB_IMPORT_KEY);
    if (importBytes) await idbDel(IDB_IMPORT_KEY);
    const saved = importBytes || await idbLoad();
    if (saved) {
      try {
        const pData = sqlite3.wasm.allocFromTypedArray(saved);
        const rc = sqlite3.capi.sqlite3_deserialize(
          db.pointer, 'main', pData, saved.byteLength, saved.byteLength, 1 | 2
        );
        if (rc !== 0) {
          sqlite3.wasm.dealloc(pData);
          console.warn(`[sw] SQLite restore failed (rc=${rc}), starting fresh`);
        } else {
          console.log(`[sw] SQLite restored from IndexedDB (${saved.byteLength} bytes)`);
        }
      } catch (de) {
        console.warn('[sw] SQLite restore error:', de.message);
      }
    } else {
      console.log('[sw] SQLite fresh in-memory DB');
    }

    persistDb = async () => {
      try {
        const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
        await idbSaveBytes(bytes);
      } catch (e) {
        console.warn('[sw] SQLite export failed:', e.message);
      }
    };
  }

  exportDb = () => sqlite3.capi.sqlite3_js_db_export(db.pointer);

  // Expose a synchronous interface Ruby calls via JS.global[:sqlite4rails]
  self.sqlite4rails = {
    exec: (sql) => {
      const result = { cols: [], rows: [] };
      db.exec({
        sql:         sql.toString(),
        columnNames: result.cols,
        resultRows:  result.rows,
        rowMode:     'array',
      });
      if (persistDb && db.changes() > 0) persistDb().catch(() => {});
      return result;
    },
    changes: () => db.changes(),
  };

  console.log('[sw] SQLite ready');
}

// ── DB export ─────────────────────────────────────────────────────────────────

let exportDb = null;

async function handleExport() {
  if (!exportDb) return new Response('Database not ready', { status: 503 });
  try {
    const bytes = exportDb();
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type':        'application/x-sqlite3',
        'Content-Disposition': 'attachment; filename="wasm-rails.sqlite3"',
        'Content-Length':      String(bytes.byteLength),
      }
    });
  } catch (e) {
    return new Response('Export failed: ' + e.message, { status: 500 });
  }
}

async function handleImport(req) {
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    const magic = new TextDecoder().decode(bytes.slice(0, 15));
    if (!magic.startsWith('SQLite format 3')) {
      return new Response(JSON.stringify({ error: 'Not a valid SQLite file' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    await idbSet(IDB_IMPORT_KEY, bytes);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── Ruby / Rails ──────────────────────────────────────────────────────────────

let vm = null;

function buildMountScript(bundle) {
  const entries = Object.entries(bundle).map(([path, b64]) => {
    const escaped = b64.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `require 'base64'; File.write("${path}", Base64.decode64("${escaped}"))`;
  }).join("\n");

  const dirs = [...new Set(
    Object.keys(bundle).map(p => p.split('/').slice(0, -1).join('/'))
  )].sort().map(d => `FileUtils.mkdir_p("${d}")`).join("\n");

  return `require 'fileutils'\n${dirs}\n${entries}`;
}

function escRuby(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function initRails() {
  broadcast({ type: 'progress', step: 'Loading Ruby+Rails (this takes ~20s on first load)…' });

  const rubyWasmUrl = typeof __RUBY_WASM_URL__ !== 'undefined' ? __RUBY_WASM_URL__ : '/wasm/ruby+stdlib.wasm';
  const wasmModule = await WebAssembly.compileStreaming(fetch(rubyWasmUrl));
  const { vm: rubyVM } = await DefaultRubyVM(wasmModule);

  broadcast({ type: 'progress', step: 'Mounting app bundle…' });
  const appBundleUrl = typeof __APP_BUNDLE_URL__ !== 'undefined' ? __APP_BUNDLE_URL__ : '/wasm/app_bundle.json';
  const bundle = await (await fetch(appBundleUrl)).json();
  rubyVM.eval(buildMountScript(bundle));

  broadcast({ type: 'progress', step: 'Booting Rails…' });
  rubyVM.eval(`
    load '/wasm_setup.rb'

    ENV['RAILS_ENV'] = 'production'
    ENV['SECRET_KEY_BASE'] = 'wasm-local-secret-not-used-for-encryption'

    Dir.chdir('/app')
    require_relative '/app/config/environment'
    RAILS_APP = Rails.application
    RAILS_APP.initialize! unless RAILS_APP.initialized?
    puts '[sw] Rails booted'

    begin
      unless ActiveRecord::Base.connection.table_exists?('users')
        ActiveRecord::Schema.verbose = false
        load('/app/db/schema.rb')
        puts '[sw] Schema loaded'
      else
        ActiveRecord::Migration.verbose = false
        ActiveRecord::MigrationContext.new(
          Rails.root.join('db/migrate'),
          ActiveRecord::SchemaMigration.new(ActiveRecord::Base.connection_pool)
        ).migrate
        puts '[sw] Migrations applied'
      end
    rescue => e
      puts "[sw] Schema warning: \#{e.message}"
    end
  `);

  // Persist schema to IDB — DDL (CREATE TABLE) doesn't bump db.changes()
  // so the exec-level auto-save won't fire for the initial schema load.
  if (persistDb) await persistDb();

  vm = rubyVM;
  console.log('[sw] Rails ready');
}

// ── Boot ──────────────────────────────────────────────────────────────────────

let bootPromise = null;

async function boot() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    try {
      await initSQLite();
      await initRails();
      broadcast({ type: 'ready' });
    } catch (e) {
      console.error('[sw] Boot failed:', e);
      broadcast({ type: 'error', message: e.message });
    } finally {
      bootPromise = null;
    }
  })();
  return bootPromise;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    boot()
      .then(() => caches.open(CACHE_VERSION))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const allCaches = await caches.keys();
    const staleCaches = allCaches.filter(k => k.startsWith('wasm-rails-sw-') && k !== CACHE_VERSION);

    const isUpdate = staleCaches.length > 0;
    await Promise.all(staleCaches.map(k => caches.delete(k)));

    await self.clients.claim();

    if (isUpdate) {
      console.log(`[sw] Updated to ${BUILD_ID} — reloading all clients`);
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map(c => c.navigate(c.url).catch(() => {})));
    }
  })());
});

// ── Request handling ──────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || isAsset(url.pathname)) return;
  if (url.pathname === '/data/export.sqlite3') {
    event.respondWith(handleExport());
    return;
  }
  if (url.pathname === '/data/import' && event.request.method === 'POST') {
    event.respondWith(handleImport(event.request));
    return;
  }
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(req) {
  if (!vm) {
    boot();
    return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Budget Clear</title>
<style>body{font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}p{font-size:1rem}</style>
<script>navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='ready')location.reload()});<\/script>
</head><body><p>Restarting Budget Clear…</p></body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const body = ['GET', 'HEAD'].includes(req.method) ? '' : await req.text();
  const url  = new URL(req.url);
  const headers = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  const httpHeaders = Object.entries(headers)
    .filter(([k]) => !['host', 'content-type', 'content-length'].includes(k.toLowerCase()))
    .map(([k, v]) => `        'HTTP_${k.toUpperCase().replace(/-/g, '_')}' => '${escRuby(v)}'`)
    .join(',\n');

  const result = vm.eval(`
    begin
      env = {
        'REQUEST_METHOD'   => '${escRuby(req.method)}',
        'PATH_INFO'        => '${escRuby(url.pathname)}',
        'QUERY_STRING'     => '${escRuby(url.search.slice(1))}',
        'HTTP_HOST'        => '${escRuby(url.host)}',
        ${headers['content-type'] ? `'CONTENT_TYPE' => '${escRuby(headers['content-type'])}',` : ''}
        'CONTENT_LENGTH'   => '${escRuby(String(body.length))}',
        'rack.input'       => StringIO.new('${escRuby(body)}'),
        'rack.errors'      => $stderr,
        'rack.url_scheme'  => '${escRuby(url.protocol.slice(0, -1))}',
        'rack.multithread' => false,
        'rack.multiprocess'=> false,
        'rack.run_once'    => false,
${httpHeaders}
      }
      status, headers, body_iter = RAILS_APP.call(env)
      body_str = ''.dup; body_iter.each { |p| body_str << p.to_s }
      body_iter.close if body_iter.respond_to?(:close)
      JSON.generate({ status: status.to_i, headers: headers, body: body_str })
    rescue => e
      JSON.generate({ status: 500, headers: {}, body: e.message + "\\n" + e.backtrace.first(20).join("\\n") + (e.cause ? "\\nCaused by: \#{e.cause.message}\\n" + e.cause.backtrace.first(10).join("\\n") : "") })
    end
  `);

  const response = JSON.parse(result.toString());

  if (response.status !== 200) {
    console.warn('[sw] non-200', response.status, response.body?.substring(0, 300));
  }

  const respHeaders = new Headers(response.headers || {});
  if (!respHeaders.has('Content-Type')) respHeaders.set('Content-Type', 'text/html');

  return new Response(response.body, { status: response.status, headers: respHeaders });
}
