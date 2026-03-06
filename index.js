#!/usr/bin/env node
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import chalk from 'chalk';

// ─── CLI parsing ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const usePackageJson = args.includes('--use-package-json');
const antigravityMode = args.includes('--antigravity');
const claudeCodeMode = args.includes('--claude-code');

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
  console.log();
  console.log(`  Docs:`);
  console.log(`    Claude Code   →  export ANTHROPIC_BASE_URL=http://localhost:8080`);
  console.log(`    Antigravity   →  just run groundtruth --antigravity in your project`);
  console.log();
  process.exit(0);
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const homeDir = os.homedir();

function ts() {
  return chalk.gray(new Date().toLocaleTimeString('it-IT'));
}

function label(sym, name, value) {
  return `  ${chalk.cyan(sym)} ${chalk.gray(name.padEnd(9))} ${chalk.white(value)}`;
}

// ─── DDG URL resolver ───────────────────────────────────────────────────────
function resolveDDGUrl(href) {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

// ─── DDG search + Readability fetch ──────────────────────────────────────────
async function webSearch(query) {
  const searchRes = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
  );
  if (!searchRes.ok) throw new Error(`DDG ${searchRes.status}`);

  const $ = cheerio.load(await searchRes.text());
  let results = [];
  $('.result__body').each((i, el) => {
    const title = $(el).find('.result__title').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    let rawUrl = $(el).find('.result__url').attr('href') || $(el).find('a.result__url').attr('href');
    const resultUrl = rawUrl ? resolveDDGUrl(rawUrl) : '';
    if (title && resultUrl) results.push({ title, snippet, url: resultUrl });
  });

  const seen = new Set();
  results = results.filter(r => r.url && !seen.has(r.url) && seen.add(r.url)).slice(0, 3);

  if (results.length === 0) throw new Error('No DDG results');

  let pageText = '';
  if (claudeCodeMode) {
    const pages = await Promise.all(results.map(async (r) => {
      try {
        const pageRes = await fetch(r.url, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (pageRes.ok) {
          const dom = new JSDOM(await pageRes.text(), { url: r.url });
          const article = new Readability(dom.window.document).parse();
          if (article?.textContent) {
            return article.textContent.replace(/\s+/g, ' ').slice(0, 4000);
          }
        }
      } catch (_) { /* ignore */ }
      return '';
    }));
    pageText = pages.filter(Boolean).join('\n\n');
  } else {
    try {
      if (results[0]) {
        const pageRes = await fetch(results[0].url, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (pageRes.ok) {
          const dom = new JSDOM(await pageRes.text(), { url: results[0].url });
          const article = new Readability(dom.window.document).parse();
          if (article?.textContent) {
            pageText = article.textContent.replace(/\s+/g, ' ').slice(0, 4000);
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  return { results, pageText };
}

// ─── Read package.json deps ───────────────────────────────────────────────────
function readPackageDeps() {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const excludeList = ["plugin", "adapter", "check", "eslint", "prettier", "vite", "rollup", "webpack", "babel"];
    const filterAndFormat = (depsObj) => {
      if (!depsObj) return [];
      return Object.entries(depsObj)
        .filter(([n]) => !excludeList.some(ex => n.toLowerCase().includes(ex)))
        .map(([n, v]) => {
          let cleanName = n;
          if (n === '@sveltejs/kit') cleanName = 'sveltekit';
          else if (n.startsWith('@')) cleanName = n.split('/')[1];
          let cleanVersion = String(v).replace(/[\^~>=<]/g, '').split('.').slice(0, 2).join('.');
          return `${cleanName} ${cleanVersion}`;
        });
    };

    let selected = filterAndFormat(pkg.dependencies);
    if (selected.length < 3) {
      selected = selected.concat(filterAndFormat(pkg.devDependencies));
    }
    selected = selected.slice(0, 3);

    return selected.length > 0 ? selected : null;
  } catch (_) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ANTIGRAVITY MODE
// ════════════════════════════════════════════════════════════════════════════
if (antigravityMode) {
  function injectBlock(filePath, content) {
    let fileContent = '';
    if (fs.existsSync(filePath)) {
      fileContent = fs.readFileSync(filePath, 'utf8');
    }
    const startTag = '<!-- groundtruth:start -->';
    const endTag = '<!-- groundtruth:end -->';
    const block = `${startTag}\n${content.trim()}\n${endTag}`;

    const startIndex = fileContent.indexOf(startTag);
    const endIndex = fileContent.indexOf(endTag);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      fileContent = fileContent.slice(0, startIndex) + block + fileContent.slice(endIndex + endTag.length);
    } else {
      fileContent = fileContent.trimEnd() + (fileContent.trimEnd() ? '\n\n' : '') + block + '\n';
    }
    fs.writeFileSync(filePath, fileContent, 'utf8');
  }

  // Workspace rules
  const rulesDir = path.join(process.cwd(), '.gemini');
  fs.mkdirSync(rulesDir, { recursive: true });
  const skillFile = path.join(rulesDir, 'GEMINI.md');
  const skillFilePretty = '.gemini/GEMINI.md';

  // Global rules
  const globalRulesDir = path.join(homeDir, '.gemini');
  fs.mkdirSync(globalRulesDir, { recursive: true });
  const globalSkillFile = path.join(globalRulesDir, 'GEMINI.md');
  const globalSkillFilePretty = '~/.gemini/GEMINI.md';

  // Read package deps
  const depEntries = readPackageDeps();
  const stackStr = depEntries
    ? depEntries.join(', ')
    : 'javascript web development';
  const query = depEntries
    ? `${depEntries.join(' ')} latest 2026`
    : 'javascript web development best practices 2026';

  // Startup screen
  console.log();
  console.log(`  ${chalk.white.bold('GroundTruth')}  ${chalk.gray('v0.1.0')}  ${chalk.gray('[antigravity mode]')}`);
  console.log();
  console.log(label('◆', 'global', globalSkillFilePretty));
  console.log(label('◆', 'workspace', skillFilePretty));
  console.log(label('◆', 'stack', stackStr));
  console.log(label('◆', 'interval', `every ${intervalMinutes} min`));
  console.log(label('◆', 'context', 'DuckDuckGo → live'));
  console.log();
  console.log(`  ${chalk.cyan('✻')} Running. Antigravity will load context automatically.`);
  console.log();

  async function updateSkill() {
    const now = new Date();
    const nextTs = new Date(now.getTime() + intervalMinutes * 60 * 1000);
    try {
      const { results, pageText } = await webSearch(query);
      const firstUrl = results[0]?.url || '';

      // Global Rules Content (short)
      let globalMd = `## Live Web Context (${now.toLocaleString('it-IT')})\n`;
      globalMd += `Stack: ${stackStr}\n`;
      if (results.length > 0) {
        globalMd += `Source: ${results[0].url}\n`;
        globalMd += `${results[0].snippet.slice(0, 300)}\n`;
      }

      // Workspace Rules Content (full)
      let md = `## Live Web Context — ${now.toLocaleString('it-IT')}
**Stack rilevato:** ${stackStr}
**Fonte:** DuckDuckGo → ${firstUrl}

### Risultati ricerca: "${query}"

`;
      for (const r of results) {
        md += `#### ${r.title}\n${r.snippet} — ${r.url}\n\n`;
      }
      if (pageText) {
        md += `### Documentazione completa\n${pageText}\n\n`;
      }
      md += `*Aggiornato: ${now.toISOString()} | Prossimo aggiornamento: ${nextTs.toISOString()}*\n`;

      const globalPath = path.join(homeDir, '.gemini', 'GEMINI.md');
      const workspacePath = path.join(process.cwd(), '.gemini', 'GEMINI.md');

      if (path.resolve(globalPath) === path.resolve(workspacePath)) {
        injectBlock(workspacePath, md);
        console.log(
          `  ${chalk.yellow('⚠')} ${ts()}  ${chalk.white('global e workspace coincidono → scritto solo workspace')}`
        );
      } else {
        injectBlock(globalSkillFile, globalMd);
        injectBlock(skillFile, md);

        console.log(
          `  ${chalk.cyan('↻')} ${ts()}  ${chalk.white('global + workspace updated')}  →  ${chalk.white(stackStr.slice(0, 40))}  →  ${chalk.cyan.bold(String(results.length))} ${chalk.cyan('results')}`
        );
      }
    } catch (e) {
      console.log(
        `  ${chalk.yellow('⚠')} ${ts()}  ${chalk.white('web fetch failed')}  →  ${chalk.yellow(e.message)}`
      );
    }
  }

  // First run immediately, then on interval
  updateSkill();
  setInterval(updateSkill, intervalMinutes * 60 * 1000);

} else {

  // ════════════════════════════════════════════════════════════════════════════
  //  PROXY MODE
  // ════════════════════════════════════════════════════════════════════════════

  // Package.json query cache (proxy mode + --use-package-json)
  let packageQueryCache = null;
  if (usePackageJson) {
    const depEntries = readPackageDeps();
    if (depEntries) packageQueryCache = `${depEntries.join(' ')} latest 2026`;
  }

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }

    let protocol = null;
    if (req.url.startsWith('/v1/messages')) {
      protocol = 'ANTHROPIC';
    } else if (req.url.startsWith('/v1beta/models/') && (req.url.includes('generateContent') || req.url.includes('streamGenerateContent'))) {
      protocol = 'GEMINI';
    } else {
      res.writeHead(404); res.end(); return;
    }

    try {
      let bodyChunks = [];
      for await (const chunk of req) bodyChunks.push(chunk);
      const rawBody = Buffer.concat(bodyChunks);

      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBody.toString('utf8'));
      } catch (_) {
        res.writeHead(400); res.end('Bad Request - Invalid JSON'); return;
      }

      // Extract last user message
      let lastUserMessage = '';
      if (protocol === 'ANTHROPIC') {
        const lastUserM = (parsedBody.messages || []).slice().reverse().find(m => m.role === 'user');
        if (lastUserM) {
          lastUserMessage = typeof lastUserM.content === 'string'
            ? lastUserM.content
            : (Array.isArray(lastUserM.content) ? lastUserM.content.map(c => c.text || '').join(' ') : '');
        }
      } else if (protocol === 'GEMINI') {
        const lastUserM = (parsedBody.contents || []).slice().reverse().find(m => m.role === 'user');
        if (lastUserM && Array.isArray(lastUserM.parts)) {
          lastUserMessage = lastUserM.parts.map(p => p.text || '').join(' ');
        }
      }

      let query, shortMsg;
      if (packageQueryCache) {
        query = packageQueryCache;
        shortMsg = 'package.json deps';
      } else {
        const text = lastUserMessage || '';
        shortMsg = text.replace(/\s+/g, ' ').trim().slice(0, 50);
        query = text.slice(0, 120).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        query = `${query} 2026`.trim();
      }

      const t0 = Date.now();
      let contextBlock = '';
      let didInject = false;
      let resultsCount = 0;

      try {
        if (!query || query.trim() === '2026') throw new Error('Empty query');
        const { results, pageText } = await webSearch(query);
        resultsCount = results.length;

        contextBlock = `\n\n--- WEB CONTEXT (live, ${new Date().toISOString()}) ---\n`;
        results.forEach((r, i) => {
          contextBlock += `${i + 1}. ${r.title}: ${r.snippet} (${r.url})\n`;
        });
        if (pageText) contextBlock += `\nFULL TEXT:\n${pageText}\n`;
        contextBlock += `--- END WEB CONTEXT ---\n`;
        didInject = true;
      } catch (_) {
        console.log(
          `  ${chalk.yellow('⚠')} ${ts()}  ${chalk.white('web fetch failed')}  →  ${chalk.yellow('forwarding clean')}`
        );
      }

      const ms = Date.now() - t0;

      if (didInject) {
        console.log(
          `  ${chalk.cyan('⚡')} ${ts()}  ${chalk.white(shortMsg.slice(0, 50) + (shortMsg.length > 50 ? '…' : ''))}  →  ${chalk.cyan.bold(String(resultsCount))} ${chalk.cyan('results')}  ${chalk.gray(ms + 'ms')}`
        );

        if (protocol === 'ANTHROPIC') {
          if (parsedBody.system) {
            if (typeof parsedBody.system === 'string') parsedBody.system += contextBlock;
            else if (Array.isArray(parsedBody.system)) parsedBody.system.push({ type: 'text', text: contextBlock });
          } else {
            parsedBody.system = contextBlock;
          }
        } else if (protocol === 'GEMINI') {
          if (!parsedBody.systemInstruction) {
            parsedBody.systemInstruction = { role: 'system', parts: [] };
          } else if (!parsedBody.systemInstruction.parts) {
            parsedBody.systemInstruction.parts = [];
          } else if (!Array.isArray(parsedBody.systemInstruction.parts)) {
            parsedBody.systemInstruction.parts = typeof parsedBody.systemInstruction.parts.text === 'string'
              ? [parsedBody.systemInstruction.parts] : [];
          }
          parsedBody.systemInstruction.parts.push({ text: contextBlock });
        }
      }

      const reqBodyStr = JSON.stringify(parsedBody);
      const targetUrlStr = protocol === 'ANTHROPIC'
        ? `https://api.anthropic.com${req.url}`
        : `https://generativelanguage.googleapis.com${req.url}`;

      const targetUrl = new URL(targetUrlStr);
      const headers = { ...req.headers };
      delete headers['host'];
      headers['content-length'] = Buffer.byteLength(reqBodyStr);

      const proxyReq = https.request(targetUrl, { method: req.method, headers }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end('Bad Gateway'); } });
      proxyReq.write(reqBodyStr);
      proxyReq.end();

    } catch (err) {
      if (!res.headersSent) { res.writeHead(500); res.end('Internal Server Proxy Error'); }
    }
  });

  // ─── autoSetEnv ────────────────────────────────────────────────────────────
  function autoSetEnv(p) {
    if (process.platform === 'win32') return;
    try {
      const targetUrl = `http://localhost:${p}`;
      if (process.env.ANTHROPIC_BASE_URL === targetUrl) return;

      const isFish = process.env.SHELL?.includes('fish') || fs.existsSync(`${homeDir}/.config/fish/config.fish`);
      let foundAny = false;
      const modifiedFiles = [];

      if (isFish) {
        const fishConfigFile = path.join(homeDir, '.config', 'fish', 'config.fish');
        fs.mkdirSync(path.dirname(fishConfigFile), { recursive: true });
        foundAny = true;
        try {
          let content = fs.existsSync(fishConfigFile) ? fs.readFileSync(fishConfigFile, 'utf8') : '';
          const lines = content ? content.split('\n') : [];
          let modified = false, foundExport = false;
          const newLines = lines.map(line => {
            if (line.trim().startsWith('set -gx ANTHROPIC_BASE_URL')) {
              foundExport = true;
              if (line.trim() !== `set -gx ANTHROPIC_BASE_URL ${targetUrl}`) { modified = true; return `set -gx ANTHROPIC_BASE_URL ${targetUrl}`; }
            }
            return line;
          });
          if (!foundExport) {
            if (newLines.length > 0 && newLines[newLines.length - 1] === '') {
              newLines[newLines.length - 1] = `set -gx ANTHROPIC_BASE_URL ${targetUrl}`;
              newLines.push('');
            } else {
              newLines.push(`set -gx ANTHROPIC_BASE_URL ${targetUrl}`);
            }
            modified = true;
          }
          if (modified) { fs.writeFileSync(fishConfigFile, newLines.join('\n'), 'utf8'); modifiedFiles.push(fishConfigFile); }
        } catch (e) {
          console.log(`  ${chalk.yellow('⚠')} ${ts()}  ${chalk.white('cannot write fish config')}  →  ${chalk.yellow(e.message)}`);
        }
      } else {
        const shellFiles = ['.zshrc', '.bashrc', '.bash_profile', '.profile'].map(f => path.join(homeDir, f));
        for (const file of shellFiles) {
          if (!fs.existsSync(file)) continue;
          foundAny = true;
          try {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            let modified = false, foundExport = false;
            const newLines = lines.map(line => {
              if (line.trim().startsWith('export ANTHROPIC_BASE_URL=')) {
                foundExport = true;
                if (line.trim() !== `export ANTHROPIC_BASE_URL=${targetUrl}`) { modified = true; return `export ANTHROPIC_BASE_URL=${targetUrl}`; }
              }
              return line;
            });
            if (!foundExport) {
              if (newLines.length > 0 && newLines[newLines.length - 1] === '') {
                newLines[newLines.length - 1] = `export ANTHROPIC_BASE_URL=${targetUrl}`;
                newLines.push('');
              } else {
                newLines.push(`export ANTHROPIC_BASE_URL=${targetUrl}`);
              }
              modified = true;
            }
            if (modified) { fs.writeFileSync(file, newLines.join('\n'), 'utf8'); modifiedFiles.push(file); }
          } catch (e) {
            console.log(`  ${chalk.yellow('⚠')} ${ts()}  ${chalk.white(`cannot write ${path.basename(file)}`)}  →  ${chalk.yellow(e.message)}`);
          }
        }
      }

      if (!foundAny) {
        const hint = isFish
          ? `set -gx ANTHROPIC_BASE_URL ${targetUrl}`
          : `export ANTHROPIC_BASE_URL=${targetUrl}`;
        console.log(`  ${chalk.yellow('⚠')} ${ts()}  ${chalk.white('no shell config found')}  →  ${chalk.yellow('add manually: ' + hint)}`);
      } else if (modifiedFiles.length > 0) {
        modifiedFiles.forEach(file => {
          const rel = file.replace(homeDir, '~');
          console.log(`  ${chalk.green('✓')} ${ts()}  ${chalk.white('ANTHROPIC_BASE_URL written to')} ${chalk.white(rel)}`);
        });
      }

      process.env.ANTHROPIC_BASE_URL = targetUrl;
    } catch (err) {
      console.log(`  ${chalk.yellow('⚠')} ${ts()}  ${chalk.white('env setup error')}  →  ${chalk.yellow(err.message)}`);
    }
  }

  // ─── startServer ───────────────────────────────────────────────────────────
  function startServer(initialPort) {
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        startServer(initialPort + 1);
      } else {
        console.error(chalk.red(`Server error: ${e.message}`));
      }
    });

    server.listen(initialPort, () => {
      console.log();
      console.log(`  ${chalk.white.bold('GroundTruth')}  ${chalk.gray('v0.1.0')}  ${chalk.gray('[claude-code mode]')}`);
      console.log();
      console.log(label('◆', 'proxy', `localhost:${initialPort}`));
      console.log(label('◆', 'anthropic', '/v1/messages'));
      console.log(label('◆', 'gemini', '/v1beta/…'));
      console.log(label('◆', 'context', 'DuckDuckGo → live'));
      console.log();
      console.log(`  ${chalk.cyan('✻')} Listening. Set ANTHROPIC_BASE_URL=http://localhost:${initialPort}`);
      console.log();
      autoSetEnv(initialPort);
    });
  }

  startServer(port);
}
