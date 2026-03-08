/**
 * @module test.proxy
 * @description Test suite per proxy.js — content-encoding, payload injection, routing.
 * Run: node --test test/test.proxy.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createProxyServer } from '../src/proxy.js';
import { createServer as createHttpServer } from 'node:http';
import { createGzip } from 'node:zlib';

describe('Proxy Server', () => {
    let proxy, mockApi, proxyPort, apiPort;

    before(async () => {
        // Mock Anthropic API — risponde con gzip
        mockApi = createHttpServer((req, res) => {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip'
            });
            const gz = createGzip();
            gz.pipe(res);
            gz.write(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }));
            gz.end();
        });

        await new Promise(r => mockApi.listen(0, '127.0.0.1', r));
        apiPort = mockApi.address().port;

        // Redirect proxy to mock API
        process.env.GROUNDTRUTH_ANTHROPIC_BASE = `http://127.0.0.1:${apiPort}`;

        proxy = await createProxyServer(false);
        await new Promise(r => proxy.listen(0, '127.0.0.1', r));
        proxyPort = proxy.address().port;
    });

    after(async () => {
        delete process.env.GROUNDTRUTH_ANTHROPIC_BASE;
        await new Promise(r => proxy.close(r));
        await new Promise(r => mockApi.close(r));
    });

    it('REGRESSION: BUG-C — content-encoding gzip non viene strippato senza decompressione', async () => {
        const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': 'test' },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
            })
        });

        const contentEncoding = response.headers.get('content-encoding');
        assert.equal(contentEncoding, 'gzip', 'Se il proxy non decomprime, deve mantenere "gzip"');

        // Verifichiamo che il body sia effettivamente gzip (fetch lo decomprime automaticamente però)
        const data = await response.json();
        assert.equal(data.content[0].text, 'ok');
    });

    it('rifiuta richieste non-POST con 404', async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, { method: 'GET' });
        assert.equal(res.status, 404);
    });

    it('rifiuta path sconosciuti con 404', async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/unknown/path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        assert.equal(res.status, 404);
    });

    it('rifiuta payload JSON malformato con 400', async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json'
        });
        assert.equal(res.status, 400);
    });

    it('rifiuta payload > 10MB con 413', async () => {
        const bigBody = JSON.stringify({ text: 'x'.repeat(11 * 1024 * 1024) });
        try {
            const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: bigBody
            });
            assert.equal(res.status, 413);
        } catch (e) {
            // Se fetch fallisce per ECONNRESET è ok, significa che il server ha chiuso prima della fine del body
            assert.ok(e instanceof TypeError || e.code === 'ECONNRESET');
        }
    });
});
