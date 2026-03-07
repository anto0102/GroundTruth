/**
 * @module registry
 * @description Interroga il Cloudflare Worker (Remote Registry) per risolvere URL docs ufficiali.
 */

import { LRUCache } from './cache.js';
import { resolveAlias } from './aliases.js';

const REGISTRY_API_URL = 'https://groundtruth-registry.antony-flex01.workers.dev/lookup';

// Cache in memoria con LRU per evitare query multiple allo stesso endpoint
const registryCache = new LRUCache({ max: 1000, ttl: 60 * 60 * 1000 });

/**
 * @description Interroga asincronamente l'API cloudflare per cercare URL docs nel registry remoto
 * @param   {string} depName - Nome dipendenza da package.json (es. "svelte 5.51" o "@sveltejs/kit")
 * @returns {Promise<string|null>} URL docs diretto o null se non trovato/errore (fallback DDG cerniera)
 */
export async function lookupRegistryUrl(depName) {
    if (!depName) return null;

    // Normalizzazione preventiva
    let name = depName.split(' ')[0].toLowerCase().trim();

    // Alias mapping per framework comuni con scope npm
    name = resolveAlias(name);


    // Check hit in memoria (ritorna subito)
    const cached = registryCache.get(name);
    if (cached !== undefined) return cached;

    try {
        // Fetch asincrono con timeout stretto per evitare latenze di fallback
        const res = await fetch(`${REGISTRY_API_URL}?pkg=${encodeURIComponent(name)}`, {
            signal: AbortSignal.timeout(1500),
            headers: {
                'Accept': 'application/json',
                'X-GroundTruth-Key': process.env.GROUNDTRUTH_REGISTRY_KEY || ''
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (data && data.found && data.url) {
                registryCache.set(name, data.url); // Cache hit success
                return data.url;
            }
        }

        // Se l'API restituisce 404/not found
        registryCache.set(name, null); // Cache negative (così non rifacciamo network)
        return null;

    } catch (err) {
        // Failover silente! (timeout o worker rotto). Se Cloudflare fallisce, 
        // noi non diamo errore all'utente ma facciamo DDG search fallback locale naturale.
        registryCache.set(name, null);
        return null;
    }
}
