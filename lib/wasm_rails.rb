require "wasm_rails/version"
require "wasm_rails/railtie" if defined?(Rails)

module WasmRails
  def self.wasm?
    RUBY_PLATFORM == "wasm32-wasi"
  end
end
