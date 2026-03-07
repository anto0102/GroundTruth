/**
 * @module watcher
 * @description Timer poll di Antigravity update locale skill inject doc rules, con registry bypass e quality settings.
 */
import os from 'os';
import path from 'path';
import { webSearch, registryFetch, fetchPageContent } from './search.js';
import { readPackageDeps, buildQuery, groupIntoBatches, batchHash } from './packages.js';
import { sanitizeWebContent } from './sanitize.js';
import { updateGeminiFiles, removeStaleBlocks } from './inject.js';
import { chalk, label, log, LOG_WARN, LOG_REFRESH } from './logger.js';
import { version, maxTokens, quality, qualitySettings, verbose, customSources } from './cli.js';
import { loadBatchState, saveBatchState } from './state.js';
import { httpsAgent } from './http-agent.js';

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
    console.log(label('◆', 'engine', 'Jina Reader → Readability fallback'));
    console.log(label('◆', 'quality', `${quality} (${qualitySettings.ddgResults} results, ${qualitySettings.charsPerPage} chars)`));
    console.log(label('◆', 'max_tokens', `${maxTokens}`));
    if (customSources.length > 0) {
        console.log(label('◆', 'sources', `${customSources.length} custom URL(s)`));
    }
    if (verbose) console.log(label('◆', 'verbose', 'enabled'));
    console.log();
    console.log(`  ${chalk.cyan('✻')} Running. Antigravity will load context automatically.`);
    console.log();

    let previousBatchHashes = new Map();

    const searchOpts = {
        ddgResults: qualitySettings.ddgResults,
        maxLen: qualitySettings.charsPerPage,
        jinaTimeout: qualitySettings.jinaTimeout,
        verbose,
    };

    async function updateSkill() {
        if (previousBatchHashes.size === 0) {
            previousBatchHashes = await loadBatchState();
        }
        const deps = await readPackageDeps();
        if (!deps || deps.length === 0) {
            return;
        }

        const batches = groupIntoBatches(deps, batchSize);
        const activeBlockIds = new Set();
        let updatedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        const maxConcurrency = 3;
        const executing = new Set();

        for (const batch of batches) {
            const promise = (async () => {
                const blockId = batchHash(batch);
                activeBlockIds.add(blockId);

                const currentHash = batchHash(batch);
                if (previousBatchHashes.get(blockId) === currentHash) {
                    skippedCount++;
                    return;
                }

                try {
                    // ── Registry fetch per dipendenze note ──
                    const { registryText, coveredDeps } = await registryFetch(batch, searchOpts);

                    // ── DDG search per dipendenze non coperte dal registry ──
                    const uncoveredBatch = batch.filter(d => !coveredDeps.has(d));
                    let ddgText = '';
                    let results = [];

                    if (uncoveredBatch.length > 0) {
                        const query = buildQuery(uncoveredBatch);
                        try {
                            const res = await webSearch(query, false, searchOpts);
                            results = res.results;
                            ddgText = res.pageText;
                        } catch (_) {
                            if (verbose) log(LOG_WARN, chalk.yellow, `DDG search failed for: ${uncoveredBatch.join(', ')}`);
                        }
                    }

                    const combinedText = registryText + (ddgText || '');
                    const badSignals = ['403', 'captcha', 'blocked', 'access denied', 'forbidden'];
                    const isBad = !combinedText || combinedText.length < 200 || badSignals.some(s => combinedText.toLowerCase().includes(s));

                    if (isBad && previousBatchHashes.has(blockId)) {
                        log(LOG_WARN, chalk.yellow, `low quality result for block ${blockId} → keeping previous context`);
                        failedCount++;
                        return;
                    }

                    const now = new Date();
                    const nowStr = now.toLocaleString('it-IT');
                    const batchTitle = batch.map(b => b.split(' ')[0]).join(', ');

                    let globalMd = `## Live Context — ${batchTitle} (${nowStr})\n`;
                    if (registryText) {
                        globalMd += sanitizeWebContent(registryText, 500) + '\n';
                    } else if (results.length > 0) {
                        globalMd += `### ${results[0].title}\n`;
                        globalMd += `${sanitizeWebContent(results[0].snippet, 300)} — ${results[0].url}\n`;
                    }

                    let md = `## Live Context — ${batchTitle} (${nowStr})\n`;
                    if (registryText) {
                        md += sanitizeWebContent(registryText, maxTokens) + '\n\n';
                    }
                    for (const r of results) {
                        md += `### ${r.title}\n${sanitizeWebContent(r.snippet, 500)} — ${r.url}\n\n`;
                    }
                    if (ddgText) {
                        md += `FULL TEXT: ${sanitizeWebContent(ddgText, maxTokens)}\n`;
                    }

                    await updateGeminiFiles([{
                        blockId,
                        globalContent: globalMd,
                        workspaceContent: md
                    }]);

                    previousBatchHashes.set(blockId, currentHash);
                    updatedCount++;

                    const sources = [];
                    if (coveredDeps.size > 0) sources.push(`registry:${coveredDeps.size}`);
                    if (results.length > 0) sources.push(`ddg:${results.length}`);
                    log(LOG_REFRESH, chalk.cyan, `block ${blockId} updated → ${batch.join(', ')} [${sources.join(', ')}]`);
                } catch (e) {
                    failedCount++;
                    log(LOG_WARN, chalk.yellow, `block ${blockId} fetch failed → keeping previous`);
                }
            })().then(() => executing.delete(promise));

            executing.add(promise);
            if (executing.size >= maxConcurrency) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);

        // ── Custom sources from .groundtruth.json ──
        if (customSources.length > 0) {
            for (const src of customSources) {
                const blockId = 'src_' + Buffer.from(src.url).toString('base64url').slice(0, 8);
                activeBlockIds.add(blockId);

                if (previousBatchHashes.has(blockId)) {
                    skippedCount++;
                    continue;
                }

                try {
                    const text = await fetchPageContent(src.url, '', searchOpts);
                    if (text && text.length > 100) {
                        const srcLabel = src.label || new URL(src.url).hostname;
                        const md = `## Custom Source — ${srcLabel}\n${sanitizeWebContent(text, maxTokens)}\n`;

                        await updateGeminiFiles([{
                            blockId,
                            globalContent: `## ${srcLabel}\n${sanitizeWebContent(text, 500)}\n`,
                            workspaceContent: md
                        }]);
                        previousBatchHashes.set(blockId, blockId);
                        updatedCount++;
                        log(LOG_REFRESH, chalk.cyan, `custom source updated → ${srcLabel}`);
                    }
                } catch (_) {
                    failedCount++;
                }
            }
        }

        await removeStaleBlocks(globalPath, activeBlockIds);
        await removeStaleBlocks(workspacePath, activeBlockIds);

        await saveBatchState(previousBatchHashes);

        log(LOG_REFRESH, chalk.gray, `cycle done → ${activeBlockIds.size} blocks active, ${updatedCount} updated, ${skippedCount} skipped, ${failedCount} errors`);
    }

    let cycleCount = 0;

    process.on('SIGINT', async () => {
        await saveBatchState(previousBatchHashes);
        process.exit(0);
    });

    updateSkill();
    setInterval(() => {
        cycleCount++;
        if (cycleCount % 10 === 0) {
            httpsAgent.destroy();
        }
        updateSkill();
    }, intervalMinutes * 60 * 1000);
}
