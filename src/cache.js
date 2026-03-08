/**
 * @module cache
 * @description Implementazione zero-dep LRU Cache limitata memory bounds.
 */

/**
 * @description Store memory con eviction LRU O(1) in get/set.
 */
class LRUCache {
    /**
     * @param {Object} options - Impostazioni max size e ttl ms
     */
    constructor(options = {}) {
        this.max = options.max || 500;
        this.ttl = options.ttl || 5 * 60 * 1000; // 5 min default TTL
        this.cache = new Map();
        // Doubly-linked list base structure per LRU policy cost O(1)
        this.head = { key: null, next: null, prev: null };
        this.tail = { key: null, next: null, prev: null };
        this.head.next = this.tail;
        this.tail.prev = this.head;
        this.size = 0;
    }

    _remove(node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    _addToFront(node) {
        node.next = this.head.next;
        node.prev = this.head;
        this.head.next.prev = node;
        this.head.next = node;
    }

    /**
     * @description Fetch nodo con eviction passiva su scadenza TTL.
     * @param   {string} key - Chiave archivio identificativa
     * @returns {any} Valore salvato o undefined su miss
     */
    get(key) {
        const node = this.cache.get(key);
        if (!node) return undefined;

        // TTL lazy evict check se expiro
        if (Date.now() > node.expiresAt) {
            this.delete(key);
            return undefined;
        }

        // Promote a recency target node
        this._remove(node);
        this._addToFront(node);
        return node.value;
    }

    /**
     * @description Assegna un nodo alla testa (recent).
     * @param   {string} key   - Target key
     * @param   {any}    value - Target val
     * @param   {number} [ttl] - Override TTL per questa entry
     * @returns {LRUCache} Istanza chaining
     */
    set(key, value, ttl) {
        // Pulizia pre-insert per sovrascrittura o cap bounds
        if (this.cache.has(key)) {
            const old = this.cache.get(key);
            this._remove(old);
            this.cache.delete(key);
            this.size--;
        } else if (this.size >= this.max) {
            const lru = this.tail.prev;
            if (lru.key) {
                this._remove(lru);
                this.cache.delete(lru.key);
                this.size--;
            }
        }

        const node = {
            key,
            value,
            expiresAt: Date.now() + (ttl || this.ttl),
            next: null,
            prev: null
        };

        this.cache.set(key, node);
        this._addToFront(node);
        this.size++;
        return this;
    }

    delete(key) {
        const node = this.cache.get(key);
        if (node) {
            this._remove(node);
            this.cache.delete(key);
            this.size--;
            return true;
        }
        return false;
    }
}

// Esporta singola cache istanza module globale (singleton per memory context node)
export const searchCache = new LRUCache({ max: 500, ttl: 5 * 60 * 1000 });

export { LRUCache };
