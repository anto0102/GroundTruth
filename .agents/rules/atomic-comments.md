---
trigger: always_on
---

Aggiungi JSDoc comments atomici a tutti i file in src/ e index.js.

════════════════════════════════════════
REGOLE GENERALI
════════════════════════════════════════

1. Ogni FILE inizia con un commento di intestazione:
/**
 * @module nomemodulo
 * @description Una riga sola — cosa fa questo file.
 */

2. Ogni FUNZIONE esportata ha JSDoc completo:
/**
 * @description Cosa fa in una riga.
 * @param {tipo} nome - Descrizione
 * @returns {tipo} Descrizione
 * @throws {Error} Quando e perché può fallire
 */

3. Ogni SEZIONE logica ha un commento inline:
// ─── Nome sezione ──────────────────────────────

4. Ogni COSTANTE non ovvia ha commento inline:
const TTL = 5 * 60 * 1000; // 5 min cache TTL

════════════════════════════════════════
REGOLE ATOMICHE (una per concetto)
════════════════════════════════════════

- UN commento per funzione — non ripetere
- NO commenti ovvi tipo // incrementa counter
- Commenta il PERCHÉ non il COSA
  ✅ // DDG blocca bot — ruotiamo UA ad ogni request
  ❌ // scegli user agent random
- Commenta i MAGIC NUMBER e le COSTANTI
  ✅ const MAX_CHARS = 4000; // ~1000 token Anthropic
  ❌ const MAX_CHARS = 4000;
- Commenta i WORKAROUND e i GOTCHA
  ✅ // node-fetch ignora timeout: usa AbortSignal
  ❌ signal: AbortSignal.timeout(5000)
- Commenta le DECISIONI ARCHITETTURALI
  ✅ // parallelo solo in claude-code: antigravity 
  //    ha rate limit più stretto su DDG
  ❌ nessun commento

════════════════════════════════════════
FORMATO GITHUB
════════════════════════════════════════

I commenti devono essere leggibili direttamente
su GitHub nella code view — quindi:

- Massimo 72 caratteri per riga nei commenti
- Separatori sezione con ─ (U+2500) non con ---
- JSDoc params allineati verticalmente:
  @param  {string} query   - Testo da cercare
  @param  {boolean} parallel - Usa Promise.all
  @returns {Object} { results, pageText }

════════════════════════════════════════
COSA NON TOCCARE
════════════════════════════════════════
- Zero modifiche alla logica
- Zero modifiche ai nomi di variabili
- Solo aggiunta commenti — nient'altro