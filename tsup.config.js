import { defineConfig } from 'tsup';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
    entry: ['index.js'],
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    clean: true,
    minify: true,
    treeshake: true,
    define: {
        '__APP_VERSION__': JSON.stringify(pkg.version)
    },
    noExternal: [/(.*)/],
    banner: {
        js: `#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);`
    }
});
