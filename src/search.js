/**
 * @module search
 * @description Logica di scraping web su DuckDuckGo tramite cheerio e linkedom.
 */
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { DOMParser } from 'linkedom';
import { searchCache } from './cache.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { httpAgent, httpsAgent } from './http-agent.js';

// ─── Config & Cache ──────────────────────────────────

// Evitiamo IP bans ruotando UA comuni in Chrome desktop
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

/**
 * @description Seleziona uno User-Agent rnd dall'array disponibile
 * @returns {string} Stringa di uno User Agent
 */
function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const ddgCircuit = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

/**
 * @description Decodifica link mascherati DuckDuckGo recuperando `uddg` querystring.
 * @param   {string} href - Url incapsulato proveniente da nodeDDG
 * @returns {string} Url reale target in chiaro
 */
export function resolveDDGUrl(href) {
    try {
        const url = new URL(href, 'https://duckduckgo.com');
        const uddg = url.searchParams.get('uddg');
        return uddg ? decodeURIComponent(uddg) : href;
    } catch {
        return href;
    }
}

/**
 * @description Esegue chiamata http reale su node DDG.
 * @param   {string} query - Ricerca DDG formattata
 * @returns {Promise<Object>} { results, userAgent }
 * @throws  {Error} Fallimento http DDG request
 */
async function doSearch(query) {
    const userAgent = getRandomUA();
    // Fetch DDG raw HTML search endpoint ignoring CSS/JS payloads
    const searchRes = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': userAgent }, agent: httpsAgent }
    );
    if (!searchRes.ok) throw new Error(`DDG ${searchRes.status}`);

    const $ = cheerio.load(await searchRes.text());
    let results = [];
    $('.result__body').each((i, el) => {
        const title = $(el).find('.result__title').text().trim();
        const snippet = $(el).find('.result__snippet').text().trim();
        let rawUrl = $(el).find('.result__url').attr('href') || $(el).find('a.result__url').attr('href');
        const resultUrl = rawUrl ? resolveDDGUrl(rawUrl) : '';
        if (title && resultUrl) results.push({ title, snippet, url: resultUrl });
    });

    const seen = new Set();
    results = results.filter(r => r.url && !seen.has(r.url) && seen.add(r.url)).slice(0, 3);

    if (results.length === 0) throw new Error('No DDG results');
    return { results, userAgent };
}

/**
 * @description Punto d'accesso caching+retry orchestrator web.
 * @param   {string}  query    - Input utente di ricerca convertibile web
 * @param   {boolean} parallel - Promise.all fast per multiple page scraping
 * @returns {Promise<Object>} Oggetto risultati + pageText formattato str
 */
export async function webSearch(query, parallel = false) {
    const now = Date.now();
    // In cache mode skip costose chiamate network
    const cached = searchCache.get(query);
    if (cached) {
        return { results: cached.results, pageText: cached.pageText };
    }

    let results, userAgent;
    try {
        const res = await ddgCircuit.execute(() => doSearch(query));
        results = res.results;
        userAgent = res.userAgent;
    } catch (err) {
        throw err;
    }

    let pageText = '';
    // Se claude-code usa parallel mode; altrimenti solo primo link (antigravity)
    if (parallel) {
        const pages = await Promise.all(results.map(async (r) => {
            try {
                const pageRes = await fetch(r.url, {
                    signal: AbortSignal.timeout(5000),
                    headers: { 'User-Agent': userAgent },
                    agent: r.url.startsWith('https:') ? httpsAgent : httpAgent
                });
                if (pageRes.ok) {
                    const document = new DOMParser().parseFromString(await pageRes.text(), 'text/html');
                    let text = '';
                    try {
                        const article = new Readability(document).parse();
                        text = article?.textContent || '';
                    } catch (_) {
                        text = document.body?.textContent || '';
                    }
                    if (text) return text.replace(/\s+/g, ' ').slice(0, 4000);
                }
            } catch (_) { // fail silenzioso parallelo tollerato per timeout link third-party
            }
            return '';
        }));
        pageText = pages.filter(Boolean).join('\n\n');
    } else {
        try {
            if (results[0]) {
                const pageRes = await fetch(results[0].url, {
                    signal: AbortSignal.timeout(5000), // node-fetch hang timeout catch
                    headers: { 'User-Agent': userAgent },
                    agent: results[0].url.startsWith('https:') ? httpsAgent : httpAgent
                });
                if (pageRes.ok) {
                    const document = new DOMParser().parseFromString(await pageRes.text(), 'text/html');
                    let text = '';
                    try {
                        const article = new Readability(document).parse();
                        text = article?.textContent || '';
                    } catch (_) {
                        text = document.body?.textContent || '';
                    }
                    if (text) {
                        pageText = text.replace(/\s+/g, ' ').slice(0, 4000);
                    }
                }
            }
        } catch (_) { // bypass errore url target: fallback al contesto vuoto
        }
    }

    const resultData = { results, pageText };
    searchCache.set(query, resultData);
    return resultData;
}
