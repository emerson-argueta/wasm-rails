# WASM stub — rails-html-sanitizer depends on loofah+nokogiri.
# In WASM, all data is user-local, so sanitizers pass through without modification.
# Defines both Rails::Html (legacy) and Rails::HTML4/HTML5 (rails-html-sanitizer 1.6+).

require "loofah"

module Rails
  # Base sanitizer shared by all namespaces
  module HtmlSanitizerBase
    class Sanitizer
      def sanitize(html, options = {}) = html.to_s
      def self.full_sanitizer        = FullSanitizer.new
      def self.link_sanitizer        = LinkSanitizer.new
      def self.safe_list_sanitizer   = SafeListSanitizer.new
      def self.white_list_sanitizer  = safe_list_sanitizer
      def self.best_supported_vendor = Rails::HTML4
    end

    class FullSanitizer < Sanitizer
      def sanitize(html, options = {})
        return "" if html.nil?
        html.to_s.gsub(/<[^>]+>/, "")
      end
    end

    class LinkSanitizer     < Sanitizer; end
    class SafeListSanitizer < Sanitizer; end
    WhiteListSanitizer = SafeListSanitizer

    module Scrubbers
      class Strip    < ::Loofah::Scrubber; end
      class SafeList < ::Loofah::Scrubber; end
      WhiteList = SafeList
    end
  end

  # Legacy namespace (rails-html-sanitizer < 1.6)
  module Html
    include HtmlSanitizerBase
    Sanitizer         = HtmlSanitizerBase::Sanitizer
    FullSanitizer     = HtmlSanitizerBase::FullSanitizer
    LinkSanitizer     = HtmlSanitizerBase::LinkSanitizer
    SafeListSanitizer = HtmlSanitizerBase::SafeListSanitizer
    WhiteListSanitizer = SafeListSanitizer
    Scrubbers         = HtmlSanitizerBase::Scrubbers
  end

  # Rails::HTML is the top-level namespace referenced by railties load_defaults
  module HTML
    Sanitizer         = HtmlSanitizerBase::Sanitizer
    FullSanitizer     = HtmlSanitizerBase::FullSanitizer
    LinkSanitizer     = HtmlSanitizerBase::LinkSanitizer
    SafeListSanitizer = HtmlSanitizerBase::SafeListSanitizer
    WhiteListSanitizer = SafeListSanitizer
    Scrubbers         = HtmlSanitizerBase::Scrubbers

    def self.best_supported_vendor = Rails::HTML4
  end

  # New namespaces (rails-html-sanitizer 1.6+ / Rails 8)
  # ActionView::SanitizeHelper defaults to Rails::HTML4
  module HTML4
    Sanitizer         = HtmlSanitizerBase::Sanitizer
    FullSanitizer     = HtmlSanitizerBase::FullSanitizer
    LinkSanitizer     = HtmlSanitizerBase::LinkSanitizer
    SafeListSanitizer = HtmlSanitizerBase::SafeListSanitizer
    WhiteListSanitizer = SafeListSanitizer
    Scrubbers         = HtmlSanitizerBase::Scrubbers

    def self.full_sanitizer        = FullSanitizer.new
    def self.link_sanitizer        = LinkSanitizer.new
    def self.safe_list_sanitizer   = SafeListSanitizer.new
    def self.best_supported_vendor = self
  end

  module HTML5
    Sanitizer         = HtmlSanitizerBase::Sanitizer
    FullSanitizer     = HtmlSanitizerBase::FullSanitizer
    LinkSanitizer     = HtmlSanitizerBase::LinkSanitizer
    SafeListSanitizer = HtmlSanitizerBase::SafeListSanitizer
    WhiteListSanitizer = SafeListSanitizer
    Scrubbers         = HtmlSanitizerBase::Scrubbers

    def self.full_sanitizer        = FullSanitizer.new
    def self.link_sanitizer        = LinkSanitizer.new
    def self.safe_list_sanitizer   = SafeListSanitizer.new
    def self.best_supported_vendor = self
  end
end
