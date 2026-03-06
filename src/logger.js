/**
 * @module logger
 * @description Utilities per log formattati con chalk e timestamp.
 */
import chalk from 'chalk';

// ─── Constants ───────────────────────────────────────

export const LOG_OK = '✓';
export const LOG_WARN = '⚠';
export const LOG_BOLT = '⚡';
export const LOG_REFRESH = '↻';
export const LOG_DOT = '◆';
export const LOG_STAR = '✻';

// ─── Formattazione ───────────────────────────────────

/**
 * @description Genera timestamp corrente per i log in formato loc-IT.
 * @returns {string} Timestamp grigio
 */
export function ts() {
    return chalk.gray(new Date().toLocaleTimeString('it-IT'));
}

/**
 * @description Crea una label allineata per l'output CLI di startup.
 * @param   {string} sym   - Simbolo bullet
 * @param   {string} name  - Nome del campo label
 * @param   {string} value - Valore associato
 * @returns {string} Stringa interpolata e colorata
 */
export function label(sym, name, value) {
    return `  ${chalk.cyan(sym)} ${chalk.gray(name.padEnd(9))} ${chalk.white(value)}`;
}

/**
 * @description Stampa un messaggio log standardizzato con timestamp.
 * @param {string}   symbol  - Simbolo costante da prefissare
 * @param {Function} colorFn - Funzione chalk per colorare il prefisso
 * @param {...any}   parts   - Testo del log iterabile
 */
export function log(symbol, colorFn, ...parts) {
    console.log(`  ${colorFn(symbol)} ${ts()}  ${parts.join(' ')}`);
}

export { chalk }; // Centralizziamo chalk per evitare import duplicati altrove
