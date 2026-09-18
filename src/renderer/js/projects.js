(function () {
  'use strict';

  var section = document.getElementById('page-projects');
  if (!section) return;

  var utils = window.QuoteCraftUtils;
  var toast = utils ? utils.toast : function () {};
  var escapeHtml = utils ? utils.escapeHtml : function (s) { return String(s); };
  var money = utils ? utils.money : function (v) { return String(v); };

  var listEl = document.getElementById('projectList');
  var searchInput = document.getElementById('projectSearch');
  var clientFilterSelect = document.getElementById('projectClientFilter');
  var statusFilterSelect = document.getElementById('projectStatusFilter');
  var addBtn = document.getElementById('addProjectBtn');

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

  // Event delegation for edit/delete buttons.
  if (listEl) {
    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var row = e.target.closest('.project-row');
      if (!row) return;
      var id = Number(row.getAttribute('data-id'));
      var action = btn.getAttribute('data-action');
      if (action === 'edit') openEditModal(id);
      else if (action === 'delete') confirmDelete(id);
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

  document.addEventListener('pagechange', function (e) {
    if (e.detail && e.detail.page === 'projects') {
      loadProjects();
    }
  });

  async function init() {
    await loadClients();
    await loadProjects();
  }
  init();
})();
