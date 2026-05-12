#!/usr/bin/env node
// Bundles the WASM service worker and boot helper into public/wasm/.
// Add your own app entry points to the entryPoints array below.

import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outdir = resolve(root, 'public', 'wasm');

mkdirSync(outdir, { recursive: true });

const watching = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: [
    resolve(root, 'app/javascript/wasm/service_worker.js'),
    resolve(root, 'app/javascript/wasm/boot.js'),
    // Add your app-specific WASM entry points here:
    // resolve(root, 'app/javascript/wasm/auth.js'),
    // resolve(root, 'app/javascript/wasm/proxy_client.js'),
  ],
  bundle:    true,
  format:    'esm',
  splitting: false,
  outdir,
  sourcemap: true,
  define: {
    'process.env.NODE_ENV':  '"production"',
    '__BUILD_ID__':          JSON.stringify(Date.now().toString()),
    '__RUBY_WASM_URL__':     JSON.stringify(process.env.WASM_BASE_URL ? `${process.env.WASM_BASE_URL}/ruby+stdlib.wasm` : '/wasm/ruby+stdlib.wasm'),
    '__APP_BUNDLE_URL__':    JSON.stringify(process.env.WASM_BASE_URL ? `${process.env.WASM_BASE_URL}/app_bundle.json` : '/wasm/app_bundle.json'),
  },
  loader: { '.wasm': 'file' },
  assetNames: '[name]',
});

cpSync(
  resolve(root, 'node_modules/@ruby/3.3-wasm-wasi/dist/ruby+stdlib.wasm'),
  resolve(outdir, 'ruby+stdlib.wasm')
);

cpSync(
  resolve(root, 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm'),
  resolve(outdir, 'sqlite3.wasm')
);

if (watching) {
  await ctx.watch();
  console.log('[esbuild_wasm] Watching…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[esbuild_wasm] Built → public/wasm/');
}
