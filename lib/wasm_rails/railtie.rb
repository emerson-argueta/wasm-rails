require "rails/railtie"

module WasmRails
  class Railtie < Rails::Railtie
    # In WASM mode, pre-require turbo-rails app-dir constants before Rails
    # eager-loads ActionController::Base and fires the on_load hooks.
    # Zeitwerk can't autoload from gem app/ dirs in WASM so we do it manually.
    initializer "wasm_rails.turbo_namespaces", before: :load_config_initializers do
      if WasmRails.wasm?
        module Turbo
          module Streams; end
          module Frames; end
          module Native; end
        end
        require "turbo/streams/action_helper"
        require "turbo/streams/turbo_streams_tag_builder"
        require "turbo/frames/frame_request"
        require "turbo/native/navigation"
        require "turbo/request_id_tracking"
      end
    end
  end
end
