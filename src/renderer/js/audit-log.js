// Audit Log Controller: read-only, filterable history of changes.
(function () {
  'use strict';

  const auditPresetSelect = document.getElementById('auditPresetSelect');
  const auditStartDate    = document.getElementById('auditStartDate');
  const auditEndDate      = document.getElementById('auditEndDate');
  const auditTypeSelect   = document.getElementById('auditTypeSelect');
  const auditRefreshBtn   = document.getElementById('auditRefreshBtn');
  const auditTableCount   = document.getElementById('auditTableCount');
  const auditTableBody    = document.getElementById('auditTableBody');
  const auditExportCsvBtn = document.getElementById('auditExportCsvBtn');
  const auditPrintBtn     = document.getElementById('auditPrintBtn');
  const auditChipBar      = document.getElementById('auditChipBar');

  let currentEntries = [];

  const TYPE_LABELS = {
    client: 'Client',
    project: 'Project',
    quote: 'Quote',
    invoice: 'Invoice',
    payment: 'Payment',
    credit_note: 'Credit note',
    settings: 'Settings',
  };

  const ACTION_LABELS = {
    created: 'Created',
    updated: 'Updated',
    deleted: 'Deleted',
    archived: 'Archived',
    status_changed: 'Status changed',
    payment_recorded: 'Payment recorded',
    credit_note_issued: 'Credit note issued',
    attachment_added: 'Attachment added',
    attachment_removed: 'Attachment removed',
    settings_changed: 'Settings changed',
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tagClass(type) {
    return 'audit-type-tag t-' + String(type || '').replace(/[^a-z0-9_]/g, '_');
  }

  function applyPreset(preset) {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const iso = (d) => d.toISOString().slice(0, 10);
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'today') {
      auditStartDate.value = iso(dayStart);
      auditEndDate.value = iso(dayStart);
    } else if (preset === 'this_week') {
      const monday = new Date(dayStart);
      const dow = (monday.getDay() + 6) % 7; // Monday = 0
      monday.setDate(monday.getDate() - dow);
      auditStartDate.value = iso(monday);
      auditEndDate.value = iso(dayStart);
    } else if (preset === 'this_month') {
      auditStartDate.value = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      auditEndDate.value = iso(dayStart);
    } else if (preset === 'last_month') {
      const s = new Date(y, m - 1, 1);
      const e = new Date(y, m, 0);
      auditStartDate.value = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-01`;
      auditEndDate.value   = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
    } else if (preset === 'this_quarter') {
      const qm = Math.floor(m / 3) * 3;
      const s = new Date(y, qm, 1);
      const e = new Date(y, qm + 3, 0);
      auditStartDate.value = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
      auditEndDate.value   = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
    } else if (preset === 'this_year') {
      auditStartDate.value = `${y}-01-01`;
      auditEndDate.value = iso(dayStart);
    } else if (preset === 'all_time') {
      auditStartDate.value = '';
      auditEndDate.value = '';
    }
  }

  async function loadEntries() {
    const filter = {};
    if (auditTypeSelect && auditTypeSelect.value && auditTypeSelect.value !== 'all') {
      filter.recordType = auditTypeSelect.value;
    }
    if (auditStartDate && auditStartDate.value) filter.from = auditStartDate.value;
    if (auditEndDate && auditEndDate.value) filter.to = auditEndDate.value;

    let entries = [];
    try {
      const res = await window.electronAPI.getAuditEntries(filter);
      if (res && res.ok) entries = res.entries || [];
    } catch (err) {
      window.QuoteCraftUtils.showToast('Could not load the audit log.', 'error');
      return;
    }

    currentEntries = entries;
    auditTableCount.textContent = entries.length + (entries.length === 1 ? ' entry' : ' entries');

    if (entries.length === 0) {
      auditTableBody.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
        icon: 'activity',
        title: 'No activity found',
        message: 'There are no audit-log entries matching these filters yet.',
      });
      return;
    }

    auditTableBody.innerHTML = entries
      .map((e) => {
        const type = TYPE_LABELS[e.entity_type] || esc(e.entity_type || '—');
        const action = ACTION_LABELS[e.action] || esc(e.action || '—');
        return (
          '<tr>' +
            '<td>' + esc(window.QuoteCraftUtils.formatDateTime(e.created_at)) + '</td>' +
            '<td><span class="' + tagClass(e.entity_type) + '">' + esc(type) + '</span></td>' +
            '<td>' + action + '</td>' +
            '<td>' + esc(e.entity_ref || '—') + '</td>' +
            '<td>' + esc(e.description || '') + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  // ── CSV Export ───────────────────────────────────────────────
  function exportCsv() {
    if (!currentEntries || currentEntries.length === 0) {
      window.QuoteCraftUtils.showToast('No audit entries to export.', 'info');
      return;
    }

    const rows = [
      ['Audit Log Export'],
      ['Exported: ' + new Date().toLocaleString()],
      ['Filter Record Type: ' + (auditTypeSelect && auditTypeSelect.value !== 'all' ? auditTypeSelect.value : 'All types')],
      ['Date Range: ' + (auditStartDate.value || 'Beginning') + ' to ' + (auditEndDate.value || 'Present')],
      [],
      ['Timestamp', 'Entity Type', 'Action', 'Record / Ref', 'Details'],
      ...currentEntries.map((e) => [
        e.created_at || '',
        TYPE_LABELS[e.entity_type] || e.entity_type || '',
        ACTION_LABELS[e.action] || e.action || '',
        e.entity_ref || '',
        e.description || '',
      ]),
    ];

    const csv = rows.map((r) => r.map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.QuoteCraftUtils.showToast('Audit log CSV exported.', 'success');
  }

  if (auditRefreshBtn) {
    auditRefreshBtn.addEventListener('click', loadEntries);
  }

  if (auditExportCsvBtn) {
    auditExportCsvBtn.addEventListener('click', exportCsv);
  }

  if (auditPrintBtn) {
    auditPrintBtn.addEventListener('click', () => window.print());
  }

  if (auditPresetSelect) {
    auditPresetSelect.addEventListener('change', () => {
      applyPreset(auditPresetSelect.value);
      loadEntries();
    });
  }

  if (auditTypeSelect) {
    auditTypeSelect.addEventListener('change', loadEntries);
  }

  [auditStartDate, auditEndDate].forEach((el) => {
    if (el) {
      el.addEventListener('change', () => {
        if (auditPresetSelect.value && auditPresetSelect.value !== 'custom') {
          auditPresetSelect.value = 'custom';
          if (auditPresetSelect.dispatchEvent) {
            auditPresetSelect.dispatchEvent(new Event('change'));
          }
        }
        loadEntries();
      });
    }
  });

  if (auditChipBar && auditPresetSelect && window.QuoteCraftUtils && window.QuoteCraftUtils.initDateChips) {
    window.QuoteCraftUtils.initDateChips(auditChipBar, auditPresetSelect, () => loadEntries());
  }

  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'audit-log') {
      loadEntries();
    }
  });

  applyPreset('this_week');
})();