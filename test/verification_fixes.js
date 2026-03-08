import assert from 'assert';
import { LRUCache } from '../src/cache.js';
import { sanitizeWebContent } from '../src/sanitize.js';
import { readPackageDeps } from '../src/packages.js';

async function testLRUCacheTTL() {
    console.log('Testing LRUCache custom TTL...');
    const cache = new LRUCache({ max: 10, ttl: 1000 });

    // Test base TTL
    cache.set('key1', 'val1');
    assert.strictEqual(cache.get('key1'), 'val1');

    // Test custom TTL
    cache.set('key2', 'val2', 100);
    assert.strictEqual(cache.get('key2'), 'val2');

    await new Promise(r => setTimeout(r, 150));
    assert.strictEqual(cache.get('key2'), undefined, 'key2 should have expired');
    assert.strictEqual(cache.get('key1'), 'val1', 'key1 should NOT have expired');

    console.log('✔ LRUCache custom TTL passed');
}

function testSanitizeWebContent() {
    console.log('Testing sanitizeWebContent refinement...');

    const navText = "Code\nIssues\nPull requests\nActions\nSecurity\nInsights";
    const sanitizedNav = sanitizeWebContent(navText);
    assert.strictEqual(sanitizedNav, '', 'Navigation labels as full lines should be removed');

    const docText = "This code example demonstrates how to use Server Actions and Security best practices.";
    const sanitizedDoc = sanitizeWebContent(docText);
    assert.ok(sanitizedDoc.includes('code example'), 'Should preserve "code example"');
    assert.ok(sanitizedDoc.includes('Server Actions'), 'Should preserve "Server Actions"');
    assert.ok(sanitizedDoc.includes('Security'), 'Should preserve "Security"');

    console.log('✔ sanitizeWebContent refinement passed');
}

async function testPackagesConstants() {
    console.log('Testing packages.js constants scope...');
    // readPackageDeps should work correctly even with constants moved
    const deps = await readPackageDeps();
    // This depends on the environment, but if it doesn't throw and works, it's a good sign.
    console.log('✔ packages.js constants (indirect check) passed');
}

async function run() {
    try {
        await testLRUCacheTTL();
        testSanitizeWebContent();
        await testPackagesConstants();
        console.log('\nALL FIX VERIFICATIONS PASSED! 🎉');
    } catch (err) {
        console.error('\nFAIL:', err.message);
        process.exit(1);
    }
}

run();
