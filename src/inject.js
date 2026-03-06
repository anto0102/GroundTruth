/**
 * @module inject
 * @description Gestisce l'aggiunta o check dei file skills GEMINI.md system.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { chalk, log, LOG_WARN, LOG_REFRESH } from './logger.js';

// ─── Document injection rules ────────────────────────

/**
 * @description Aggiorna tag di groundtruth regex matched o block inject in file txt.
 * @param {string} filePath - Absolute path write operation target rule doc file
 * @param {string} content  - Content plain formattato markdown text raw update
 */
export function injectBlock(filePath, content) {
    let fileContent = '';
    if (fs.existsSync(filePath)) {
        fileContent = fs.readFileSync(filePath, 'utf8');
    }
    const startTag = '<!-- groundtruth:start -->';
    const endTag = '<!-- groundtruth:end -->';
    const block = `${startTag}\n${content.trim()}\n${endTag}`;

    const startIndex = fileContent.indexOf(startTag);
    const endIndex = fileContent.indexOf(endTag);

    // Appenda a vuoto se empty content o se regex bounds match limits trovati
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        fileContent = fileContent.slice(0, startIndex) + block + fileContent.slice(endIndex + endTag.length);
    } else {
        fileContent = fileContent.trimEnd() + (fileContent.trimEnd() ? '\n\n' : '') + block + '\n';
    }
    fs.writeFileSync(filePath, fileContent, 'utf8');
}

/**
 * @description Interfaccia logic per sincronizzare folder local workspace skill context
 * @param {string} globalContent  - Content locale short
 * @param {string} workspaceContent - Content root extended doc format context
 * @param {string} stackStr       - Output text system cli notification
 * @param {number} resultsLength  - Notifica items numero log console metric proxy
 */
export function updateGeminiFiles(globalContent, workspaceContent, stackStr, resultsLength) {
    const homeDir = os.homedir();
    const rulesDir = path.join(process.cwd(), '.gemini');
    fs.mkdirSync(rulesDir, { recursive: true });
    const skillFile = path.join(rulesDir, 'GEMINI.md');

    const globalRulesDir = path.join(homeDir, '.gemini');
    fs.mkdirSync(globalRulesDir, { recursive: true });
    const globalSkillFile = path.join(globalRulesDir, 'GEMINI.md');

    if (path.resolve(globalSkillFile) === path.resolve(skillFile)) {
        injectBlock(skillFile, workspaceContent);
        // In node process su base dir i rules local coincideranno root
        log(LOG_WARN, chalk.yellow, chalk.white('global e workspace coincidono → scritto solo workspace'));
    } else {
        injectBlock(globalSkillFile, globalContent);
        injectBlock(skillFile, workspaceContent);
        log(
            LOG_REFRESH, chalk.cyan,
            chalk.white('global + workspace updated') +
            `  →  ${chalk.white(stackStr.slice(0, 40))}  →  ${chalk.cyan.bold(String(resultsLength))} ${chalk.cyan('results')}`
        );
    }
}
