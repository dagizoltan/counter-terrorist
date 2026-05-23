class ToastManager extends HTMLElement {
    constructor() {
        super();
        this.toasts = [];
        this.render();
    }

    connectedCallback() {
        globalThis.toast = (message, type = 'info', duration = 4000) => {
            this.addToast(message, type, duration);
        };
        
        // Listen to global events for common mutations
        globalThis.addEventListener('tactical-mutation', (e) => {
            this.addToast(e.detail.message, e.detail.type || 'success');
        });
    }

    addToast(message, type, duration) {
        const id = Date.now() + Math.random().toString(36).substring(2);
        this.toasts.push({ id, message, type });
        this.render();
        
        setTimeout(() => {
            this.toasts = this.toasts.filter(t => t.id !== id);
            this.render();
        }, duration);
    }

    getIcon(type) {
        if (type === 'success') return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-success"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        if (type === 'danger' || type === 'error') return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-danger"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        if (type === 'warning') return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-warning"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-primary"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    getBgClass(type) {
        if (type === 'success') return 'border-success/30 bg-success/10';
        if (type === 'danger' || type === 'error') return 'border-danger/30 bg-danger/10';
        if (type === 'warning') return 'border-warning/30 bg-warning/10';
        return 'border-primary/30 bg-primary/10';
    }

    render() {
        this.innerHTML = `
            <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-sm">
                ${this.toasts.map(toast => `
                    <div class="flex items-center gap-4 p-4 rounded-xl border backdrop-blur-xl animate-in slide-in-from-right-8 fade-in duration-300 shadow-[0_4px_24px_rgba(0,0,0,0.4)] ${this.getBgClass(toast.type)}">
                        <div class="shrink-0 p-2 rounded-full bg-black/40 border border-white/5">
                            ${this.getIcon(toast.type)}
                        </div>
                        <p class="mono-xs font-bold text-slate-200 tracking-wide uppercase leading-tight">${globalThis.escapeHTML(toast.message)}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

if (!customElements.get('toast-manager')) {
    customElements.define('toast-manager', ToastManager);
}
