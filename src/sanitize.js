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

const NOISE_PATTERNS = [
    /Skip to content/gi,
    /Navigation Menu/gi,
    /Toggle navigation/gi,
    /Appearance settings/gi,
    /AI CODE CREATION/gi,
    /GitHub Copilot Write better code with AI/gi,
    /Sign in/gi,
    /Sign up/gi,
    /Notifications/gi,
    /Fork\s+\d+/gi,
    /Star\s+[\d.]+[kK]?/gi,
    /Code/gi,
    /Issues/gi,
    /Pull requests/gi,
    /Actions/gi,
    /Projects/gi,
    /Security/gi,
    /Insights/gi,
    /Why GitHub/gi,
    /Solutions/gi,
    /Resources/gi,
    /Open Source/gi,
    /Enterprises/gi,
    /Startups/gi,
    /Customer stories|Ebooks & reports|Events & webinars/gi,
    /GitHub (Sponsors|Skills|Accelerator|Archive Program|Spark|Models)/gi,
    /Weekly Downloads|Unpacked Size|Total Files|Collaborators/gi,
    /Analyze with Socket|Check bundle size|View package health|Explore dependencies/gi,
    /Skip to content|Skip to main content|skip to:\[content\]|package search/gi,
    /\[Signing in\]\(https:\/\/github\.com\/login\)/gi,
    /Performing verification|This website uses a service to protect against malicious bots/gi,
    /Radix Primitives|Visually or semantically separates content/gi,
    /View docs here|Check bundle size|View package health/gi,
];


/**
 * @description Filtra pattern pericolosi e rumore di navigazione dal testo web scrappato.
 * @param   {string} text - Testo raw proveniente da web scraping
 * @param   {number} maxLen - Lunghezza massima output (default 8000)
 * @returns {string} Testo sanitizzato
 */
export function sanitizeWebContent(text, maxLen = 8000) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // 1. Rimuoviamo il rumore di navigazione
    for (const pattern of NOISE_PATTERNS) {
        cleaned = cleaned.replace(pattern, '');
    }

    // 2. Rimuoviamo pattern pericolosi ricorsivamente
    // Protezione contro bypass (es: "ignore [INST] previous")
    let lastLen;
    do {
        lastLen = cleaned.length;
        for (const p of DANGEROUS_PATTERNS) {
            cleaned = cleaned.replace(p, '[FILTERED]');
        }
    } while (cleaned.length !== lastLen);

    // 3. Normalizzazione spazi bianchi per risparmiare token
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned.slice(0, maxLen);
}
