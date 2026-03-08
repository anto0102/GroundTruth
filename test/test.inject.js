/**
 * @module test.inject
 * @description Test suite per inject.js — regressione Bug #3 e Bug #10.
 * Run: node --test test/test.inject.js
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { injectBlock, removeStaleBlocks } from '../src/inject.js';
import { writeFile, readFile, mkdir, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('inject.js logic', () => {
    const testDir = path.join(tmpdir(), `gt-inject-test-${Date.now()}`);
    const testFile = path.join(testDir, 'GEMINI.md');

    before(async () => {
        await mkdir(testDir, { recursive: true });
    });

    after(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it('injectBlock: basic injection and update', async () => {
        await writeFile(testFile, '# Title\n', 'utf8');
        await injectBlock(testFile, 'Content A', 'id1');

        let content = await readFile(testFile, 'utf8');
        assert.ok(content.includes('<!-- groundtruth:block-id1:start -->'));
        assert.ok(content.includes('Content A'));

        await injectBlock(testFile, 'Content B', 'id1');
        content = await readFile(testFile, 'utf8');
        assert.ok(content.includes('Content B'));
        assert.ok(!content.includes('Content A'), 'Should replace content');
    });

    it('REGRESSION: bug #3 - blockId with "-"', async () => {
        // base64url produced '-' which failed \w+ regex in removeStaleBlocks
        const blockId = 'src_abc-123';
        await injectBlock(testFile, 'Custom Source Content', blockId);

        let content = await readFile(testFile, 'utf8');
        assert.ok(content.includes(`block-${blockId}`), 'Block should be injected');

        // If bug is FIXED, removeStaleBlocks with empty Set should remove it
        // If bug is PRESENT, the \w+ wouldn't match 'src_abc-123' and it would stay
        await removeStaleBlocks(testFile, new Set());

        content = await readFile(testFile, 'utf8');
        assert.ok(!content.includes(`block-${blockId}`), 'Stale block with "-" should be removed');
    });

    it('removeStaleBlocks: preserves active blocks', async () => {
        await injectBlock(testFile, 'Active 1', 'idA');
        await injectBlock(testFile, 'Active 2', 'idB');
        await injectBlock(testFile, 'Stale 1', 'idC');

        await removeStaleBlocks(testFile, new Set(['idA', 'idB']));

        const content = await readFile(testFile, 'utf8');
        assert.ok(content.includes('block-idA'));
        assert.ok(content.includes('block-idB'));
        assert.ok(!content.includes('block-idC'));
    });

    it('REGRESSION: bug #10 - withFileLock stale reset', async () => {
        const lockFile = testFile + '.lock';
        // Create a fake STALE lock (older than 10s)
        await writeFile(lockFile, 'stale');
        const past = new Date(Date.now() - 20000);
        await import('fs').then(fs => {
            fs.utimesSync(lockFile, past, past);
        });

        // This should trigger the stale detection, unlink, and succeed
        await injectBlock(testFile, 'Lock Test', 'lockId');

        const content = await readFile(testFile, 'utf8');
        assert.ok(content.includes('Lock Test'), 'Should succeed by removing stale lock');

        // Ensure lock file is cleaned up after success
        try {
            await stat(lockFile);
            assert.fail('Lock file should have been deleted');
        } catch (e) {
            assert.equal(e.code, 'ENOENT');
        }
    });
});
