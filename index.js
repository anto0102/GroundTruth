/**
 * @module index
 * @description Entry point runtime groundtruth delegazione CLI o proxy flow logic.
 */
import './src/http-agent.js';
import { chalk, label } from './src/logger.js';
import { intro, outro, select, isCancel, cancel } from '@clack/prompts';
import { usePackageJson, antigravityMode, claudeCodeMode, uninstallMode, interactiveMode, port, intervalMinutes, batchSize, version } from './src/cli.js';
import { createServer } from './src/proxy.js';
import { autoSetEnv, removeEnv } from './src/env.js';
import { startWatcher } from './src/watcher.js';

// ─── Execution Logic ─────────────────────────────────

const runAntigravity = () => {
  startWatcher({ intervalMinutes, usePackageJson, batchSize });
};

const runClaudeCode = async () => {
  const server = await createServer(usePackageJson);
  const startServer = (p) => {
    server.on('error', (e) => (e.code === 'EADDRINUSE' ? startServer(p + 1) : console.error(chalk.red(`Server error: ${e.message}`))));
    server.listen(p, async () => {
      console.log(`\n  ${chalk.white.bold('GroundTruth')}  ${chalk.gray(`v${version}`)}  ${chalk.gray('[claude-code mode]')}\n`);
      console.log(label('◆', 'proxy', `localhost:${p}`));
      console.log(label('◆', 'anthropic', '/v1/messages'));
      console.log(label('◆', 'context', 'DuckDuckGo → live'));
      console.log(`\n  ${chalk.cyan('✻')} Listening. Set ANTHROPIC_BASE_URL=http://localhost:${p}\n`);
      await autoSetEnv(p);
    });
  };
  startServer(port);
};

const runUninstall = async () => {
  console.log(`\n  ${chalk.white.bold('GroundTruth')}  ${chalk.gray(`v${version}`)}  ${chalk.gray('[uninstall]')}\n`);
  await removeEnv();
  process.exit(0);
};

// ─── Dispatcher start app logic ──────────────────────

if (interactiveMode) {
  intro(`${chalk.white.bold('GroundTruth')} ${chalk.gray(`v${version}`)}`);

  const mode = await select({
    message: 'Select execution mode:',
    options: [
      { value: 'antigravity', label: 'Antigravity Mode', hint: 'Background watcher for local dotfiles' },
      { value: 'claude', label: 'Claude Code Mode', hint: 'HTTP proxy interceptor' },
      { value: 'uninstall', label: 'Uninstall', hint: 'Clean up shell environments' },
    ],
  });

  if (isCancel(mode)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  outro(`Starting ${mode}...`);

  if (mode === 'antigravity') runAntigravity();
  if (mode === 'claude') await runClaudeCode();
  if (mode === 'uninstall') await runUninstall();
} else {
  if (uninstallMode) {
    await runUninstall();
  } else if (antigravityMode) {
    runAntigravity();
  } else if (claudeCodeMode) {
    await runClaudeCode();
  }
}

