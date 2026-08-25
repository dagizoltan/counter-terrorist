/**
 * Custom Element: NewsFeed
 * Enhanced tactical aggregator for real-time cyber intelligence.
 * Optimized for readability and professional engineering standards.
 * Refined: Removed blue color from labels to align with neutral tactical aesthetic.
 */
import { unwrap } from "./api.js";
class NewsFeed extends HTMLElement {
  constructor() {
    super();
    this.news = [];
    this.currentIndex = 0;
  }

  connectedCallback() {
    this.render();
    this.fetchInitial();
    this.setupListeners();
  }

  async fetchInitial() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/threats/feed', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await unwrap(res);
        const items = Array.isArray(data) ? data : (data.items || data.latest || []);
        if (items.length > 0) {
          this.news = items.map(item => ({
            ...item,
            severity: this.calculateSeverity(item.title),
            category: this.detectCategory(item.title)
          }));
          this.render();
        }
      }
    } catch (e) {
      console.warn('[NEWS-FEED] Initial fetch failed, waiting for stream');
    }
  }

  setupListeners() {
    globalThis.addEventListener('metrics-update', (e) => {
      if (e.detail?.news?.latest) {
        this.news = e.detail.news.latest.map(item => ({
          ...item,
          severity: this.calculateSeverity(item.title),
          category: this.detectCategory(item.title)
        }));
        this.render();
      }
    });
  }

  calculateSeverity(title) {
    const critical = ['exploit', 'critical', 'zero-day', 'ransomware', 'breach'];
    const high = ['vulnerability', 'phishing', 'campaign', 'targeted'];
    const lower = title.toLowerCase();
    if (critical.some(word => lower.includes(word))) return 'CRITICAL';
    if (high.some(word => lower.includes(word))) return 'HIGH';
    return 'INFO';
  }

  detectCategory(title) {
    const lower = title.toLowerCase();
    if (lower.includes('phish')) return 'PHISHING';
    if (lower.includes('vulnerabilit') || lower.includes('cve')) return 'EXPLOIT';
    if (lower.includes('malware') || lower.includes('ransom')) return 'MALWARE';
    return 'INTEL';
  }

  getSeverityStyles(sev, cat) {
    if (cat === 'PHISHING') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (cat === 'EXPLOIT') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    if (cat === 'MALWARE') return 'bg-red-500/10 text-red-400 border-red-500/20';
    
    switch (sev) {
      case 'CRITICAL': return 'bg-danger/10 text-danger border-danger/20';
      case 'HIGH': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-white/5 text-slate-300 border-white/10';
    }
  }

  getCategoryIcon(cat) {
    switch (cat) {
      case 'EXPLOIT': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L22 22"/></svg>';
      case 'PHISHING': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12l4 4-4 4"/></svg>';
      case 'MALWARE': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
      default: return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }
  }

  formatLabel(label) {
    if (!label) return '';
    return label.replace(/_/g, ' ').toUpperCase();
  }

  render() {
    const isDetailed = this.getAttribute('detailed') === 'true';
    const isCompact = this.getAttribute('compact') === 'true';
    const limit = parseInt(this.getAttribute('limit') || (isDetailed ? '50' : '12'));
    const displayNews = this.news.slice(0, limit);
 
    if (this.news.length === 0) {
      this.innerHTML = `
        <div class="flex flex-col gap-4">
           <div class="${isCompact ? 'p-4 rounded-xl' : 'p-6 rounded-2xl'} bg-black/40 border border-white/5 backdrop-blur-xl">
              <div class="flex items-center gap-3 mb-2">
                 <div class="indicator" data-state="info" data-pulse="" aria-hidden="true"></div>
                 <span class="eyebrow" data-tone="primary">Global Intelligence Feed Standby</span>
              </div>
              <p class="mono-xs text-slate-500 font-medium tracking-wide leading-relaxed">
                 Awaiting dynamic threat telemetry ingest from OSINT providers (NVD, AlienVault, CISA).
              </p>
           </div>
        </div>
      `;
      return;
    }
 
    const gridClass = isDetailed ? 'flex flex-col space-y-6' : (isCompact ? 'space-y-3' : 'space-y-6');
 
    this.innerHTML = `
      <div class="${gridClass}">
        ${displayNews.map(item => `
          <a href="${item.link}" target="_blank" class="block ${isCompact ? 'p-4 rounded-xl' : 'p-8 rounded-2xl'} bg-black/40 border border-white/5 hover:border-white/10 hover:bg-white/[0.03] group transition-all duration-300 relative overflow-hidden backdrop-blur-xl">
            <div class="flex justify-between items-start ${isCompact ? 'mb-2' : 'mb-6'}">
               <div class="flex items-center gap-4">
                  <div class="${isCompact ? 'p-1.5' : 'p-2.5'} rounded-lg border ${this.getSeverityStyles(item.severity, item.category)}">
                     ${this.getCategoryIcon(item.category)}
                  </div>
                  <div class="flex flex-col gap-0.5">
                     <span class="eyebrow" style="${isCompact ? 'font-size: 7px;' : ''}">${this.formatLabel(item.source)}</span>
                     <span class="eyebrow" style="font-size: 8px;">${new Date(item.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</span>
                  </div>
               </div>
               <span class="status-pill ${item.severity === 'CRITICAL' ? 'danger' : item.severity === 'HIGH' ? 'warning' : 'neutral'} font-black uppercase tracking-[0.2em]">
                  ${item.severity}
               </span>
            </div>
 
            <h4 class="${isCompact ? 'text-sm mb-2' : 'text-xl mb-6'} font-black text-white uppercase tracking-tight leading-tight line-clamp-1 group-hover:translate-x-1 transition-all">
               ${item.title.replace(/_/g, ' ')}
            </h4>
            
            ${!isCompact ? `
              <p class="mono-xs text-slate-400 line-clamp-3 leading-relaxed mb-4 font-medium italic">
                 ${item.summary.replace(/_/g, ' ')}
              </p>
            ` : ''}
 
            ${!isCompact ? `
              <div class="flex items-center justify-between pt-4 border-t border-white/5">
                  <div class="flex items-center gap-3 text-slate-500 group-hover:text-slate-300 transition-colors">
                      <span class="eyebrow">Intercept Signal</span>
                      <svg class="transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </div>
              </div>
            ` : ''}
          </a>
        `).join('')}
      </div>
 
      ${!isDetailed && !isCompact ? `
        <div class="mt-6">
            <a href="/intel/feed" class="t-btn primary w-full justify-center py-4 group">
                <span class="eyebrow">Open Global Intelligence Deck</span>
                <svg class="transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12H3"/><path d="m15 18 6-6-6-6"/></svg>
            </a>
        </div>
      ` : ''}
    `;
  }
}

if (!customElements.get('news-feed')) {
  customElements.define('news-feed', NewsFeed);
}
