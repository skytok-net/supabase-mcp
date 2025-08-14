import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/transports/stdio.ts', 'src/platform/index.ts'],
    format: ['cjs', 'esm'], // Add CommonJS format for older Node.js versions
    outDir: 'dist',
    sourcemap: true,
    dts: true,
    minify: false, // Disable minification to prevent HTML encoding
    splitting: true,
    loader: {
      '.sql': 'text',
    },
    target: 'es2018', // Target Node.js 18+ compatibility
  },
]);
