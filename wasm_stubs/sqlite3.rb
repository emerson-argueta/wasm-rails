# WASM stub for the sqlite3 C extension.
# Loaded via /stubs (prepended to $LOAD_PATH) before any gem path, so
# `require 'sqlite3'` resolves here instead of trying to load the native .so.
# Provides enough constants and classes for sqlite3_adapter.rb to load;
# the actual DB operations are handled by WasmSqlite3Adapter::ExternalInterface.

module SQLite3
  VERSION = '2.5.0'

  module ForkSafety
    def self.suppress_warnings!; end
  end

  class Exception < StandardError; end
  class BusyException < Exception; end
  class FullException < Exception; end
  class IOException < Exception; end
  class AccessDeniedException < Exception; end
  class ProtocolException < Exception; end
  class RangeException < Exception; end
  class NotADatabaseException < Exception; end
  class MisuseException < Exception; end
  class CantOpenException < Exception; end
  class NotFoundException < Exception; end
  class CorruptException < Exception; end
  class ConstraintException < Exception; end

  module Constants
    module TextRep
      UTF8    = 1
      UTF16LE = 2
      UTF16BE = 3
      UTF16   = 4
      ANY     = 5
    end

    module ColumnType
      INTEGER = 1
      FLOAT   = 2
      TEXT    = 3
      BLOB    = 4
      NULL    = 5
    end

    module Open
      READONLY  = 0x00000001
      READWRITE = 0x00000002
      CREATE    = 0x00000004
      NOMUTEX   = 0x00008000
      FULLMUTEX = 0x00010000
    end
  end

  module Pragmas; end

  class Statement
    attr_reader :remainder

    def initialize(db, sql); end
    def close; end
    def step; nil; end
    def columns; []; end
    def types; []; end
    def reset!; end
    def bind_params(*); end
    def execute(*); []; end
    def done?; true; end
    def must_be_open!; end
    def column_count; 0; end
  end

  class Database
    def self.quote(s) = s.gsub("'", "''")

    def initialize(file = '', options = {}); end
    def close; end
    def closed?; false; end
    def execute(sql, *binds); []; end
    def execute2(sql, *binds); []; end
    def query(sql, *binds); []; end
    def prepare(sql); Statement.new(self, sql); end
    def transaction(mode = :deferred); yield self if block_given?; end
    def commit; end
    def rollback; end
    def changes; 0; end
    def last_insert_row_id; 0; end
    def errmsg; ''; end
    def errcode; 0; end
    def complete?(sql); true; end
    def busy_handler_timeout=(v); end
    def busy_timeout=(v); end
    def busy_timeout(ms); end
    def extended_result_codes=(v); end
    def results_as_hash=(v); end
    def type_translation=(v); end
    def encoding; 'UTF-8'; end
    def authorizer=(v); end
    def trace(&block); end

    include Pragmas
  end
end
