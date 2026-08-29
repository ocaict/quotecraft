(function () {
  const listEl = document.getElementById('clientList');
  const section = document.getElementById('page-clients');
  if (!listEl || !section) return;

  const modal = document.getElementById('clientModal');
  const form = document.getElementById('clientForm');
  const modalTitle = document.getElementById('clientModalTitle');
  const submitBtn = document.getElementById('clientSubmitBtn');
  const searchInput = document.getElementById('clientSearch');
  const sortSelect = document.getElementById('clientSort');
  const addBtn = document.getElementById('addClientBtn');

  const deleteDialog = document.getElementById('clientDeleteDialog');
  const deleteMessage = document.getElementById('clientDeleteMessage');

  let clients = [];
  let searchTerm = '';
  let sortBy = 'name';
  let editingId = null;
  let pendingArchiveId = null;

  function toast(message, type) {
    window.QuoteCraftUtils.showToast(message, type);
  }

  function clearFieldError(field) {
    const el = form.elements[field];
    if (el) el.classList.remove('invalid');
    const errEl = document.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = '';
  }

  function showFieldError(field, message) {
    const el = form.elements[field];
    if (el) el.classList.add('invalid');
    const errEl = document.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = message || '';
  }

  function clearAllErrors() {
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      if (el && el.name) clearFieldError(el.name);
    }
  }

  function fullAddress(client) {
    const parts = [
      client.address_line1,
      client.address_line2,
      client.city,
      client.state,
      client.postal_code,
      client.country,
    ].filter(Boolean);
    return parts.join(', ') || '—';
  }

  function renderList() {
    let filtered = clients.slice();

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((c) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.company_name || '').toLowerCase().includes(q) ||
        String(c.email || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q)
      );
    }

    if (sortBy === 'date') {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      filtered.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
    }

    if (filtered.length === 0) {
      if (clients.length === 0) {
        listEl.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'clients',
          title: 'No clients yet',
          message: 'Add your first client to start creating quotes and invoices.',
          actionLabel: 'Add Client',
        });
        const action = listEl.querySelector('[data-empty-action]');
        if (action) action.addEventListener('click', openAddModal);
      } else {
        listEl.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'search',
          title: 'No matching clients',
          message: 'Nothing matches "' + searchTerm.trim() + '". Try a different search term or clear it.',
          actionLabel: 'Clear search',
        });
        const action = listEl.querySelector('[data-empty-action]');
        if (action) {
          action.addEventListener('click', () => {
            searchInput.value = '';
            searchTerm = '';
            renderList();
            searchInput.focus();
          });
        }
      }
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>' +
      '<th>Name</th>' +
      '<th>Company</th>' +
      '<th>Email</th>' +
      '<th>Phone</th>' +
      '<th>Billing address</th>' +
      '<th>Date added</th>' +
      '<th class="th-actions">Actions</th>' +
      '</tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const c of filtered) {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.className = 'cell-name';
      nameTd.textContent = c.name;

      const companyTd = document.createElement('td');
      companyTd.textContent = c.company_name || '—';

      const emailTd = document.createElement('td');
      emailTd.textContent = c.email || '—';

      const phoneTd = document.createElement('td');
      phoneTd.textContent = c.phone || '—';

      const addrTd = document.createElement('td');
      addrTd.className = 'cell-address';
      addrTd.textContent = fullAddress(c);

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(c.created_at);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'cell-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-small btn-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openEditModal(c));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-small btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => handleDelete(c));
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);

      tr.appendChild(nameTd);
      tr.appendChild(companyTd);
      tr.appendChild(emailTd);
      tr.appendChild(phoneTd);
      tr.appendChild(addrTd);
      tr.appendChild(dateTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listEl.innerHTML = '';
    listEl.appendChild(table);
  }

  function collectFormData() {
    return {
      name: form.elements['name'].value,
      company_name: form.elements['company_name'].value,
      email: form.elements['email'].value,
      phone: form.elements['phone'].value,
      address_line1: form.elements['address_line1'].value,
      address_line2: form.elements['address_line2'].value,
      city: form.elements['city'].value,
      state: form.elements['state'].value,
      postal_code: form.elements['postal_code'].value,
      country: form.elements['country'].value,
      notes: form.elements['notes'].value,
    };
  }

  function fillFields(client) {
    form.elements['id'].value = client.id;
    form.elements['name'].value = client.name || '';
    form.elements['company_name'].value = client.company_name || '';
    form.elements['email'].value = client.email || '';
    form.elements['phone'].value = client.phone || '';
    form.elements['address_line1'].value = client.address_line1 || '';
    form.elements['address_line2'].value = client.address_line2 || '';
    form.elements['city'].value = client.city || '';
    form.elements['state'].value = client.state || '';
    form.elements['postal_code'].value = client.postal_code || '';
    form.elements['country'].value = client.country || '';
    form.elements['notes'].value = client.notes || '';
  }

  function openAddModal() {
    editingId = null;
    clearAllErrors();
    form.reset();
    modalTitle.textContent = 'Add Client';
    submitBtn.textContent = 'Save client';
    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  function openEditModal(client) {
    editingId = client.id;
    clearAllErrors();
    form.reset();
    fillFields(client);
    modalTitle.textContent = 'Edit Client';
    submitBtn.textContent = 'Save changes';
    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    editingId = null;
  }

  function openDeleteDialog(message, archiveId) {
    pendingArchiveId = archiveId;
    deleteMessage.textContent = message;
    deleteDialog.classList.remove('hidden');
  }

  function closeDeleteDialog() {
    deleteDialog.classList.add('hidden');
    pendingArchiveId = null;
  }

  async function loadClients() {
    try {
      const res = await window.electronAPI.listClients();
      if (res.ok) {
        clients = res.clients || [];
        renderList();
      } else {
        toast('Could not load clients.', 'error');
      }
    } catch (e) {
      toast('Could not load clients: ' + e.message, 'error');
    }
  }

  async function handleDelete(client) {
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Delete this client?',
      message: '"' + client.name + '" will be permanently removed and this cannot be undone. Clients with quotes or invoices cannot be deleted and will be offered for archiving instead.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const res = await window.electronAPI.tryDeleteClient(client.id);
      if (res.ok) {
        toast('Client "' + client.name + '" deleted.', 'success');
        await loadClients();
      } else if (res.blocked) {
        const parts = [];
        if (res.quoteCount > 0) parts.push(res.quoteCount + ' quote' + (res.quoteCount === 1 ? '' : 's'));
        if (res.invoiceCount > 0) parts.push(res.invoiceCount + ' invoice' + (res.invoiceCount === 1 ? '' : 's'));
        openDeleteDialog(
          'Client "' + res.name + '" cannot be deleted because they have linked ' + parts.join(' and ') + '. Deleting would break historical records.',
          client.id
        );
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not delete client.', 'error');
      }
    } catch (e) {
      toast('Could not delete client: ' + e.message, 'error');
    }
  }

  async function archivePending() {
    if (!pendingArchiveId) return;
    const id = pendingArchiveId;
    closeDeleteDialog();
    try {
      const res = await window.electronAPI.archiveClient(id);
      if (res.ok) {
        toast('Client archived. Historical data preserved.', 'success');
        await loadClients();
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not archive client.', 'error');
      }
    } catch (e) {
      toast('Could not archive client: ' + e.message, 'error');
    }
  }

  addBtn.addEventListener('click', openAddModal);
  document.getElementById('clientModalClose').addEventListener('click', closeModal);
  document.getElementById('clientCancelBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.getElementById('clientDeleteClose').addEventListener('click', closeDeleteDialog);
  document.getElementById('clientDeleteCancel').addEventListener('click', closeDeleteDialog);
  document.getElementById('clientDeleteArchive').addEventListener('click', archivePending);
  deleteDialog.addEventListener('click', (e) => {
    if (e.target === deleteDialog) closeDeleteDialog();
  });

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value;
    renderList();
  });

  sortSelect.addEventListener('change', () => {
    sortBy = sortSelect.value;
    renderList();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();
    const data = collectFormData();

    try {
      let res;
      if (editingId !== null) {
        res = await window.electronAPI.updateClient(editingId, data);
      } else {
        res = await window.electronAPI.addClient(data);
      }

      if (res.ok) {
        closeModal();
        toast(editingId === null ? 'Client "' + res.client.name + '" added.' : 'Client "' + res.client.name + '" updated.', 'success');
        await loadClients();
      } else {
        if (res.errors) {
          for (const [field, msg] of Object.entries(res.errors)) {
            if (field === 'general') toast(msg, 'error');
            else showFieldError(field, msg);
          }
        } else {
          toast('Could not save client.', 'error');
        }
      }
    } catch (err) {
      toast('Could not save client: ' + err.message, 'error');
    }
  });

  loadClients();
})();
