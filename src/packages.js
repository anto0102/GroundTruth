/**
 * @module packages
 * @description Utilita per estrarre il package array e generare queries LLM a blocchi.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

// ─── Logica Dipendenze ───────────────────────────────

/**
 * @description Analizza deps di system locali escludendo packages non rilevanti
 * @returns {Array|null} Array strings stack locale o null in fallback error
 */
export function readPackageDeps() {
    try {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        if (!fs.existsSync(pkgPath)) return null;
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        const excludeList = ["plugin", "adapter", "check", "eslint", "prettier", "vite", "rollup", "webpack", "babel"];

        const filterAndFormat = (depsObj) => {
            if (!depsObj) return [];
            return Object.entries(depsObj)
                .filter(([n]) => !excludeList.some(ex => n.toLowerCase().includes(ex)))
                .map(([n, v]) => {
                    let cleanName = n;
                    if (n === '@sveltejs/kit') cleanName = 'sveltekit';
                    else if (n.startsWith('@')) cleanName = n.split('/')[1];
                    let cleanVersion = String(v).replace(/[\^~>=<]/g, '').split('.').slice(0, 2).join('.');
                    return `${cleanName} ${cleanVersion}`;
                });
        };

        let selected = filterAndFormat(pkg.dependencies);
        selected = selected.concat(filterAndFormat(pkg.devDependencies));

        return selected.length > 0 ? selected : null;
    } catch (_) {
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
    if (deps && deps.length > 0) {
        return `${deps.join(' ')} latest 2026`;
    }
    return 'javascript web development best practices 2026';
}
