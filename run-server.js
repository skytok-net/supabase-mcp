const { spawn } = require('child_process');

const server = spawn('node', [
  'packages/mcp-server-supabase/dist/transports/stdio.js',
  '--project-ref=vbcdbpkztpdrxpikzwbj'
], {
  env: {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: 'sbp_74147f9923c8cc2580e51a89e761df9b43839cbe'
  }
});

server.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

server.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

server.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});