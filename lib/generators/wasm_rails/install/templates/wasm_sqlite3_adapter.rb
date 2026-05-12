require 'js'

# wasm_stubs/sqlite3.rb (loaded via /stubs on $LOAD_PATH) provides the SQLite3
# module stubs. sqlite3_adapter.rb's `gem 'sqlite3'` and `require 'sqlite3'`
# both resolve there without the native C extension.
#
# We still need the fake gem spec so the `gem 'sqlite3', '>= 2.1'` version
# check in sqlite3_adapter.rb passes.
unless Gem.loaded_specs['sqlite3']
  fake = Gem::Specification.new { |s| s.name = 'sqlite3'; s.version = Gem::Version.new('2.5.0') }
  Gem.loaded_specs['sqlite3'] = fake
end

require 'active_record/connection_adapters/sqlite3_adapter'

module ActiveRecord
  module ConnectionAdapters
    # Thin JS-bridge wrapper around the real SQLite3Adapter.
    # All query pipeline (perform_query, internal_exec_query, write_query?,
    # column reflection, type mapping) is inherited from SQLite3Adapter.
    # Only the raw connection object is replaced with a JS proxy.
    class WasmSqlite3Adapter < SQLite3Adapter
      class ExternalInterface
        def initialize
          @js = JS.global[:sqlite4rails]
        end

        # Called by SQLite3Adapter to execute SQL. Returns a Statement-like object.
        def prepare(sql)
          Statement.new(@js, sql)
        end

        def execute(sql)
          stmt = prepare(sql)
          stmt.result
        end

        # Compatibility shims SQLite3Adapter calls on the connection object.
        def transaction(mode = nil)
          mode = nil if mode == :deferred
          execute("begin #{mode} transaction".strip)
          if block_given?
            begin
              yield self
              commit
            rescue
              rollback
              raise
            end
          end
        end

        def commit   = execute('commit transaction')
        def rollback = execute('rollback transaction')

        def changes       = @js.call(:changes).to_i
        def total_changes = @js.call(:changes).to_i

        def busy_timeout(_t) = nil
        def busy_handler_timeout=(_t); end
        def closed? = false
        def results_as_hash = true
        def results_as_hash=(_v); end
      end

      class Statement
        attr_reader :columns, :rows

        def initialize(js_interface, sql)
          @js       = js_interface
          @base_sql = sql.to_s
          @sql      = @base_sql
          @executed = false
          @columns  = []
          @rows     = []
        end

        # Substitute bound parameters into the SQL (? placeholders).
        def bind_params(*params)
          params = params.flatten(1)
          return if params.empty?
          i = -1
          @sql = @base_sql.gsub('?') do
            i += 1
            quote_value(params[i])
          end
        end

        def step
          execute
          nil
        end

        def execute
          return if @executed
          @executed = true

          res      = @js.call(:exec, @sql)
          @columns = res[:cols].to_a.map(&:to_s)
          @rows    = res[:rows].to_a.map do |row|
            row.to_a.map do |val|
              str = val.to_s
              case val.typeof
              when 'string'  then str
              when 'boolean' then str == 'true'
              when 'number'  then str.include?('.') ? val.to_f : val.to_i
              else str == 'null' ? nil : str
              end
            end
          end
        end

        def column_count = (execute; @columns.size)
        def types        = (execute; Array.new(@columns.size)) # nil → default type
        def to_a         = (execute; @rows)
        def close; end
        def reset!; @executed = false; @sql = @base_sql; end

        private

        def quote_value(v)
          case v
          when NilClass   then 'NULL'
          when TrueClass  then '1'
          when FalseClass then '0'
          when Numeric    then v.to_s
          else "'#{v.to_s.gsub("'", "''")}'"
          end
        end
      end

      class << self
        def database_exists?(_config) = true
        def new_client(_config)       = ExternalInterface.new
      end

      def initialize(...)
        # Bypass SQLite3Adapter's native-gem constructor; use AbstractAdapter's.
        AbstractAdapter.instance_method(:initialize).bind_call(self, ...)
        @prepared_statements  = false
        @memory_database      = false
        @connection_parameters = @config.merge(
          database: @config[:database].to_s,
          results_as_hash: true
        )
        @use_insert_returning = @config.key?(:insert_returning) \
          ? self.class.type_cast_config_to_boolean(@config[:insert_returning]) \
          : true
      end

      def database_exists? = true
      def database_version  = SQLite3Adapter::Version.new('3.45.1')
    end
  end
end

ActiveRecord::ConnectionAdapters.register(
  'wasm_sqlite3',
  'ActiveRecord::ConnectionAdapters::WasmSqlite3Adapter'
) { ActiveRecord::ConnectionAdapters::WasmSqlite3Adapter }
