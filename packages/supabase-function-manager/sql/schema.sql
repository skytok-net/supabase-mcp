-- Store edge function definitions
CREATE TABLE IF NOT EXISTS edge_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  version INTEGER DEFAULT 1,
  entrypoint_path VARCHAR(255) DEFAULT 'index.ts',
  import_map_path VARCHAR(255),
  verify_jwt BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store function files
CREATE TABLE IF NOT EXISTS edge_function_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id UUID REFERENCES edge_functions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store deployment history
CREATE TABLE IF NOT EXISTS edge_function_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id UUID REFERENCES edge_functions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_edge_functions_name ON edge_functions(name);
CREATE INDEX IF NOT EXISTS idx_edge_functions_slug ON edge_functions(slug);
CREATE INDEX IF NOT EXISTS idx_edge_function_files_function_id ON edge_function_files(function_id);
CREATE INDEX IF NOT EXISTS idx_edge_function_deployments_function_id ON edge_function_deployments(function_id);

-- Enable Row Level Security
ALTER TABLE edge_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_function_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_function_deployments ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can manage edge functions" 
  ON edge_functions 
  FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage edge function files" 
  ON edge_function_files 
  FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage edge function deployments" 
  ON edge_function_deployments 
  FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role');
