-- Function to get function with files
CREATE OR REPLACE FUNCTION get_edge_function_with_files(function_name TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', ef.id,
    'name', ef.name,
    'slug', ef.slug,
    'status', ef.status,
    'version', ef.version,
    'entrypoint_path', ef.entrypoint_path,
    'import_map_path', ef.import_map_path,
    'verify_jwt', ef.verify_jwt,
    'created_at', ef.created_at,
    'updated_at', ef.updated_at,
    'files', COALESCE(
      json_agg(
        json_build_object(
          'name', eff.name,
          'content', eff.content
        )
      ) FILTER (WHERE eff.id IS NOT NULL),
      '[]'::json
    )
  )
  INTO result
  FROM edge_functions ef
  LEFT JOIN edge_function_files eff ON ef.id = eff.function_id
  WHERE ef.name = function_name
  GROUP BY ef.id, ef.name, ef.slug, ef.status, ef.version, 
           ef.entrypoint_path, ef.import_map_path, ef.verify_jwt, 
           ef.created_at, ef.updated_at;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to list all functions with files
CREATE OR REPLACE FUNCTION list_edge_functions_with_files()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'id', ef.id,
      'name', ef.name,
      'slug', ef.slug,
      'status', ef.status,
      'version', ef.version,
      'entrypoint_path', ef.entrypoint_path,
      'import_map_path', ef.import_map_path,
      'verify_jwt', ef.verify_jwt,
      'created_at', ef.created_at,
      'updated_at', ef.updated_at,
      'files', COALESCE(files.file_list, '[]'::json)
    )
  )
  INTO result
  FROM edge_functions ef
  LEFT JOIN (
    SELECT 
      function_id,
      json_agg(
        json_build_object(
          'name', name,
          'content', content
        )
      ) as file_list
    FROM edge_function_files
    GROUP BY function_id
  ) files ON ef.id = files.function_id
  ORDER BY ef.created_at DESC;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deploy a function (upsert with version increment)
CREATE OR REPLACE FUNCTION deploy_edge_function(
  function_name TEXT,
  function_files JSON[],
  entrypoint_path TEXT DEFAULT 'index.ts',
  import_map_path TEXT DEFAULT NULL,
  verify_jwt BOOLEAN DEFAULT true
)
RETURNS JSON AS $$
DECLARE
  function_id UUID;
  new_version INTEGER;
  file_data JSON;
  result JSON;
BEGIN
  -- Check if function exists
  SELECT id, version INTO function_id, new_version
  FROM edge_functions 
  WHERE name = function_name;
  
  IF function_id IS NOT NULL THEN
    -- Update existing function
    new_version := new_version + 1;
    
    UPDATE edge_functions 
    SET 
      version = new_version,
      entrypoint_path = deploy_edge_function.entrypoint_path,
      import_map_path = deploy_edge_function.import_map_path,
      verify_jwt = deploy_edge_function.verify_jwt,
      updated_at = NOW()
    WHERE id = function_id;
    
    -- Delete existing files
    DELETE FROM edge_function_files WHERE function_id = deploy_edge_function.function_id;
  ELSE
    -- Create new function
    new_version := 1;
    
    INSERT INTO edge_functions (
      name, slug, version, entrypoint_path, import_map_path, verify_jwt
    ) VALUES (
      function_name, function_name, new_version, 
      deploy_edge_function.entrypoint_path, 
      deploy_edge_function.import_map_path, 
      deploy_edge_function.verify_jwt
    )
    RETURNING id INTO function_id;
  END IF;
  
  -- Insert new files
  FOREACH file_data IN ARRAY function_files
  LOOP
    INSERT INTO edge_function_files (function_id, name, content)
    VALUES (
      function_id,
      file_data->>'name',
      file_data->>'content'
    );
  END LOOP;
  
  -- Create deployment record
  INSERT INTO edge_function_deployments (function_id, version, status)
  VALUES (function_id, new_version, 'deployed');
  
  -- Return the deployed function
  SELECT json_build_object(
    'id', id,
    'name', name,
    'slug', slug,
    'status', status,
    'version', version,
    'entrypoint_path', entrypoint_path,
    'import_map_path', import_map_path,
    'verify_jwt', verify_jwt,
    'created_at', created_at,
    'updated_at', updated_at
  )
  INTO result
  FROM edge_functions
  WHERE id = function_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION get_edge_function_with_files(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION list_edge_functions_with_files() TO service_role;
GRANT EXECUTE ON FUNCTION deploy_edge_function(TEXT, JSON[], TEXT, TEXT, BOOLEAN) TO service_role;
