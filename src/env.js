/**
 * @module env
 * @description Scrive config automagica in files dot rc zsh/fish/bash sessione auth.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { chalk, ts, LOG_WARN, LOG_OK, log } from './logger.js';

// ─── Setup shell environment ─────────────────────────

/**
 * @description Applica environment variables a vari rc profile bash fish unix
 * @param {number} p - HTTP default porta su local instance target
 */
export function autoSetEnv(p) {
    if (process.platform === 'win32') return;
    try {
        const targetUrl = `http://localhost:${p}`;
        if (process.env.ANTHROPIC_BASE_URL === targetUrl) return;

        const homeDir = os.homedir();
        // Test exist pattern specifico shell config di fish locale
        const isFish = process.env.SHELL?.includes('fish') || fs.existsSync(`${homeDir}/.config/fish/config.fish`);
        let foundAny = false;
        const modifiedFiles = [];

        if (isFish) {
            const fishConfigFile = path.join(homeDir, '.config', 'fish', 'config.fish');
            fs.mkdirSync(path.dirname(fishConfigFile), { recursive: true });
            foundAny = true;
            try {
                let content = fs.existsSync(fishConfigFile) ? fs.readFileSync(fishConfigFile, 'utf8') : '';
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

                if (modified) { fs.writeFileSync(fishConfigFile, newLines.join('\n'), 'utf8'); modifiedFiles.push(fishConfigFile); }
            } catch (e) {
                log(LOG_WARN, chalk.yellow, chalk.white('cannot write fish config') + `  →  ${chalk.yellow(e.message)}`);
            }
        } else {
            const shellFiles = ['.zshrc', '.bashrc', '.bash_profile', '.profile'].map(f => path.join(homeDir, f));
            for (const file of shellFiles) {
                if (!fs.existsSync(file)) continue;
                foundAny = true;
                try {
                    const content = fs.readFileSync(file, 'utf8');
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

                    if (modified) { fs.writeFileSync(file, newLines.join('\n'), 'utf8'); modifiedFiles.push(file); }
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
