/**
 * @module test
 * @description Main test suite per GroundTruth — Packages, Cache, CircuitBreaker, Search.
 * Run: node --test test/test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Regression Bug #1 ───────────────────────────────

import { label, log, LOG_OK } from '../src/logger.js';

describe('Logger (Regression Bug #1)', () => {
    it('REGRESSION: bug #1 - chalk.cyan.bold crash', () => {
        // This should not throw TypeError: chalk.cyan.bold is not a function
        try {
            const output = label('✓', 'test', 'value');
            assert.ok(output.includes('test'));

            // Re-verify the fix logic
            log(LOG_OK, (s) => s, 'This should work');
        } catch (e) {
            assert.fail('Logger crashed: ' + e.message);
        }
    });
});

// ─── Packages Logic ──────────────────────────────────

import { readPackageDeps, groupIntoBatches, buildQuery, batchHash } from '../src/packages.js';

describe('Packages Module', () => {
    it('buildQuery: includes current year', () => {
        const q = buildQuery(['a', 'b']);
        const year = new Date().getFullYear();
        assert.ok(q.includes(String(year)));
        assert.ok(q.includes('a b'));
    });

    it('groupIntoBatches: partitions correctly', () => {
        const deps = [1, 2, 3, 4, 5, 6, 7];
        const batches = groupIntoBatches(deps, 3);
        assert.equal(batches.length, 3);
        assert.deepEqual(batches[0], [1, 2, 3]);
        assert.deepEqual(batches[1], [4, 5, 6]);
        assert.deepEqual(batches[2], [7]);
    });

    it('batchHash: deterministic output', () => {
        const h1 = batchHash(['svelte', 'kit']);
        const h2 = batchHash(['svelte', 'kit']);
        assert.equal(h1, h2);
        assert.equal(h1.length, 8);
    });
});

// ─── Cache Logic ─────────────────────────────────────

import { LRUCache } from '../src/cache.js';

describe('LRUCache', () => {
    it('evicts least recently used', () => {
        const cache = new LRUCache({ max: 2 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.get('a'); // 'a' is now most recent
        cache.set('c', 3); // 'b' should be evicted

        assert.equal(cache.get('a'), 1);
        assert.equal(cache.get('c'), 3);
        assert.equal(cache.get('b'), undefined);
    });

    it('honors TTL', async () => {
        const cache = new LRUCache({ max: 10, ttl: 50 });
        cache.set('key', 'val');
        assert.equal(cache.get('key'), 'val');

        await new Promise(r => setTimeout(r, 60));
        assert.equal(cache.get('key'), undefined);
    });

    it('delete element and update size', () => {
        const cache = new LRUCache({ max: 10 });
        cache.set('k', 'v');
        assert.equal(cache.size, 1);
        cache.delete('k');
        assert.equal(cache.size, 0);
    });
});

// ─── Circuit Breaker ─────────────────────────────────

import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('CircuitBreaker Transitions', () => {
    it('requires 2 successes to close from HALF_OPEN', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 0 });

        // Open it
        try { await cb.execute(() => { throw new Error('fail'); }); } catch { }
        assert.equal(cb.state, 'OPEN');

        // Next execute will trigger HALF_OPEN (timeout 0)
        await new Promise(r => setTimeout(r, 20));
        await cb.execute(() => 'success 1');
        assert.equal(cb.state, 'HALF_OPEN');
        assert.equal(cb.halfOpenSuccesses, 1);

        await cb.execute(() => 'success 2');
        assert.equal(cb.state, 'CLOSED');
        assert.equal(cb.halfOpenSuccesses, 0);
    });

    it('resets failures on success in CLOSED state', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 3 });
        try { await cb.execute(() => { throw new Error('fail'); }); } catch { }
        assert.equal(cb.failures, 1);

        await cb.execute(() => 'ok');
        assert.equal(cb.failures, 0);
    });
});

// ─── Search Utils ────────────────────────────────────

import { resolveDDGUrl } from '../src/search.js';

describe('Search Utilities', () => {
    it('resolveDDGUrl: handles uddg', () => {
        const encoded = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com";
        assert.equal(resolveDDGUrl(encoded), "https://example.com");
    });

    it('resolveDDGUrl: returns original if missing uddg', () => {
        assert.equal(resolveDDGUrl("https://direct.link"), "https://direct.link");
    });
});

import { resolveQuality } from '../src/config.js';

describe('Config Utilities', () => {
    it('resolveQuality: fallback to medium', () => {
        const q = resolveQuality('bogus');
        assert.equal(q.ddgResults, 3);
    });
});
