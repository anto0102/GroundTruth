/**
 * @module env
 * @description Scrive config automagica in files dot rc zsh/fish/bash sessione auth.
 */
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { chalk, LOG_WARN, LOG_OK, log } from './logger.js';
import { atomicWrite } from './utils/atomic-write.js';

// ─── Setup shell environment ─────────────────────────

/**
 * @description Suggerisce il setup dell'environment variables se non settate correttamente.
 * @param {number} p - HTTP default porta su local instance target
 * @returns {Promise<void>}
 */
export async function autoSetEnv(p) {
    const targetUrl = `http://localhost:${p}`;

    // Se è già settata correttamente, non facciamo nulla
    if (process.env.ANTHROPIC_BASE_URL === targetUrl) {
        return;
    }

    const homeDir = os.homedir();
    const fishConfigFile = path.join(homeDir, '.config', 'fish', 'config.fish');
    const isFish = process.env.SHELL?.includes('fish') || existsSync(fishConfigFile);

    const hint = isFish
        ? `set -gx ANTHROPIC_BASE_URL ${targetUrl}`
        : `export ANTHROPIC_BASE_URL=${targetUrl}`;

    log(LOG_WARN, chalk.yellow, chalk.white('ANTHROPIC_BASE_URL not set to GroundTruth') + `  →  ${chalk.yellow(targetUrl)}`);
    log(LOG_WARN, chalk.yellow, chalk.white('Add this to your shell profile to use Claude Code:') + `\n\n    ${chalk.bold(chalk.cyan(hint))}\n`);

    // Impostiamo per la sessione corrente comunque
    process.env.ANTHROPIC_BASE_URL = targetUrl;
}

/**
 * @description Rimuove ANTHROPIC_BASE_URL da tutti i file di configurazione shell.
 * @returns {Promise<void>}
 */
export async function removeEnv() {
    const homeDir = os.homedir();
    const targets = [
        { file: path.join(homeDir, '.zshrc'), pattern: /^export ANTHROPIC_BASE_URL=.*\n?/gm },
        { file: path.join(homeDir, '.bashrc'), pattern: /^export ANTHROPIC_BASE_URL=.*\n?/gm },
        { file: path.join(homeDir, '.bash_profile'), pattern: /^export ANTHROPIC_BASE_URL=.*\n?/gm },
        { file: path.join(homeDir, '.profile'), pattern: /^export ANTHROPIC_BASE_URL=.*\n?/gm },
        { file: path.join(homeDir, '.config', 'fish', 'config.fish'), pattern: /^set -gx ANTHROPIC_BASE_URL .*\n?/gm },
    ];

    let cleaned = 0;
    for (const t of targets) {
        if (!existsSync(t.file)) continue;
        try {
            const content = await fs.readFile(t.file, 'utf8');
            const result = content.replace(t.pattern, '').replace(/\n{3,}/g, '\n\n');
            if (result !== content) {
                await atomicWrite(t.file, result);
                const rel = t.file.replace(homeDir, '~');
                log(LOG_OK, chalk.green, chalk.white('removed ANTHROPIC_BASE_URL from') + ' ' + chalk.white(rel));
                cleaned++;
            }
        } catch (e) {
            log(LOG_WARN, chalk.yellow, chalk.white(`cannot clean ${path.basename(t.file)}`) + `  →  ${chalk.yellow(e.message)}`);
        }
    }

    if (cleaned === 0) {
        log(LOG_WARN, chalk.yellow, chalk.white('nothing to clean') + `  →  ${chalk.yellow('no ANTHROPIC_BASE_URL found in shell configs')}`);
    } else {
        log(LOG_OK, chalk.green, chalk.white(`cleaned ${cleaned} file(s)`));
    }

    delete process.env.ANTHROPIC_BASE_URL;
}
