(function () {
  'use strict';

  var section = document.getElementById('page-projects');
  if (!section) return;

  var utils = window.QuoteCraftUtils;
  var toast = function (m, t) { if (window.QuoteCraftUtils) window.QuoteCraftUtils.showToast(m, t); };
  var escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  var listView = document.getElementById('projectListView');
  var overviewView = document.getElementById('projectOverviewView');
  var listEl = document.getElementById('projectList');
  var searchInput = document.getElementById('projectSearch');
  var clientFilterSelect = document.getElementById('projectClientFilter');
  var statusFilterSelect = document.getElementById('projectStatusFilter');
  var addBtn = document.getElementById('addProjectBtn');

  // Overview elements
  var overviewTitle = document.getElementById('projOverviewTitle');
  var overviewStatusBadge = document.getElementById('projOverviewStatusBadge');
  var overviewSubtitle = document.getElementById('projOverviewSubtitle');
  var overviewNewQuoteBtn = document.getElementById('projOverviewNewQuoteBtn');
  var overviewNewInvoiceBtn = document.getElementById('projOverviewNewInvoiceBtn');
  var overviewEditBtn = document.getElementById('projOverviewEditBtn');
  var overviewBackBtn = document.getElementById('projOverviewBackBtn');
  var overviewClient = document.getElementById('projOverviewClient');
  var overviewStatusText = document.getElementById('projOverviewStatusText');
  var overviewStart = document.getElementById('projOverviewStart');
  var overviewEnd = document.getElementById('projOverviewEnd');
  var overviewDesc = document.getElementById('projOverviewDesc');
  var overviewTotalQuoted = document.getElementById('projTotalQuoted');
  var overviewTotalInvoiced = document.getElementById('projTotalInvoiced');
  var overviewTotalPaid = document.getElementById('projTotalPaid');
  var overviewOutstanding = document.getElementById('projOutstandingBalance');
  var overviewQuoteCount = document.getElementById('projOverviewQuoteCount');
  var overviewQuotesBody = document.getElementById('projOverviewQuotesBody');
  var overviewInvoiceCount = document.getElementById('projOverviewInvoiceCount');
  var overviewInvoicesBody = document.getElementById('projOverviewInvoicesBody');

  var currentOverviewId = null;
  var currentOverviewProject = null;
  var currencyCode = 'USD';

  var modal = document.getElementById('projectModal');
  var form = document.getElementById('projectForm');
  var modalTitle = document.getElementById('projectModalTitle');
  var submitBtn = document.getElementById('projectSubmitBtn');
  var closeBtn = document.getElementById('projectModalClose');
  var cancelBtn = document.getElementById('projectCancelBtn');

  var idInput = document.getElementById('projectId');
  var nameInput = document.getElementById('projectName');
  var clientSelect = document.getElementById('projectClient');
  var statusSelect = document.getElementById('projectStatus');
  var startDateInput = document.getElementById('projectStartDate');
  var endDateInput = document.getElementById('projectEndDate');
  var hourlyRateInput = document.getElementById('projectHourlyRate');
  var descriptionInput = document.getElementById('projectDescription');

  var deleteDialog = document.getElementById('projectDeleteDialog');
  var deleteMessage = document.getElementById('projectDeleteMessage');
  var deleteClose = document.getElementById('projectDeleteClose');
  var deleteCancel = document.getElementById('projectDeleteCancel');
  var deleteArchive = document.getElementById('projectDeleteArchive');

  var projects = [];
  var clients = [];
  var editingId = null;
  var deleteCandidate = null;

  var STATUS_LABELS = {
    active: 'Active',
    on_hold: 'On hold',
    completed: 'Completed',
    archived: 'Archived',
  };

  var STATUS_BADGE = {
    active: 'status-active',
    on_hold: 'status-on-hold',
    completed: 'status-completed',
    archived: 'status-archived',
  };

  // ---------- Modal helpers ----------
  function openModal() {
    modal.classList.remove('hidden');
    if (nameInput) nameInput.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    form.reset();
    clearErrors();
    editingId = null;
    modalTitle.textContent = 'Add Project';
    submitBtn.textContent = 'Save project';
  }

  function clearErrors() {
    form.querySelectorAll('.field-error[data-error-for]').forEach(function (el) {
      el.textContent = '';
      var wrap = el.closest('.field');
      if (wrap) wrap.classList.remove('has-error');
    });
  }

  function setError(fieldName, msg) {
    var el = form.querySelector('.field-error[data-error-for="' + fieldName + '"]');
    if (el) {
      el.textContent = msg;
      var wrap = el.closest('.field');
      if (wrap) wrap.classList.add('has-error');
    }
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || 'Active';
  }

  function statusClass(status) {
    return STATUS_BADGE[status] || 'status-active';
  }

  function clientNameById(id) {
    var c = clients.find(function (x) { return String(x.id) === String(id); });
    return c ? (c.company_name ? c.name + ' (' + c.company_name + ')' : c.name) : 'Unknown client';
  }

  var QUOTE_STATUS_LABELS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };

  function quoteEffectiveStatus(q) {
    if (q.status === 'accepted') return 'accepted';
    if (q.valid_until) {
      var expiry = new Date(q.valid_until + 'T00:00:00');
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!isNaN(expiry.getTime()) && expiry < today) return 'expired';
    }
    return q.status;
  }

  function invoiceEffectiveStatus(inv) {
    if (Number(inv.balance_due) <= 0.0001) return 'paid';
    if (inv.date_due) {
      var due = new Date(String(inv.date_due) + 'T00:00:00');
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!isNaN(due.getTime()) && due < today) return 'overdue';
    }
    var netPaid = Math.max(0, Math.round(((Number(inv.amount_paid) || 0) - (Number(inv.amount_credited) || 0)) * 100) / 100);
    if (netPaid > 0.0001) return 'partially_paid';
    return inv.date_sent ? 'sent' : (inv.status || 'draft');
  }

  function formatMoney(v) {
    return window.QuoteCraftUtils.formatCurrency(v, currencyCode);
  }

  // ---------- View switching ----------
  function showListView() {
    currentOverviewId = null;
    currentOverviewProject = null;
    listView.classList.add('active');
    overviewView.classList.remove('active');
  }

  function showOverviewView() {
    listView.classList.remove('active');
    overviewView.classList.add('active');
  }

  // ---------- Project Overview ----------
  async function openOverview(id) {
    currentOverviewId = id;
    try {
      var res = await window.electronAPI.getProjectOverview(id);
      if (!res.ok || !res.overview) {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not load project overview.', 'error');
        return;
      }
      renderOverview(res.overview);
      showOverviewView();
    } catch (e) {
      toast('Could not load project overview: ' + e.message, 'error');
    }
  }

  function renderOverview(overview) {
    var p = overview.project;
    currentOverviewProject = p;
    var c = overview.client || {};
    var stats = overview.stats || {};

    overviewTitle.textContent = p.name || 'Project Overview';
    overviewStatusBadge.textContent = statusLabel(p.status);
    overviewStatusBadge.className = 'badge ' + statusClass(p.status);
    overviewSubtitle.textContent = p.description ? p.description : (c.name ? 'Belongs to ' + c.name : '');

    overviewTotalQuoted.textContent = formatMoney(stats.totalQuoted);
    overviewTotalInvoiced.textContent = formatMoney(stats.totalInvoiced);
    overviewTotalPaid.textContent = formatMoney(stats.totalPaid);
    overviewOutstanding.textContent = formatMoney(stats.outstandingBalance);
    var balCard = overviewOutstanding.closest('.kpi-card');
    if (balCard) balCard.classList.toggle('has-balance', Number(stats.outstandingBalance) > 0.001);

    var clientDisplay = c.name ? (c.company_name ? c.name + ' (' + c.company_name + ')' : c.name) : '—';
    overviewClient.textContent = clientDisplay;
    overviewStatusText.textContent = statusLabel(p.status);
    overviewStart.textContent = p.start_date ? p.start_date : '—';
    overviewEnd.textContent = p.end_date ? p.end_date : '—';
    overviewDesc.textContent = p.description || '—';

    renderQuoteRows(overview.quotes || []);
    renderInvoiceRows(overview.invoices || []);
  }

  function renderQuoteRows(quotes) {
    overviewQuoteCount.textContent = quotes.length + ' quote' + (quotes.length === 1 ? '' : 's');
    overviewQuotesBody.innerHTML = '';
    if (quotes.length === 0) {
      overviewQuotesBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No quotes linked to this project.</td></tr>';
      return;
    }
    quotes.forEach(function (q) {
      var eff = quoteEffectiveStatus(q);
      var tr = document.createElement('tr');

      var numTd = document.createElement('td');
      numTd.className = 'cell-number';
      numTd.textContent = q.quote_number;

      var dateTd = document.createElement('td');
      dateTd.textContent = window.QuoteCraftUtils.formatDate(q.date_created);

      var expTd = document.createElement('td');
      expTd.textContent = q.valid_until ? window.QuoteCraftUtils.formatDate(q.valid_until) : '—';

      var totalTd = document.createElement('td');
      totalTd.textContent = window.QuoteCraftUtils.formatCurrency(q.total, q.currency || currencyCode);

      var statusTd = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge status-' + eff;
      badge.textContent = QUOTE_STATUS_LABELS[eff] || eff;
      statusTd.appendChild(badge);

      var actTd = document.createElement('td');
      actTd.className = 'cell-actions';
      var viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-small btn-secondary';
      viewBtn.textContent = 'View Quote';
      viewBtn.addEventListener('click', function () {
        window.QuoteCraftUtils.goToPage('quotes');
        setTimeout(function () {
          window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: q.id }));
        }, 50);
      });
      actTd.appendChild(viewBtn);

      tr.appendChild(numTd);
      tr.appendChild(dateTd);
      tr.appendChild(expTd);
      tr.appendChild(totalTd);
      tr.appendChild(statusTd);
      tr.appendChild(actTd);
      overviewQuotesBody.appendChild(tr);
    });
  }

  function renderInvoiceRows(invoices) {
    overviewInvoiceCount.textContent = invoices.length + ' invoice' + (invoices.length === 1 ? '' : 's');
    overviewInvoicesBody.innerHTML = '';
    if (invoices.length === 0) {
      overviewInvoicesBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px;">No invoices linked to this project.</td></tr>';
      return;
    }
    invoices.forEach(function (inv) {
      var tr = document.createElement('tr');

      var numTd = document.createElement('td');
      numTd.className = 'cell-number';
      numTd.textContent = inv.invoice_number;
      if (inv.invoice_type === 'deposit') {
        var depBadge = document.createElement('span');
        depBadge.className = 'badge badge-deposit';
        depBadge.textContent = 'Deposit (' + (inv.deposit_percent || 0) + '%)';
        depBadge.style.marginLeft = '6px';
        numTd.appendChild(depBadge);
      } else if (inv.invoice_type === 'final') {
        var finBadge = document.createElement('span');
        finBadge.className = 'badge badge-final';
        finBadge.textContent = 'Final';
        finBadge.style.marginLeft = '6px';
        numTd.appendChild(finBadge);
      }

      var invCurr = inv.currency || currencyCode;
      var dateTd = document.createElement('td');
      dateTd.textContent = window.QuoteCraftUtils.formatDate(inv.date_created);

      var dueTd = document.createElement('td');
      dueTd.textContent = inv.date_due ? window.QuoteCraftUtils.formatDate(inv.date_due) : '—';

      var totalTd = document.createElement('td');
      totalTd.textContent = window.QuoteCraftUtils.formatCurrency(inv.total, invCurr);

      var paidTd = document.createElement('td');
      var credited = Number(inv.amount_credited) || 0;
      var netPaid = Math.max(0, Math.round(((Number(inv.amount_paid) || 0) - credited) * 100) / 100);
      if (credited > 0.0001) {
        paidTd.innerHTML = '<div>' + window.QuoteCraftUtils.formatCurrency(inv.amount_paid, invCurr) + '</div>' +
          '<div class="cell-sub" style="color:var(--text-muted);font-size:11px;">Credited: −' + window.QuoteCraftUtils.formatCurrency(credited, invCurr) + ' (Net: ' + window.QuoteCraftUtils.formatCurrency(netPaid, invCurr) + ')</div>';
      } else {
        paidTd.textContent = window.QuoteCraftUtils.formatCurrency(inv.amount_paid, invCurr);
      }

      var balanceTd = document.createElement('td');
      balanceTd.className = 'cell-balance';
      balanceTd.textContent = window.QuoteCraftUtils.formatCurrency(inv.balance_due, invCurr);

      var effStatus = invoiceEffectiveStatus(inv);
      var statusTd = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge status-' + effStatus;
      badge.textContent = effStatus.replace('_', ' ');
      statusTd.appendChild(badge);

      var actTd = document.createElement('td');
      actTd.className = 'cell-actions';
      var viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-small btn-secondary';
      viewBtn.textContent = 'View Invoice';
      viewBtn.addEventListener('click', function () {
        window.QuoteCraftUtils.goToPage('invoices');
        setTimeout(function () {
          window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: inv.id }));
        }, 50);
      });
      actTd.appendChild(viewBtn);

      tr.appendChild(numTd);
      tr.appendChild(dateTd);
      tr.appendChild(dueTd);
      tr.appendChild(totalTd);
      tr.appendChild(paidTd);
      tr.appendChild(balanceTd);
      tr.appendChild(statusTd);
      tr.appendChild(actTd);
      overviewInvoicesBody.appendChild(tr);
    });
  }

  // ---------- Loading ----------
  async function loadClients() {
    try {
      var res = await window.electronAPI.listClients();
      if (res.ok) {
        clients = res.clients || [];
        populateClientOptions();
      }
    } catch (e) {
      toast('Could not load clients: ' + e.message, 'error');
    }
  }

  function populateClientOptions() {
    var active = clients.filter(function (c) { return !c.is_archived; });
    clientFilterSelect.innerHTML = '<option value="">All clients</option>';
    active.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.company_name ? c.name + ' (' + c.company_name + ')' : c.name;
      clientFilterSelect.appendChild(opt);
    });
  }

  async function loadProjects() {
    try {
      var filters = {};
      if (searchInput && searchInput.value.trim()) filters.search = searchInput.value.trim();
      if (clientFilterSelect && clientFilterSelect.value) filters.client_id = clientFilterSelect.value;
      if (statusFilterSelect && statusFilterSelect.value) filters.status = statusFilterSelect.value;
      var res = await window.electronAPI.listProjects(filters);
      if (res.ok) {
        projects = res.projects || [];
        renderList();
      } else {
        toast(res.error || 'Could not load projects.', 'error');
      }
    } catch (e) {
      toast('Could not load projects: ' + e.message, 'error');
    }
  }

  // ---------- Rendering ----------
  function renderList() {
    if (!listEl) return;

    if (projects.length === 0) {
      listEl.innerHTML = '<p class="placeholder">No projects found. Create one to group quotes and invoices under a client job.</p>';
      return;
    }

    listEl.innerHTML = projects.map(function (p) {
      var counts = [];
      if (p.quote_count > 0) counts.push(p.quote_count + ' quote' + (p.quote_count === 1 ? '' : 's'));
      if (p.invoice_count > 0) counts.push(p.invoice_count + ' invoice' + (p.invoice_count === 1 ? '' : 's'));
      var countLine = counts.length ? ' · <span class="project-count">' + counts.join(', ') + '</span>' : '';

      return '' +
        '<div class="project-row" data-id="' + p.id + '">' +
          '<div class="project-row-main">' +
            '<div class="project-row-title">' +
              '<span class="status-dot ' + statusClass(p.status) + '"></span>' +
              '<span class="project-name">' + escapeHtml(p.name || '') + '</span>' +
              '<span class="project-status-label">' + statusLabel(p.status) + '</span>' +
            '</div>' +
            '<div class="project-row-client">' + escapeHtml(clientNameById(p.client_id)) + '</div>' +
            (p.description ? '<div class="project-row-desc">' + escapeHtml(p.description) + '</div>' : '') +
            '<div class="project-row-dates">' +
              (p.start_date ? '<span>Start ' + escapeHtml(p.start_date) + '</span>' : '') +
              (p.start_date && p.end_date ? ' – ' : '') +
              (p.end_date ? '<span>' + escapeHtml(p.end_date) + '</span>' : '') +
            '</div>' +
            countLine +
          '</div>' +
          '<div class="project-row-actions">' +
            '<button type="button" class="btn-actions-row" data-action="edit" title="Edit">Edit</button>' +
            '<button type="button" class="btn-actions-row" data-action="delete" title="Delete / archive">Delete</button>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  // Event delegation for edit/delete buttons and row-click → overview.
  if (listEl) {
    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      var row = e.target.closest('.project-row');
      if (!row) return;
      var id = Number(row.getAttribute('data-id'));
      if (btn) {
        var action = btn.getAttribute('data-action');
        if (action === 'edit') { openEditModal(id); return; }
        if (action === 'delete') { confirmDelete(id); return; }
      }
      if (id) openOverview(id);
    });
  }

  // ---------- Modal (add / edit) ----------
  function openAddModal() {
    editingId = null;
    form.reset();
    clearErrors();
    modalTitle.textContent = 'Add Project';
    submitBtn.textContent = 'Save project';
    idInput.value = '';
    clientSelect.innerHTML = '<option value="">Select a client…</option>';
    clients.filter(function (c) { return !c.is_archived; }).forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.company_name ? c.name + ' (' + c.company_name + ')' : c.name;
      clientSelect.appendChild(opt);
    });
    if (statusSelect) statusSelect.value = 'active';
    openModal();
  }

  async function openEditModal(id) {
    try {
      var res = await window.electronAPI.getProject(id);
      if (!res.ok) {
        toast(res.error || 'Could not load project.', 'error');
        return;
      }
      var p = res.project;
      editingId = p.id;
      clearErrors();
      modalTitle.textContent = 'Edit Project';
      submitBtn.textContent = 'Save project';
      idInput.value = p.id;
      nameInput.value = p.name || '';
      descriptionInput.value = p.description || '';
      startDateInput.value = p.start_date || '';
      endDateInput.value = p.end_date || '';
      if (hourlyRateInput) hourlyRateInput.value = p.hourly_rate != null ? p.hourly_rate : '';
      if (statusSelect) statusSelect.value = p.status || 'active';

      clientSelect.innerHTML = '<option value="">Select a client…</option>';
      clients.filter(function (c) { return !c.is_archived; }).forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.company_name ? c.name + ' (' + c.company_name + ')' : c.name;
        clientSelect.appendChild(opt);
      });
      clientSelect.value = p.client_id !== null && p.client_id !== undefined ? String(p.client_id) : '';
      openModal();
    } catch (e) {
      toast('Could not load project: ' + e.message, 'error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearErrors();

    var data = {
      name: nameInput && nameInput.value.trim(),
      client_id: clientSelect && clientSelect.value,
      status: statusSelect ? statusSelect.value : 'active',
      start_date: startDateInput ? startDateInput.value : '',
      end_date: endDateInput ? endDateInput.value : '',
      hourly_rate: hourlyRateInput ? hourlyRateInput.value : '',
      description: descriptionInput ? descriptionInput.value.trim() : '',
    };

    try {
      var res;
      if (editingId !== null && editingId !== undefined && editingId !== '') {
        res = await window.electronAPI.updateProject(editingId, data);
      } else {
        res = await window.electronAPI.addProject(data);
      }

      if (res.ok) {
        closeModal();
        await loadProjects();
        toast(editingId ? 'Project updated.' : 'Project created.', 'success');
      } else {
        if (res.errors) {
          Object.keys(res.errors).forEach(function (field) {
            setError(field, res.errors[field]);
          });
        } else {
          toast(res.error || 'Could not save project.', 'error');
        }
      }
    } catch (err) {
      toast('Could not save project: ' + err.message, 'error');
    }
  }

  // ---------- Delete / archive ----------
  async function confirmDelete(id) {
    try {
      var res = await window.electronAPI.tryDeleteProject(id);
      if (res.ok) {
        toast('Project deleted.', 'success');
        loadProjects();
        return;
      }
      if (res.blocked) {
        deleteCandidate = { id: id };
        var parts = [];
        if (res.quoteCount > 0) parts.push(res.quoteCount + ' linked quote' + (res.quoteCount === 1 ? '' : 's'));
        if (res.invoiceCount > 0) parts.push(res.invoiceCount + ' linked invoice' + (res.invoiceCount === 1 ? '' : 's'));
        deleteMessage.textContent = 'This project has ' + (parts.join(' and ') || 'linked records') +
          '. Deleting it would break the connection to those records. You can archive it instead to hide it from the active list while keeping history intact.';
        deleteDialog.classList.remove('hidden');
        return;
      }
      toast(res.error || 'Could not delete project.', 'error');
    } catch (err) {
      toast('Could not delete project: ' + err.message, 'error');
    }
  }

  function closeDeleteDialog() {
    deleteDialog.classList.add('hidden');
    deleteCandidate = null;
  }

  async function archiveCandidate() {
    if (!deleteCandidate) return;
    var id = deleteCandidate.id;
    closeDeleteDialog();
    try {
      var res = await window.electronAPI.archiveProject(id);
      if (res.ok) {
        toast('Project archived.', 'success');
        loadProjects();
      } else {
        toast(res.error || 'Could not archive project.', 'error');
      }
    } catch (e) {
      toast('Could not archive project: ' + e.message, 'error');
    }
  }

  // ---------- Init / wiring ----------
  if (addBtn) addBtn.addEventListener('click', openAddModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }
  if (form) form.addEventListener('submit', handleSubmit);
  if (deleteClose) deleteClose.addEventListener('click', closeDeleteDialog);
  if (deleteCancel) deleteCancel.addEventListener('click', closeDeleteDialog);
  if (deleteArchive) deleteArchive.addEventListener('click', archiveCandidate);
  if (deleteDialog) {
    deleteDialog.addEventListener('click', function (e) {
      if (e.target === deleteDialog) closeDeleteDialog();
    });
  }
  if (searchInput) searchInput.addEventListener('input', loadProjects);
  if (clientFilterSelect) clientFilterSelect.addEventListener('change', loadProjects);
  if (statusFilterSelect) statusFilterSelect.addEventListener('change', loadProjects);

  if (overviewNewQuoteBtn) {
    overviewNewQuoteBtn.addEventListener('click', function () {
      if (!currentOverviewProject) return;
      window.QuoteCraftUtils.goToPage('quotes');
      setTimeout(function () {
        if (window.QuoteCraftQuotes && window.QuoteCraftQuotes.openNewQuoteForProject) {
          window.QuoteCraftQuotes.openNewQuoteForProject(currentOverviewProject.client_id, currentOverviewProject.id);
        }
      }, 80);
    });
  }

  if (overviewNewInvoiceBtn) {
    overviewNewInvoiceBtn.addEventListener('click', function () {
      window.QuoteCraftUtils.goToPage('quotes');
      toast('Invoices are created by converting an accepted quote. Open this project\u2019s accepted quote and choose Convert to Invoice.', 'info');
    });
  }

  if (overviewEditBtn) {
    overviewEditBtn.addEventListener('click', function () {
      if (currentOverviewId) openEditModal(currentOverviewId);
    });
  }

  if (overviewBackBtn) {
    overviewBackBtn.addEventListener('click', function () {
      showListView();
      loadProjects();
    });
  }

  document.addEventListener('pagechange', function (e) {
    if (e.detail && e.detail.page === 'projects') {
      showListView();
      loadClients();
      loadProjects();
    }
  });

  window.addEventListener('qc-open-project-overview', function (e) {
    if (e.detail) openOverview(e.detail);
  });

  async function init() {
    try {
      var profileRes = await window.electronAPI.getCompanyProfile();
      if (profileRes.ok && profileRes.profile && profileRes.profile.default_currency) {
        currencyCode = profileRes.profile.default_currency;
      }
    } catch (e) { /* ignore */ }
    await loadClients();
    await loadProjects();
  }
  init();

  window.QuoteCraftProjects = window.QuoteCraftProjects || {};
  window.QuoteCraftProjects.openOverview = openOverview;
})();
