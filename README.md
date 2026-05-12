# wasm_rails

Run Rails apps entirely in the browser via WebAssembly.

The entire Rails runtime — ActiveRecord, ActionController, ActionView — executes inside a Service Worker. SQLite is persisted to OPFS (with IndexedDB fallback). No server required after first load.

## Installation

Add to your Gemfile:

```ruby
gem "wasm_rails"
```

Run the installer:

```bash
bundle install
rails g wasm_rails:install
npm install
```

## What the generator installs

| File | Purpose |
|------|---------|
| `app/javascript/wasm/service_worker.js` | Boots Rails in SW, handles SQLite, intercepts fetches |
| `app/javascript/wasm/boot.js` | Page-side SW registration |
| `bin/build_app_bundle.mjs` | Bundles Ruby source + gems → `public/wasm/app_bundle.json` |
| `bin/esbuild_wasm.mjs` | esbuild config for WASM JS entry points |
| `bin/serve_wasm.mjs` | Local dev server with COOP/COEP headers |
| `lib/active_record/connection_adapters/wasm_sqlite3_adapter.rb` | AR adapter bridging Ruby to JS sqlite |
| `wasm_stubs/` | Stubs for C extensions unavailable in WASM |
| `public/wasm_shell.html` | Entry point HTML — registers SW, shows boot progress |

## Usage

### Build

```bash
# Precompile Rails assets (Propshaft reads the manifest at runtime)
SECRET_KEY_BASE=dummy RAILS_ENV=production bin/rails assets:precompile

# Bundle Ruby source + gems
npm run build:app

# Bundle service worker JS
npm run build:wasm
```

### Serve locally

```bash
node bin/serve_wasm.mjs   # http://localhost:3100
```

Requires Chrome or Edge — Firefox/Safari lack full OPFS SAH Pool + module Service Worker support.

### Deploy

Upload `public/wasm/ruby+stdlib.wasm` and `public/wasm/app_bundle.json` to a CDN (they're large — ~34MB and ~60MB). Deploy the rest to Cloudflare Pages or any static host.

Set `WASM_BASE_URL` at build time to point to your CDN:

```bash
WASM_BASE_URL=https://your-cdn.example.com npm run build:wasm
```

## `config/application.rb` setup

After installing, add these requires **before** `Bundler.require`:

```ruby
require "wasm_rails"
require "turbo-rails"
require "stimulus-rails"
```

## WasmRails.wasm?

The gem provides a clean predicate you can use anywhere:

```ruby
WasmRails.wasm?  # => true when running inside ruby.wasm
```

## How it works

1. `wasm_shell.html` is served statically and registers the Service Worker
2. The SW downloads `ruby+stdlib.wasm` (~34MB, cached after first load)
3. The SW downloads `app_bundle.json` (all gem + app `.rb` files, base64-encoded)
4. Ruby boots, Rails initializes, SQLite opens (OPFS SAH Pool or IndexedDB fallback)
5. On first boot: runs `db/schema.rb`. On subsequent boots: runs pending migrations
6. Every page request is intercepted by the SW, dispatched to the Rails Rack app, returned as HTML

## C extension stubs

Native gems that can't run in WASM are stubbed in `wasm_stubs/`:

- `sqlite3` → replaced by the JS sqlite4rails interface
- `openssl`, `nokogiri`, `loofah`, `rails-html-sanitizer` → empty stubs
- `resolv`, `socket`, `io/wait`, `io/console/size` → empty stubs
- `thread` → mapped to `Fiber` (WASM is single-threaded)

## Requirements

- Ruby 3.3+
- Rails 7.1+
- Node.js 20+
- Chrome or Edge (for OPFS SAH Pool)
