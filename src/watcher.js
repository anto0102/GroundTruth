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
import { spinner } from '@clack/prompts';

// ─── Scheduler Watcher Instance ──────────────────────

export function startWatcher({ intervalMinutes, usePackageJson, batchSize }) {
    const homeDir = os.homedir();
    const globalPath = path.join(homeDir, '.gemini', 'GEMINI.md');
    const workspacePath = path.join(process.cwd(), '.gemini', 'GEMINI.md');

    const globalSkillFilePretty = '~/.gemini/GEMINI.md';
    const skillFilePretty = '.gemini/GEMINI.md';

    console.log();
    console.log(`  ${chalk.white(chalk.bold('GroundTruth'))}  ${chalk.gray(`v${version}`)}  ${chalk.gray('[antigravity mode]')}`);
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


    let previousBatchHashes = new Map();
    let customSourceTimestamps = new Map(); // Map<blockId: string, timestamp: number>

    const searchOpts = {
        ddgResults: qualitySettings.ddgResults,
        maxLen: qualitySettings.charsPerPage,
        jinaTimeout: qualitySettings.jinaTimeout,
        verbose,
    };

    async function updateSkill() {
        if (previousBatchHashes.size === 0) {
            const state = await loadBatchState(version);
            previousBatchHashes = state.hashes;
            customSourceTimestamps = state.customTs;
        }
        const deps = usePackageJson !== false ? await readPackageDeps() : null;
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
                const blockId = batchHash(batch.map(d => d.split(' ')[0]));
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
                    const nowStr = now.toLocaleString(process.env.GROUNDTRUTH_LOCALE || undefined);
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
            })().finally(() => executing.delete(promise));

            executing.add(promise);
            if (executing.size >= maxConcurrency) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);

        // ── Custom sources from .groundtruth.json ──
        if (customSources.length > 0) {
            const CUSTOM_SOURCE_TTL_MS = 60 * 60 * 1000;
            const customWork = customSources.map(async (src) => {
                const blockId = 'src_' + Buffer.from(src.url).toString('base64url').slice(0, 8);

                activeBlockIds.add(blockId);

                const lastFetchTime = customSourceTimestamps.get(blockId) || 0;
                if ((Date.now() - lastFetchTime) < CUSTOM_SOURCE_TTL_MS) {
                    skippedCount++;
                    return;
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
                        customSourceTimestamps.set(blockId, Date.now());
                        updatedCount++;
                        log(LOG_REFRESH, chalk.cyan, `custom source updated → ${srcLabel}`);
                    }
                } catch (_) {
                    failedCount++;
                }
            });
            await Promise.all(customWork);
        }

        await removeStaleBlocks(globalPath, activeBlockIds);
        await removeStaleBlocks(workspacePath, activeBlockIds);

        await saveBatchState(previousBatchHashes, customSourceTimestamps, version);

        log(LOG_REFRESH, chalk.gray, `cycle done → ${activeBlockIds.size} blocks active, ${updatedCount} updated, ${skippedCount} skipped, ${failedCount} errors`);
    }

    const s = spinner();
    let isFirstRun = true;

    async function runWatcherCycle() {
        if (isFirstRun) {
            s.start('Antigravity is loading initial context...');
        }
        try {
            await updateSkill();
        } catch (err) {
            log(LOG_WARN, chalk.yellow, 'updateSkill error: ' + err.message);
        } finally {
            if (isFirstRun) {
                s.stop('Antigravity active. Context loaded automatically.');
                isFirstRun = false;
            }
        }
    }

    runWatcherCycle();
    const handle = setInterval(runWatcherCycle, intervalMinutes * 60 * 1000);

    return {
        stop: () => clearInterval(handle)
    };
}
