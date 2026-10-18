/**
 * cashflow-chart.js
 * Phase 2 – Visual Dashboard Analytics: Cash Flow Timeline
 *
 * Renders an interactive grouped bar chart (Money In / Money Out / Net Profit)
 * on the dashboard. Uses only vanilla JS + inline SVG — no external deps.
 * Wired up from dashboard.js via window.CashFlowChart.load(range).
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const CHART_H   = 180;   // SVG drawing height (px)
  const BAR_GROUPS = 3;     // bars per month group: In / Out / Net
  const BAR_GAP   = 3;     // px gap between individual bars
  const GROUP_PAD = 10;    // px padding between month groups

  // ── State ──────────────────────────────────────────────────────────────────
  let _currentRange = '6m';
  let _currency     = 'USD';
  let _loading      = false;

  // ── DOM refs (resolved lazily) ─────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function money(v) {
    return window.QuoteCraftUtils
      ? window.QuoteCraftUtils.formatCurrency(v, _currency)
      : String(v);
  }

  function setKpi(id, value, colorClass) {
    const node = el(id);
    if (!node) return;
    node.textContent = money(value);
    // reset colour classes then apply
    node.classList.remove('cf-in', 'cf-out', 'profit-positive', 'profit-negative');
    if (colorClass) node.classList.add(colorClass);
  }

  // ── Bar chart renderer ─────────────────────────────────────────────────────
  function renderChart(timeline) {
    const barsEl  = el('cashflowBars');
    const axisEl  = el('cashflowXAxis');
    const emptyEl = el('cashflowEmptyState');
    if (!barsEl || !axisEl) return;

    barsEl.innerHTML = '';
    axisEl.innerHTML = '';

    const hasData = timeline.some(m => m.moneyIn > 0 || m.moneyOut > 0 || Math.abs(m.netProfit) > 0);

    if (emptyEl) emptyEl.style.display = hasData ? 'none' : 'flex';
    barsEl.style.display = hasData ? 'flex' : 'none';
    axisEl.style.display = hasData ? 'flex' : 'none';

    if (!hasData) return;

    // Compute the scale max across all data
    const allVals = timeline.flatMap(m => [m.moneyIn, m.moneyOut, Math.abs(m.netProfit)]);
    const maxVal  = Math.max(...allVals, 1);

    timeline.forEach((month) => {
      // --- column wrapper (bars + label) ---
      const col = document.createElement('div');
      col.className = 'cf-col';
      col.setAttribute('aria-label', `${month.fullMonth} ${month.year}`);

      // Tooltip on hover
      const tooltipLines = [
        `${month.fullMonth} ${month.year}`,
        `In:  ${money(month.moneyIn)}`,
        `Out: ${money(month.moneyOut)}`,
        `Net: ${money(month.netProfit)}`,
      ].join('\n');
      col.title = tooltipLines;

      // --- bars ---
      const barsGroup = document.createElement('div');
      barsGroup.className = 'cf-bars-group';

      function makeBar(value, cls, label) {
        const wrap = document.createElement('div');
        wrap.className = 'cf-bar-wrap';

        const bar = document.createElement('div');
        const pct = Math.min(100, (Math.abs(value) / maxVal) * 100);
        bar.className = 'cf-bar ' + cls;
        bar.style.height = pct + '%';
        bar.setAttribute('aria-label', label + ': ' + money(value));

        // Animate in
        bar.style.transform  = 'scaleY(0)';
        bar.style.transformOrigin = 'bottom';
        bar.style.transition = 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1)';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { bar.style.transform = 'scaleY(1)'; });
        });

        wrap.appendChild(bar);
        return wrap;
      }

      barsGroup.appendChild(makeBar(month.moneyIn,  'bar-in',  'Money In'));
      barsGroup.appendChild(makeBar(month.moneyOut, 'bar-out', 'Money Out'));

      const netAbs    = Math.abs(month.netProfit);
      const netCls    = 'bar-net ' + (month.netProfit >= 0 ? 'bar-net-pos' : 'bar-net-neg');
      barsGroup.appendChild(makeBar(netAbs, netCls, 'Net Profit'));

      col.appendChild(barsGroup);

      // --- X-axis label ---
      const lbl = document.createElement('span');
      lbl.className = 'cf-x-label';
      lbl.textContent = month.label;
      col.appendChild(lbl);

      barsEl.appendChild(col);
    });
  }

  // ── Main load function ─────────────────────────────────────────────────────
  async function load(range) {
    if (_loading) return;
    _loading = true;
    _currentRange = range || _currentRange;

    // Update tab UI
    ['6m', '12m', 'ytd'].forEach(r => {
      const tab = el('cfRange' + r.replace('m', 'm').replace('td', 'td'));
      // IDs are cfRange6m, cfRange12m, cfRangeYtd
    });
    document.querySelectorAll('.cashflow-tab').forEach(btn => {
      const active = btn.dataset.range === _currentRange;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    const subtitleEl = el('cashflowSubtitle');
    if (subtitleEl) subtitleEl.textContent = 'Loading…';

    try {
      if (!window.electronAPI || !window.electronAPI.getCashFlowTimeline) {
        throw new Error('getCashFlowTimeline not available');
      }

      const res = await window.electronAPI.getCashFlowTimeline({ range: _currentRange });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Unknown error');

      _currency = res.currency || 'USD';

      // KPI strip
      setKpi('cfTotalIn',  res.totalMoneyIn,  'cf-in');
      setKpi('cfTotalOut', res.totalMoneyOut, 'cf-out');

      const netNode = el('cfTotalNet');
      if (netNode) {
        netNode.textContent = money(res.totalNetProfit);
        netNode.classList.remove('profit-positive', 'profit-negative');
        netNode.classList.add(res.totalNetProfit >= 0 ? 'profit-positive' : 'profit-negative');
      }

      // Subtitle
      const rangeLabel = _currentRange === '6m' ? 'Last 6 months' :
                         _currentRange === '12m' ? 'Last 12 months' : 'Year to date';
      if (subtitleEl) subtitleEl.textContent = `${rangeLabel} · All amounts in ${_currency}`;

      // Chart
      renderChart(res.timeline || []);

    } catch (e) {
      if (subtitleEl) subtitleEl.textContent = 'Could not load cash flow data.';
      const emptyEl = el('cashflowEmptyState');
      if (emptyEl) {
        emptyEl.style.display = 'flex';
        emptyEl.innerHTML = '<span class="cashflow-empty-icon">⚠️</span><span>Failed to load cash flow data.</span>';
      }
      console.warn('[CashFlowChart] load error:', e);
    } finally {
      _loading = false;
    }
  }

  // ── Wire up range tabs ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.cashflow-tab').forEach(btn => {
      btn.addEventListener('click', () => load(btn.dataset.range));
    });
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  window.CashFlowChart = { load };

})();
