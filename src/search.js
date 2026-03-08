/**
 * @module search
 * @description Logica di scraping web: Jina Reader → fallback Readability, registry bypass, DDG search.
 */
import { Readability } from '@mozilla/readability';
import { DOMParser } from 'linkedom';
import { searchCache } from './cache.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { sanitizeWebContent } from './sanitize.js';
import { lookupRegistryUrl } from './registry.js';

// ─── Config & Cache ──────────────────────────────────

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const ddgCircuit = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

// ─── Jina Reader + Readability Fallback ──────────────

/**
 * @description Fetch contenuto pagina: prima Jina Reader (JS rendering + markdown), poi fallback Readability.
 * @param   {string} url         - URL della pagina
 * @param   {string} userAgent   - UA per il fallback fetch
 * @param   {Object} opts        - { jinaTimeout, maxLen, verbose }
 * @returns {Promise<string>} Contenuto markdown/text estratto
 */
export async function fetchPageContent(url, userAgent, opts = {}) {
    const { jinaTimeout = 8000, maxLen = 4000, verbose = false } = opts;

    // ── Try Jina Reader API first ──
    try {
        const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
            signal: AbortSignal.timeout(jinaTimeout),
            headers: { 'Accept': 'text/markdown', 'X-No-Cache': 'true' }
        });
        if (jinaRes.ok) {
            const text = await jinaRes.text();
            if (text && text.length > 200) {
                if (verbose) console.log(`    [jina] ✓ ${url} → ${text.length} chars`);
                return sanitizeWebContent(text, maxLen);
            }
        }
    } catch (_) {
        if (verbose) console.log(`    [jina] ✗ ${url} → fallback readability`);
    }

    // ── Fallback: fetch + Readability ──
    try {
        const pageRes = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': userAgent }
        });
        if (pageRes.ok) {
            const htmlText = await pageRes.text();
            // Protect Event Loop: discard if HTML is too large (> 2MB)
            if (htmlText.length > 2 * 1024 * 1024) {
                if (verbose) console.log(`    [readability] ✗ ${url} → HTML too large (${htmlText.length} chars)`);
                return '';
            }
            const document = new DOMParser().parseFromString(htmlText, 'text/html');
            let text = '';
            try {
                const article = new Readability(document).parse();
                text = article?.textContent || '';
            } catch (_) {
                text = document.body?.textContent || '';
            }
            return sanitizeWebContent(text, maxLen);
        }
    } catch (_) { }

    return '';
}

// ─── Registry Direct Fetch ───────────────────────────

/**
 * @description Fetch diretto dalle docs ufficiali per dipendenze nel registry.
 * @param   {Array}  deps - Array di dipendenze ("svelte 5.51", "sveltekit 2.50")
 * @param   {Object} opts - { jinaTimeout, maxLen, verbose }
 * @returns {Promise<Object>} { registryText, coveredDeps } 
 */
export async function registryFetch(deps, opts = {}) {
    const { verbose = false } = opts;
    const userAgent = getRandomUA();
    let registryText = '';
    const coveredDeps = new Set();

    for (const dep of deps) {
        const docUrl = await lookupRegistryUrl(dep);
        if (!docUrl) continue;

        const depName = dep.split(' ')[0];
        try {
            const text = await fetchPageContent(docUrl, userAgent, opts);
            if (text && text.length > 100) {
                registryText += `\n### ${depName} (official docs)\n${text}\n`;
                coveredDeps.add(dep);
                if (verbose) console.log(`    [registry] ✓ ${depName} → ${docUrl}`);
            }
        } catch (_) {
            if (verbose) console.log(`    [registry] ✗ ${depName} → fetch failed`);
        }
    }

    return { registryText, coveredDeps };
}

// ─── DDG Search ──────────────────────────────────────

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
 * @param   {string} query       - Ricerca DDG formattata
 * @param   {number} resultsLimit - Max risultati da ritornare
 * @returns {Promise<Object>} { results, userAgent }
 */
async function doSearch(query, resultsLimit = 3) {
    const userAgent = getRandomUA();
    // Use the "html" version for more stable scraping, but with better error handling
    const searchRes = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=0&dc=0&v=l&kl=wt-wt`,
        {
            signal: AbortSignal.timeout(8000),
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://duckduckgo.com/',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1'
            }
        }
    );
    if (!searchRes.ok) {
        if (searchRes.status === 403 || searchRes.status === 429) {
            throw new Error(`DDG Blocked (${searchRes.status})`);
        }
        throw new Error(`DDG ${searchRes.status}`);
    }

    const html = await searchRes.text();
    if (html.includes('ddg-captcha') || html.includes('captcha')) {
        throw new Error('DDG Captcha Detected');
    }

    const document = new DOMParser().parseFromString(html, 'text/html');
    let results = [];
    const elements = document.querySelectorAll('.result__body');

    for (const el of elements) {
        const titleEl = el.querySelector('.result__title');
        const snippetEl = el.querySelector('.result__snippet');
        const urlEl = el.querySelector('.result__url') || el.querySelector('a.result__url');

        const title = titleEl ? titleEl.textContent.trim() : '';
        const snippet = snippetEl ? snippetEl.textContent.trim() : '';
        const rawUrl = urlEl ? urlEl.getAttribute('href') : '';
        const resultUrl = rawUrl ? resolveDDGUrl(rawUrl) : '';

        if (title && resultUrl) {
            results.push({ title, snippet, url: resultUrl });
        }
    }

    const seen = new Set();
    results = results.filter(r => r.url && !seen.has(r.url) && seen.add(r.url)).slice(0, resultsLimit);

    if (results.length === 0) throw new Error('No DDG results');
    return { results, userAgent };
}

// ─── Main Web Search ─────────────────────────────────

/**
 * @description Punto d'accesso caching+retry orchestrator web.
 * @param   {string}  query        - Input utente di ricerca convertibile web
 * @param   {boolean} parallel     - Promise.all fast per multiple page scraping
 * @param   {Object}  opts         - { ddgResults, maxLen, jinaTimeout, verbose }
 * @returns {Promise<Object>} Oggetto risultati + pageText formattato str
 */
export async function webSearch(query, parallel = false, opts = {}) {
    const { ddgResults = 3, maxLen = 4000, jinaTimeout = 8000, verbose = false } = opts;

    const cached = searchCache.get(query);
    if (cached) {
        return { results: cached.results, pageText: cached.pageText };
    }

    let results, userAgent;
    const res = await ddgCircuit.execute(() => doSearch(query, ddgResults));
    results = res.results;
    userAgent = res.userAgent;

    const fetchOpts = { jinaTimeout, maxLen, verbose };
    let pageText = '';

    if (parallel) {
        const pages = await Promise.all(results.map(r => fetchPageContent(r.url, userAgent, fetchOpts)));
        pageText = pages.filter(Boolean).join('\n\n');
    } else {
        if (results[0]) {
            pageText = await fetchPageContent(results[0].url, userAgent, fetchOpts);
        }
    }

    const resultData = { results, pageText };
    searchCache.set(query, resultData);
    return resultData;
}
