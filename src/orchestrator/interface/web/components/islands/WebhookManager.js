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
          status.style.color = 'var(--danger)';
          status.className = 'text-[9px] font-black uppercase text-center';
        } else {
          status.textContent = 'WEBHOOK REGISTERED';
          status.style.color = 'var(--success)';
          status.className = 'text-[9px] font-black uppercase text-center';
          form.reset();
          this.loadWebhooks();
        }
      } catch (e) {
        status.textContent = `FAILED: ${e.message}`;
        status.style.color = 'var(--danger)';
        status.className = 'text-[9px] font-black uppercase text-center';
      }
    });
  }

  bindTestAll() {
    const btn = document.getElementById('test-all-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.textContent = 'TESTING...';
      try {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
        // Trigger a test notification through the audit system
        await fetch('/api/infrastructure/system/protection/firewall/status', {
           headers: csrf ? { 'X-CT-Token': csrf } : {}
        });
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
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/notifications', {
         headers: csrf ? { 'X-CT-Token': csrf } : {}
      });
      const webhooks = await res.json();

      if (!webhooks || webhooks.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12 border-2 border-dashed border-white/5">
            <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">No_Webhooks_Configured</p>
            <p class="text-slate-700 text-[9px] mono uppercase">Active alerts require Slack, Discord, or generic endpoints.</p>
          </div>`;
        return;
      }

      container.innerHTML = webhooks.map(wh => `
        <div class="t-panel flex justify-between items-center group">
          <div class="flex-1">
            <div class="flex items-center gap-4 mb-4">
              <span class="mono text-[10px] font-black uppercase tracking-widest text-white">${this.esc(wh.name)}</span>
              <span class="px-2 py-1 text-[8px] font-black uppercase mono tracking-widest" style="background:var(--primary-glow); color:var(--primary);">${wh.type}</span>
              <span class="px-2 py-1 text-[8px] font-black uppercase mono tracking-widest" style="background:${wh.enabled ? 'var(--success-glow)' : 'var(--danger-glow)'}; color:${wh.enabled ? 'var(--success)' : 'var(--danger)'};">
                ${wh.enabled ? 'ACTIVE' : 'DISABLED'}
              </span>
            </div>
            <p class="text-[9px] text-slate-500 font-mono truncate max-w-lg italic opacity-60">${this.esc(wh.url)}</p>
          </div>
          <button onclick="const csrf=document.querySelector('meta[name=\\'csrf-token\\']')?.content;fetch('/api/notifications/${wh.id}',{method:'DELETE',headers:{'X-CT-Token':csrf}}).then(()=>document.querySelector('webhook-manager').loadWebhooks())" class="t-btn danger" style="padding: 0.5rem 1rem; font-size: 8px;">
            Remove
          </button>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p class="mono text-[9px] font-black uppercase text-center" style="color:var(--danger);">Sync_Failed: ${e.message}</p>`;
    }
  }

  esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
customElements.define('webhook-manager', WebhookManager);
