require_relative "lib/wasm_rails/version"

Gem::Specification.new do |spec|
  spec.name        = "wasm_rails"
  spec.version     = WasmRails::VERSION
  spec.authors     = ["Emerson Argueta"]
  spec.summary     = "Run Rails apps in the browser via WebAssembly"
  spec.description = "Infrastructure gem for building WASM-first Rails apps. " \
                     "Provides a Service Worker that boots Ruby+Rails inside the browser, " \
                     "SQLite persistence via OPFS, build tooling, and C extension stubs."
  spec.homepage    = "https://github.com/emerson-argueta/wasm-rails"
  spec.license     = "MIT"

  spec.required_ruby_version = ">= 3.3"

  spec.files = Dir[
    "lib/**/*",
    "wasm_stubs/**/*",
    "MIT-LICENSE",
    "README.md"
  ]

  spec.add_dependency "railties", ">= 7.1"
end
