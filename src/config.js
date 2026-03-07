/**
 * @module config
 * @description Carica configurazione opzionale da .groundtruth.json nella cwd.
 */
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ─── Quality Presets ─────────────────────────────────

const QUALITY_PRESETS = {
    low: { ddgResults: 1, charsPerPage: 2000, jinaTimeout: 5000 },
    medium: { ddgResults: 3, charsPerPage: 4000, jinaTimeout: 8000 },
    high: { ddgResults: 5, charsPerPage: 8000, jinaTimeout: 12000 },
};

/**
 * @description Risolve preset quality da stringa a parametri operativi.
 * @param   {string} level - "low" | "medium" | "high"
 * @returns {Object} { ddgResults, charsPerPage, jinaTimeout }
 */
export function resolveQuality(level) {
    return QUALITY_PRESETS[level] || QUALITY_PRESETS.medium;
}

// ─── Config Defaults ─────────────────────────────────

const DEFAULTS = {
    maxTokens: 4000,
    quality: 'medium',
    verbose: false,
    sources: [],
};

/**
 * @description Carica .groundtruth.json dalla cwd, merge con defaults.
 * @returns {Promise<Object>} Configurazione finale mergiata
 */
export async function loadConfig() {
    const configPath = path.resolve(process.cwd(), '.groundtruth.json');
    if (!existsSync(configPath)) return { ...DEFAULTS };

    try {
        const raw = await readFile(configPath, 'utf8');
        const parsed = JSON.parse(raw);

        return {
            maxTokens: clamp(parsed.maxTokens ?? DEFAULTS.maxTokens, 500, 8000),
            quality: ['low', 'medium', 'high'].includes(parsed.quality) ? parsed.quality : DEFAULTS.quality,
            verbose: typeof parsed.verbose === 'boolean' ? parsed.verbose : DEFAULTS.verbose,
            sources: Array.isArray(parsed.sources) ? parsed.sources.filter(s => s && s.url) : DEFAULTS.sources,
        };
    } catch {
        return { ...DEFAULTS };
    }
}

/**
 * @description Clamp numerico con min/max bounds.
 */
function clamp(val, min, max) {
    const n = parseInt(val, 10);
    if (isNaN(n)) return min;
    return Math.max(min, Math.min(n, max));
}

export { QUALITY_PRESETS };
