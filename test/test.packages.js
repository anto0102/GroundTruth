/**
 * @module test.packages
 * @description Test per BUG-I — versioni workspace/link/file filtrate correttamente.
 * Run: node --test test/test.packages.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readPackageDeps } from '../src/packages.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('readPackageDeps — monorepo version strings', () => {
    const testDir = path.join(tmpdir(), `gt-pkg-test-${Date.now()}`);
    const originalCwd = process.cwd;

    before(async () => {
        await mkdir(testDir, { recursive: true });
        // process.cwd override in ESM is tricky, we rely on the fact that readPackageDeps 
        // uses process.cwd() internally.
        process.cwd = () => testDir;
    });

    after(async () => {
        process.cwd = originalCwd;
        await rm(testDir, { recursive: true, force: true });
    });

    it('REGRESSION: BUG-I — filtra versioni workspace:* e link:', async () => {
        await writeFile(path.join(testDir, 'package.json'), JSON.stringify({
            dependencies: {
                'react': '^18.0.0',
                'my-local-pkg': 'workspace:*',
                'another-local': 'link:../packages/ui',
                'file-dep': 'file:./local',
                'svelte': '^5.0.0',
            }
        }));

        const deps = await readPackageDeps();
        assert.ok(deps, 'deve restituire deps');

        const names = deps.map(d => d.split(' ')[0]);
        assert.ok(names.includes('react'), 'deve includere react');
        assert.ok(names.includes('svelte'), 'deve includere svelte');
        assert.ok(!names.includes('my-local-pkg'), 'deve escludere workspace:*');
        assert.ok(!names.includes('another-local'), 'deve escludere link:');
        assert.ok(!names.includes('file-dep'), 'deve escludere file:');
    });
});
