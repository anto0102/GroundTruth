/**
 * @module state
 * @description Persiste la memoria di antigravity prev-hash per fault tolleranza riavvii.
 */
import { readFile, mkdir } from 'fs/promises';
import { atomicWrite } from './utils/atomic-write.js';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.groundtruth');
const getStateFile = (baseDir = DEFAULT_STATE_DIR) => path.join(baseDir, 'watcher-state.json');

/**
 * @description Carica gli hash validati e memorizzati dallo schedule storage locale.
 * @param {string} currentVersion - Versione attuale dell'applicazione per validare la cache.
 * @returns {Promise<Map>} Restituisce le hash map entries persistite o una mappa vuota se la versione differisce.
 */
export async function loadBatchState(currentVersion, baseDir) {
    const stateFile = getStateFile(baseDir);
    try {
        if (!existsSync(stateFile)) return { hashes: new Map(), customTs: new Map() };
        const data = await readFile(stateFile, 'utf8');
        const state = JSON.parse(data);

        // Invalida la cache se la versione è differente (forza refresh dopo update)
        if (state.version !== currentVersion) {
            return { hashes: new Map(), customTs: new Map() };
        }

        return {
            hashes: new Map(Object.entries(state.hashes || {})),
            customTs: new Map(Object.entries(state.customTs || {}))
        };
    } catch {
        return { hashes: new Map(), customTs: new Map() };
    }
}

/**
 * @description Sincronizza hash batches e versione per fault tolerance cross process.
 * @param {Map} map - Oggetto dei blocchi hashati validi.
 * @param {string} version - Versione attuale dell'applicazione.
 * @returns {Promise<void>} 
 */
export async function saveBatchState(hashesMap, customTsMap, version, baseDir) {
    const stateDir = baseDir || DEFAULT_STATE_DIR;
    const stateFile = getStateFile(stateDir);
    await mkdir(stateDir, { recursive: true });
    const state = {
        version: version,
        updatedAt: new Date().toISOString(),
        hashes: Object.fromEntries(hashesMap),
        customTs: Object.fromEntries(customTsMap)
    };
    await atomicWrite(stateFile, JSON.stringify(state, null, 2), { backup: false });
}

