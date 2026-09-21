// Revenue Report Controller
(function () {
  'use strict';

  let currentReport = null;
  let activePeriod = 'month';

  // ── DOM References ──────────────────────────────────────────
  const rrPresetSelect   = document.getElementById('rrPresetSelect');
  const rrStartDate      = document.getElementById('rrStartDate');
  const rrEndDate        = document.getElementById('rrEndDate');
  const rrExportCsvBtn   = document.getElementById('rrExportCsvBtn');
  const rrPrintBtn       = document.getElementById('rrPrintBtn');

  // KPIs
  const rrKpiInvoiced    = document.getElementById('rrKpiInvoiced');
  const rrKpiInvoicedSub = document.getElementById('rrKpiInvoicedSub');
  const rrKpiCollected   = document.getElementById('rrKpiCollected');
  const rrKpiCollectedSub= document.getElementById('rrKpiCollectedSub');
  const rrKpiUncollected = document.getElementById('rrKpiUncollected');
  const rrKpiRate        = document.getElementById('rrKpiRate');
  const rrCurrencyBadge  = document.getElementById('rrCurrencyBadge');

  // Chart
  const rrChartWrap      = document.getElementById('rrChartWrap');
  const rrFxNotice       = document.getElementById('rrFxNotice');

  // Table
  const rrTableBody      = document.getElementById('rrTableBody');
  const rrTableFoot      = document.getElementById('rrTableFoot');

  // Tooltip
  let tooltip = null;

  // ── Currency Formatting ─────────────────────────────────────
  const CURRENCY_SYMBOLS = {};
  for (const c of (window.CURRENCIES || [])) CURRENCY_SYMBOLS[c.code] = c.symbol;

  function fmtCurrency(amount, currency) {
    const sym = CURRENCY_SYMBOLS[currency] || currency + ' ';
    return sym + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtRate(rate) {
    if (rate === null || rate === undefined) return '—';
    return rate.toFixed(1) + '%';
  }

  function getISODate(d) {
    return d.toISOString().slice(0, 10);
  }

  // ── Preset Handling ─────────────────────────────────────────
  function applyPreset(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'this_year') {
      rrStartDate.value = `${y}-01-01`;
      rrEndDate.value   = `${y}-12-31`;
    } else if (preset === 'last_year') {
      rrStartDate.value = `${y - 1}-01-01`;
      rrEndDate.value   = `${y - 1}-12-31`;
    } else if (preset === 'last_12_months') {
      const s = new Date(y, m - 11, 1);
      const e = new Date(y, m + 1, 0);
      rrStartDate.value = getISODate(s);
      rrEndDate.value   = getISODate(e);
    } else if (preset === 'this_quarter') {
      const qm = Math.floor(m / 3) * 3;
      rrStartDate.value = getISODate(new Date(y, qm, 1));
      rrEndDate.value   = getISODate(new Date(y, qm + 3, 0));
    } else if (preset === 'this_month') {
      rrStartDate.value = getISODate(new Date(y, m, 1));
      rrEndDate.value   = getISODate(new Date(y, m + 1, 0));
    } else if (preset === 'last_month') {
      rrStartDate.value = getISODate(new Date(y, m - 1, 1));
      rrEndDate.value   = getISODate(new Date(y, m, 0));
    } else if (preset === 'all_time') {
      rrStartDate.value = '';
      rrEndDate.value   = '';
    }
  }

  // ── Load Data ───────────────────────────────────────────────
  async function loadReport() {
    const filter = {
      period: activePeriod,
      startDate: rrStartDate.value || undefined,
      endDate:   rrEndDate.value   || undefined,
    };

    renderLoading();

    try {
      const result = await window.electronAPI.getRevenueReport(filter);
      if (!result.ok) {
        renderError(result.error || 'Failed to load revenue report.');
        return;
      }
      currentReport = result.report;
      renderReport(currentReport);
    } catch (e) {
      renderError(e.message);
    }
  }

  // ── Render Loading Skeletons ─────────────────────────────────
  function renderLoading() {
    if (rrKpiInvoiced)   rrKpiInvoiced.innerHTML = '<span class="rr-skeleton" style="display:block;width:80px;height:26px;"></span>';
    if (rrKpiCollected)  rrKpiCollected.innerHTML = '<span class="rr-skeleton" style="display:block;width:80px;height:26px;"></span>';
    if (rrKpiUncollected)rrKpiUncollected.innerHTML = '<span class="rr-skeleton" style="display:block;width:80px;height:26px;"></span>';
    if (rrKpiRate)       rrKpiRate.innerHTML = '<span class="rr-skeleton" style="display:block;width:60px;height:26px;"></span>';
    if (rrChartWrap)     rrChartWrap.innerHTML = '<div class="rr-chart-empty"><span class="rr-empty-icon">📊</span><p>Loading…</p></div>';
    if (rrTableBody)     rrTableBody.innerHTML = '';
  }

  function renderError(msg) {
    if (rrChartWrap) rrChartWrap.innerHTML = `<div class="rr-chart-empty"><span class="rr-empty-icon">⚠️</span><p>${msg}</p></div>`;
  }

  // ── Render Full Report ───────────────────────────────────────
  function renderReport(report) {
    const { summary, buckets, reportingCurrency, hasForeignCurrency } = report;
    const cur = reportingCurrency || 'USD';

    // Currency badge
    if (rrCurrencyBadge) rrCurrencyBadge.textContent = `Reporting in ${cur}`;

    // KPI Cards
    if (rrKpiInvoiced)   rrKpiInvoiced.textContent   = fmtCurrency(summary.totalInvoiced, cur);
    if (rrKpiInvoicedSub) rrKpiInvoicedSub.textContent = `${summary.invoiceCount} invoice${summary.invoiceCount !== 1 ? 's' : ''}`;
    if (rrKpiCollected)  rrKpiCollected.textContent  = fmtCurrency(summary.totalCollected, cur);
    if (rrKpiCollectedSub) rrKpiCollectedSub.textContent = `${summary.paymentCount} payment${summary.paymentCount !== 1 ? 's' : ''}`;
    if (rrKpiUncollected)rrKpiUncollected.textContent= fmtCurrency(summary.uncollected, cur);
    if (rrKpiRate)       rrKpiRate.textContent = summary.collectionRate !== null ? fmtRate(summary.collectionRate) : '—';

    // FX notice
    if (rrFxNotice) rrFxNotice.style.display = hasForeignCurrency ? 'flex' : 'none';

    // Chart
    renderChart(buckets, cur);

    // Table
    renderTable(buckets, cur, summary);
  }

  // ── SVG Bar Chart ────────────────────────────────────────────
  function renderChart(buckets, currency) {
    if (!rrChartWrap) return;

    if (!buckets || buckets.length === 0) {
      rrChartWrap.innerHTML = `<div class="rr-chart-empty">
        <span class="rr-empty-icon">📊</span>
        <p>No data for the selected period.</p>
      </div>`;
      return;
    }

    // Compute dimensions
    const SVG_H     = 260;
    const PAD_TOP   = 20;
    const PAD_BOT   = 48;
    const PAD_LEFT  = 72;
    const PAD_RIGHT = 20;
    const CHART_H   = SVG_H - PAD_TOP - PAD_BOT;
    const BAR_GROUP_GAP = 0.25; // fraction of group width used as gap
    const N = buckets.length;

    // Dynamic SVG width: at least 60px per group
    const MIN_GROUP_W = 60;
    const svgWidth = Math.max(600, PAD_LEFT + PAD_RIGHT + N * MIN_GROUP_W);
    const CHART_W   = svgWidth - PAD_LEFT - PAD_RIGHT;
    const groupW    = CHART_W / N;
    const barGap    = groupW * BAR_GROUP_GAP;
    const barW      = (groupW - barGap) / 2;

    // Y axis
    const maxVal = buckets.reduce((m, b) => Math.max(m, b.invoiced, b.collected), 0);
    const yMax   = maxVal === 0 ? 100 : Math.ceil(maxVal * 1.15 / 50) * 50;
    const GRIDLINES = 5;

    // Build SVG
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('id', 'rrChartSvg');
    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${SVG_H}`);
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', SVG_H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Revenue bar chart');

    const defs = document.createElementNS(ns, 'defs');
    const gradInv = document.createElementNS(ns, 'linearGradient');
    gradInv.setAttribute('id', 'rrGradInv');
    gradInv.setAttribute('x1', '0'); gradInv.setAttribute('y1', '0');
    gradInv.setAttribute('x2', '0'); gradInv.setAttribute('y2', '1');
    gradInv.innerHTML = '<stop offset="0%" stop-color="#6366f1" stop-opacity="1"/><stop offset="100%" stop-color="#818cf8" stop-opacity="0.8"/>';
    const gradCol = document.createElementNS(ns, 'linearGradient');
    gradCol.setAttribute('id', 'rrGradCol');
    gradCol.setAttribute('x1', '0'); gradCol.setAttribute('y1', '0');
    gradCol.setAttribute('x2', '0'); gradCol.setAttribute('y2', '1');
    gradCol.innerHTML = '<stop offset="0%" stop-color="#10b981" stop-opacity="1"/><stop offset="100%" stop-color="#34d399" stop-opacity="0.8"/>';
    defs.appendChild(gradInv);
    defs.appendChild(gradCol);
    svg.appendChild(defs);

    function px(v) { return PAD_TOP + CHART_H - (v / yMax) * CHART_H; }

    // Gridlines + Y axis labels
    for (let i = 0; i <= GRIDLINES; i++) {
      const val = (yMax / GRIDLINES) * i;
      const y   = px(val);

      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', PAD_LEFT);
      line.setAttribute('x2', svgWidth - PAD_RIGHT);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', 'rgba(255,255,255,0.07)');
      line.setAttribute('stroke-width', i === 0 ? '1.5' : '1');
      svg.appendChild(line);

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', PAD_LEFT - 8);
      label.setAttribute('y', y + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('font-size', '10');
      label.setAttribute('fill', 'rgba(148,163,184,0.8)');
      label.textContent = val >= 1000 ? (val / 1000).toFixed(val >= 10000 ? 0 : 1) + 'k' : val.toFixed(0);
      svg.appendChild(label);
    }

    // Bars + X labels
    buckets.forEach((b, i) => {
      const x0 = PAD_LEFT + i * groupW + barGap / 2;

      // Invoiced bar
      const invH = yMax > 0 ? (b.invoiced / yMax) * CHART_H : 0;
      const invY = PAD_TOP + CHART_H - invH;
      const rectInv = document.createElementNS(ns, 'rect');
      rectInv.setAttribute('x', x0);
      rectInv.setAttribute('y', invY);
      rectInv.setAttribute('width', barW);
      rectInv.setAttribute('height', Math.max(invH, 0));
      rectInv.setAttribute('fill', 'url(#rrGradInv)');
      rectInv.setAttribute('rx', '3');
      rectInv.style.cursor = 'pointer';
      rectInv.style.transition = 'opacity 0.1s';

      // Collected bar
      const colH = yMax > 0 ? (b.collected / yMax) * CHART_H : 0;
      const colY = PAD_TOP + CHART_H - colH;
      const rectCol = document.createElementNS(ns, 'rect');
      rectCol.setAttribute('x', x0 + barW + 2);
      rectCol.setAttribute('y', colY);
      rectCol.setAttribute('width', barW);
      rectCol.setAttribute('height', Math.max(colH, 0));
      rectCol.setAttribute('fill', 'url(#rrGradCol)');
      rectCol.setAttribute('rx', '3');
      rectCol.style.cursor = 'pointer';
      rectCol.style.transition = 'opacity 0.1s';

      // X axis label
      const labelX = x0 + barW;
      const textEl = document.createElementNS(ns, 'text');
      textEl.setAttribute('x', labelX);
      textEl.setAttribute('y', SVG_H - PAD_BOT + 18);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('font-size', '10');
      textEl.setAttribute('fill', 'rgba(148,163,184,0.8)');
      const labelStr = b.label.length > 12 ? b.label.slice(0, 11) + '…' : b.label;
      textEl.textContent = labelStr;

      // Tooltip event group
      const g = document.createElementNS(ns, 'g');
      g.appendChild(rectInv);
      g.appendChild(rectCol);

      const showTooltip = (evt) => {
        if (!tooltip) return;
        const rate = b.collectionRate !== null ? fmtRate(b.collectionRate) : '—';
        tooltip.innerHTML = `
          <div class="rr-tooltip-title">${b.label}</div>
          <div class="rr-tooltip-row"><span>📄 Invoiced</span><span>${fmtCurrency(b.invoiced, currency)}</span></div>
          <div class="rr-tooltip-row"><span>💳 Collected</span><span>${fmtCurrency(b.collected, currency)}</span></div>
          <div class="rr-tooltip-row"><span>⏳ Outstanding</span><span>${fmtCurrency(b.difference, currency)}</span></div>
          <div class="rr-tooltip-rate">Collection rate: <strong>${rate}</strong></div>
        `;
        tooltip.classList.add('visible');
        moveTooltip(evt);
      };

      const hideTooltip = () => {
        if (tooltip) tooltip.classList.remove('visible');
      };

      const moveTooltip = (evt) => {
        if (!tooltip) return;
        const tw = tooltip.offsetWidth || 200;
        const th = tooltip.offsetHeight || 120;
        let lx = evt.clientX + 14;
        let ly = evt.clientY - th / 2;
        if (lx + tw > window.innerWidth - 10) lx = evt.clientX - tw - 14;
        if (ly < 6) ly = 6;
        if (ly + th > window.innerHeight - 10) ly = window.innerHeight - th - 10;
        tooltip.style.left = lx + 'px';
        tooltip.style.top  = ly + 'px';
      };

      [rectInv, rectCol].forEach(r => {
        r.addEventListener('mouseenter', showTooltip);
        r.addEventListener('mousemove', moveTooltip);
        r.addEventListener('mouseleave', hideTooltip);
      });

      svg.appendChild(g);
      svg.appendChild(textEl);
    });

    // Clear and mount
    rrChartWrap.innerHTML = '';
    rrChartWrap.appendChild(svg);
  }

  // ── Period Table ─────────────────────────────────────────────
  function renderTable(buckets, currency, summary) {
    if (!rrTableBody) return;

    if (!buckets || buckets.length === 0) {
      rrTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">No data for the selected period.</td></tr>`;
      if (rrTableFoot) rrTableFoot.innerHTML = '';
      return;
    }

    function rateBadge(rate) {
      if (rate === null) return `<span class="rr-badge-rate none">—</span>`;
      const cls = rate >= 80 ? 'high' : rate >= 50 ? 'mid' : 'low';
      return `<span class="rr-badge-rate ${cls}">${fmtRate(rate)}</span>`;
    }

    rrTableBody.innerHTML = buckets.map(b => `
      <tr>
        <td>${b.label}</td>
        <td class="num">${b.invoiceCount}</td>
        <td class="num">${fmtCurrency(b.invoiced, currency)}</td>
        <td class="num">${b.paymentCount}</td>
        <td class="num">${fmtCurrency(b.collected, currency)}</td>
        <td class="num">${fmtCurrency(b.difference, currency)}</td>
        <td class="num">${rateBadge(b.collectionRate)}</td>
      </tr>
    `).join('');

    if (rrTableFoot) {
      const totalRate = summary.collectionRate !== null ? `<span class="rr-badge-rate ${summary.collectionRate >= 80 ? 'high' : summary.collectionRate >= 50 ? 'mid' : 'low'}">${fmtRate(summary.collectionRate)}</span>` : `<span class="rr-badge-rate none">—</span>`;
      rrTableFoot.innerHTML = `
        <tr>
          <td>Total</td>
          <td class="num">${summary.invoiceCount}</td>
          <td class="num">${fmtCurrency(summary.totalInvoiced, currency)}</td>
          <td class="num">${summary.paymentCount}</td>
          <td class="num">${fmtCurrency(summary.totalCollected, currency)}</td>
          <td class="num">${fmtCurrency(summary.uncollected, currency)}</td>
          <td class="num">${totalRate}</td>
        </tr>
      `;
    }
  }

  // ── CSV Export ───────────────────────────────────────────────
  function exportCsv() {
    if (!currentReport) return;
    const { buckets, reportingCurrency: cur, summary, period, startDate, endDate } = currentReport;

    const rows = [
      [`Revenue Report — ${activePeriod.charAt(0).toUpperCase() + activePeriod.slice(1)}ly`],
      [`Period: ${startDate || 'All time'} to ${endDate || 'All time'}`],
      [`Reporting Currency: ${cur}`],
      [],
      ['Period', 'Invoices', `Invoiced (${cur})`, 'Payments', `Collected (${cur})`, `Outstanding (${cur})`, 'Collection %'],
      ...buckets.map(b => [
        b.label,
        b.invoiceCount,
        b.invoiced.toFixed(2),
        b.paymentCount,
        b.collected.toFixed(2),
        b.difference.toFixed(2),
        b.collectionRate !== null ? b.collectionRate.toFixed(1) + '%' : '',
      ]),
      [],
      ['TOTAL', summary.invoiceCount, summary.totalInvoiced.toFixed(2), summary.paymentCount, summary.totalCollected.toFixed(2), summary.uncollected.toFixed(2), summary.collectionRate !== null ? summary.collectionRate.toFixed(1) + '%' : ''],
    ];

    const csv = rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `revenue-report-${activePeriod}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Period Pills ─────────────────────────────────────────────
  function setupPeriodPills() {
    document.querySelectorAll('.rr-period-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rr-period-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activePeriod = btn.dataset.period;
        loadReport();
      });
    });
  }

  // ── Initialise ───────────────────────────────────────────────
  function init() {
    // Create tooltip element
    tooltip = document.createElement('div');
    tooltip.className = 'rr-tooltip';
    document.body.appendChild(tooltip);

    setupPeriodPills();

    // Apply default preset
    if (rrPresetSelect) {
      rrPresetSelect.value = 'this_year';
      applyPreset('this_year');
      rrPresetSelect.addEventListener('change', () => {
        applyPreset(rrPresetSelect.value);
        loadReport();
      });
    }

    if (rrStartDate) rrStartDate.addEventListener('change', () => {
      if (rrPresetSelect) rrPresetSelect.value = 'custom';
      loadReport();
    });
    if (rrEndDate) rrEndDate.addEventListener('change', () => {
      if (rrPresetSelect) rrPresetSelect.value = 'custom';
      loadReport();
    });

    if (rrExportCsvBtn) rrExportCsvBtn.addEventListener('click', exportCsv);

    const rrExportPdfBtn = document.getElementById('rrExportPdfBtn');
    if (rrExportPdfBtn) {
      rrExportPdfBtn.addEventListener('click', async () => {
        try {
          const filter = getFilterPayload();
          await window.electronAPI.exportRevenueReportPdf(filter);
        } catch (err) {
          console.error('Failed to export revenue PDF:', err);
        }
      });
    }
    if (rrPrintBtn)     rrPrintBtn.addEventListener('click', () => window.print());

    const rrChipBar = document.getElementById('rrChipBar');
    if (rrChipBar && rrPresetSelect && window.QuoteCraftUtils && window.QuoteCraftUtils.initDateChips) {
      window.QuoteCraftUtils.initDateChips(rrChipBar, rrPresetSelect);
    }

    loadReport();
  }

  // Listen for page activation
  function onPageChange(e) {
    if (e.detail === 'revenue-report') {
      document.removeEventListener('pagechange', onPageChange);
      init();
    }
  }
  document.addEventListener('pagechange', onPageChange);

  // Also catch direct init if already on page
  if (document.getElementById('page-revenue-report') &&
      document.getElementById('page-revenue-report').classList.contains('active')) {
    init();
  }
})();

