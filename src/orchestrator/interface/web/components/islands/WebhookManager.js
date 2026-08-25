import { unwrap } from "./api.js";
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
        const data = await unwrap(res);
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
      const webhooks = await unwrap(res);

      if (!webhooks || webhooks.length === 0) {
        container.innerHTML = `
          <div class="text-center py-5 border-2 border-dashed border-white/5 rounded-lg bg-black/20">
            <p class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">No_Webhooks_Configured</p>
            <p class="eyebrow">Active alerts require Slack, Discord, or generic endpoints.</p>
          </div>`;
        return;
      }

      // SEC-03: DOM-based XSS Hardening.
      // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
      container.innerHTML = '';
      (webhooks || []).forEach(wh => {
        const whEl = document.createElement('div');
        whEl.className = "t-panel glass-panel flex justify-between items-center group transition-all hover:border-white/10 p-6 mb-4 last:mb-0";

        const infoDiv = document.createElement('div');
        infoDiv.className = "flex-1 min-w-0";

        const topRow = document.createElement('div');
        topRow.className = "flex items-center gap-4 mb-3";

        const nameSpan = document.createElement('span');
        nameSpan.className = "mono text-[10px] font-black uppercase tracking-widest text-white";
        nameSpan.textContent = wh.name;

        const typeSpan = document.createElement('span');
        typeSpan.className = "px-2 py-0.5 text-[8px] font-black uppercase mono tracking-widest rounded";
        typeSpan.style.background = 'var(--primary-glow)';
        typeSpan.style.color = 'var(--primary)';
        typeSpan.textContent = wh.type;

        const statusSpan = document.createElement('span');
        statusSpan.className = "px-2 py-0.5 text-[8px] font-black uppercase mono tracking-widest rounded";
        statusSpan.style.background = wh.enabled ? 'var(--success-glow)' : 'var(--danger-glow)';
        statusSpan.style.color = wh.enabled ? 'var(--success)' : 'var(--danger)';
        statusSpan.textContent = wh.enabled ? 'ACTIVE' : 'DISABLED';

        topRow.appendChild(nameSpan);
        topRow.appendChild(typeSpan);
        topRow.appendChild(statusSpan);

        const urlP = document.createElement('p');
        urlP.className = "text-[9px] text-slate-500 font-mono truncate max-w-lg italic opacity-60";
        urlP.textContent = wh.url;

        infoDiv.appendChild(topRow);
        infoDiv.appendChild(urlP);

        const removeBtn = document.createElement('button');
        removeBtn.className = "t-btn danger opacity-0 group-hover:opacity-100 transition-opacity";
        removeBtn.style.padding = "0.5rem 1rem";
        removeBtn.style.fontSize = "8px";
        removeBtn.textContent = "Remove";
        removeBtn.onclick = () => {
            const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
            fetch(`/api/notifications/${encodeURIComponent(wh.id)}`, {
                method: 'DELETE',
                headers: { 'X-CT-Token': csrf }
            }).then(() => this.loadWebhooks());
        };

        whEl.appendChild(infoDiv);
        whEl.appendChild(removeBtn);
        container.appendChild(whEl);
      });
    } catch (e) {
      container.innerHTML = '';
      const errorP = document.createElement('p');
      errorP.className = "mono text-[9px] font-black uppercase text-center";
      errorP.style.color = 'var(--danger)';
      errorP.textContent = `Sync_Failed: ${e.message}`;
      container.appendChild(errorP);
    }
  }
}
customElements.define('webhook-manager', WebhookManager);
