# WASM stub — Loofah depends on Nokogiri which is not available in WASM.
# Provides minimal interface for rails-html-sanitizer to load.

require "nokogiri"

module Loofah
  VERSION = "2.25.1"

  def self.document(html, *) = Nokogiri::HTML::Document.new(html.to_s)
  def self.fragment(html, *) = Nokogiri::HTML::DocumentFragment.new(html.to_s)
  def self.scrub_document(html, scrubber) = document(html)
  def self.scrub_fragment(html, scrubber) = fragment(html)

  class Scrubber
    STOP = :stop
    CONTINUE = nil
    attr_accessor :direction
    def initialize(**opts); @direction = opts[:direction] || :bottom_up; end
    def scrub(node) = nil
  end

  class StripScrubber    < Scrubber; end
  class WhitelistScrubber < Scrubber; end
  class SafeListScrubber  < Scrubber; end

  module HTML5
    def self.parse(html, *) = Nokogiri::HTML::Document.new(html.to_s)
    def self.fragment(html, *) = Nokogiri::HTML::DocumentFragment.new(html.to_s)

    class Document         < Nokogiri::HTML::Document; end
    class DocumentFragment < Nokogiri::HTML::DocumentFragment; end
    class SafeDocument         < Document; end
    class SafeDocumentFragment < DocumentFragment; end
  end

  module XssFoliate
    def self.included(base); end
  end
end
