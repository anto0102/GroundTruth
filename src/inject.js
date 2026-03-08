/**
 * @module inject
 * @description Gestisce l'aggiunta o check dei file skills GEMINI.md system.
 */
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { chalk, log, LOG_WARN, LOG_REFRESH } from './logger.js';
import { atomicWrite } from './utils/atomic-write.js';

const LOCK_RETRY_DELAY = 100;
const LOCK_MAX_RETRIES = 50; // Total ~5 seconds

async function withFileLock(filePath, fn) {
    const lockPath = filePath + '.lock';
    let acquired = false;

    for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
        try {
            const handle = await fs.open(lockPath, 'wx');
            await handle.close();
            acquired = true;
            break;
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
            // Check if lock exists but is stale (older than 10 seconds)
            try {
                const stats = await fs.stat(lockPath);
                if (Date.now() - stats.mtimeMs > 10000) {
                    await fs.unlink(lockPath).catch(() => { });
                    i--; // Decrement to retry same index after continue
                    continue;
                }
            } catch (_) { }
            await new Promise(r => setTimeout(r, LOCK_RETRY_DELAY));
        }
    }

    if (!acquired) throw new Error(`Could not acquire lock for ${filePath}`);

    try {
        return await fn();
    } finally {
        await fs.unlink(lockPath).catch(() => { });
    }
}

// ─── Document injection rules ────────────────────────

/**
 * @description Aggiorna block target per block id customizzati in hash
 * @param {string} filePath - Absolute path write operation target rule doc file
 * @param {string} content  - Content plain formattato markdown text raw update
 * @param {string} blockId  - identificativo 8 char associato
 * @returns {Promise<void>}
 */
export async function injectBlock(filePath, content, blockId) {
    return withFileLock(filePath, async () => {
        let fileContent = '';
        if (existsSync(filePath)) {
            fileContent = await fs.readFile(filePath, 'utf8');
        }
        const startTag = `<!-- groundtruth:block-${blockId}:start -->`;
        const endTag = `<!-- groundtruth:block-${blockId}:end -->`;
        const block = `${startTag}\n${content.trim()}\n${endTag}`;

        const startIndex = fileContent.indexOf(startTag);
        const endIndex = fileContent.indexOf(endTag);

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            // Sostituisce il blocco esistente mantenendo il resto del file intatto
            const before = fileContent.slice(0, startIndex);
            const after = fileContent.slice(endIndex + endTag.length);
            fileContent = before + block + after;
        } else {
            // Aggiunge in fondo se non esiste
            fileContent = fileContent.trimEnd() + '\n\n' + block + '\n';
        }

        await atomicWrite(filePath, fileContent);
    });
}

/**
 * @description Identifica blocchi dipendenze vecchi invalidati e li cancella dal file
 * @param {string} filePath       - File path workspace markdown context rules locale
 * @param {Set}    activeBlockIds - ids attivi elaborati nel watcher logic timer task loop cycle
 * @returns {Promise<void>}
 */
export async function removeStaleBlocks(filePath, activeBlockIds) {
    if (!existsSync(filePath)) return;
    return withFileLock(filePath, async () => {
        let fileContent = await fs.readFile(filePath, 'utf8');
        const regex = /<!-- groundtruth:block-([\w-]+):start -->[\s\S]*?<!-- groundtruth:block-\1:end -->/g;

        let modified = false;
        fileContent = fileContent.replace(regex, (match, blockId) => {
            if (!activeBlockIds.has(blockId)) {
                log(LOG_REFRESH, chalk.yellow, chalk.white(`removed stale block ${blockId} from GEMINI.md`));
                modified = true;
                return '';
            }
            return match;
        });

        if (modified) {
            fileContent = fileContent.replace(/\n{3,}/g, '\n\n').trim() + '\n';
            await atomicWrite(filePath, fileContent);
        }
    });
}

/**
 * @description Interfaccia logic per sincronizzare multiple blocks local workspace skill context
 * @param {Array} blocks  - Blocchi aggiornati
 * @returns {Promise<void>}
 */
export async function updateGeminiFiles(blocks, cwd = process.cwd()) {
    const homeDir = os.homedir();
    const rulesDir = path.join(cwd, '.gemini');
    await fs.mkdir(rulesDir, { recursive: true });
    const skillFile = path.join(rulesDir, 'GEMINI.md');

    let globalBaseDir;
    if (process.platform === 'win32' && process.env.APPDATA) {
        globalBaseDir = path.join(process.env.APPDATA, 'antigravity');
    } else {
        globalBaseDir = path.join(homeDir, '.gemini');
    }

    const globalRulesDir = globalBaseDir;
    await fs.mkdir(globalRulesDir, { recursive: true });
    const globalSkillFile = path.join(globalRulesDir, 'GEMINI.md');

    const samePath = path.resolve(globalSkillFile) === path.resolve(skillFile);

    for (const b of blocks) {
        if (samePath) {
            await injectBlock(skillFile, b.workspaceContent, b.blockId);
        } else {
            await injectBlock(globalSkillFile, b.globalContent, b.blockId);
            await injectBlock(skillFile, b.workspaceContent, b.blockId);
        }
    }
}
