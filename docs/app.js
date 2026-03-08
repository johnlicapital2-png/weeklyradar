/* Weekly Radar — Dashboard App */
(function () {
  'use strict';

  let DATA = null;
  let activeFilters = new Set();
  let sortState = {};

  // ── Fetch Data ──
  async function loadData() {
    try {
      const res = await fetch('data/scanner_data.json?t=' + Date.now());
      DATA = await res.json();
      render();
    } catch (e) {
      document.querySelector('main').innerHTML =
        '<div class="loading">Loading scanner data…</div>';
    }
  }

  // ── Render All ──
  function render() {
    renderHeader();
    renderHeatmap();
    renderCombos();
    renderSignals();
    setupFilters();
  }

  // ── Header ──
  function renderHeader() {
    document.getElementById('scan-date').textContent = 'Scanned: ' + DATA.scan_time;
    document.getElementById('next-scan').textContent = 'Next: ' + DATA.next_scan;
  }

  // ── Heatmap ──
  function renderHeatmap() {
    const tbody = document.querySelector('#heatmap-table tbody');
    tbody.innerHTML = '';
    const rows = [...DATA.heatmap];
    applySortToArray(rows, 'heatmap');

    rows.forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${h.category}</td>
        <td class="num ${heatClass(h.ret_1w)}">${fmtPct(h.ret_1w)}</td>
        <td class="num ${heatClass(h.ret_4w)}">${fmtPct(h.ret_4w)}</td>
        <td class="num">${h.signal_count}</td>
      `;
      tbody.appendChild(tr);
    });

    setupTableSort('#heatmap-table', 'heatmap', renderHeatmap);
  }

  // ── Combos ──
  function renderCombos() {
    const grid = document.getElementById('combos-grid');
    grid.innerHTML = '';
    if (!DATA.combos.length) {
      grid.innerHTML = '<p style="color:var(--text-dim)">No combo signals this week.</p>';
      return;
    }

    DATA.combos.forEach(s => {
      const isBearish = s.signals.includes('breakdown');
      const card = document.createElement('div');
      card.className = 'combo-card' + (isBearish ? ' bearish' : '');
      card.innerHTML = `
        <div class="card-header">
          <span class="ticker">${s.ticker}</span>
          <span class="category-tag">${s.category}</span>
        </div>
        <div class="badges">
          ${s.signals.map(sig => `<span class="badge badge-${sig}">${sigLabel(sig)}</span>`).join('')}
        </div>
        <div class="stats">
          <span class="label">Price</span><span class="value">$${s.price.toFixed(2)}</span>
          <span class="label">Vol Ratio</span><span class="value">${s.vol_ratio}x</span>
          <span class="label">4wk Return</span><span class="value ${s.ret_4w >= 0 ? 'pos' : 'neg'}">${fmtPct(s.ret_4w)}</span>
          <span class="label">RS vs SPY</span><span class="value ${s.rs_vs_spy >= 0 ? 'pos' : 'neg'}">${fmtPp(s.rs_vs_spy)}</span>
        </div>
      `;
      card.addEventListener('click', () => openDetail(s.ticker));
      grid.appendChild(card);
    });
  }

  // ── Signals Table ──
  function renderSignals() {
    const tbody = document.querySelector('#signals-table tbody');
    tbody.innerHTML = '';
    let rows = [...DATA.signals];

    if (activeFilters.size) {
      rows = rows.filter(s => s.signals.some(sig => activeFilters.has(sig)));
    }

    applySortToArray(rows, 'signals');

    rows.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${s.ticker}</strong></td>
        <td class="hide-mobile">${s.category}</td>
        <td>${s.signals.map(sig => `<span class="badge badge-${sig}">${sigLabel(sig)}</span>`).join(' ')}</td>
        <td class="num">$${s.price.toFixed(2)}</td>
        <td class="num">${s.vol_ratio}x</td>
        <td class="num ${s.ret_4w >= 0 ? 'pos' : 'neg'}">${fmtPct(s.ret_4w)}</td>
        <td class="num hide-mobile ${s.rs_vs_spy >= 0 ? 'pos' : 'neg'}">${fmtPp(s.rs_vs_spy)}</td>
        <td class="${s.is_new ? 'status-new' : 'status-persistent'}">${s.is_new ? '🆕 New' : '⏳'}</td>
      `;
      tr.addEventListener('click', () => openDetail(s.ticker));
      tbody.appendChild(tr);
    });

    setupTableSort('#signals-table', 'signals', renderSignals);
  }

  // ── Filters ──
  function setupFilters() {
    const container = document.getElementById('signal-filters');
    if (container.children.length) return; // already set up
    const types = ['volume_spike', 'breakout', 'momentum_shift', 'relative_strength', 'breakdown'];
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.textContent = sigLabel(t);
      btn.addEventListener('click', () => {
        if (activeFilters.has(t)) {
          activeFilters.delete(t);
          btn.classList.remove('active');
        } else {
          activeFilters.add(t);
          btn.classList.add('active');
        }
        renderSignals();
      });
      container.appendChild(btn);
    });
  }

  // ── Detail Panel ──
  function openDetail(ticker) {
    const d = DATA.ticker_details[ticker];
    if (!d) return;
    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');

    const sparkBars = (d.vol_history || [])
      .map(v => `<div class="spark-bar" style="height:${Math.max(v, 3)}%"></div>`)
      .join('');

    content.innerHTML = `
      <div class="detail-ticker">${ticker}</div>
      <div class="detail-category">${d.category}</div>
      <div class="detail-badges">
        ${d.signals.map(sig => `<span class="badge badge-${sig}">${sigLabel(sig)}</span>`).join('')}
      </div>
      <div class="detail-grid">
        <div class="detail-stat"><div class="label">Price</div><div class="value">$${d.price.toFixed(2)}</div></div>
        <div class="detail-stat"><div class="label">20w MA</div><div class="value ${d.above_ma20 ? 'pos' : 'neg'}">$${d.ma20.toFixed(2)}</div></div>
        <div class="detail-stat"><div class="label">Vol Ratio</div><div class="value">${d.vol_ratio}x</div></div>
        <div class="detail-stat"><div class="label">RS vs SPY</div><div class="value ${d.rs_vs_spy >= 0 ? 'pos' : 'neg'}">${fmtPp(d.rs_vs_spy)}</div></div>
      </div>
      <table class="returns-table">
        <thead><tr><th>1wk</th><th>4wk</th><th>8wk</th><th>12wk</th><th>20wk</th></tr></thead>
        <tbody><tr>
          <td class="num ${d.ret_1w >= 0 ? 'pos' : 'neg'}">${fmtPct(d.ret_1w)}</td>
          <td class="num ${d.ret_4w >= 0 ? 'pos' : 'neg'}">${fmtPct(d.ret_4w)}</td>
          <td class="num ${d.ret_8w >= 0 ? 'pos' : 'neg'}">${fmtPct(d.ret_8w)}</td>
          <td class="num ${d.ret_12w >= 0 ? 'pos' : 'neg'}">${fmtPct(d.ret_12w)}</td>
          <td class="num ${d.ret_20w >= 0 ? 'pos' : 'neg'}">${fmtPct(d.ret_20w)}</td>
        </tr></tbody>
      </table>
      <div class="sparkline-container">
        <div class="sparkline-label">Volume (10 weeks)</div>
        <div class="sparkline">${sparkBars}</div>
      </div>
    `;

    panel.classList.add('open');
  }

  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-panel').classList.remove('open');
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.getElementById('detail-panel').classList.remove('open');
  });

  // ── Table Sorting ──
  function setupTableSort(selector, stateKey, renderFn) {
    const ths = document.querySelectorAll(`${selector} thead th`);
    ths.forEach(th => {
      // Remove old listeners by cloning
      const newTh = th.cloneNode(true);
      th.parentNode.replaceChild(newTh, th);
      newTh.addEventListener('click', () => {
        const key = newTh.getAttribute('data-sort');
        if (!key) return;
        const cur = sortState[stateKey];
        if (cur && cur.key === key) {
          sortState[stateKey] = { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
        } else {
          sortState[stateKey] = { key, dir: 'desc' };
        }
        renderFn();
      });
      // Mark sorted column
      const cur = sortState[stateKey];
      if (cur && cur.key === newTh.getAttribute('data-sort')) {
        newTh.classList.add(cur.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  }

  function applySortToArray(arr, stateKey) {
    const s = sortState[stateKey];
    if (!s) return;
    const k = s.key;
    const dir = s.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va = a[k], vb = b[k];
      if (k === 'signal') { va = (a.signals || []).join(','); vb = (b.signals || []).join(','); }
      if (k === 'status') { va = a.is_new ? 1 : 0; vb = b.is_new ? 1 : 0; }
      if (typeof va === 'string') return dir * va.localeCompare(vb);
      return dir * ((va || 0) - (vb || 0));
    });
  }

  // ── Helpers ──
  function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
  function fmtPp(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + 'pp'; }

  function heatClass(v) {
    if (v > 5) return 'heat-strong-pos';
    if (v > 0) return 'heat-pos';
    if (v < -5) return 'heat-strong-neg';
    return 'heat-neg';
  }

  const SIG_LABELS = {
    volume_spike: '🔴 Volume Spike',
    breakout: '🟡 Breakout',
    momentum_shift: '🟢 Momentum',
    relative_strength: '📊 RS',
    breakdown: '📉 Breakdown',
  };
  function sigLabel(s) { return SIG_LABELS[s] || s; }

  // ── Init ──
  loadData();
  // Auto-refresh every 5 minutes
  setInterval(loadData, 300000);
})();
