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
    /\bact\s+as\s+(a|an)\b/gi,
    /pretend\s+(you\s+are|to\s+be)/gi,
    /simulate\s+(a|an)\b/gi,
    /<\|system\|>/gi,
    /<<SYS>>/gi,
    /\[\/INST\]/gi,
    /###\s*(instruction|system|prompt)/gi,
    /override\s+(your\s+)?(previous\s+)?(instructions?|constraints?|rules?)/gi,
];

const NOISE_PATTERNS = [
    /Skip to content/gi,
    /\bNavigation Menu\b/gi,
    /\bToggle navigation\b/gi,
    /\bAppearance settings\b/gi,
    /AI CODE CREATION/gi,
    /GitHub Copilot Write better code with AI/gi,
    /\bSign in\b/gi,
    /\bSign up\b/gi,
    /\bNotifications\b/gi,
    /\bFork\s+\d+\b/gi,
    /\bStar\s+[\d.]+[kK]?\b/gi,
    /^Code$/gm,         // Navigazione GitHub/NPM: riga intera
    /^Issues$/gm,       // Navigazione GitHub: riga intera
    /^Pull requests$/gm, // Navigazione GitHub: riga intera
    /^Actions$/gm,      // Navigazione GitHub: riga intera
    /^Projects$/gm,     // Navigazione GitHub: riga intera
    /^Security$/gm,     // Navigazione GitHub: riga intera
    /^Insights$/gm,     // Navigazione GitHub: riga intera
    /\bWhy GitHub\b/gi,
    /^Solutions$/gm,    // Navigazione: riga intera
    /^Resources$/gm,    // Navigazione: riga intera
    /^Open Source$/gm,  // Navigazione: riga intera
    /\bEnterprises\b/gi,
    /\bStartups\b/gi,
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


const COMBINED_NOISE = new RegExp(NOISE_PATTERNS.map(r => r.source).join('|'), 'gi');


/**
 * @description Filtra pattern pericolosi e rumore di navigazione dal testo web scrappato.
 * @param   {string} text - Testo raw proveniente da web scraping
 * @param   {number} maxLen - Lunghezza massima output (default 8000)
 * @returns {string} Testo sanitizzato
 */
export function sanitizeWebContent(text, maxLen = 8000) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // 1. Rimuoviamo il rumore di navigazione (V8 Optimized)
    cleaned = cleaned.replace(COMBINED_NOISE, '');

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
