/**
 * @module proxy
 * @description Proxy node routing Anthropic/Gemini http server streaming protocol.
 */
import http from 'http';
import https from 'https';
import { webSearch } from './search.js';
import { readPackageDeps, buildQuery } from './packages.js';
import { chalk, log, LOG_WARN, LOG_BOLT } from './logger.js';

// ─── HTTP Node server daemon ─────────────────────────

/**
 * @description Main listener Anthropic port interceptor content system stream 
 * @param   {boolean} usePackageJson - Overrides per fallback module args
 * @returns {http.Server} Istanza server network configurata listen loop
 */
export function createServer(usePackageJson) {
    let packageQueryCache = null;
    if (usePackageJson) {
        const depEntries = readPackageDeps();
        if (depEntries) packageQueryCache = buildQuery(depEntries);
    }

    const server = http.createServer(async (req, res) => {
        if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }

        let protocol = null;
        if (req.url.startsWith('/v1/messages')) {
            protocol = 'ANTHROPIC';
        } else if (req.url.startsWith('/v1beta/models/') && (req.url.includes('generateContent') || req.url.includes('streamGenerateContent'))) {
            protocol = 'GEMINI';
        } else {
            res.writeHead(404); res.end(); return;
        }

        try {
            let bodyChunks = [];
            for await (const chunk of req) bodyChunks.push(chunk);
            const rawBody = Buffer.concat(bodyChunks);

            let parsedBody;
            try {
                parsedBody = JSON.parse(rawBody.toString('utf8'));
            } catch (_) {
                res.writeHead(400); res.end('Bad Request - Invalid JSON'); return;
            }

            // Estrai query last context check iter logic object
            let lastUserMessage = '';
            if (protocol === 'ANTHROPIC') {
                const lastUserM = (parsedBody.messages || []).slice().reverse().find(m => m.role === 'user');
                if (lastUserM) {
                    lastUserMessage = typeof lastUserM.content === 'string'
                        ? lastUserM.content
                        : (Array.isArray(lastUserM.content) ? lastUserM.content.map(c => c.text || '').join(' ') : '');
                }
            } else if (protocol === 'GEMINI') {
                const lastUserM = (parsedBody.contents || []).slice().reverse().find(m => m.role === 'user');
                if (lastUserM && Array.isArray(lastUserM.parts)) {
                    lastUserMessage = lastUserM.parts.map(p => p.text || '').join(' ');
                }
            }

            let query, shortMsg;
            if (packageQueryCache) {
                query = packageQueryCache;
                shortMsg = 'package.json deps';
            } else {
                const text = lastUserMessage || '';
                shortMsg = text.replace(/\s+/g, ' ').trim().slice(0, 50);
                query = text.slice(0, 120).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
                query = `${query} 2026`.trim();
            }

            const t0 = Date.now();
            let contextBlock = '';
            let didInject = false;
            let resultsCount = 0;

            try {
                if (!query || query.trim() === '2026') throw new Error('Empty query');
                // parallel load in proxy app process to boost response load
                const { results, pageText } = await webSearch(query, true);
                resultsCount = results.length;

                contextBlock = `\n\n--- WEB CONTEXT (live, ${new Date().toISOString()}) ---\n`;
                results.forEach((r, i) => {
                    contextBlock += `${i + 1}. ${r.title}: ${r.snippet} (${r.url})\n`;
                });
                if (pageText) contextBlock += `\nFULL TEXT:\n${pageText}\n`;
                contextBlock += `--- END WEB CONTEXT ---\n`;
                didInject = true;
            } catch (_) {
                log(LOG_WARN, chalk.yellow, chalk.white('web fetch failed') + `  →  ${chalk.yellow('forwarding clean')}`);
            }

            const ms = Date.now() - t0;

            if (didInject) {
                log(LOG_BOLT, chalk.cyan, chalk.white(shortMsg.slice(0, 50) + (shortMsg.length > 50 ? '…' : '')) + `  →  ${chalk.cyan.bold(String(resultsCount))} ${chalk.cyan('results')}  ${chalk.gray(ms + 'ms')}`);

                if (protocol === 'ANTHROPIC') {
                    if (parsedBody.system) {
                        if (typeof parsedBody.system === 'string') parsedBody.system += contextBlock;
                        else if (Array.isArray(parsedBody.system)) parsedBody.system.push({ type: 'text', text: contextBlock });
                    } else {
                        parsedBody.system = contextBlock;
                    }
                } else if (protocol === 'GEMINI') {
                    if (!parsedBody.systemInstruction) {
                        parsedBody.systemInstruction = { role: 'system', parts: [] };
                    } else if (!parsedBody.systemInstruction.parts) {
                        parsedBody.systemInstruction.parts = [];
                    } else if (!Array.isArray(parsedBody.systemInstruction.parts)) {
                        parsedBody.systemInstruction.parts = typeof parsedBody.systemInstruction.parts.text === 'string'
                            ? [parsedBody.systemInstruction.parts] : [];
                    }
                    parsedBody.systemInstruction.parts.push({ text: contextBlock });
                }
            }

            const reqBodyStr = JSON.stringify(parsedBody);
            const targetUrlStr = protocol === 'ANTHROPIC'
                ? `https://api.anthropic.com${req.url}`
                : `https://generativelanguage.googleapis.com${req.url}`;

            const targetUrl = new URL(targetUrlStr);
            const headers = { ...req.headers };
            delete headers['host'];
            headers['content-length'] = Buffer.byteLength(reqBodyStr);

            const proxyReq = https.request(targetUrl, { method: req.method, headers }, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });
            proxyReq.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end('Bad Gateway'); } });
            proxyReq.write(reqBodyStr);
            proxyReq.end();

        } catch (err) {
            if (!res.headersSent) { res.writeHead(500); res.end('Internal Server Proxy Error'); }
        }
    });

    return server;
}
