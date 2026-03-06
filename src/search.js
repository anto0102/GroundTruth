/**
 * @module search
 * @description Logica di scraping web su DuckDuckGo tramite cheerio e jsdom.
 */
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

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

const cache = new Map(); // Store query in runtime object
const CACHE_TTL = 5 * 60 * 1000; // 5 min TTL matchato ad interval

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
        { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': userAgent } }
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
    if (cache.has(query)) {
        const cached = cache.get(query);
        if (now - cached.timestamp < CACHE_TTL) {
            return { results: cached.results, pageText: cached.pageText };
        }
    }

    let results, userAgent;
    try {
        const res = await doSearch(query);
        results = res.results;
        userAgent = res.userAgent;
    } catch (err) {
        // Retry singola dopo wait in caso network throttle da DDG
        await new Promise(r => setTimeout(r, 1000));
        const res = await doSearch(query);
        results = res.results;
        userAgent = res.userAgent;
    }

    let pageText = '';
    // Se claude-code usa parallel mode; altrimenti solo primo link (antigravity)
    if (parallel) {
        const pages = await Promise.all(results.map(async (r) => {
            try {
                const pageRes = await fetch(r.url, {
                    signal: AbortSignal.timeout(5000),
                    headers: { 'User-Agent': userAgent }
                });
                if (pageRes.ok) {
                    const dom = new JSDOM(await pageRes.text(), { url: r.url });
                    const article = new Readability(dom.window.document).parse();
                    if (article?.textContent) {
                        return article.textContent.replace(/\s+/g, ' ').slice(0, 4000);
                    }
                }
            } catch (_) { /* ignore failure in subfetching link array */ }
            return '';
        }));
        pageText = pages.filter(Boolean).join('\n\n');
    } else {
        try {
            if (results[0]) {
                const pageRes = await fetch(results[0].url, {
                    signal: AbortSignal.timeout(5000), // node-fetch hang timeout catch
                    headers: { 'User-Agent': userAgent }
                });
                if (pageRes.ok) {
                    const dom = new JSDOM(await pageRes.text(), { url: results[0].url });
                    const article = new Readability(dom.window.document).parse();
                    if (article?.textContent) {
                        // max 4000 chars context window per target pages
                        pageText = article.textContent.replace(/\s+/g, ' ').slice(0, 4000);
                    }
                }
            }
        } catch (_) { /* bypass errore in singolo parse url */ }
    }

    const resultData = { results, pageText };
    cache.set(query, { ...resultData, timestamp: now });
    return resultData;
}
