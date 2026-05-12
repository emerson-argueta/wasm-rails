# WASM stub — DNS resolution not available in browser WASM.
module Resolv
  def self.getaddress(name) = "127.0.0.1"
  def self.getaddresses(name) = ["127.0.0.1"]
  def self.getname(addr) = "localhost"
  def self.getnames(addr) = ["localhost"]

  class DNS; end
  class IPv4
    def self.create(addr) = new(addr)
    def initialize(addr); @addr = addr; end
    def to_s = @addr
  end
  class IPv6
    def self.create(addr) = new(addr)
    def initialize(addr); @addr = addr; end
    def to_s = @addr
  end
end
