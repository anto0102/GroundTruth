/**
 * @module sanitize
 * @description Sanitizzazione contenuto web contro prompt injection attacks.
 */

// Pattern noti di prompt injection che devono essere filtrati
const DANGEROUS_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions?/gi,
    /disregard\s+(all\s+)?previous/gi,
    /you\s+are\s+now\s+/gi,
    /forget\s+(all\s+)?(your\s+)?instructions?/gi,
    /new\s+instructions?\s*:/gi,
    /system\s*prompt\s*:/gi,
    /\[INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /```system/gi,
    /ASSISTANT:\s/gi,
    /HUMAN:\s/gi,
];

/**
 * @description Filtra pattern pericolosi di prompt injection dal testo web scrappato.
 * @param   {string} text - Testo raw proveniente da web scraping
 * @param   {number} maxLen - Lunghezza massima output (default 8000)
 * @returns {string} Testo sanitizzato
 */
export function sanitizeWebContent(text, maxLen = 8000) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;
    for (const p of DANGEROUS_PATTERNS) {
        cleaned = cleaned.replace(p, '[FILTERED]');
    }
    return cleaned.slice(0, maxLen);
}
