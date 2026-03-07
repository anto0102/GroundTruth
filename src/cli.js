/**
 * @module cli
 * @description Parsing degli argomenti CLI process.argv e logica help screen.
 */
import { chalk } from './logger.js';
import { loadConfig, resolveQuality } from './config.js';
import pkg from '../package.json' with { type: 'json' };
const { version } = pkg;

// ─── Arg Parsers ─────────────────────────────────────

const args = process.argv.slice(2);
const usePackageJson = args.includes('--use-package-json');
const antigravityMode = args.includes('--antigravity');
const claudeCodeMode = args.includes('--claude-code');
const uninstallMode = args.includes('--uninstall');

// Interactive mode check
const interactiveMode = !antigravityMode && !claudeCodeMode && !uninstallMode;


// ─── Default params override ─────────────────────────

let port = 8080;
const portArgIndex = args.indexOf('--port');
if (portArgIndex !== -1 && args[portArgIndex + 1]) {
    port = parseInt(args[portArgIndex + 1], 10);
}

let intervalMinutes = 5;
const intervalArgIndex = args.indexOf('--interval');
if (intervalArgIndex !== -1 && args[intervalArgIndex + 1]) {
    intervalMinutes = parseInt(args[intervalArgIndex + 1], 10) || 5;
}

const batchSizeIndex = args.indexOf('--batch-size');
const batchSize = batchSizeIndex !== -1
    ? Math.max(2, Math.min(parseInt(args[batchSizeIndex + 1]) || 3, 5))
    : 3;

// ─── New v1.2 flags ──────────────────────────────────

const maxTokensIndex = args.indexOf('--max-tokens');
const cliMaxTokens = maxTokensIndex !== -1
    ? Math.max(500, Math.min(parseInt(args[maxTokensIndex + 1]) || 4000, 8000))
    : null;

const qualityIndex = args.indexOf('--quality');
const cliQuality = qualityIndex !== -1 && ['low', 'medium', 'high'].includes(args[qualityIndex + 1])
    ? args[qualityIndex + 1]
    : null;

const cliVerbose = args.includes('--verbose');

// ─── Merge CLI + .groundtruth.json ───────────────────

const fileConfig = await loadConfig();

const maxTokens = cliMaxTokens ?? fileConfig.maxTokens;
const quality = cliQuality ?? fileConfig.quality;
const verbose = cliVerbose || fileConfig.verbose;
const qualitySettings = resolveQuality(quality);
const customSources = fileConfig.sources;

export {
    args, usePackageJson, antigravityMode, claudeCodeMode, uninstallMode, interactiveMode,
    port, intervalMinutes, batchSize, version,
    maxTokens, quality, qualitySettings, verbose, customSources
};
