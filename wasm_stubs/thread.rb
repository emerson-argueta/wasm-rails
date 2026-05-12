# WASM is single-threaded — map Thread to Fiber so gems that spawn threads
# don't raise. The fiber runs synchronously when .value or .join is called.
class Thread
  def self.new(...)
    f = Fiber.new(...)
    def f.value = resume
    def f.join  = value
    f
  end
end
