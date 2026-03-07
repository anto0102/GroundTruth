import { Agent, setGlobalDispatcher } from 'undici';
import { Agent as HttpsAgent } from 'https';
import { Agent as HttpAgent } from 'http';

const globalAgent = new Agent({
    keepAliveTimeout: 20 * 1000,
    keepAliveMaxTimeout: 60 * 1000,
    connections: 10,
    pipelining: 1,
});
setGlobalDispatcher(globalAgent);

export { globalAgent };

export const httpsAgent = new HttpsAgent({
    keepAlive: true, maxSockets: 10, maxFreeSockets: 5, timeout: 5000,
});
export const httpAgent = new HttpAgent({
    keepAlive: true, maxSockets: 10, maxFreeSockets: 5, timeout: 5000,
});
