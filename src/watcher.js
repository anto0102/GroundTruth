/**
 * @module watcher
 * @description Timer poll di Antigravity update locale skill inject doc rules.
 */
import { webSearch } from './search.js';
import { readPackageDeps, buildQuery } from './packages.js';
import { updateGeminiFiles } from './inject.js';
import { chalk, label, log, LOG_WARN } from './logger.js';

// ─── Scheduler Watcher Instance ──────────────────────

/**
 * @description Bootstrap del ciclo event intervallato update timer markdown file
 * @param {Object}  opts                 - Param object setup watcher args setup
 * @param {number}  opts.intervalMinutes - Configurato timer minuti cli arg
 * @param {boolean} opts.usePackageJson  - Usa package json legacy arg object compat
 * @param {number}  opts.maxPackages     - Maximum allowed packages parsing cap object query config
 */
export function startWatcher({ intervalMinutes, usePackageJson, maxPackages }) {
    const depEntries = readPackageDeps(maxPackages);
    const stackStr = depEntries
        ? depEntries.join(', ')
        : 'javascript web development';
    const query = buildQuery(depEntries);

    const globalSkillFilePretty = '~/.gemini/GEMINI.md';
    const skillFilePretty = '.gemini/GEMINI.md';

    console.log();
    console.log(`  ${chalk.white.bold('GroundTruth')}  ${chalk.gray('v0.1.0')}  ${chalk.gray('[antigravity mode]')}`);
    console.log();
    console.log(label('◆', 'global', globalSkillFilePretty));
    console.log(label('◆', 'workspace', skillFilePretty));
    console.log(label('◆', 'stack', stackStr));
    console.log(label('◆', 'interval', `every ${intervalMinutes} min`));
    console.log(label('◆', 'packages', `max ${maxPackages} targets`));
    console.log(label('◆', 'context', 'DuckDuckGo → live'));
    console.log();
    console.log(`  ${chalk.cyan('✻')} Running. Antigravity will load context automatically.`);
    console.log();

    let previousDepsKey = null;
    let previousContent = null;

    async function updateSkill() {
        // Evaluate logic dependencies comparison object changes state ref skip updates config
        const currentDeps = readPackageDeps(maxPackages);
        const currentKey = JSON.stringify(currentDeps);

        if (currentKey === previousDepsKey) {
            log(LOG_REFRESH, chalk.gray, chalk.white('no changes detected') + `  →  ${chalk.gray('skipped')}`);
            return; // salta questo ciclo
        }

        if (previousDepsKey !== null) {
            const prevStack = JSON.parse(previousDepsKey) || [];
            const currStack = currentDeps || [];
            const added = currStack.filter(d => !prevStack.includes(d));
            const removed = prevStack.filter(d => !currStack.includes(d));

            const diffParts = [];
            if (added.length) diffParts.push(chalk.green(`+${added.join(', +')}`));
            if (removed.length) diffParts.push(chalk.red(`-${removed.join(', -')}`));

            log(LOG_REFRESH, chalk.cyan, chalk.white('deps changed') + ` (${diffParts.join(', ')})  →  ${chalk.cyan('updating')}`);
        }
        previousDepsKey = currentKey;

        // Re-calculate stackStr/query string parameters
        const stackStr = currentDeps ? currentDeps.join(', ') : 'javascript web development';
        const query = buildQuery(currentDeps);

        const now = new Date();
        const nextTs = new Date(now.getTime() + intervalMinutes * 60 * 1000);
        try {
            const { results, pageText } = await webSearch(query, false);
            const firstUrl = results[0]?.url || '';

            let globalMd = `## Live Web Context (${now.toLocaleString('it-IT')})\n`;
            globalMd += `Stack: ${stackStr}\n`;
            if (results.length > 0) {
                globalMd += `Source: ${results[0].url}\n`;
                globalMd += `${results[0].snippet.slice(0, 300)}\n`;
            }

            let md = `## Live Web Context — ${now.toLocaleString('it-IT')}\n`;
            md += `**Stack rilevato:** ${stackStr}\n`;
            md += `**Fonte:** DuckDuckGo → ${firstUrl}\n\n`;
            md += `### Risultati ricerca: "${query}"\n\n`;

            for (const r of results) {
                md += `#### ${r.title}\n${r.snippet} — ${r.url}\n\n`;
            }
            if (pageText) {
                md += `### Documentazione completa\n${pageText}\n\n`;
            }
            md += `*Aggiornato: ${now.toISOString()} | Prossimo aggiornamento: ${nextTs.toISOString()}*\n`;

            const badSignals = ['403', 'captcha', 'blocked', 'access denied', 'forbidden'];
            const isBad = !pageText || pageText.length < 200 || badSignals.some(s => pageText.toLowerCase().includes(s));

            if (isBad && previousContent) {
                log(LOG_WARN, chalk.yellow, chalk.white('low quality result') + `  →  ${chalk.yellow('keeping previous context')}`);
                return; // non sovrascrivere
            }

            previousContent = { globalContent: globalMd, workspaceContent: md };

            updateGeminiFiles(globalMd, md, stackStr, results.length);
        } catch (e) {
            log(LOG_WARN, chalk.yellow, chalk.white('web fetch failed') + `  →  ${chalk.yellow(e.message)}`);
        }
    }

    // Lancio a startup immediato
    updateSkill();
    setInterval(updateSkill, intervalMinutes * 60 * 1000);
}
