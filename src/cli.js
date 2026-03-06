/**
 * @module cli
 * @description Parsing degli argomenti CLI process.argv e logica help screen.
 */
import { chalk } from './logger.js';

// ─── Arg Parsers ─────────────────────────────────────

const args = process.argv.slice(2);
const usePackageJson = args.includes('--use-package-json');
const antigravityMode = args.includes('--antigravity');
const claudeCodeMode = args.includes('--claude-code');

// Stop immediato se nessun mode definito
if (!antigravityMode && !claudeCodeMode) {
    console.log();
    console.log(`  ${chalk.white.bold('GroundTruth')}  ${chalk.gray('v0.1.0')}`);
    console.log();
    console.log(`  Usage:`);
    console.log(`    groundtruth --claude-code       proxy mode (Claude Code)`);
    console.log(`    groundtruth --antigravity       rules mode (Antigravity/Gemini)`);
    console.log();
    console.log(`  Options:`);
    console.log(`    --use-package-json   use package.json as search query`);
    console.log(`    --port <n>           custom port, default 8080 (claude-code only)`);
    console.log(`    --interval <n>       refresh in minutes, default 5 (antigravity only)`);
    console.log(`    --batch-size <n>     deps per search batch (default: 3)`);
    console.log();
    console.log(`  Docs:`);
    console.log(`    Claude Code   →  export ANTHROPIC_BASE_URL=http://localhost:8080`);
    console.log(`    Antigravity   →  just run groundtruth --antigravity in your project`);
    console.log();
    process.exit(0);
}

// ─── Default params override ─────────────────────────

let port = 8080; // Default Anthropic proxy
const portArgIndex = args.indexOf('--port');
if (portArgIndex !== -1 && args[portArgIndex + 1]) {
    port = parseInt(args[portArgIndex + 1], 10);
}

let intervalMinutes = 5; // Default context refresh
const intervalArgIndex = args.indexOf('--interval');
if (intervalArgIndex !== -1 && args[intervalArgIndex + 1]) {
    intervalMinutes = parseInt(args[intervalArgIndex + 1], 10) || 5;
}

const batchSizeIndex = args.indexOf('--batch-size');
const batchSize = batchSizeIndex !== -1
    ? Math.max(2, Math.min(parseInt(args[batchSizeIndex + 1]) || 3, 5))
    : 3;

export { args, usePackageJson, antigravityMode, claudeCodeMode, port, intervalMinutes, batchSize };
