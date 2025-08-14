import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { z } from 'zod';
import type { InitData } from '@supabase/mcp-utils';
import packageJson from '../../package.json' with { type: 'json' };
import type {
  ApplyMigrationOptions,
  Branch,
  CreateBranchOptions,
  CreateProjectOptions,
  DeployEdgeFunctionOptions,
  EdgeFunction,
  ExecuteSqlOptions,
  GetLogsOptions,
  Migration,
  Organization,
  Project,
  ResetBranchOptions,
  StorageBucket,
  StorageConfig,
  SupabasePlatform
} from './types.js';
import { executeSqlOptionsSchema } from './types.js';

const { version } = packageJson;

export type SelfHostedPlatformOptions = {
  /**
   * The URL of the self-hosted Supabase instance
   */
  hostUrl: string;

  /**
   * The service role key for the self-hosted instance
   */
  serviceRoleKey: string;

  /**
   * Optional PostgreSQL connection string for direct database access
   */
  pgConnection?: string;
};

/**
 * Creates a Supabase platform implementation for self-hosted instances.
 */
export function createSelfHostedPlatform(
  options: SelfHostedPlatformOptions
): SupabasePlatform {
  const { hostUrl, serviceRoleKey, pgConnection } = options;

  // Create Supabase client for REST API access
  const supabase = createClient(hostUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Set up PG client if connection string is provided
  let pgClient: Client | null = null;
  
  if (pgConnection) {
    pgClient = new Client({
      connectionString: pgConnection
    });
  }

  const platform: SupabasePlatform = {
    async init(info: InitData) {
      if (pgClient) {
        try {
          await pgClient.connect();
        } catch (error) {
          console.error('Failed to connect to PostgreSQL database:', error);
          pgClient = null; // Reset to null so we'll use the REST API instead
        }
      }
    },

    // Database operations
    async executeSql<T>(projectId: string, options: ExecuteSqlOptions): Promise<T[]> {
      const { query, read_only } = executeSqlOptionsSchema.parse(options);

      // Try using direct PG connection if available
      if (pgClient) {
        try {
          // If read-only is specified, use a transaction with READ ONLY mode
          if (read_only) {
            await pgClient.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY');
            try {
              const result = await pgClient.query(query);
              await pgClient.query('COMMIT');
              return result.rows as T[];
            } catch (error) {
              await pgClient.query('ROLLBACK');
              throw error;
            }
          } else {
            // Regular query
            const result = await pgClient.query(query);
            return result.rows as T[];
          }
        } catch (error) {
          console.error('Error executing SQL with direct PG connection:', error);
          // Fall back to REST API
        }
      }

      // Fall back to REST API if PG connection failed or isn't available
      const { data, error } = await supabase.rpc('exec_sql', {
        query,
        read_only: read_only || false
      });

      if (error) {
        throw new Error(`Failed to execute SQL query: ${error.message}`);
      }

      return data as unknown as T[];
    },

    async listMigrations(projectId: string): Promise<Migration[]> {
      if (pgClient) {
        try {
          // Try to query the migrations table directly
          const result = await pgClient.query(`
            SELECT version, name 
            FROM supabase_migrations.schema_migrations 
            ORDER BY version DESC
          `);
          
          return result.rows as Migration[];
        } catch (error) {
          console.error('Error querying migrations with direct PG connection:', error);
          // Fall back to empty list if table doesn't exist
        }
      }
      
      // In self-hosted mode, we might not have access to migrations
      // Return an empty array since there's no management API equivalent
      return [];
    },

    async applyMigration(
      projectId: string,
      options: ApplyMigrationOptions
    ): Promise<void> {
      const { name, query } = options;

      // For migrations, we need to insert into the migrations table and execute the query
      if (pgClient) {
        try {
          await pgClient.query('BEGIN');
          try {
            // Execute the migration SQL
            await pgClient.query(query);
            
            // Insert into the migrations table
            const timestamp = new Date().toISOString().replace(/[-T:\.Z]/g, '').substring(0, 14);
            await pgClient.query(`
              INSERT INTO supabase_migrations.schema_migrations (version, name)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `, [`${timestamp}`, name]);
            
            await pgClient.query('COMMIT');
          } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
          }
          return;
        } catch (error) {
          console.error('Error applying migration with direct PG connection:', error);
          // Fall back to just executing the SQL
        }
      }

      // If we can't update the migrations table, just execute the SQL
      await this.executeSql(projectId, { query });
    },

    // Account operations - limited in self-hosted mode
    async listOrganizations(): Promise<Pick<Organization, 'id' | 'name'>[]> {
      // Self-hosted instances don't have organizations in the same way as cloud
      return [{ id: 'self-hosted', name: 'Self-Hosted' }];
    },

    async getOrganization(): Promise<Organization> {
      // Return a placeholder organization for self-hosted
      return {
        id: 'self-hosted',
        name: 'Self-Hosted',
        plan: 'self-hosted',
        allowed_release_channels: ['stable'],
        opt_in_tags: [],
      };
    },

    async listProjects(): Promise<Project[]> {
      // In self-hosted mode, there's just one project
      return [{
        id: 'default',
        organization_id: 'self-hosted',
        name: 'Default Project',
        status: 'active',
        created_at: new Date().toISOString(),
        region: 'self-hosted',
      }];
    },

    async getProject(): Promise<Project> {
      // Return the default project
      return {
        id: 'default',
        organization_id: 'self-hosted',
        name: 'Default Project',
        status: 'active',
        created_at: new Date().toISOString(),
        region: 'self-hosted',
      };
    },

    async createProject(): Promise<Project> {
      throw new Error('Creating projects is not supported in self-hosted mode');
    },

    async pauseProject(): Promise<void> {
      throw new Error('Pausing projects is not supported in self-hosted mode');
    },

    async restoreProject(): Promise<void> {
      throw new Error('Restoring projects is not supported in self-hosted mode');
    },

    // Edge functions
    async listEdgeFunctions(): Promise<EdgeFunction[]> {
      // Note: supabase-js v2 doesn't have functions.list() method
      // This is a workaround until we can update to v3
      try {
        // @ts-ignore - Handling this dynamically since it might exist in some versions
        const result = await supabase.functions.list();
        const { data, error } = result;
        
        if (error) {
          throw new Error(`Failed to list edge functions: ${error.message}`);
        }
        
        if (!data) {
          return [];
        }
        
        // Convert the function data to the expected format
        return data.map((fn: any) => ({
          id: fn.id,
          slug: fn.slug,
          name: fn.name,
          status: fn.status,
          version: fn.version,
          verify_jwt: fn.verify_jwt,
          created_at: fn.created_at ? Date.parse(fn.created_at) : undefined,
          updated_at: fn.updated_at ? Date.parse(fn.updated_at) : undefined,
          files: [] // Files need to be fetched separately
        }));
      } catch (e) {
        console.error('Error listing functions:', e);
        return [];
      }
    },

    async getEdgeFunction(projectId: string, functionSlug: string): Promise<EdgeFunction> {
      // There's no direct API to get a function with its code
      // We'd need to download the function code manually
      throw new Error('Getting edge function details is not fully supported in self-hosted mode');
    },

    async deployEdgeFunction(
      projectId: string,
      options: DeployEdgeFunctionOptions
    ): Promise<Omit<EdgeFunction, 'files'>> {
      // Self-hosted edge function deployment requires building a ZIP file
      // This is complex and would require additional dependencies
      throw new Error('Deploying edge functions via MCP is not supported in self-hosted mode');
    },

    // Debugging
    async getLogs(projectId: string, options: GetLogsOptions): Promise<unknown> {
      // Self-hosted instances don't have a logs API
      // We could potentially query the logs from the database if we know the schema
      throw new Error('Getting logs is not supported in self-hosted mode');
    },

    async getSecurityAdvisors(): Promise<unknown> {
      // Self-hosted instances don't have security advisors
      throw new Error('Security advisors are not available in self-hosted mode');
    },

    async getPerformanceAdvisors(): Promise<unknown> {
      // Self-hosted instances don't have performance advisors
      throw new Error('Performance advisors are not available in self-hosted mode');
    },

    // Development
    async getProjectUrl(): Promise<string> {
      // For self-hosted, this is just the host URL
      return hostUrl;
    },

    async getAnonKey(): Promise<string> {
      // This is a placeholder - in a real implementation, you'd need to 
      // get the anon key from somewhere (config, environment, etc.)
      throw new Error('Getting anon key is not supported in self-hosted mode');
    },

    async generateTypescriptTypes(projectId: string) {
      // For self-hosted, we'd need to generate the types directly from the database
      if (pgClient) {
        try {
          // Generate types from the database schema
          // This is a simplified approach - in reality, you'd need more sophisticated code
          const tablesResult = await pgClient.query(`
            SELECT 
              table_name,
              column_name,
              data_type
            FROM 
              information_schema.columns
            WHERE 
              table_schema = 'public'
            ORDER BY
              table_name, ordinal_position
          `);

          // Build TypeScript types from the result
          const tables: Record<string, Record<string, string>> = {};
          
          tablesResult.rows.forEach((row: { table_name: string; column_name: string; data_type: string }) => {
            const tableName = row.table_name;
            if (!tables[tableName]) {
              tables[tableName] = {};
            }
            const tableObj = tables[tableName];
            if (tableObj) {
              tableObj[row.column_name] = mapPgTypeToTs(row.data_type);
            }
          });

          // Generate TypeScript interfaces
          let types = '// Generated types for Supabase database\n\n';
          types += 'export type Database = {\n';
          types += '  public: {\n';
          types += '    Tables: {\n';
          
          Object.entries(tables).forEach(([tableName, columns]) => {
            types += `      ${tableName}: {\n`;
            types += '        Row: {\n';
            
            Object.entries(columns).forEach(([colName, colType]) => {
              types += `          ${colName}: ${colType}\n`;
            });
            
            types += '        }\n';
            types += '        Insert: {\n';
            
            Object.entries(columns).forEach(([colName, colType]) => {
              types += `          ${colName}?: ${colType}\n`;
            });
            
            types += '        }\n';
            types += '        Update: {\n';
            
            Object.entries(columns).forEach(([colName, colType]) => {
              types += `          ${colName}?: ${colType}\n`;
            });
            
            types += '        }\n';
            types += '      }\n';
          });
          
          types += '    }\n';
          types += '  }\n';
          types += '}\n';
          
          return { types };
        } catch (error) {
          console.error('Error generating TypeScript types:', error);
          throw new Error('Failed to generate TypeScript types');
        }
      }

      throw new Error('Generating TypeScript types is not supported without a direct database connection');
    },

    // Branching - not supported in self-hosted mode
    async listBranches(): Promise<Branch[]> {
      // Self-hosted instances don't support branching
      return [];
    },

    async createBranch(): Promise<Branch> {
      throw new Error('Branching is not supported in self-hosted mode');
    },

    async deleteBranch(): Promise<void> {
      throw new Error('Branching is not supported in self-hosted mode');
    },

    async mergeBranch(): Promise<void> {
      throw new Error('Branching is not supported in self-hosted mode');
    },

    async resetBranch(): Promise<void> {
      throw new Error('Branching is not supported in self-hosted mode');
    },

    async rebaseBranch(): Promise<void> {
      throw new Error('Branching is not supported in self-hosted mode');
    },

    // Storage
    async getStorageConfig(): Promise<StorageConfig> {
      // Return a default config for self-hosted instances
      return {
        fileSizeLimit: 5242880, // 5MB
        features: {
          imageTransformation: { enabled: false },
          s3Protocol: { enabled: false }
        }
      };
    },

    async updateStorageConfig(): Promise<void> {
      throw new Error('Updating storage config is not supported in self-hosted mode');
    },

    async listAllBuckets(projectId: string): Promise<StorageBucket[]> {
      // Get buckets from the Storage API
      const { data, error } = await supabase.storage.listBuckets();
      
      if (error) {
        throw new Error(`Failed to list storage buckets: ${error.message}`);
      }

      // Convert to the expected format
      return data.map((bucket: { id: string; name: string; created_at: string; public?: boolean }) => ({
        id: bucket.id,
        name: bucket.name,
        owner: 'self-hosted',
        created_at: bucket.created_at,
        updated_at: bucket.created_at, // Using created_at as updated_at is not provided
        public: bucket.public || false
      }));
    },
  };

  return platform;
}

// Helper to map PostgreSQL types to TypeScript types
function mapPgTypeToTs(pgType: string): string {
  switch (pgType.toLowerCase()) {
    case 'integer':
    case 'numeric':
    case 'decimal':
    case 'real':
    case 'double precision':
    case 'smallint':
    case 'bigint':
    case 'money':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'Record<string, unknown>';
    case 'timestamp':
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'date':
      return 'string';
    case 'uuid':
    case 'text':
    case 'character varying':
    case 'varchar':
    case 'char':
    case 'character':
    default:
      return 'string';
  }
}