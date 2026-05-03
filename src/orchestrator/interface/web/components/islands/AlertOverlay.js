/**
 * Custom Element: AlertOverlay
 * Triggers a high-intensity visual override during LOCKDOWN or ISOLATE events.
 */
class AlertOverlay extends HTMLElement {
    constructor() {
        super();
        this.active = false;
        this.type = 'NONE';
    }

    connectedCallback() {
        this.render();
        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);
        
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'CRITICAL' && (data.message.includes('LOCKDOWN') || data.message.includes('ISOLATION'))) {
                    this.trigger('LOCKDOWN');
                } else if (data.type === 'REMEDIATION' && (data.data?.tier === 'LOCKDOWN' || data.data?.tier === 'ISOLATE')) {
                    this.trigger(data.data.tier);
                }
            } catch (e) {}
        };
    }

    trigger(type) {
        if (this.active) return;
        this.active = true;
        this.type = type;
        this.render();
        
        // Add global class to body for CSS animations
        document.body.classList.add('system-alert-active');
        
        // Play alert sound if possible
        try {
            const audio = new Audio('/assets/audio/alert_siren.mp3');
            audio.volume = 0.2;
            audio.play().catch(() => {});
        } catch (e) {}
    }

    render() {
        if (!this.active) {
            this.innerHTML = '';
            return;
        }

        this.innerHTML = `
            <div class="fixed inset-0 z-[10002] pointer-events-none overflow-hidden animate-fade-in">
                {/* 1. Global Red Pulsing Border */}
                <div class="absolute inset-0 border-[20px] border-danger opacity-40 animate-pulse"></div>
                
                {/* 2. Glitchy Scanline Overlay */}
                <div class="absolute inset-0 bg-danger/5 opacity-20 pointer-events-none mix-blend-overlay"></div>
                <div class="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none"></div>

                {/* 3. Central Alert Banner */}
                <div class="absolute top-1/4 left-0 w-full bg-danger/90 text-white py-10 shadow-[0_0_100px_rgba(255,0,0,0.5)] border-y-4 border-white/20 transform -skew-y-2 backdrop-blur-md pointer-events-auto">
                    <div class="container mx-auto px-10 flex items-center justify-between">
                        <div class="flex items-center gap-10">
                            <div class="p-5 bg-white/20 rounded-full animate-ping">
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            </div>
                            <div>
                                <h1 class="text-6xl font-black italic tracking-tighter uppercase mb-2">SYSTEM_${this.type}_INITIATED</h1>
                                <p class="mono text-xl font-bold opacity-80 uppercase tracking-[0.5em]">Consensus_Reached // Enforcement_Active // All_Channels_Locked</p>
                            </div>
                        </div>
                        <button onclick="this.closest('alert-overlay').dismiss()" class="t-btn bg-white text-danger border-none px-10 py-5 text-xl font-black hover:bg-slate-200 transition-colors">ACKNOWLEDGE</button>
                    </div>
                </div>

                {/* 4. Warning Symbols in Background */}
                <div class="absolute bottom-20 right-20 opacity-20 animate-bounce">
                    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
            </div>
        `;
    }

    dismiss() {
        this.active = false;
        document.body.classList.remove('system-alert-active');
        this.render();
    }
}

customElements.define('alert-overlay', AlertOverlay);
