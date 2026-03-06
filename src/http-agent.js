/**
 * @module http-agent
 * @description Pool manager per connessioni API http e requests HTTPS in proxy context.
 */
import { Agent as HttpsAgent } from 'https';
import { Agent as HttpAgent } from 'http';

// Evita timeout TCP handshakes costanti per network node-fetch requests proxy target
export const httpsAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 5000,
});

export const httpAgent = new HttpAgent({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 5000,
});
