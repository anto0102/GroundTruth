/**
 * @module test.cli-integration
 * @description Testa i valori effettivi esportati da cli.js con argv simulati.
 * Run: node --test test/test.cli-integration.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('CLI Integration', () => {

    it('--antigravity imposta usePackageJson=true di default', async () => {
        const originalArgv = process.argv;
        process.argv = ['node', 'index.js', '--antigravity'];

        // Forza re-import del modulo con nuovi argv
        // Nota: in Node ESM, usa ?v=<Date.now()> per bypassare la cache
        const { usePackageJson, antigravityMode } = await import(`../src/cli.js?t=${Date.now()}`);

        assert.equal(antigravityMode, true);
        assert.equal(usePackageJson, true, 'usePackageJson deve essere true di default con --antigravity');

        process.argv = originalArgv;
    });

    it('--antigravity --no-package-json imposta usePackageJson=false', async () => {
        const originalArgv = process.argv;
        process.argv = ['node', 'index.js', '--antigravity', '--no-package-json'];

        const { usePackageJson } = await import(`../src/cli.js?t=${Date.now()}`);
        assert.equal(usePackageJson, false);

        process.argv = originalArgv;
    });

    it('--claude-code imposta claudeCodeMode=true', async () => {
        const originalArgv = process.argv;
        process.argv = ['node', 'index.js', '--claude-code'];

        const { claudeCodeMode, antigravityMode } = await import(`../src/cli.js?t=${Date.now()}`);
        assert.equal(claudeCodeMode, true);
        assert.equal(antigravityMode, false);

        process.argv = originalArgv;
    });

    it('--quality high viene applicato correttamente', async () => {
        const originalArgv = process.argv;
        process.argv = ['node', 'index.js', '--antigravity', '--quality', 'high'];

        const { quality, qualitySettings } = await import(`../src/cli.js?t=${Date.now()}`);
        assert.equal(quality, 'high');
        assert.equal(qualitySettings.ddgResults, 5);

        process.argv = originalArgv;
    });
});
