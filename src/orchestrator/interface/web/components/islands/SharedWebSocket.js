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
        this.connect();
    }

    connect() {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
        }

        // Pass token via sub-protocol to avoid query param leakage
        const protocols = this.csrfToken ? [`cts-auth-${this.csrfToken}`] : [];
        this.ws = new WebSocket(this.url, protocols);
        
        this.ws.onmessage = (event) => {
            for (const listener of this.listeners) {
                if (listener.onmessage) {
                    try { listener.onmessage(event); } catch (e) { console.error(e); }
                }
            }
        };

        this.ws.onopen = (event) => {
            console.log('[SovereignWS] Multiplexed Connection Established');
            for (const listener of this.listeners) {
                if (listener.onopen) {
                    try { listener.onopen(event); } catch (e) { console.error(e); }
                }
            }
        };

        this.ws.onclose = (event) => {
            console.warn('[SovereignWS] Connection Lost. Reconnecting in 5s...');
            for (const listener of this.listeners) {
                if (listener.onclose) {
                    try { listener.onclose(event); } catch (e) { console.error(e); }
                }
            }
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        };
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
