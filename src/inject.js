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

// ─── Document injection rules ────────────────────────

/**
 * @description Aggiorna block target per block id customizzati in hash
 * @param {string} filePath - Absolute path write operation target rule doc file
 * @param {string} content  - Content plain formattato markdown text raw update
 * @param {string} blockId  - identificativo 8 char associato
 * @returns {Promise<void>}
 */
export async function injectBlock(filePath, content, blockId) {
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
        fileContent = fileContent.slice(0, startIndex) + block + fileContent.slice(endIndex + endTag.length);
    } else {
    }

    await atomicWrite(filePath, fileContent);
}

/**
 * @description Identifica blocchi dipendenze vecchi invalidati e li cancella dal file
 * @param {string} filePath       - File path workspace markdown context rules locale
 * @param {Set}    activeBlockIds - ids attivi elaborati nel watcher logic timer task loop cycle
 * @returns {Promise<void>}
 */
export async function removeStaleBlocks(filePath, activeBlockIds) {
    if (!existsSync(filePath)) return;
    let fileContent = await fs.readFile(filePath, 'utf8');
    const regex = /<!-- groundtruth:block-(\w+):start -->[\s\S]*?<!-- groundtruth:block-\w+:end -->/g;

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
}

/**
 * @description Interfaccia logic per sincronizzare multiple blocks local workspace skill context
 * @param {Array} blocks  - Blocchi aggiornati
 * @returns {Promise<void>}
 */
export async function updateGeminiFiles(blocks) {
    const homeDir = os.homedir();
    const rulesDir = path.join(process.cwd(), '.gemini');
    await fs.mkdir(rulesDir, { recursive: true });
    const skillFile = path.join(rulesDir, 'GEMINI.md');

    const globalRulesDir = path.join(homeDir, '.gemini');
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
