/**
 * @module test.atomic-write
 * @description Test suite per atomic-write.js — regressione Bug #8.
 * Run: node --test test/test.atomic-write.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { atomicWrite } from '../src/utils/atomic-write.js';
import { writeFile, readFile, rm, mkdir, stat } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('atomicWrite', () => {
    const testDir = path.join(tmpdir(), `gt-atomic-test-${Date.now()}`);

    before(async () => {
        await mkdir(testDir, { recursive: true });
    });

    after(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it('writes content and removes temp file', async () => {
        const file = path.join(testDir, 'test1.txt');
        await atomicWrite(file, 'hello');
        const content = await readFile(file, 'utf8');
        assert.equal(content, 'hello');

        // Check no temp files left
        const files = await import('fs/promises').then(fs => fs.readdir(testDir));
        const temps = files.filter(f => f.startsWith('.gt-') && f.endsWith('.tmp'));
        assert.equal(temps.length, 0);
    });

    it('creates backup when requested', async () => {
        const file = path.join(testDir, 'test-bak.txt');
        await writeFile(file, 'original');
        await atomicWrite(file, 'new', { backup: true });

        assert.equal(await readFile(file, 'utf8'), 'new');
        assert.equal(await readFile(file + '.bak', 'utf8'), 'original');
    });

    it('REGRESSION: bug #8 - cleanup .bak on error', async () => {
        const file = path.join(testDir, 'test-fail.txt');
        await writeFile(file, 'old');

        // We need to trigger an error AFTER backup is created but DURING rename.
        // This is tricky without mocks, but on Linux we can try to make the target directory read-only
        // or use a path that will fail the rename but pass the copy.

        // Let's use a non-existent directory for the final path to force rename failure
        const badFile = path.join(testDir, 'non-existent-dir', 'file.txt');

        // Note: fs.copyFile might fail too if the parent doesn't exist.
        // Actually, atomicWrite uses path.dirname(filePath) for temp file.

        // Better way: Mock fs.rename locally if possible? No, we use imports.
        // Let's rely on the code audit for this specific edge case or try to 
        // find a way to make rename fail reliably.

        // Actually, if I pass a filePath that is a directory, rename(temp, dir) will fail.
        const dirAsFile = path.join(testDir, 'some-dir');
        await mkdir(dirAsFile);

        try {
            await atomicWrite(dirAsFile, 'content', { backup: true });
        } catch (e) {
            // Check if .bak was cleaned up
            try {
                await stat(dirAsFile + '.bak');
                assert.fail('Backup file should have been cleaned up on error');
            } catch (err) {
                assert.equal(err.code, 'ENOENT');
            }
        }
    });
});
