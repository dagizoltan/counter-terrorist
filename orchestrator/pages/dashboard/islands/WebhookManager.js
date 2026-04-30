class WebhookManager extends HTMLElement {
  connectedCallback() {
    this.loadWebhooks();
    this.bindForm();
    this.bindTestAll();
  }

  bindForm() {
    const form = document.getElementById('webhook-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('wh-name').value;
      const url = document.getElementById('wh-url').value;
      const type = document.getElementById('wh-type').value;
      const status = document.getElementById('webhook-status');

      try {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
        const res = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CT-Token': csrf
          },
          body: JSON.stringify({ name, url, type, enabled: true })
        });
        const data = await res.json();
        if (data.error) {
          status.textContent = `ERROR: ${data.error}`;
          status.className = 'text-[9px] font-bold uppercase text-red-500 text-center';
        } else {
          status.textContent = 'WEBHOOK REGISTERED';
          status.className = 'text-[9px] font-bold uppercase text-green-500 text-center';
          form.reset();
          this.loadWebhooks();
        }
      } catch (e) {
        status.textContent = `FAILED: ${e.message}`;
        status.className = 'text-[9px] font-bold uppercase text-red-500 text-center';
      }
    });
  }

  bindTestAll() {
    const btn = document.getElementById('test-all-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.textContent = 'TESTING...';
      try {
        // Trigger a test notification through the audit system
        await fetch('/api/protection/firewall/status');
        btn.textContent = 'TEST SENT';
        setTimeout(() => btn.textContent = 'TEST_ALL', 2000);
      } catch {
        btn.textContent = 'FAILED';
      }
    });
  }

  async loadWebhooks() {
    const container = document.getElementById('webhook-list');
    if (!container) return;

    try {
      const res = await fetch('/api/notifications');
      const webhooks = await res.json();

      if (!webhooks || webhooks.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12">
            <p class="text-slate-600 text-[10px] font-bold uppercase tracking-widest mb-2">No webhooks configured</p>
            <p class="text-slate-700 text-[9px]">Add a Slack, Discord, or generic webhook to receive security alerts.</p>
          </div>`;
        return;
      }

      container.innerHTML = webhooks.map(wh => `
        <div class="bg-black/40 border border-white/5 p-6 flex justify-between items-center group hover:border-white/10 transition-all">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-[10px] font-black uppercase tracking-widest text-white">${this.esc(wh.name)}</span>
              <span class="px-2 py-0.5 text-[8px] font-black uppercase ${wh.type === 'slack' ? 'bg-purple-600/20 text-purple-400' : wh.type === 'discord' ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-600/20 text-slate-400'}">${wh.type}</span>
              <span class="px-2 py-0.5 text-[8px] font-black uppercase ${wh.enabled ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}">${wh.enabled ? 'ACTIVE' : 'DISABLED'}</span>
            </div>
            <p class="text-[9px] text-slate-600 font-mono truncate max-w-lg">${this.esc(wh.url)}</p>
          </div>
          <button onclick="const csrf=document.querySelector('meta[name=\'csrf-token\']')?.content;fetch('/api/notifications/${wh.id}',{method:'DELETE',headers:{'X-CT-Token':csrf}}).then(()=>document.querySelector('webhook-manager').loadWebhooks())" class="text-[9px] font-black uppercase text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all px-4 py-2 border border-transparent hover:border-red-500/20">
            Remove
          </button>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p class="text-red-500 text-[9px] font-bold uppercase text-center">Failed to load: ${e.message}</p>`;
    }
  }

  esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
customElements.define('webhook-manager', WebhookManager);
