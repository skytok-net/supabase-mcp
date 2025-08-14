import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { method } = req
    const url = new URL(req.url)
    
    // Authenticate using Supabase service role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing or invalid authorization header' }), 
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    const token = authHeader.split(' ')[1]
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      token, // Use the provided token (should be service role key)
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify token is valid service role by trying to access auth admin
    const { error: authError } = await supabase.auth.admin.listUsers()
    if (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid service role key' }), 
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    switch (method) {
      case 'GET':
        if (url.pathname === '/functions') {
          return await listFunctions(supabase)
        } else if (url.pathname.startsWith('/functions/')) {
          const functionName = url.pathname.split('/')[2]
          if (!functionName) {
            return new Response(
              JSON.stringify({ error: 'Function name is required' }), 
              { 
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }
          return await getFunction(supabase, functionName)
        }
        break
        
      case 'POST':
        if (url.pathname === '/functions') {
          const functionData = await req.json()
          return await deployFunction(supabase, functionData)
        }
        break
        
      case 'DELETE':
        if (url.pathname.startsWith('/functions/')) {
          const functionName = url.pathname.split('/')[2]
          if (!functionName) {
            return new Response(
              JSON.stringify({ error: 'Function name is required' }), 
              { 
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }
          return await deleteFunction(supabase, functionName)
        }
        break
    }
    
    return new Response(
      JSON.stringify({ error: 'Not Found' }), 
      { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Function manager error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function listFunctions(supabase: any) {
  try {
    // Get all edge functions with their files
    const { data: functions, error: functionsError } = await supabase
      .from('edge_functions')
      .select(`
        *,
        edge_function_files (
          name,
          content
        )
      `)
      .order('created_at', { ascending: false })

    if (functionsError) {
      console.error('Error fetching functions:', functionsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch functions' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Transform the data to match the expected EdgeFunction format
    const edgeFunctions = functions.map((func: any) => ({
      id: func.id,
      slug: func.slug,
      version: func.version,
      name: func.name,
      status: func.status,
      entrypoint_path: func.entrypoint_path,
      import_map_path: func.import_map_path,
      import_map: !!func.import_map_path,
      verify_jwt: func.verify_jwt,
      created_at: func.created_at,
      updated_at: func.updated_at,
      files: func.edge_function_files.map((file: any) => ({
        name: file.name,
        content: file.content
      }))
    }))

    return new Response(
      JSON.stringify(edgeFunctions), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in listFunctions:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to list functions' }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}

async function getFunction(supabase: any, functionName: string) {
  try {
    const { data: func, error: functionError } = await supabase
      .from('edge_functions')
      .select(`
        *,
        edge_function_files (
          name,
          content
        )
      `)
      .eq('name', functionName)
      .single()

    if (functionError) {
      if (functionError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({ error: 'Function not found' }), 
          { 
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      console.error('Error fetching function:', functionError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch function' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const edgeFunction = {
      id: func.id,
      slug: func.slug,
      version: func.version,
      name: func.name,
      status: func.status,
      entrypoint_path: func.entrypoint_path,
      import_map_path: func.import_map_path,
      import_map: !!func.import_map_path,
      verify_jwt: func.verify_jwt,
      created_at: func.created_at,
      updated_at: func.updated_at,
      files: func.edge_function_files.map((file: any) => ({
        name: file.name,
        content: file.content
      }))
    }

    return new Response(
      JSON.stringify(edgeFunction), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in getFunction:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to get function' }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}

async function deployFunction(supabase: any, functionData: any) {
  try {
    const { name, files, entrypoint_path = 'index.ts', import_map_path, verify_jwt = true } = functionData

    if (!name || !files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid function data: name and files are required' }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if function already exists
    const { data: existingFunction } = await supabase
      .from('edge_functions')
      .select('id, version')
      .eq('name', name)
      .single()

    let functionId: string
    let version: number

    if (existingFunction) {
      // Update existing function
      version = existingFunction.version + 1
      const { error: updateError } = await supabase
        .from('edge_functions')
        .update({
          version,
          entrypoint_path,
          import_map_path,
          verify_jwt,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingFunction.id)

      if (updateError) {
        console.error('Error updating function:', updateError)
        return new Response(
          JSON.stringify({ error: 'Failed to update function' }), 
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      functionId = existingFunction.id

      // Delete old files
      await supabase
        .from('edge_function_files')
        .delete()
        .eq('function_id', functionId)
    } else {
      // Create new function
      version = 1
      const { data: newFunction, error: insertError } = await supabase
        .from('edge_functions')
        .insert({
          name,
          slug: name,
          version,
          entrypoint_path,
          import_map_path,
          verify_jwt,
          status: 'ACTIVE'
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Error creating function:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to create function' }), 
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      functionId = newFunction.id
    }

    // Insert new files
    const fileInserts = files.map((file: any) => ({
      function_id: functionId,
      name: file.name,
      content: file.content
    }))

    const { error: filesError } = await supabase
      .from('edge_function_files')
      .insert(fileInserts)

    if (filesError) {
      console.error('Error inserting function files:', filesError)
      return new Response(
        JSON.stringify({ error: 'Failed to store function files' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create deployment record
    const { error: deploymentError } = await supabase
      .from('edge_function_deployments')
      .insert({
        function_id: functionId,
        version,
        status: 'deployed'
      })

    if (deploymentError) {
      console.warn('Failed to create deployment record:', deploymentError)
    }

    // Trigger filesystem deployment
    await deployToFilesystem(name, files)

    // Return the deployed function info
    const { data: deployedFunction } = await supabase
      .from('edge_functions')
      .select('*')
      .eq('id', functionId)
      .single()

    return new Response(
      JSON.stringify({
        id: deployedFunction.id,
        slug: deployedFunction.slug,
        version: deployedFunction.version,
        name: deployedFunction.name,
        status: deployedFunction.status,
        entrypoint_path: deployedFunction.entrypoint_path,
        import_map_path: deployedFunction.import_map_path,
        import_map: !!deployedFunction.import_map_path,
        verify_jwt: deployedFunction.verify_jwt,
        created_at: deployedFunction.created_at,
        updated_at: deployedFunction.updated_at
      }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in deployFunction:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to deploy function' }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}

async function deleteFunction(supabase: any, functionName: string) {
  try {
    const { data: func, error: fetchError } = await supabase
      .from('edge_functions')
      .select('id')
      .eq('name', functionName)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({ error: 'Function not found' }), 
          { 
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      console.error('Error fetching function for deletion:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch function' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Delete the function (cascade will handle files and deployments)
    const { error: deleteError } = await supabase
      .from('edge_functions')
      .delete()
      .eq('id', func.id)

    if (deleteError) {
      console.error('Error deleting function:', deleteError)
      return new Response(
        JSON.stringify({ error: 'Failed to delete function' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Remove from filesystem
    await removeFromFilesystem(functionName)

    return new Response(
      JSON.stringify({ message: 'Function deleted successfully' }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in deleteFunction:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to delete function' }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}

async function deployToFilesystem(functionName: string, files: any[]) {
  try {
    const functionPath = `/home/deno/functions/${functionName}`
    
    // Create function directory
    await Deno.mkdir(functionPath, { recursive: true })
    
    // Write function files
    for (const file of files) {
      await Deno.writeTextFile(`${functionPath}/${file.name}`, file.content)
    }
    
    console.log(`Deployed function ${functionName} to filesystem`)
  } catch (error) {
    console.error(`Failed to deploy function ${functionName} to filesystem:`, error)
    // Don't throw here - we still want to return success for database storage
  }
}

async function removeFromFilesystem(functionName: string) {
  try {
    const functionPath = `/home/deno/functions/${functionName}`
    await Deno.remove(functionPath, { recursive: true })
    console.log(`Removed function ${functionName} from filesystem`)
  } catch (error) {
    console.error(`Failed to remove function ${functionName} from filesystem:`, error)
  }
}
