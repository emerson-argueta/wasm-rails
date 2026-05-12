# WASM stub — socket C extension is not available in ruby+stdlib.wasm.
# Provides the constants and classes that ipaddr, activesupport, and railties need.

class BasicSocket; end

class Socket < BasicSocket
  AF_UNSPEC    = 0
  AF_UNIX      = 1
  AF_INET      = 2
  AF_INET6     = 10
  AF_LOCAL     = 1
  SOCK_STREAM  = 1
  SOCK_DGRAM   = 2
  SOCK_RAW     = 3
  IPPROTO_IP   = 0
  IPPROTO_TCP  = 6
  IPPROTO_UDP  = 17
  IPPROTO_IPV6 = 41
  IPPORT_RESERVED = 1024

  def self.gethostname = "localhost"
  def self.getaddrinfo(*) = []
  def self.gethostbyname(*) = nil
  def self.gethostbyaddr(*) = nil
  def self.ip_address_list = []
  def self.pack_sockaddr_in(port, host) = ""
  def self.unpack_sockaddr_in(addr) = [0, "127.0.0.1"]
end

class Addrinfo
  attr_reader :afamily, :pfamily, :socktype, :protocol
  def initialize(*); end
  def self.getaddrinfo(*) = []
  def self.tcp(host, port) = new
  def self.udp(host, port) = new
  def ip? = false
  def ip_address = "127.0.0.1"
  def ip_port = 0
  def ipv4? = false
  def ipv6? = false
end

class TCPSocket   < BasicSocket; def initialize(*); end; end
class TCPServer   < BasicSocket; def initialize(*); end; end
class UDPSocket   < BasicSocket; def initialize(*); end; end
class UNIXSocket  < BasicSocket; def initialize(*); end; end
class UNIXServer  < BasicSocket; def initialize(*); end; end
