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
    if (auditTypeSelect.value && auditTypeSelect.value !== 'all') filter.recordType = auditTypeSelect.value;
    if (auditStartDate.value) filter.from = auditStartDate.value;
    if (auditEndDate.value) filter.to = auditEndDate.value;

    let entries = [];
    try {
      const res = await window.electronAPI.getAuditEntries(filter);
      if (res && res.ok) entries = res.entries || [];
    } catch (err) {
      window.QuoteCraftUtils.showToast('Could not load the audit log.', 'error');
      return;
    }

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

  if (auditRefreshBtn) {
    auditRefreshBtn.addEventListener('click', loadEntries);
  }

  if (auditPresetSelect) {
    auditPresetSelect.addEventListener('change', () => applyPreset(auditPresetSelect.value));
  }

  [auditStartDate, auditEndDate].forEach((el) => {
    if (el) {
      el.addEventListener('change', () => {
        if (auditPresetSelect.value && auditPresetSelect.value !== 'custom') {
          auditPresetSelect.value = 'custom';
        }
      });
    }
  });

  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'audit-log') {
      loadEntries();
    }
  });

  applyPreset('this_week');
})();