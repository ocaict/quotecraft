(function () {
  const listEl = document.getElementById('itemList');
  const section = document.getElementById('page-items');
  if (!listEl || !section) return;

  const modal = document.getElementById('itemModal');
  const form = document.getElementById('itemForm');
  const modalTitle = document.getElementById('itemModalTitle');
  const submitBtn = document.getElementById('itemSubmitBtn');
  const searchInput = document.getElementById('itemSearch');
  const sortSelect = document.getElementById('itemSort');
  const addBtn = document.getElementById('addItemBtn');
  const cancelBtn = document.getElementById('itemCancelBtn');
  const closeBtn = document.getElementById('itemModalClose');

  let items = [];
  let searchTerm = '';
  let sortBy = 'name';
  let editingId = null;
  let currencyCode = 'USD';

  function toast(message, type) {
    window.QuoteCraftUtils.showToast(message, type);
  }

  function money(amount) {
    return window.QuoteCraftUtils.formatCurrency(amount, currencyCode);
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

  function renderList() {
    let filtered = items.slice();

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((item) =>
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.description || '').toLowerCase().includes(q)
      );
    }

    if (sortBy === 'price') {
      filtered.sort((a, b) => Number(b.unit_price || 0) - Number(a.unit_price || 0));
    } else if (sortBy === 'date') {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      filtered.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
    }

    if (filtered.length === 0) {
      if (items.length === 0) {
        listEl.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'items',
          title: 'No items in library yet',
          message: 'Add your frequently-used services or products here to insert them into quotes with one click.',
          actionLabel: '+ Add Item',
        });
        const action = listEl.querySelector('[data-empty-action]');
        if (action) action.addEventListener('click', openAddModal);
      } else {
        listEl.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'search',
          title: 'No matching items',
          message: 'Nothing matches "' + searchTerm.trim() + '". Try a different search term or clear it.',
          actionLabel: 'Clear search',
        });
        const action = listEl.querySelector('[data-empty-action]');
        if (action) {
          action.addEventListener('click', () => {
            searchInput.value = '';
            searchTerm = '';
            renderList();
          });
        }
      }
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Item / Service</th>
          <th class="cell-number header-right">Default Unit Price</th>
          <th>Default Tax Rate</th>
          <th style="text-align: right;">Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    for (const item of filtered) {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      const nameEl = document.createElement('div');
      nameEl.className = 'item-name-cell';
      nameEl.textContent = item.name;
      tdName.appendChild(nameEl);

      if (item.description && item.description.trim()) {
        const descEl = document.createElement('div');
        descEl.className = 'item-desc-sub';
        descEl.textContent = item.description;
        tdName.appendChild(descEl);
      }

      const tdPrice = document.createElement('td');
      tdPrice.className = 'cell-number';
      tdPrice.textContent = money(item.unit_price);

      const tdTax = document.createElement('td');
      tdTax.textContent = Number(item.tax_rate) > 0 ? `${Number(item.tax_rate)}%` : '—';

      const tdActions = document.createElement('td');
      tdActions.className = 'items-actions-cell';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openEditModal(item));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => handleDelete(item));

      tdActions.appendChild(editBtn);
      tdActions.appendChild(deleteBtn);

      tr.appendChild(tdName);
      tr.appendChild(tdPrice);
      tr.appendChild(tdTax);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    }

    listEl.innerHTML = '';
    listEl.appendChild(table);
  }

  function openAddModal() {
    editingId = null;
    modalTitle.textContent = 'Add Item to Library';
    submitBtn.textContent = 'Save item';
    form.reset();
    clearAllErrors();
    modal.classList.remove('hidden');
    const nameEl = form.elements['name'];
    if (nameEl) nameEl.focus();
  }

  function openEditModal(item) {
    editingId = item.id;
    modalTitle.textContent = 'Edit Library Item';
    submitBtn.textContent = 'Update item';
    clearAllErrors();

    form.elements['name'].value = item.name || '';
    form.elements['description'].value = item.description || '';
    form.elements['unit_price'].value = item.unit_price !== undefined && item.unit_price !== null ? item.unit_price : '';
    form.elements['tax_rate'].value = item.tax_rate !== undefined && item.tax_rate !== null ? item.tax_rate : '';

    modal.classList.remove('hidden');
    const nameEl = form.elements['name'];
    if (nameEl) nameEl.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    form.reset();
    clearAllErrors();
    editingId = null;
  }

  async function handleDelete(item) {
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Delete library item?',
      message: `Are you sure you want to delete "${item.name}" from your library? Quotes and invoices that already used this item will not be affected.`,
      confirmText: 'Delete item',
      cancelText: 'Cancel',
      danger: true,
    });

    if (!confirmed) return;

    try {
      const res = await window.electronAPI.deleteItem(item.id);
      if (res.ok) {
        toast(`"${item.name}" was deleted from library.`, 'success');
        await loadItems();
        window.dispatchEvent(new CustomEvent('qc-library-updated'));
      } else {
        toast((res.errors && res.errors.general) || 'Could not delete item.', 'error');
      }
    } catch (e) {
      toast('Failed to delete item: ' + e.message, 'error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearAllErrors();

    const data = {
      name: (form.elements['name'].value || '').trim(),
      description: (form.elements['description'].value || '').trim(),
      unit_price: form.elements['unit_price'].value === '' ? '' : Number(form.elements['unit_price'].value),
      tax_rate: form.elements['tax_rate'].value === '' ? 0 : Number(form.elements['tax_rate'].value),
    };

    let hasClientErrors = false;
    if (!data.name) {
      showFieldError('name', 'Item name is required.');
      hasClientErrors = true;
    }
    if (data.unit_price === '' || isNaN(data.unit_price) || data.unit_price < 0) {
      showFieldError('unit_price', 'Please enter a valid unit price (0 or more).');
      hasClientErrors = true;
    }
    if (isNaN(data.tax_rate) || data.tax_rate < 0 || data.tax_rate > 100) {
      showFieldError('tax_rate', 'Tax rate must be between 0 and 100.');
      hasClientErrors = true;
    }

    if (hasClientErrors) return;

    submitBtn.disabled = true;
    try {
      let res;
      if (editingId) {
        res = await window.electronAPI.updateItem(editingId, data);
      } else {
        res = await window.electronAPI.addItem(data);
      }

      if (res.ok) {
        toast(editingId ? 'Item updated.' : 'Item added to library.', 'success');
        closeModal();
        await loadItems();
        window.dispatchEvent(new CustomEvent('qc-library-updated'));
      } else if (res.errors) {
        for (const [field, msg] of Object.entries(res.errors)) {
          if (field === 'general') {
            toast(msg, 'error');
          } else {
            showFieldError(field, msg);
          }
        }
      }
    } catch (err) {
      toast('Error saving item: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function loadItems() {
    try {
      const res = await window.electronAPI.listItems();
      if (res.ok) {
        items = res.items || [];
        renderList();
      }
    } catch (e) {
      toast('Could not load library items: ' + e.message, 'error');
    }
  }

  async function init() {
    try {
      const p = await window.electronAPI.getCompanyProfile();
      if (p.ok && p.profile && p.profile.default_currency) {
        currencyCode = p.profile.default_currency;
      }
    } catch (e) { /* keep default */ }

    addBtn.addEventListener('click', openAddModal);
    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    form.addEventListener('submit', handleSubmit);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderList();
    });

    sortSelect.addEventListener('change', (e) => {
      sortBy = e.target.value;
      renderList();
    });

    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      if (el && el.addEventListener) {
        el.addEventListener('input', () => clearFieldError(el.name));
      }
    }

    await loadItems();
  }

  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'items') loadItems();
  });

  init();
})();
