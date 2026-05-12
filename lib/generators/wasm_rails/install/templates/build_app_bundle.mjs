#!/usr/bin/env node
// Bundles Ruby source files + gem lib files into public/wasm/app_bundle.json.
// Also generates public/wasm/wasm_setup.rb which sets up $LOAD_PATH inside WASM.

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, relative, extname, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outdir = resolve(root, 'public', 'wasm');

mkdirSync(outdir, { recursive: true });

// ── App source files ──────────────────────────────────────────────────────────

const APP_DIRS = [
  'app/models', 'app/controllers', 'app/helpers', 'app/views',
  'app/mailers', 'app/jobs', 'app/services', 'config', 'db/migrate', 'lib',
];
const APP_FILES = [
  'db/schema.rb', 'db/seeds.rb',
  'public/assets/.manifest.json',
];
const EXCLUDE = [/node_modules/, /\.git/, /tmp\//, /log\//, /public\//, /storage\//, /\.DS_Store/];
const SOURCE_EXTS = new Set(['.rb', '.erb', '.yml', '.yaml', '.json', '.ru']);

function shouldExclude(p) { return EXCLUDE.some(r => r.test(p)); }

function collectDir(dir, mountPath, bundle) {
  const abs = resolve(root, dir);
  try {
    const walk = (cur) => {
      if (shouldExclude(cur)) return;
      const stat = statSync(cur);
      if (stat.isDirectory()) {
        readdirSync(cur).forEach(f => walk(resolve(cur, f)));
      } else if (SOURCE_EXTS.has(extname(cur).toLowerCase())) {
        const rel = mountPath + '/' + relative(abs, cur);
        bundle[rel] = Buffer.from(readFileSync(cur)).toString('base64');
      }
    };
    walk(abs);
  } catch { /* skip missing dirs */ }
}

// ── Gem source files ──────────────────────────────────────────────────────────

const NATIVE_GEMS = new Set([
  'sqlite3', 'puma', 'bootsnap', 'nio4r', 'ffi', 'nokogiri',
  'msgpack', 'bcrypt', 'ed25519', 'bcrypt_pbkdf', 'bindex',
  'websocket-driver', 'websocket-extensions', 'image_processing',
  'mini_magick', 'ruby-vips', 'selenium-webdriver', 'capybara',
  'debug', 'web-console', 'kamal', 'thruster',
  // loofah and rails-html-sanitizer depend on nokogiri — stub them instead
  'loofah', 'rails-html-sanitizer', 'crass',
  // dev/build tools
  'rubocop', 'rubocop-rails-omakase', 'brakeman', 'bundler-audit',
  'tailwindcss-rails', 'tailwindcss-ruby',
]);

// Extra non-lib paths to bundle for specific gems (e.g. Rails engines with app/ dirs)
const GEM_EXTRA_PATHS = {
  'turbo-rails': [
    'app/controllers',
    'app/controllers/concerns',
    'app/helpers',
    'app/models',
    'app/models/concerns',
    'app/views',
  ],
};

const STDLIB_GEMS = new Set([
  'json', 'psych', 'stringio', 'date', 'bigdecimal', 'racc',
  'strscan', 'io-console', 'timeout', 'logger', 'ostruct',
  'prism', 'rbs',
  'bundler',
]);

function getGemSpecs() {
  try {
    const json = execSync(
      'bundle exec ruby -e \'' +
      'require "json"; ' +
      'puts Gem.loaded_specs.values.map { |s| ' +
      '  { name: s.name, version: s.version.to_s, gem_dir: s.gem_dir, ' +
      '    require_paths: s.require_paths } ' +
      '}.to_json\'',
      { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return JSON.parse(json);
  } catch (e) {
    console.warn('[build_app_bundle] Could not enumerate gems:', e.message);
    return [];
  }
}

function collectGems(bundle) {
  const specs = getGemSpecs();
  const loadPaths = [];
  let gemFileCount = 0;

  for (const spec of specs) {
    if (NATIVE_GEMS.has(spec.name) || STDLIB_GEMS.has(spec.name)) continue;

    const allPaths = [
      ...spec.require_paths,
      ...(GEM_EXTRA_PATHS[spec.name] || []),
    ];

    for (const rp of allPaths) {
      const libDir = join(spec.gem_dir, rp);
      const mountAt = `/gems/${spec.name}-${spec.version}/${rp}`;

      try {
        statSync(libDir);
      } catch { continue; }

      loadPaths.push(mountAt);

      const walk = (cur) => {
        try { statSync(cur); } catch { return; }
        if (statSync(cur).isDirectory()) {
          readdirSync(cur).forEach(f => walk(join(cur, f)));
        } else if (['.rb', '.erb', '.yml', '.yaml'].includes(extname(cur))) {
          const rel = mountAt + '/' + relative(libDir, cur);
          bundle[rel] = Buffer.from(readFileSync(cur)).toString('base64');
          gemFileCount++;
        }
      };
      walk(libDir);
    }
  }

  console.log(`[build_app_bundle] Bundled ${gemFileCount} gem .rb files from ${loadPaths.length} load paths`);
  return loadPaths;
}

// ── Build ─────────────────────────────────────────────────────────────────────

// 1. App source — mounted at /app/... in the WASM virtual FS
const cleanBundle = {};
for (const dir of APP_DIRS) {
  const abs = resolve(root, dir);
  try {
    const walk = (cur) => {
      if (shouldExclude(cur)) return;
      if (statSync(cur).isDirectory()) {
        readdirSync(cur).forEach(f => walk(resolve(cur, f)));
      } else if (SOURCE_EXTS.has(extname(cur).toLowerCase())) {
        const rel = '/app/' + relative(root, cur);
        cleanBundle[rel] = Buffer.from(readFileSync(cur)).toString('base64');
      }
    };
    walk(abs);
  } catch { /* skip */ }
}
for (const file of APP_FILES) {
  try {
    const abs = resolve(root, file);
    cleanBundle['/app/' + file] = Buffer.from(readFileSync(abs)).toString('base64');
  } catch { /* skip */ }
}

// 2. WASM stubs — C extensions not available in ruby+stdlib.wasm
const stubsDir = resolve(root, 'wasm_stubs');
try {
  const walkStubs = (cur) => {
    if (statSync(cur).isDirectory()) {
      readdirSync(cur).forEach(f => walkStubs(resolve(cur, f)));
    } else if (extname(cur) === '.rb') {
      cleanBundle['/stubs/' + relative(stubsDir, cur)] = Buffer.from(readFileSync(cur)).toString('base64');
    }
  };
  walkStubs(stubsDir);
  console.log(`[build_app_bundle] Bundled ${Object.keys(cleanBundle).filter(k => k.startsWith('/stubs/')).length} WASM stubs`);
} catch { /* wasm_stubs dir missing — skip */ }

// 3. Gem source files + collect load paths
const gemLoadPaths = collectGems(cleanBundle);

// 4. Generate wasm_setup.rb
const setupRb = [
  '# Auto-generated by bin/build_app_bundle.mjs — do not edit',
  '$LOAD_PATH.unshift("/stubs")',
  '$LOAD_PATH.unshift("/app")',
  ...gemLoadPaths.map(p => `$LOAD_PATH.unshift("${p}")`),
].join("\n") + "\n";

writeFileSync(resolve(outdir, 'wasm_setup.rb'), setupRb);
cleanBundle['/wasm_setup.rb'] = Buffer.from(setupRb).toString('base64');

// 5. Write bundle
const outPath = resolve(outdir, 'app_bundle.json');
writeFileSync(outPath, JSON.stringify(cleanBundle));

const count = Object.keys(cleanBundle).length;
const size  = (Buffer.byteLength(JSON.stringify(cleanBundle)) / 1024 / 1024).toFixed(1);
console.log(`[build_app_bundle] Total: ${count} files → ${size} MB → public/wasm/app_bundle.json`);
