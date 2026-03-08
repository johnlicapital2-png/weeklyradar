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
    renderGuru();
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

  // ── Guru 13F Activity ──
  function renderGuru() {
    const guru = DATA.guru_activity;
    const section = document.getElementById('guru-section');
    if (!guru) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    // Clusters
    const clustersEl = document.getElementById('guru-clusters');
    const multiGuru = (guru.clusters || []).filter(c => c.guru_count >= 2);
    if (multiGuru.length) {
      clustersEl.innerHTML = '<h3 style="font-size:.9rem;color:var(--text-dim);margin-bottom:.6rem">Cross-Guru Holdings</h3><div class="cluster-grid"></div>';
      const grid = clustersEl.querySelector('.cluster-grid');
      multiGuru.slice(0, 12).forEach(c => {
        const card = document.createElement('div');
        card.className = 'cluster-card' + (c.critical ? ' critical' : '');
        card.innerHTML = `
          <div class="cluster-header">
            <span class="cluster-issuer">${c.ticker || c.issuer}</span>
            <span>
              ${c.critical ? '<span class="badge badge-critical">CRITICAL</span> ' : ''}
              <span class="badge badge-guru-count">${c.guru_count} gurus</span>
            </span>
          </div>
          <div class="cluster-gurus">${c.gurus.join(' · ')}</div>
          <div style="font-size:.75rem;color:var(--text-dim);margin-top:.2rem">Combined: $${fmtVal(c.total_value)}</div>
        `;
        grid.appendChild(card);
      });
    } else {
      clustersEl.innerHTML = '';
    }

    // Portfolio cards
    const guruGrid = document.getElementById('guru-grid');
    guruGrid.innerHTML = '';
    (guru.portfolios || []).forEach(p => {
      const card = document.createElement('div');
      card.className = 'guru-card';
      const rows = (p.top10 || []).map((h, i) => {
        const cls = (h.on_watchlist ? ' watchlist-hit' : '') + (i >= 5 ? ' guru-hidden' : '');
        return `<tr class="${cls}">
          <td>${h.ticker ? '<strong>' + h.ticker + '</strong> ' : ''}${h.issuer}</td>
          <td>$${fmtVal(h.value)}</td>
          <td>${h.weight}%</td>
        </tr>`;
      }).join('');

      const alertBadges = (p.alerts || []).map(a => {
        const cls = a.type === 'new' ? 'guru-alert-new' : a.type === 'exit' ? 'guru-alert-exit' : 'guru-alert-doubled';
        return `<span class="guru-alert-badge ${cls}">${a.label}</span>`;
      }).join('');

      card.innerHTML = `
        <div class="guru-header">
          <span class="guru-name">${p.name}</span>
          <div class="guru-meta">
            <span>$${fmtVal(p.total_value)} · ${p.num_positions} pos</span>
            <span>Filed: ${p.filing_date}</span>
          </div>
        </div>
        ${alertBadges ? '<div class="guru-alerts">' + alertBadges + '</div>' : ''}
        <div class="guru-holdings">
          <table>
            <thead><tr><th>Holding</th><th>Value</th><th>Weight</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${p.top10 && p.top10.length > 5 ? '<button class="guru-expand" data-expanded="false">Show all ' + p.top10.length + ' ▼</button>' : ''}
      `;

      const expandBtn = card.querySelector('.guru-expand');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          const expanded = expandBtn.getAttribute('data-expanded') === 'true';
          card.querySelectorAll('.guru-hidden').forEach(tr => {
            tr.style.display = expanded ? 'none' : 'table-row';
          });
          expandBtn.setAttribute('data-expanded', expanded ? 'false' : 'true');
          expandBtn.textContent = expanded ? 'Show all ' + p.top10.length + ' ▼' : 'Show less ▲';
        });
      }

      guruGrid.appendChild(card);
    });

    // Watchlist overlap matrix
    const matrixEl = document.getElementById('guru-watchlist-matrix');
    const wl = guru.watchlist_overlap || [];
    if (wl.length) {
      const guruNames = guru.guru_names || [];
      const shortName = n => n.split('(')[0].trim().split(' ')[0];
      let html = '<h3>📋 Watchlist × Guru Overlap</h3><table><thead><tr><th>Ticker</th>';
      guruNames.forEach(g => { html += `<th>${shortName(g)}</th>`; });
      html += '</tr></thead><tbody>';
      wl.forEach(row => {
        const multi = row.guru_count >= 3;
        html += `<tr class="${multi ? 'wl-multi' : ''}"><td><strong>${row.ticker}</strong></td>`;
        guruNames.forEach(g => {
          if (row.held_by[g]) {
            html += `<td class="wl-value wl-hit">✅ $${fmtVal(row.held_by[g])}</td>`;
          } else {
            html += '<td class="wl-value" style="color:var(--text-dim)">—</td>';
          }
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      matrixEl.innerHTML = html;
    } else {
      matrixEl.innerHTML = '';
    }
  }

  function fmtVal(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toString();
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
