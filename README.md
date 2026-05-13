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
| `app/javascript/wasm/service_worker.js` | Boots Rails in SW, handles SQLite, intercepts fetches, export/import DB |
| `app/javascript/wasm/boot.js` | Page-side SW registration and progress display |
| `bin/build_app_bundle.mjs` | Bundles Ruby source + gems → `public/wasm/app_bundle.json` |
| `bin/esbuild_wasm.mjs` | esbuild config for WASM JS entry points |
| `bin/serve_wasm.mjs` | Local dev server with COOP/COEP headers |
| `lib/active_record/connection_adapters/wasm_sqlite3_adapter.rb` | AR adapter bridging Ruby to JS sqlite |
| `wasm_stubs/` | Stubs for C extensions unavailable in WASM |
| `public/wasm_shell.html` | Entry point HTML — registers SW, shows boot progress |

## `config/application.rb` setup

After installing, add these requires at the top of `config/application.rb`, **before** `Bundler.require`:

```ruby
require "wasm_rails"
require "turbo-rails"
require "stimulus-rails"
# Add any other gems that need explicit requires for Propshaft asset discovery:
# require "chartkick"
# require "groupdate"
```

Also add the WASM SQLite adapter inside your `Application` class:

```ruby
module YourApp
  class Application < Rails::Application
    require_relative "../../lib/active_record/connection_adapters/wasm_sqlite3_adapter" if RUBY_PLATFORM == "wasm32-wasi"
  end
end
```

## `config/boot.rb` setup

Wrap Bundler setup so it's skipped inside the Service Worker:

```ruby
unless RUBY_PLATFORM == "wasm32-wasi"
  ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)
  require "bundler/setup"
end
```

## `config/initializers/assets.rb` setup

Add `app/javascript` to Propshaft's asset paths so `application.js` and controller files are found:

```ruby
Rails.application.config.assets.paths << Rails.root.join("app/javascript")
```

## Gems with `app/` directories

Some gems (like `turbo-rails`) ship controllers, helpers, and views in their `app/` directory. Zeitwerk normally autoloads these, but WASM has no lazy autoloading from gem `app/` dirs. The `wasm_rails` Railtie handles `turbo-rails` automatically.

For other gems that use `app/` dirs, add them to `GEM_EXTRA_PATHS` in `bin/build_app_bundle.mjs`:

```js
const GEM_EXTRA_PATHS = {
  'turbo-rails': ['app/controllers', 'app/controllers/concerns', 'app/helpers', 'app/models', 'app/models/concerns', 'app/views'],
  'your-gem':    ['app/helpers'],
};
```

## Usage

### Build

```bash
# Precompile Rails assets (Propshaft reads the manifest at runtime)
SECRET_KEY_BASE=dummy RAILS_ENV=production bin/rails assets:precompile

# Bundle Ruby source + gems (~39MB)
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

`ruby+stdlib.wasm` (~34MB) and `app_bundle.json` (~39MB) exceed Cloudflare Pages' 25MB file size limit. Upload them to R2 or any CDN. Deploy the rest to Cloudflare Pages or any static host.

Set `WASM_BASE_URL` at build time to point to your CDN:

```bash
WASM_BASE_URL=https://your-cdn.example.com npm run build:wasm
```

The built JS files in `public/wasm/` (`service_worker.js`, `boot.js`, etc.) must be committed — they're served directly by the static host.

## `WasmRails.wasm?`

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
