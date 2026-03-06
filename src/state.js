/**
 * @module state
 * @description Persiste la memoria di antigravity prev-hash per fault tolleranza riavvii.
 */
import { readFile, mkdir } from 'fs/promises';
import { atomicWrite } from './utils/atomic-write.js';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const STATE_DIR = path.join(os.homedir(), '.groundtruth');
const STATE_FILE = path.join(STATE_DIR, 'watcher-state.json');

/**
 * @description Carica gli hash validati e memorizzati dallo schedule storage locale.
 * @returns {Promise<Map>} Restituisce le hash map entries persistite del cron logic stream precedente.
 */
export async function loadBatchState() {
    try {
        if (!existsSync(STATE_FILE)) return new Map();
        const data = await readFile(STATE_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return new Map(Object.entries(parsed));
    } catch {
        return new Map();
    }
}

/**
 * @description Sincronizza hash batches per fault tolerance cross process
 * @param {Map} map - Oggetto dei blocchi hashati validi in mem persist state map
 * @returns {Promise<void>} 
 */
export async function saveBatchState(map) {
    await mkdir(STATE_DIR, { recursive: true });
    const obj = Object.fromEntries(map);
    await atomicWrite(STATE_FILE, JSON.stringify(obj, null, 2), { backup: false });
}
