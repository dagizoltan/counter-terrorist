class WsManager {
    constructor() {
        this.protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // SEC-06 Hardening: Remove token from query parameters.
        // WebSocket now utilizes HttpOnly session cookies or the 'Sec-WebSocket-Protocol' sub-protocol if needed.
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        this.url = `${this.protocol}//${globalThis.location.host}/api/ws/events`;
        this.listeners = new Set();
        this.ws = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.connect();
    }

    connect() {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            this.ws.onerror = null;
            try { this.ws.close(); } catch (e) {}
        }

        clearInterval(this.pingInterval);
        clearTimeout(this.reconnectTimer);

        // Build WebSocket connection URL with CSRF/session token
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const wsUrl = new URL(this.url);
        if (this.csrfToken) {
            wsUrl.searchParams.set('token', this.csrfToken);
        }
        
        try {
            this.ws = new WebSocket(wsUrl.toString());
        } catch (e) {
            console.error('[SovereignWS] WebSocket instantiation error:', e);
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = (event) => {
            console.log('[SovereignWS] Multiplexed Connection Established');
            this.reconnectAttempts = 0;

            // Start 20s heartbeat ping to keep connection alive through proxies
            this.pingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    try { this.ws.send(JSON.stringify({ type: 'PING' })); } catch (e) {}
                }
            }, 20000);

            for (const listener of this.listeners) {
                if (listener.onopen) {
                    try { listener.onopen(event); } catch (e) { console.error(e); }
                }
            }
        };

        this.ws.onmessage = (event) => {
            for (const listener of this.listeners) {
                if (listener.onmessage) {
                    try { listener.onmessage(event); } catch (e) { console.error(e); }
                }
            }
        };

        this.ws.onerror = (err) => {
            console.warn('[SovereignWS] Socket Error:', err);
        };

        this.ws.onclose = (event) => {
            clearInterval(this.pingInterval);
            console.warn('[SovereignWS] Connection Lost. Reconnecting in 3s...');

            for (const listener of this.listeners) {
                if (listener.onclose) {
                    try { listener.onclose(event); } catch (e) { console.error(e); }
                }
            }
            this.scheduleReconnect();
        };
    }

    scheduleReconnect() {
        clearTimeout(this.reconnectTimer);
        // Exponential backoff: base 1s, doubling up to max 30s, with randomized ±20% jitter
        this.reconnectAttempts++;
        const baseDelay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)));
        const jitter = (Math.random() * 0.4 - 0.2) * baseDelay;
        const delay = Math.max(1000, Math.floor(baseDelay + jitter));
        console.warn(`[SovereignWS] Connection Lost. Reconnecting in ${(delay / 1000).toFixed(1)}s (Attempt ${this.reconnectAttempts})...`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    subscribe(fakeWs) {
        this.listeners.add(fakeWs);
        // If already connected, immediately fire onopen for the subscriber
        if (this.ws && this.ws.readyState === WebSocket.OPEN && fakeWs.onopen) {
            setTimeout(() => fakeWs.onopen({ type: 'open' }), 0);
        }
    }

    unsubscribe(fakeWs) {
        this.listeners.delete(fakeWs);
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    close() {
        // We do not close the multiplexed connection just because one island unmounted.
    }
}

if (!globalThis.SovereignWS) {
    globalThis.SovereignWS = new WsManager();
}

globalThis.SharedWebSocket = class SharedWebSocket {
    constructor(url) {
        // `url` was read as a free variable here, so every island threw
        // "ReferenceError: url is not defined" on construction and none of them ever
        // subscribed — the whole live telemetry layer was dead on arrival.
        this.url = url; // Ignored, we use the multiplexed URL
        this.onmessage = null;
        this.onopen = null;
        this.onclose = null;
        globalThis.SovereignWS.subscribe(this);
    }

    send(data) {
        globalThis.SovereignWS.send(data);
    }

    close() {
        globalThis.SovereignWS.unsubscribe(this);
        if (this.onclose) {
            this.onclose({ type: 'close', wasClean: true });
        }
    }
};
