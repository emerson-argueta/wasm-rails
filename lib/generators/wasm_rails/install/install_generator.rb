require "rails/generators"
require "json"

module WasmRails
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      desc "Sets up a Rails app to run as a WASM app in the browser."

      def copy_wasm_adapter
        copy_file "wasm_sqlite3_adapter.rb",
                  "lib/active_record/connection_adapters/wasm_sqlite3_adapter.rb"
      end

      def copy_wasm_stubs
        stubs_src = File.expand_path("../../../../../wasm_stubs", __dir__)
        Dir.glob("#{stubs_src}/**/*").each do |src|
          next if File.directory?(src)
          rel = Pathname.new(src).relative_path_from(Pathname.new(stubs_src))
          copy_file src, "wasm_stubs/#{rel}"
        end
      end

      def copy_js_files
        copy_file "service_worker.js", "app/javascript/wasm/service_worker.js"
        copy_file "boot.js",           "app/javascript/wasm/boot.js"
      end

      def copy_bin_scripts
        copy_file "build_app_bundle.mjs", "bin/build_app_bundle.mjs"
        copy_file "esbuild_wasm.mjs",     "bin/esbuild_wasm.mjs"
        copy_file "serve_wasm.mjs",       "bin/serve_wasm.mjs"
        chmod "bin/build_app_bundle.mjs", 0o755
        chmod "bin/esbuild_wasm.mjs",     0o755
        chmod "bin/serve_wasm.mjs",       0o755
      end

      def copy_public_files
        copy_file "wasm_shell.html", "public/wasm_shell.html"
      end

      def patch_boot_rb
        boot = "config/boot.rb"
        return unless File.exist?(boot)
        return if File.read(boot).include?("wasm32-wasi")
        gsub_file boot,
          /^(ENV\["BUNDLE_GEMFILE"\].+\nrequire "bundler\/setup"\nrequire "bootsnap\/setup")$/m,
          "unless RUBY_PLATFORM == \"wasm32-wasi\"\n  \\1\nend"
      end

      def patch_application_rb
        application_rb = "config/application.rb"
        return if File.read(application_rb).include?("wasm_sqlite3_adapter")
        inject_into_class application_rb, "Application" do
          <<~RUBY.indent(4)
            if RUBY_PLATFORM == "wasm32-wasi"
              require_relative "../../lib/active_record/connection_adapters/wasm_sqlite3_adapter"
            end
          RUBY
        end
      end

      def patch_assets_initializer
        initializer = "config/initializers/assets.rb"
        create_file initializer unless File.exist?(initializer)
        return if File.read(initializer).include?("app/javascript")
        append_to_file initializer,
          "\nRails.application.config.assets.paths << Rails.root.join(\"app/javascript\")\n"
      end

      def update_package_json
        return unless File.exist?("package.json")
        pkg = JSON.parse(File.read("package.json"))

        (pkg["dependencies"] ||= {}).merge!(
          "@ruby/3.3-wasm-wasi"     => "^3.3.0",
          "@ruby/wasm-wasi"         => "^3.3.0",
          "@sqlite.org/sqlite-wasm" => "^3.0.0",
          "esbuild"                 => "^0.25.0"
        ) { |_k, old, _new| old }

        (pkg["scripts"] ||= {}).merge!(
          "build:wasm" => "node bin/esbuild_wasm.mjs",
          "watch:wasm" => "node bin/esbuild_wasm.mjs --watch",
          "build:app"  => "node bin/build_app_bundle.mjs"
        ) { |_k, old, _new| old }

        File.write("package.json", JSON.pretty_generate(pkg))
        say_status :update, "package.json"
      end

      def show_post_install_message
        say "\n"
        say "  ✓ wasm_rails installed!", :green
        say "\n"
        say "  Next steps:"
        say "    1. npm install"
        say "    2. In config/application.rb, require these before Bundler.require:"
        say "         require 'wasm_rails'"
        say "         require 'turbo-rails'"
        say "         require 'stimulus-rails'"
        say "    3. npm run build:app && npm run build:wasm"
        say "    4. node bin/serve_wasm.mjs  →  http://localhost:3100"
        say "\n"
      end
    end
  end
end
