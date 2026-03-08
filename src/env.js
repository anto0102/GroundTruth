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
 * @param {string} [homeDir] - Override home directory (per test)
 * @returns {Promise<void>}
 */
export async function autoSetEnv(p, homeDir = os.homedir()) {
    const targetUrl = `http://localhost:${p}`;
    if (process.env.ANTHROPIC_BASE_URL === targetUrl) return;

    const fishConfigFile = path.join(homeDir, '.config', 'fish', 'config.fish');
    const isFish = process.env.SHELL?.includes('fish') || existsSync(fishConfigFile);

    let shellFile, exportLine;
    if (isFish) {
        shellFile = fishConfigFile;
        exportLine = `set -gx ANTHROPIC_BASE_URL ${targetUrl}`;
    } else if (process.env.SHELL?.includes('zsh') || existsSync(path.join(homeDir, '.zshrc'))) {
        shellFile = path.join(homeDir, '.zshrc');
        exportLine = `export ANTHROPIC_BASE_URL=${targetUrl}`;
    } else {
        shellFile = path.join(homeDir, '.bashrc');
        exportLine = `export ANTHROPIC_BASE_URL=${targetUrl}`;
    }

    try {
        let content = '';
        try { content = await fs.readFile(shellFile, 'utf8'); } catch (_) { }

        if (!content.includes(exportLine)) {
            await atomicWrite(shellFile, content.trimEnd() + '\n\n# Added by GroundTruth\n' + exportLine + '\n');
            log(LOG_OK, chalk.green, chalk.white('auto-set ANTHROPIC_BASE_URL in') + ' ' + chalk.cyan(shellFile.replace(homeDir, '~')));
            log(LOG_WARN, chalk.yellow, chalk.white('Restart your shell or run:') + ' ' + chalk.cyan(`source ${shellFile.replace(homeDir, '~')}`));
        }
    } catch (e) {
        // Fallback: mostra solo il warning manuale
        log(LOG_WARN, chalk.yellow, chalk.white('ANTHROPIC_BASE_URL not set') + `  →  add manually: ${chalk.cyan(exportLine)}`);
    }

    process.env.ANTHROPIC_BASE_URL = targetUrl;
}

/**
 * @description Rimuove ANTHROPIC_BASE_URL da tutti i file di configurazione shell.
 * @param {string} [homeDir] - Override home directory (per test)
 * @returns {Promise<void>}
 */
export async function removeEnv(homeDir = os.homedir()) {
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
                await atomicWrite(t.file, result, { backup: true });
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
