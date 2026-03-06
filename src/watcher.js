/**
 * @module watcher
 * @description Timer poll di Antigravity update locale skill inject doc rules, ora con caching a batch blocchi separati.
 */
import os from 'os';
import path from 'path';
import { webSearch } from './search.js';
import { readPackageDeps, buildQuery, groupIntoBatches, batchHash } from './packages.js';
import { updateGeminiFiles, removeStaleBlocks } from './inject.js';
import { chalk, label, log, LOG_WARN, LOG_REFRESH } from './logger.js';
import { version } from './cli.js';

// ─── Scheduler Watcher Instance ──────────────────────

export function startWatcher({ intervalMinutes, usePackageJson, batchSize }) {
    const homeDir = os.homedir();
    const globalPath = path.join(homeDir, '.gemini', 'GEMINI.md');
    const workspacePath = path.join(process.cwd(), '.gemini', 'GEMINI.md');

    const globalSkillFilePretty = '~/.gemini/GEMINI.md';
    const skillFilePretty = '.gemini/GEMINI.md';

    console.log();
    console.log(`  ${chalk.white.bold('GroundTruth')}  ${chalk.gray(`v${version}`)}  ${chalk.gray('[antigravity mode]')}`);
    console.log();
    console.log(label('◆', 'global', globalSkillFilePretty));
    console.log(label('◆', 'workspace', skillFilePretty));
    console.log(label('◆', 'interval', `every ${intervalMinutes} min`));
    console.log(label('◆', 'batch_size', `chunk limit ${batchSize}`));
    console.log(label('◆', 'context', 'DuckDuckGo → live'));
    console.log();
    console.log(`  ${chalk.cyan('✻')} Running. Antigravity will load context automatically.`);
    console.log();

    const previousBatchHashes = new Map();

    async function updateSkill() {
        const deps = readPackageDeps(); // tutte le deps
        if (!deps || deps.length === 0) {
            return; // fall back to something default or just skip 
        }

        const batches = groupIntoBatches(deps, batchSize);
        const activeBlockIds = new Set();
        let updatedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        await Promise.all(batches.map(async (batch) => {
            const blockId = batchHash(batch);
            activeBlockIds.add(blockId);

            const currentHash = batchHash(batch);
            if (previousBatchHashes.get(blockId) === currentHash) {
                // batch invariato → skip
                skippedCount++;
                return;
            }

            // batch cambiato o nuovo → cerca
            const query = buildQuery(batch);
            try {
                const { results, pageText } = await webSearch(query, false);

                // quality check
                const badSignals = ['403', 'captcha', 'blocked', 'access denied', 'forbidden'];
                const isBad = !pageText || pageText.length < 200 || badSignals.some(s => pageText.toLowerCase().includes(s));
                if (isBad && previousBatchHashes.has(blockId)) {
                    log(LOG_WARN, chalk.yellow, `low quality result for block ${blockId} → keeping previous context`);
                    failedCount++;
                    return; // non sovrascrivere
                }

                const now = new Date();
                const nowStr = now.toLocaleString('it-IT');
                const batchTitle = batch.map(b => b.split(' ')[0]).join(', '); // extracting base name

                let globalMd = `## Live Context — ${batchTitle} (${nowStr})\n`;
                globalMd += `**Query:** ${query}\n\n`;
                if (results.length > 0) {
                    globalMd += `### ${results[0].title}\n`;
                    globalMd += `${results[0].snippet.slice(0, 300)} — ${results[0].url}\n`;
                }

                let md = `## Live Context — ${batchTitle} (${nowStr})\n`;
                md += `**Query:** ${query}\n\n`;
                for (const r of results) {
                    md += `### ${r.title}\n${r.snippet} — ${r.url}\n\n`;
                }
                if (pageText) {
                    md += `FULL TEXT: ${pageText}\n`;
                }

                await updateGeminiFiles([{
                    blockId,
                    globalContent: globalMd,
                    workspaceContent: md
                }]);

                previousBatchHashes.set(blockId, currentHash);
                updatedCount++;
                log(LOG_REFRESH, chalk.cyan, `block ${blockId} updated → ${batch.join(', ')}`);
            } catch (e) {
                failedCount++;
                log(LOG_WARN, chalk.yellow, `block ${blockId} fetch failed → keeping previous`);
            }
        }));

        removeStaleBlocks(globalPath, activeBlockIds);
        removeStaleBlocks(workspacePath, activeBlockIds);

        log(LOG_REFRESH, chalk.gray, `cycle done → ${activeBlockIds.size} blocks active, ${updatedCount} updated, ${skippedCount} skipped, ${failedCount} errors`);
    }

    // Lancio a startup immediato
    updateSkill();
    setInterval(updateSkill, intervalMinutes * 60 * 1000);
}
