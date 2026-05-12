# WASM stub — io/wait C extension not available in ruby+stdlib.wasm.
class IO
  def wait_readable(timeout = nil) = self
  def wait_writable(timeout = nil) = self
  def ready? = false
end
