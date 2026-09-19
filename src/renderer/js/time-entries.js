(function () {
  'use strict';

  var section = document.getElementById('page-time-entries');
  if (!section) return;

  var toast = function (message, type) {
    if (window.QuoteCraftUtils) window.QuoteCraftUtils.showToast(message, type);
  };

  var LOCKED_MESSAGE =
    'This time entry is Billed. Once a time entry is included on an invoice it becomes a historical record and can no longer be edited or deleted.';

  // ---------- Element refs ----------
  var newEntryBtn = document.getElementById('newTimeEntryBtn');
  var startTimerBtn = document.getElementById('startTimerBtn');
  var resetBtn = document.getElementById('timeResetBtn');

  var filterClient = document.getElementById('timeFilterClient');
  var filterProject = document.getElementById('timeFilterProject');
  var filterStart = document.getElementById('timeFilterStart');
  var filterEnd = document.getElementById('timeFilterEnd');
  var filterBilled = document.getElementById('timeFilterBilled');
  var searchInput = document.getElementById('timeSearch');

  var kpiHours = document.getElementById('timeTotalHours');
  var kpiCount = document.getElementById('timeEntriesCount');
  var kpiUnbilled = document.getElementById('timeUnbilledHours');
  var kpiAmount = document.getElementById('timeTotalAmount');
  var kpiBilled = document.getElementById('timeBilledHours');

  var tableBody = document.getElementById('timeEntriesBody');

  var modal = document.getElementById('timeEntryModal');
  var modalTitle = document.getElementById('timeEntryModalTitle');
  var modalClose = document.getElementById('timeEntryModalClose');
  var cancelBtn = document.getElementById('timeEntryCancelBtn');
  var submitBtn = document.getElementById('timeEntrySubmitBtn');
  var form = document.getElementById('timeEntryForm');
  var editIdInput = document.getElementById('timeEntryEditId');
  var lockBanner = document.getElementById('timeEntryLockBanner');
  var rateHint = document.getElementById('timeEntryRateHint');
  var amountPreview = document.getElementById('timeEntryAmountPreview');

  var clientSelect = document.getElementById('timeEntryClient');
  var projectSelect = document.getElementById('timeEntryProject');
  var dateInput = document.getElementById('timeEntryDate');
  var hoursInput = document.getElementById('timeEntryHours');
  var rateInput = document.getElementById('timeEntryRate');
  var descriptionInput = document.getElementById('timeEntryDescription');

  // ---------- State ----------
  var clients = [];
  var allProjects = [];
  var projectsByClient = {};
  var baseCurrency = 'USD';
  var rateAutoFilled = false;
  var formReadonly = false;
  var loaded = false;

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getISODate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatCurrency(amount) {
    return window.QuoteCraftUtils.formatCurrency(amount, baseCurrency);
  }

  function clientLabel(c) {
    return c && (c.name || '').trim()
      ? c.name + (c.company_name ? ' (' + c.company_name + ')' : '')
      : 'Client #' + (c ? c.id : '?');
  }

  function projectOptionsHtml(list, emptyLabel) {
    var html = emptyLabel != null ? '<option value="">' + emptyLabel + '</option>' : '';
    list.forEach(function (p) {
      html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>';
    });
    return html;
  }

  // ---------- Options population ----------
  function clientOptionsHtml(emptyLabel) {
    var opts = '<option value="">' + emptyLabel + '</option>';
    clients.forEach(function (c) {
      opts += '<option value="' + c.id + '">' + escapeHtml(clientLabel(c)) + '</option>';
    });
    return opts;
  }

  function fillClientOptions() {
    if (filterClient) filterClient.innerHTML = clientOptionsHtml('All clients');
    if (clientSelect) clientSelect.innerHTML = clientOptionsHtml('Select a client…');
  }

  function projectsFor(clientId) {
    return clientId ? (projectsByClient[clientId] || []) : allProjects;
  }

  function fillFilterProjectOptions() {
    var list = projectsFor(filterClient.value);
    filterProject.innerHTML = projectOptionsHtml(list, 'All projects');
    filterProject.value = '';
  }

  function fillModalProjectOptions() {
    var list = projectsFor(clientSelect.value);
    projectSelect.innerHTML = projectOptionsHtml(list, 'No project (client only)');
    projectSelect.value = '';
  }

  // ---------- Loading ----------
  async function loadClients() {
    try {
      const res = await window.electronAPI.listClients();
      if (res.ok) {
        clients = res.clients || [];
      } else {
        toast('Could not load clients.', 'error');
      }
    } catch (e) {
      toast('Could not load clients: ' + e.message, 'error');
    }
    fillClientOptions();
    fillFilterProjectOptions();
  }

  async function loadProjects() {
    try {
      const res = await window.electronAPI.listProjects();
      if (res.ok) {
        allProjects = res.projects || [];
        projectsByClient = {};
        allProjects.forEach(function (p) {
          var key = String(p.client_id);
          if (!projectsByClient[key]) projectsByClient[key] = [];
          projectsByClient[key].push(p);
        });
      }
    } catch (e) {
      toast('Could not load projects: ' + e.message, 'error');
    }
    fillFilterProjectOptions();
  }

  async function loadCurrency() {
    try {
      const res = await window.electronAPI.getCompanyProfile();
      if (res.ok && res.profile) {
        baseCurrency = res.profile.reporting_currency || res.profile.default_currency || 'USD';
      }
    } catch (e) {
      /* ignore */
    }
  }

  function getFilterPayload() {
    return {
      client_id: filterClient.value,
      project_id: filterProject.value,
      date_from: filterStart.value,
      date_to: filterEnd.value,
      billed: filterBilled.value,
      search: searchInput.value.trim(),
    };
  }

  function renderTable(entries) {
    tableBody.innerHTML = '';
    if (!entries.length) {
      tableBody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">No time entries found matching the selected criteria.</td></tr>';
      return;
    }

    entries.forEach(function (entry) {
      const tr = document.createElement('tr');
      const billed = Number(entry.billed) ? 1 : 0;
      const statusCell = billed
        ? '<span class="badge status-billed">Billed</span>' +
          (entry.invoice_number
            ? ' <a href="#" class="time-invoice-link" title="View the invoice this entry was billed on">' + escapeHtml(entry.invoice_number) + '</a>'
            : '')
        : '<span class="badge status-unbilled">Unbilled</span>';
      tr.innerHTML =
        '<td style="white-space: nowrap;">' + window.QuoteCraftUtils.formatDate(entry.date) + '</td>' +
        '<td>' + escapeHtml(entry.client_name || '') + (entry.client_company ? ' <span class="time-entry-hint">(' + escapeHtml(entry.client_company) + ')</span>' : '') + '</td>' +
        '<td>' + escapeHtml(entry.project_name || '—') + '</td>' +
        '<td>' + escapeHtml(entry.description || '—') + '</td>' +
        '<td style="text-align: right;">' + Number(entry.hours || 0).toFixed(2) + '</td>' +
        '<td style="text-align: right;">' + formatCurrency(entry.hourly_rate) + '</td>' +
        '<td style="text-align: right;">' + formatCurrency(entry.amount) + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td class="th-actions">' +
        '  <div class="time-actions">' +
        '    <button type="button" class="expense-action-btn edit-btn">Edit</button>' +
        '    <button type="button" class="expense-action-btn delete delete-btn">Delete</button>' +
        '  </div>' +
        '</td>';

      const invoiceLink = tr.querySelector('.time-invoice-link');
      if (invoiceLink) {
        invoiceLink.addEventListener('click', function (ev) {
          ev.preventDefault();
          window.QuoteCraftUtils.goToPage('invoices');
          setTimeout(function () {
            window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: entry.invoice_id }));
          }, 50);
        });
      }

      const editBtn = tr.querySelector('.edit-btn');
      editBtn.addEventListener('click', function () {
        openEntryModal(entry);
      });

      const deleteBtn = tr.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', function () {
        handleDelete(entry);
      });

      tableBody.appendChild(tr);
    });
  }

  function renderSummary(summary) {
    if (!summary) return;
    baseCurrency = summary.baseCurrency || baseCurrency;
    kpiHours.textContent = Number(summary.totalHours || 0).toFixed(2);
    kpiCount.textContent = summary.count + ' ' + (summary.count === 1 ? 'entry' : 'entries');
    kpiUnbilled.textContent = Number(summary.unbilledHours || 0).toFixed(2);
    kpiBilled.textContent = Number(summary.billedHours || 0).toFixed(2);
    kpiAmount.textContent = formatCurrency(summary.totalAmount);
  }

  async function loadEntries() {
    try {
      const [listRes, summaryRes] = await Promise.all([
        window.electronAPI.listTimeEntries(getFilterPayload()),
        window.electronAPI.getTimeEntriesSummary(getFilterPayload()),
      ]);
      if (listRes.ok) {
        renderTable(listRes.entries || []);
      }
      if (summaryRes.ok) {
        renderSummary(summaryRes.summary);
      }
    } catch (e) {
      toast('Could not load time entries: ' + e.message, 'error');
    }
  }

  // ---------- Filters ----------
  function resetFilters() {
    filterClient.value = '';
    fillFilterProjectOptions();
    filterStart.value = '';
    filterEnd.value = '';
    filterBilled.value = '';
    searchInput.value = '';
    loadEntries();
  }

  // ---------- Modal ----------
  function clearErrors() {
    form.querySelectorAll('.field-error').forEach(function (el) {
      el.textContent = '';
    });
  }

  function showFieldError(fieldName, message) {
    const el = form.querySelector('[data-error-for="' + fieldName + '"]');
    if (el) el.textContent = message;
  }

  function setFormReadonly(readonly) {
    formReadonly = readonly;
    [clientSelect, projectSelect, dateInput, hoursInput, rateInput, descriptionInput].forEach(function (input) {
      input.disabled = readonly;
    });
    submitBtn.disabled = readonly;
    submitBtn.textContent = readonly ? 'Billed — record is locked' : (editIdInput.value ? 'Save Changes' : 'Save Time Entry');
    lockBanner.classList.toggle('hidden', !readonly);
  }

  function updateRateHint() {
    const src = (rateInput.value || '').trim();
    if (src !== '' && !rateAutoFilled) {
      rateHint.textContent = 'Manual rate — will be stored on this entry.';
      return;
    }
    const clientId = clientSelect.value;
    resolveTimeEntryRate(clientId, projectSelect.value, false);
  }

  async function resolveTimeEntryRate(clientId, projectId, fill) {
    if (clientId === '' && (projectId === '' || projectId == null)) {
      rateHint.textContent = 'No client selected — leave blank to store a zero rate.';
      return;
    }
    if (!rateAutoFilled && (rateInput.value || '').trim() !== '' && fill) {
      return;
    }
    try {
      const res = await window.electronAPI.resolveTimeEntryRate(clientId, projectId);
      if (!res.ok) return;
      if (res.hourly_rate != null) {
        if (fill && ((rateInput.value || '').trim() === '' || rateAutoFilled)) {
          rateInput.value = Number(res.hourly_rate).toFixed(2);
          rateAutoFilled = true;
        }
        const sourceLabel = res.source === 'project' ? 'the project' : res.source === 'client' ? 'the client' : 'the company default';
        rateHint.textContent = 'Auto default: ' + sourceLabel + ' rate ' + formatCurrency(res.hourly_rate) + '. Type to override.';
      } else if (fill) {
        rateHint.textContent = 'No rate found — leaving blank stores 0.00.';
      }
    } catch (e) {
      /* ignore */
    }
  }

  function updateAmountPreview() {
    const h = Number(hoursInput.value || 0);
    const r = Number(rateInput.value || 0);
    const amount = Math.round(h * r * 100) / 100;
    amountPreview.textContent = formatCurrency(amount);
  }

  function closeModal() {
    modal.classList.add('hidden');
    clearErrors();
    setFormReadonly(false);
    rateAutoFilled = false;
    editIdInput.value = '';
  }

  async function openEntryModal(entry) {
    clearErrors();

    if (entry) {
      editIdInput.value = entry.id;

      if (Number(entry.billed)) {
        modalTitle.textContent = 'Time Entry (Billed)';
        fillModalProjectOptions();
        clientSelect.value = entry.client_id;
        fillModalProjectOptions();
        if (entry.project_id) projectSelect.value = entry.project_id;
        dateInput.value = entry.date || '';
        hoursInput.value = Number(entry.hours || 0).toFixed(2);
        rateInput.value = Number(entry.hourly_rate || 0).toFixed(2);
        descriptionInput.value = entry.description || '';
        amountPreview.textContent = formatCurrency(entry.amount);
        rateHint.textContent = 'Billed entries are locked. Rate shown is the stored snapshot.';
        setFormReadonly(true);
      } else {
        modalTitle.textContent = 'Edit Time Entry';
        fillModalProjectOptions();
        clientSelect.value = entry.client_id;
        fillModalProjectOptions();
        if (entry.project_id) projectSelect.value = entry.project_id;
        dateInput.value = entry.date || '';
        hoursInput.value = Number(entry.hours || 0).toFixed(2);
        rateInput.value = Number(entry.hourly_rate || 0).toFixed(2);
        descriptionInput.value = entry.description || '';
        rateAutoFilled = false;
        rateHint.textContent = 'Stored rate — clear to keep this snapshot.';
        setFormReadonly(false);
        updateAmountPreview();
      }
    } else {
      editIdInput.value = '';
      modalTitle.textContent = 'New Time Entry';
      form.reset();
      fillClientOptions();
      fillModalProjectOptions();
      if (filterClient.value) clientSelect.value = filterClient.value;
      fillModalProjectOptions();
      dateInput.value = getISODate(new Date());
      rateHint.textContent = 'Leave blank to use project → client → company default.';
      rateAutoFilled = false;
      setFormReadonly(false);
      updateAmountPreview();
    }

    modal.classList.remove('hidden');
  }

  // ---------- Actions ----------
  async function handleDelete(entry) {
    if (Number(entry.billed)) {
      toast(LOCKED_MESSAGE, 'error');
      return;
    }
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Delete time entry?',
      message:
        'Delete "' + entry.description + '" (' + Number(entry.hours).toFixed(2) + 'h at ' + formatCurrency(entry.hourly_rate) + ')? This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const res = await window.electronAPI.deleteTimeEntry(entry.id);
      if (res.ok) {
        toast('Time entry deleted.', 'success');
        loadEntries();
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not delete time entry.', 'error');
        if (res.locked) loadEntries();
      }
    } catch (e) {
      toast('Could not delete time entry: ' + e.message, 'error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (formReadonly) return;
    clearErrors();

    const payload = {
      client_id: clientSelect.value,
      project_id: projectSelect.value,
      date: dateInput.value,
      hours: hoursInput.value,
      hourly_rate: rateInput.value,
      description: descriptionInput.value.trim(),
    };

    const editId = editIdInput.value ? Number(editIdInput.value) : null;
    try {
      let res;
      if (editId) {
        res = await window.electronAPI.updateTimeEntry(editId, payload);
      } else {
        res = await window.electronAPI.createTimeEntry(payload);
      }

      if (!res.ok) {
        if (res.locked) {
          toast(res.errors && res.errors.general ? res.errors.general : LOCKED_MESSAGE, 'error');
          loadEntries();
          return;
        }
        if (res.errors) {
          let showed = false;
          for (const [field, msg] of Object.entries(res.errors)) {
            if (field === 'general') {
              toast(msg, 'error');
            } else {
              showFieldError(field, msg);
              showed = true;
            }
          }
          if (showed) toast('Please correct the highlighted fields.', 'error');
        } else {
          toast('Could not save time entry.', 'error');
        }
        return;
      }

      toast(editId ? 'Time entry updated.' : 'Time entry added.', 'success');
      closeModal();
      loadEntries();
    } catch (err) {
      toast('Error saving time entry: ' + err.message, 'error');
    }
  }

  // ---------- Wiring ----------
  if (newEntryBtn) newEntryBtn.addEventListener('click', function () { openEntryModal(null); });
  if (startTimerBtn && window.QuoteCraftTimer) {
    startTimerBtn.addEventListener('click', function () { window.QuoteCraftTimer.openStart(); });
  }
  window.addEventListener('qc-timer-stopped', function () {
    loadEntries();
  });
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);

  filterClient.addEventListener('change', function () {
    fillFilterProjectOptions();
    loadEntries();
  });
  filterProject.addEventListener('change', loadEntries);
  filterStart.addEventListener('change', loadEntries);
  filterEnd.addEventListener('change', loadEntries);
  filterBilled.addEventListener('change', loadEntries);
  searchInput.addEventListener('input', function () {
    clearTimeout(searchInput._t);
    searchInput._t = setTimeout(loadEntries, 300);
  });

  clientSelect.addEventListener('change', function () {
    fillModalProjectOptions();
    resolveTimeEntryRate(clientSelect.value, projectSelect.value, true);
    updateAmountPreview();
  });
  projectSelect.addEventListener('change', function () {
    resolveTimeEntryRate(clientSelect.value, projectSelect.value, true);
    updateAmountPreview();
  });
  hoursInput.addEventListener('input', updateAmountPreview);
  rateInput.addEventListener('input', function () {
    if ((rateInput.value || '').trim() !== '') rateAutoFilled = false;
    updateRateHint();
    updateAmountPreview();
  });

  modalClose.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });
  form.addEventListener('submit', handleSubmit);

  document.addEventListener('pagechange', function (e) {
    if (e.detail === 'time-entries') {
      if (!loaded) {
        loaded = true;
        Promise.all([loadCurrency(), loadClients(), loadProjects()]).then(loadEntries);
      } else {
        fillFilterProjectOptions();
        loadEntries();
      }
    }
  });
})();