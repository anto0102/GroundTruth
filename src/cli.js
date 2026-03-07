/**
 * @module cli
 * @description Parsing degli argomenti CLI process.argv e logica help screen.
 */
import { chalk } from './logger.js';
import { createRequire } from 'module';
import { loadConfig, resolveQuality } from './config.js';

const { version } = createRequire(import.meta.url)('../package.json');

// ─── Arg Parsers ─────────────────────────────────────

const args = process.argv.slice(2);
const usePackageJson = args.includes('--use-package-json');
const antigravityMode = args.includes('--antigravity');
const claudeCodeMode = args.includes('--claude-code');
const uninstallMode = args.includes('--uninstall');

// Stop immediato se nessun mode definito
if (!antigravityMode && !claudeCodeMode && !uninstallMode) {
    console.log();
    console.log(`  ${chalk.white.bold('GroundTruth')}  ${chalk.gray(`v${version}`)}`);
    console.log();
    console.log(`  Usage:`);
    console.log(`    groundtruth --claude-code       proxy mode (Claude Code)`);
    console.log(`    groundtruth --antigravity       rules mode (Antigravity/Gemini)`);
    console.log(`    groundtruth --uninstall         remove shell env config`);
    console.log();
    console.log(`  Options:`);
    console.log(`    --use-package-json   use package.json as search query`);
    console.log(`    --port <n>           custom port, default 8080 (claude-code only)`);
    console.log(`    --interval <n>       refresh in minutes, default 5 (antigravity only)`);
    console.log(`    --batch-size <n>     deps per search batch (default: 3)`);
    console.log(`    --max-tokens <n>     max tokens per context block (default: 4000)`);
    console.log(`    --quality <level>    low | medium | high (default: medium)`);
    console.log(`    --verbose            enable detailed extraction logging`);
    console.log();
    console.log(`  Config:`);
    console.log(`    Place a .groundtruth.json in your project root for persistent settings.`);
    console.log();
    console.log(`  Docs:`);
    console.log(`    Claude Code   →  export ANTHROPIC_BASE_URL=http://localhost:8080`);
    console.log(`    Antigravity   →  just run groundtruth --antigravity in your project`);
    console.log();
    process.exit(0);
}

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
    args, usePackageJson, antigravityMode, claudeCodeMode, uninstallMode,
    port, intervalMinutes, batchSize, version,
    maxTokens, quality, qualitySettings, verbose, customSources
};
