/**
 * @module test.env
 * @description Test suite per env.js — autoSetEnv e removeEnv.
 * Run: node --test test/test.env.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('autoSetEnv', () => {
    const testDir = path.join(tmpdir(), `gt-env-test-${Date.now()}`);
    const fakeHome = path.join(testDir, 'home');

    before(async () => {
        await mkdir(path.join(fakeHome, '.config', 'fish'), { recursive: true });
    });

    after(async () => {
        await rm(testDir, { recursive: true, force: true });
        delete process.env.ANTHROPIC_BASE_URL;
    });

    it('scrive la variabile nel .zshrc se non presente', async () => {
        const zshrc = path.join(fakeHome, '.zshrc');
        await writeFile(zshrc, '# existing content\n');

        const { autoSetEnv } = await import('../src/env.js');
        await autoSetEnv(8080, fakeHome);

        const content = await readFile(zshrc, 'utf8');
        assert.ok(
            content.includes('export ANTHROPIC_BASE_URL=http://localhost:8080'),
            'deve scrivere la variabile nel .zshrc'
        );
    });

    it('NON scrive se la variabile è già presente', async () => {
        const zshrc = path.join(fakeHome, '.zshrc2');
        const line = 'export ANTHROPIC_BASE_URL=http://localhost:8080';
        await writeFile(zshrc, line + '\n');

        const originalSize = (await readFile(zshrc, 'utf8')).length;
        const { autoSetEnv } = await import('../src/env.js');
        await autoSetEnv(8080, fakeHome);

        const newContent = await readFile(zshrc, 'utf8');
        assert.equal(newContent.length, originalSize, 'non deve modificare il file se già configurato');
    });

    it('removeEnv pulisce la variabile dal file', async () => {
        const zshrc = path.join(fakeHome, '.zshrc');
        await writeFile(zshrc, '# before\nexport ANTHROPIC_BASE_URL=http://localhost:8080\n# after\n');

        const { removeEnv } = await import('../src/env.js');
        await removeEnv(fakeHome);

        const content = await readFile(zshrc, 'utf8');
        assert.ok(!content.includes('ANTHROPIC_BASE_URL'), 'removeEnv deve pulire la variabile');
        assert.ok(content.includes('# before'), 'removeEnv non deve rimuovere altro contenuto');
        assert.ok(content.includes('# after'), 'removeEnv non deve rimuovere altro contenuto');
    });
});
