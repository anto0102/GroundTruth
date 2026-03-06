/**
 * @module packages
 * @description Utilita per estrarre il package array e generare queries LLM.
 */
import fs from 'fs';
import path from 'path';

// ─── Logica Dipendenze ───────────────────────────────

/**
 * @description Analizza deps di system locali escludendo packages non rilevanti
 * @param {number} maxPackages - Numero massimo dipendenze limit da includere
 * @returns {Array|null} Array strings stack locale o null in fallback error
 */
export function readPackageDeps(maxPackages = 3) {
    try {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        if (!fs.existsSync(pkgPath)) return null;
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        // Rimuoviamo adapter ed utilities varie per limitare queries a nomi chiave
        const excludeList = ["plugin", "adapter", "check", "eslint", "prettier", "vite", "rollup", "webpack", "babel"];

        // Filtro pulizia mapping package json entries
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
        if (selected.length < maxPackages) {
            selected = selected.concat(filterAndFormat(pkg.devDependencies));
        }
        selected = selected.slice(0, maxPackages); // Capped at parameter max

        return selected.length > 0 ? selected : null;
    } catch (_) {
        return null;
    }
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
