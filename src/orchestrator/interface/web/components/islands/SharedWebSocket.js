class WsManager {
    constructor() {
        this.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        this.url = `${this.protocol}//${window.location.host}/api/ws/events${this.csrfToken ? `?token=${this.csrfToken}` : ''}`;
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
        this.ws = new WebSocket(this.url);
        
        this.ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                window.dispatchEvent(new CustomEvent('tactical-event', { detail: payload }));
            } catch (e) {}

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

if (!window.SovereignWS) {
    window.SovereignWS = new WsManager();
}

window.SharedWebSocket = class SharedWebSocket {
    constructor(url) {
        this.url = url; // Ignored, we use the multiplexed URL
        this.onmessage = null;
        this.onopen = null;
        this.onclose = null;
        window.SovereignWS.subscribe(this);
    }

    send(data) {
        window.SovereignWS.send(data);
    }

    close() {
        window.SovereignWS.unsubscribe(this);
        if (this.onclose) {
            this.onclose({ type: 'close', wasClean: true });
        }
    }
};
