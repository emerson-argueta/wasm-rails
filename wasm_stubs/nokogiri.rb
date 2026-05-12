# WASM stub — Nokogiri is a C extension not available in ruby+stdlib.wasm.
# Provides minimal classes so loofah and rails-html-sanitizer can load.

module Nokogiri
  VERSION        = "1.18.0"
  LIBXML_VERSION = "2.9.14"

  module HTML
    def self.parse(html, url = nil, encoding = nil, options = 0)
      Document.new(html.to_s)
    end
    def self.fragment(html, encoding = nil, options = 0)
      DocumentFragment.new(html.to_s)
    end

    class Document
      def initialize(html = ""); @html = html.to_s; end
      def to_s = @html
      def text = @html.gsub(/<[^>]+>/, "")
      def inner_html = @html
      def css(*) = NodeSet.new
      def xpath(*) = NodeSet.new
      def search(*) = NodeSet.new
      def at_css(*) = nil
      def at_xpath(*) = nil
      def encoding = "UTF-8"
      def errors = []
    end

    class DocumentFragment < Document; end
  end

  HTML4 = HTML

  module XML
    Node = HTML::Document

    class Document < HTML::Document; end
    class DocumentFragment < HTML::DocumentFragment; end

    class NodeSet
      include Enumerable
      def initialize(items = []) = @items = items
      def each(&b) = @items.each(&b)
      def to_s = @items.map(&:to_s).join
      def text = @items.map { |n| n.respond_to?(:text) ? n.text : n.to_s }.join
      def size = @items.size
      def empty? = @items.empty?
      def [](i) = @items[i]
      def first = @items.first
      def css(*) = NodeSet.new
      def xpath(*) = NodeSet.new
    end

    module SAX
      class Document; end
      class Parser
        def initialize(doc = nil); end
        def parse(data); end
      end
    end
  end

  module CSS
    def self.xpath_for(*) = ""
  end
end
