/**
 * @module proxy
 * @description Proxy node routing Anthropic/Gemini http server streaming protocol.
 */
import http from 'http';
import https from 'https';
import { webSearch } from './search.js';
import { readPackageDeps, buildQuery } from './packages.js';
import { chalk, log, LOG_WARN, LOG_BOLT, LOG_REFRESH } from './logger.js';
import { httpsAgent } from './http-agent.js';
import { sanitizeWebContent } from './sanitize.js';
import { watch } from 'fs';
import path from 'path';
import { maxTokens, qualitySettings, verbose } from './cli.js';

/**
 * @typedef {Object} AnthropicMessage
 * @property {string} role
 * @property {string | Array<{type: string, text?: string}>} content
 *
 * @typedef {Object} AnthropicPayload
 * @property {AnthropicMessage[]} [messages]
 * @property {string | Array<{type: string, text?: string}>} [system]
 *
 * @typedef {Object} GeminiPart
 * @property {string} [text]
 *
 * @typedef {Object} GeminiContent
 * @property {string} role
 * @property {GeminiPart[]} parts
 *
 * @typedef {Object} GeminiPayload
 * @property {GeminiContent[]} [contents]
 * @property {{role: string, parts: GeminiPart[]}} [systemInstruction]
 *
 * @typedef {AnthropicPayload & GeminiPayload & Record<string, any>} ProxyPayload
 */

// ─── HTTP Node server daemon ─────────────────────────

/**
 * @description Main listener Anthropic port interceptor content system stream 
 * @param   {boolean} usePackageJson - Overrides per fallback module args
 * @returns {Promise<http.Server>} Istanza server network configurata listen loop
 */
export async function createServer(usePackageJson) {
    let packageQueryCache = null;
    let cacheStale = true;
    let refreshPromise = null;

    if (usePackageJson) {
        const depEntries = await readPackageDeps();
        if (depEntries) {
            packageQueryCache = buildQuery(depEntries);
            cacheStale = false;
        }

        const pkgPath = path.resolve(process.cwd(), 'package.json');
        try {
            watch(pkgPath, { persistent: false }, () => {
                cacheStale = true;
                log(LOG_REFRESH, chalk.cyan, chalk.white('package.json changed — cache invalidated'));
            });
        } catch (_) { }
    }

    const server = http.createServer(async (req, res) => {
        if (usePackageJson && cacheStale) {
            if (!refreshPromise) {
                refreshPromise = readPackageDeps().then(depEntries => {
                    if (depEntries) {
                        packageQueryCache = buildQuery(depEntries);
                    }
                    cacheStale = false;
                }).finally(() => {
                    refreshPromise = null;
                });
            }
            await refreshPromise;
        }
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
            const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB limit
            let chunks = [];
            let bodyLength = 0;
            for await (const chunk of req) {
                bodyLength += chunk.length;
                if (bodyLength > MAX_PAYLOAD_SIZE) {
                    res.writeHead(413); res.end('Payload Too Large');
                    req.destroy(); // Fix TCP Stream Leak
                    return;
                }
                chunks.push(chunk);
            }
            const rawBody = Buffer.concat(chunks);

            /** @type {ProxyPayload} */
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
                const year = new Date().getFullYear();
                query = `${query} ${year}`.trim();
            }

            const t0 = Date.now();
            let contextBlock = '';
            let didInject = false;
            let resultsCount = 0;

            try {
                if (!query || query.trim() === String(new Date().getFullYear())) throw new Error('Empty query');
                // parallel load in proxy app process to boost response load
                const { results, pageText } = await webSearch(query, false, {
                    ddgResults: qualitySettings.ddgResults,
                    maxLen: qualitySettings.charsPerPage,
                    jinaTimeout: qualitySettings.jinaTimeout,
                    verbose,
                });
                resultsCount = results.length;

                contextBlock = `\n\n--- WEB CONTEXT (live, ${new Date().toISOString()}) ---\n`;
                results.forEach((r, i) => {
                    contextBlock += `${i + 1}. ${r.title}: ${sanitizeWebContent(r.snippet, 500)} (${r.url})\n`;
                });
                if (pageText) contextBlock += `\nFULL TEXT:\n${sanitizeWebContent(pageText, maxTokens)}\n`;
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
                    }
                    const sys = parsedBody.systemInstruction;
                    if (!Array.isArray(sys.parts)) {
                        if (typeof sys.parts === 'object' && sys.parts !== null) {
                            sys.parts = [sys.parts];
                        } else if (typeof sys.parts === 'string') {
                            sys.parts = [{ text: sys.parts }];
                        } else {
                            sys.parts = [];
                        }
                    }
                    sys.parts.push({ text: contextBlock });
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

            const proxyReq = https.request(targetUrl, { method: req.method, headers, agent: httpsAgent }, (proxyRes) => {
                const responseHeaders = { ...proxyRes.headers };
                delete responseHeaders['content-security-policy'];
                delete responseHeaders['x-content-type-options'];
                delete responseHeaders['content-encoding'];
                delete responseHeaders['content-length'];

                res.writeHead(proxyRes.statusCode, responseHeaders);
                proxyRes.pipe(res);
            });

            // Fix Orphaned Sockets: stop upstream if client disconnects
            req.on('close', () => {
                if (!res.writableEnded) proxyReq.destroy();
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
