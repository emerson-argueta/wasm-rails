# WASM stub — io/console/size is a C extension not available in ruby+stdlib.wasm.
# Returns a fixed terminal size since WASM has no real console.

class IO
  def self.console_size = [24, 80]
  def self.default_console_size = [24, 80]
  def winsize = [24, 80]
end
