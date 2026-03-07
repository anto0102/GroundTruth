import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['index.js'],
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    clean: true,
    minify: true,
    noExternal: [/(.*)/],
    banner: {
        js: `#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);`
    }
});
