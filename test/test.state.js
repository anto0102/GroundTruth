/**
 * @module test.state
 * @description Test suite per state.js — round-trip e persistenza con isolamento.
 * Run: node --test test/test.state.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadBatchState, saveBatchState } from '../src/state.js';
import { rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('State Persistence', () => {
    const testDir = path.join(tmpdir(), `gt-state-test-${Date.now()}`);

    before(async () => {
        await mkdir(testDir, { recursive: true });
    });

    after(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it('round-trip save and load', async () => {
        const hashes = new Map([['block1', 'hash1'], ['block2', 'hash2']]);
        const customTs = new Map([['src1', 123456789]]);
        const version = '0.5.1-test';

        await saveBatchState(hashes, customTs, version, testDir);

        const loaded = await loadBatchState(version, testDir);
        assert.equal(loaded.hashes.get('block1'), 'hash1');
        assert.equal(loaded.hashes.get('block2'), 'hash2');
        assert.equal(loaded.customTs.get('src1'), 123456789);
    });

    it('invalidates state on version mismatch', async () => {
        const hashes = new Map([['b', 'h']]);
        await saveBatchState(hashes, new Map(), '1.0.0', testDir);

        const loaded = await loadBatchState('1.0.1', testDir);
        assert.equal(loaded.hashes.size, 0, 'Should return empty maps on version mismatch');
    });

    it('handles missing state file gracefully', async () => {
        const emptyDir = path.join(testDir, 'empty');
        const loaded = await loadBatchState('any', emptyDir);
        assert.equal(loaded.hashes.size, 0);
        assert.equal(loaded.customTs.size, 0);
    });
});
