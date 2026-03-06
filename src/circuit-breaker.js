/**
 * @module circuit-breaker
 * @description Fail-fast strategy su DDG in caso di cap HTTP bloccati IP.
 */

export class CircuitBreaker {
    /**
     * @param {Object} options Imposta le policies di fault limit e timeout windows.
     */
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.lastFailureTime = null;
    }

    /**
     * @description Esegue logica async proteggendola da cascading failure DDG
     * @param   {Function} fn - Ritorna Promise async operation DDG fetch
     * @returns {Promise<any>} Risultato esecuzione
     * @throws  {Error} Fallimento execution o cb open rejection error
     */
    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime < this.resetTimeout) {
                throw new Error('Circuit breaker is OPEN');
            }
            // Tentativo check dopo finestra timeout
            this.state = 'HALF_OPEN';
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (err) {
            this.onFailure(err);
            throw err;
        }
    }

    onSuccess() {
        if (this.state === 'HALF_OPEN') {
            this.halfOpenSuccesses = (this.halfOpenSuccesses || 0) + 1;
            if (this.halfOpenSuccesses >= 2) {
                this.failures = 0;
                this.state = 'CLOSED';
                this.halfOpenSuccesses = 0;
            }
        } else {
            this.failures = 0;
        }
    }

    onFailure(err) {
        // 429 rate limit apre il circuito immediatamente
        if (err?.message?.includes('429')) {
            this.failures = this.failureThreshold;
        } else {
            this.failures++;
        }
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
}
