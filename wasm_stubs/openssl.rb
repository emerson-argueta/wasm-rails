# WASM stub — OpenSSL C extension is not included in ruby+stdlib.wasm.
# Provides the minimal interface ActiveSupport needs for MessageEncryptor,
# MessageVerifier, and EncryptedConfiguration at load time.
# Real encryption is not used in WASM (no server secrets, local-only data).

module OpenSSL
  VERSION = "3.0.0"
  OPENSSL_VERSION = "OpenSSL 3.0.0 (wasm stub)"

  # Must be a class (not module) so that SHA256 < OpenSSL::Digest returns true.
  # ActiveSupport::KeyGenerator checks this with klass < OpenSSL::Digest.
  class Digest
    def self.hexdigest(data)
      require "digest"
      ::Digest::SHA256.hexdigest(data.to_s)
    end
    def self.digest(data) = [self.hexdigest(data)].pack("H*")
    def hexdigest(data)   = self.class.hexdigest(data)
    def digest(data)      = self.class.digest(data)
    def initialize(*); end
    def update(*); self; end
    def reset; self; end
    def finish = ""

    class SHA1 < Digest
      def self.hexdigest(data)
        require "digest"; ::Digest::SHA1.hexdigest(data.to_s)
      end
    end

    class SHA256 < Digest
      def self.hexdigest(data)
        require "digest"; ::Digest::SHA256.hexdigest(data.to_s)
      end
    end

    class SHA384 < Digest
      def self.hexdigest(data)
        require "digest"; ::Digest::SHA384.hexdigest(data.to_s)
      end
    end

    class SHA512 < Digest
      def self.hexdigest(data)
        require "digest"; ::Digest::SHA512.hexdigest(data.to_s)
      end
    end
  end

  # Real OpenSSL::Cipher is a class (not a module), so .new works directly.
  class Cipher
    CipherError = Class.new(StandardError)

    def initialize(algo); @algo = algo.to_s; end
    def authenticated?; @algo.upcase.include?("GCM") || @algo.upcase.include?("CCM"); end
    def encrypt; self; end
    def decrypt; self; end
    def key=(k); end
    def iv=(v); end
    def iv_len = 12
    def key_len = 32
    def padding=(v); end
    def auth_data=(d); end
    def auth_tag(len = 16) = ("\x00" * (len || 16))
    def auth_tag=(t); end
    def update(data) = data
    def final = ""
    def random_key = ("\x00" * 32)
    def random_iv  = ("\x00" * 12)
    def block_size = 16

    class AES < Cipher; end
  end

  module HMAC
    def self.digest(digest, key, data) = ""
    def self.hexdigest(digest, key, data) = ("00" * 32)
  end

  module PKCS5
    def self.pbkdf2_hmac(secret, salt, iterations, length, digest)
      require "digest"
      base = ::Digest::SHA256.digest("#{secret}:#{salt}:#{iterations}")
      (base * ((length / 32) + 2))[0, length]
    end
  end

  module KDF
    def self.hkdf(secret, salt:, info:, length:, hash:) = ("\x00" * length)
  end

  module Random
    def self.random_bytes(n = 16) = SecureRandom.random_bytes(n)
  end

  module PKey
    class PKey; end
    class RSA < PKey
      def initialize(*); end
      def public_key = self
      def private? = false
      def sign(*) = ""
      def verify(*) = false
    end
  end

  module SSL
    VERIFY_NONE = 0
    VERIFY_PEER = 1
  end

  class BN
    def initialize(n = 0, base = 10); @n = n.to_i; end
    def to_i = @n
    def to_s(base = 10) = @n.to_s(base)
  end

  class X509
    class Certificate; end
    class Store; end
  end
end
