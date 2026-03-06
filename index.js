#!/usr/bin/env node
/**
 * @module index
 * @description Entry point runtime groundtruth delegazione CLI o proxy flow logic.
 */
import { chalk, label } from './src/logger.js';
import { usePackageJson, antigravityMode, claudeCodeMode, port, intervalMinutes, batchSize } from './src/cli.js';
import { createServer } from './src/proxy.js';
import { autoSetEnv } from './src/env.js';
import { startWatcher } from './src/watcher.js';

// ─── Dispatcher start app logic ──────────────────────

if (antigravityMode) {
  startWatcher({ intervalMinutes, usePackageJson, batchSize });
} else if (claudeCodeMode) {
  const server = createServer(usePackageJson);
  const startServer = (p) => {
    // EADDRINUSE fallback listener fail chain ricorsivo su port shift param logic 
    server.on('error', (e) => (e.code === 'EADDRINUSE' ? startServer(p + 1) : console.error(chalk.red(`Server error: ${e.message}`))));
    server.listen(p, () => {
      console.log(`\n  ${chalk.white.bold('GroundTruth')}  ${chalk.gray('v0.1.0')}  ${chalk.gray('[claude-code mode]')}\n`);
      console.log(label('◆', 'proxy', `localhost:${p}`));
      console.log(label('◆', 'anthropic', '/v1/messages'));
      console.log(label('◆', 'gemini', '/v1beta/…'));
      console.log(label('◆', 'context', 'DuckDuckGo → live'));
      console.log(`\n  ${chalk.cyan('✻')} Listening. Set ANTHROPIC_BASE_URL=http://localhost:${p}\n`);
      autoSetEnv(p);
    });
  };
  startServer(port);
}
