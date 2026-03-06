/**
 * @module env
 * @description Scrive config automagica in files dot rc zsh/fish/bash sessione auth.
 */
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { chalk, ts, LOG_WARN, LOG_OK, log } from './logger.js';
import { atomicWrite } from './utils/atomic-write.js';

// ─── Setup shell environment ─────────────────────────

/**
 * @description Applica environment variables a vari rc profile bash fish unix
 * @param {number} p - HTTP default porta su local instance target
 * @returns {Promise<void>} Operazione asincrona
 */
export async function autoSetEnv(p) {
    if (process.platform === 'win32') return;
    try {
        const targetUrl = `http://localhost:${p}`;
        if (process.env.ANTHROPIC_BASE_URL === targetUrl) return;

        const homeDir = os.homedir();
        // Test exist pattern specifico shell config di fish locale
        const isFish = process.env.SHELL?.includes('fish') || existsSync(`${homeDir}/.config/fish/config.fish`);
        let foundAny = false;
        const modifiedFiles = [];

        if (isFish) {
            const fishConfigFile = path.join(homeDir, '.config', 'fish', 'config.fish');
            await fs.mkdir(path.dirname(fishConfigFile), { recursive: true });
            foundAny = true;
            try {
                let content = existsSync(fishConfigFile) ? await fs.readFile(fishConfigFile, 'utf8') : '';
                const lines = content ? content.split('\n') : [];
                let modified = false, foundExport = false;

                const newLines = lines.map(line => {
                    if (line.trim().startsWith('set -gx ANTHROPIC_BASE_URL')) {
                        foundExport = true;
                        if (line.trim() !== `set -gx ANTHROPIC_BASE_URL ${targetUrl}`) { modified = true; return `set -gx ANTHROPIC_BASE_URL ${targetUrl}`; }
                    }
                    return line;
                });

                if (!foundExport) {
                    if (newLines.length > 0 && newLines[newLines.length - 1] === '') {
                        newLines[newLines.length - 1] = `set -gx ANTHROPIC_BASE_URL ${targetUrl}`;
                        newLines.push('');
                    } else {
                        newLines.push(`set -gx ANTHROPIC_BASE_URL ${targetUrl}`);
                    }
                    modified = true;
                }

                if (modified) {
                    await atomicWrite(fishConfigFile, newLines.join('\n'));
                    modifiedFiles.push(fishConfigFile);
                }
            } catch (e) {
                log(LOG_WARN, chalk.yellow, chalk.white('cannot write fish config') + `  →  ${chalk.yellow(e.message)}`);
            }
        } else {
            const shellFiles = ['.zshrc', '.bashrc', '.bash_profile', '.profile'].map(f => path.join(homeDir, f));
            for (const file of shellFiles) {
                if (!existsSync(file)) continue;
                foundAny = true;
                try {
                    const content = await fs.readFile(file, 'utf8');
                    const lines = content.split('\n');
                    let modified = false, foundExport = false;

                    const newLines = lines.map(line => {
                        if (line.trim().startsWith('export ANTHROPIC_BASE_URL=')) {
                            foundExport = true;
                            if (line.trim() !== `export ANTHROPIC_BASE_URL=${targetUrl}`) { modified = true; return `export ANTHROPIC_BASE_URL=${targetUrl}`; }
                        }
                        return line;
                    });

                    if (!foundExport) {
                        if (newLines.length > 0 && newLines[newLines.length - 1] === '') {
                            newLines[newLines.length - 1] = `export ANTHROPIC_BASE_URL=${targetUrl}`;
                            newLines.push('');
                        } else {
                            newLines.push(`export ANTHROPIC_BASE_URL=${targetUrl}`);
                        }
                        modified = true;
                    }

                    if (modified) {
                        await atomicWrite(file, newLines.join('\n'));
                        modifiedFiles.push(file);
                    }
                } catch (e) {
                    log(LOG_WARN, chalk.yellow, chalk.white(`cannot write ${path.basename(file)}`) + `  →  ${chalk.yellow(e.message)}`);
                }
            }
        }

        if (!foundAny) {
            const hint = isFish
                ? `set -gx ANTHROPIC_BASE_URL ${targetUrl}`
                : `export ANTHROPIC_BASE_URL=${targetUrl}`;
            log(LOG_WARN, chalk.yellow, chalk.white('no shell config found') + `  →  ${chalk.yellow('add manually: ' + hint)}`);
        } else if (modifiedFiles.length > 0) {
            // Segnala write su standard node path a console utente post process
            modifiedFiles.forEach(file => {
                const rel = file.replace(homeDir, '~');
                log(LOG_OK, chalk.green, chalk.white('ANTHROPIC_BASE_URL written to') + ' ' + chalk.white(rel));
            });
        }

        process.env.ANTHROPIC_BASE_URL = targetUrl;
    } catch (err) {
        log(LOG_WARN, chalk.yellow, chalk.white('env setup error') + `  →  ${chalk.yellow(err.message)}`);
    }
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
