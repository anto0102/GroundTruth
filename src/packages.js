/**
 * @module packages
 * @description Utilita per estrarre il package array e generare queries LLM a blocchi.
 */
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { chalk, log, LOG_WARN } from './logger.js';
import { resolveAlias } from './aliases.js';

// ─── Logica Dipendenze ───────────────────────────────

const EXACT_EXCLUDE = new Set(['eslint', 'prettier', 'vite', 'rollup', 'webpack', 'babel', 'turbo', 'esbuild']);
const SUBSTR_EXCLUDE = ['plugin', 'adapter', '-check', 'lint-staged'];

/**
 * @description Analizza deps di system locali escludendo packages non rilevanti
 * @returns {Promise<Array|null>} Array strings stack locale o null in fallback error
 */
export async function readPackageDeps() {
    try {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        try {
            await fs.access(pkgPath);
        } catch (_) {
            return null;
        }
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));


        const filterAndFormat = (depsObj) => {
            if (!depsObj) return [];
            return Object.entries(depsObj)
                .filter(([n]) => {
                    const lower = n.toLowerCase();
                    const base = lower.startsWith('@') ? lower.split('/')[1] : lower;
                    if (EXACT_EXCLUDE.has(base)) return false;
                    if (SUBSTR_EXCLUDE.some(ex => lower.includes(ex))) return false;
                    return true;
                })
                .map(([n, v]) => {
                    let cleanName = resolveAlias(n);
                    let cleanVersion = String(v).replace(/[\^~>=<]/g, '').split('.').slice(0, 2).join('.');
                    return `${cleanName} ${cleanVersion}`;
                });
        };

        const depMap = new Map();
        for (const [n, v] of Object.entries(pkg.dependencies || {})) {
            depMap.set(n, v);
        }
        for (const [n, v] of Object.entries(pkg.devDependencies || {})) {
            if (!depMap.has(n)) depMap.set(n, v);
        }

        const selected = filterAndFormat(Object.fromEntries(depMap));
        return selected.length > 0 ? selected : null;
    } catch (err) {
        log(LOG_WARN, chalk.yellow, chalk.white('package.json parse error') + `  →  ${chalk.yellow(err.message)}`);
        return null;
    }
}

/**
 * @description Raggruppa l'array delle dipendenze in chunk di dimensione fissa.
 * @param {Array}  deps      - Array completo formattato
 * @param {number} batchSize - Dimensione forzata dei chuncks
 * @returns {Array<Array>} Array bidimensionale aggregato a batches 
 */
export function groupIntoBatches(deps, batchSize = 3) {
    if (!deps || !deps.length) return [];
    const batches = [];
    for (let i = 0; i < deps.length; i += batchSize) {
        batches.push(deps.slice(i, i + batchSize));
    }
    return batches;
}

/**
 * @description Genera crypto hash string id da chunk object signature elements array
 * @param {Array} batch - chunk elements content package string names 
 * @returns {string} short 8 character identifier digest
 */
export function batchHash(batch) {
    return createHash('md5')
        .update(batch.join(','))
        .digest('hex')
        .slice(0, 8);
}

/**
 * @description Costruisce logica query concats DDG su input array e hardcoded filter.
 * @param   {Array} deps   - Array validato input dipendenze system
 * @returns {string} Target string duck duck query
 */
export function buildQuery(deps) {
    const year = new Date().getFullYear();
    if (deps && deps.length > 0) {
        return `${deps.join(' ')} latest ${year}`;
    }
    return `javascript web development best practices ${year}`;
}
