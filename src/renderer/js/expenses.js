// Expenses Tracker Controller
(function () {
  'use strict';

  let baseCurrencyCode = 'USD';
  let debounceTimeout = null;
  let allExpenses = [];

  // Toolbar Elements
  const datePresetSelect = document.getElementById('expensesDatePreset');
  const startDateInput = document.getElementById('expensesStartDate');
  const endDateInput = document.getElementById('expensesEndDate');
  const categoryFilterSelect = document.getElementById('expensesCategoryFilter');
  const searchInput = document.getElementById('expensesSearch');
  const resetBtn = document.getElementById('expensesResetBtn');
  const newExpenseBtn = document.getElementById('newExpenseBtn');

  // KPI & Table Elements
  const totalAmountEl = document.getElementById('expensesTotalAmount');
  const periodLabelEl = document.getElementById('expensesPeriodLabel');
  const countEl = document.getElementById('expensesCount');
  const categoriesGridEl = document.getElementById('expensesCategoriesGrid');
  const tableBodyEl = document.getElementById('expensesTableBody');

  // Modal Elements
  const modal = document.getElementById('expenseModal');
  const modalClose = document.getElementById('expenseModalClose');
  const modalTitle = document.getElementById('expenseModalTitle');
  const form = document.getElementById('expenseForm');
  const cancelBtn = document.getElementById('expenseCancelBtn');

  const editIdInput = document.getElementById('expenseEditId');
  const amountInput = document.getElementById('expenseAmount');
  const dateInput = document.getElementById('expenseDate');
  const currencySelect = document.getElementById('expenseCurrency');
  const exchangeRateField = document.getElementById('expenseExchangeRateField');
  const exchangeRateInput = document.getElementById('expenseExchangeRate');
  const exchangeRateHint = document.getElementById('expenseExchangeRateHint');
  const categorySelect = document.getElementById('expenseCategory');
  const customCategoryInput = document.getElementById('expenseCustomCategory');
  const notesInput = document.getElementById('expenseNotes');

  function getISODate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function applyPreset(preset) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (preset === 'this_month') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `This month (${startDateInput.value} to ${endDateInput.value})`;
    } else if (preset === 'last_month') {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `Last month (${startDateInput.value} to ${endDateInput.value})`;
    } else if (preset === 'this_quarter') {
      const qMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, qMonth, 1);
      const end = new Date(year, qMonth + 3, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `This quarter (${startDateInput.value} to ${endDateInput.value})`;
    } else if (preset === 'this_year') {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `This year (${year})`;
    } else if (preset === 'all') {
      startDateInput.value = '';
      endDateInput.value = '';
      periodLabelEl.textContent = 'All time';
    } else {
      periodLabelEl.textContent = startDateInput.value || endDateInput.value
        ? `Custom (${startDateInput.value || '…'} to ${endDateInput.value || '…'})`
        : 'All time';
    }
  }

  function getFilterPayload() {
    return {
      startDate: startDateInput.value || '',
      endDate: endDateInput.value || '',
      category: categoryFilterSelect.value || 'all',
      search: searchInput.value ? searchInput.value.trim() : '',
    };
  }

  async function loadBaseCurrency() {
    try {
      const res = await window.electronAPI.getCompanyProfile();
      if (res && res.ok && res.profile) {
        baseCurrencyCode = res.profile.reporting_currency || res.profile.default_currency || 'USD';
      }
    } catch (_) {}
  }

  function populateCurrencyOptions(selectedCode) {
    if (!currencySelect) return;
    currencySelect.innerHTML = '';
    const currencies = window.CURRENCIES || [{ code: 'USD', name: 'US Dollar', symbol: '$' }];
    currencies.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = `${c.code} - ${c.name} (${c.symbol})`;
      if (c.code === (selectedCode || baseCurrencyCode)) {
        opt.selected = true;
      }
      currencySelect.appendChild(opt);
    });
  }

  function updateExchangeRateVisibility() {
    if (!exchangeRateField || !currencySelect) return;
    const selected = currencySelect.value;
    if (selected === baseCurrencyCode) {
      exchangeRateField.style.display = 'none';
      exchangeRateInput.value = '1.0';
    } else {
      exchangeRateField.style.display = '';
      exchangeRateHint.textContent = `1 ${selected} = [rate] ${baseCurrencyCode} (for profit reporting)`;
      if (!exchangeRateInput.value || Number(exchangeRateInput.value) === 1) {
        exchangeRateInput.value = '1.0';
      }
    }
  }

  function getCategorySlug(category) {
    if (!category) return 'other';
    const lower = category.toLowerCase().trim();
    if (lower.includes('software')) return 'software';
    if (lower.includes('supplies')) return 'supplies';
    if (lower.includes('travel')) return 'travel';
    if (lower.includes('other')) return 'other';
    return 'default';
  }

  async function loadExpenses() {
    await loadBaseCurrency();
    try {
      const filter = getFilterPayload();
      const res = await window.electronAPI.getExpensesSummary(filter);
      if (!res || !res.ok) {
        console.error('Failed to load expenses summary:', res && res.errors);
        return;
      }

      allExpenses = res.summary.expenses || [];
      renderExpensesSummary(res.summary);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    }
  }

  function renderExpensesSummary(summary) {
    const baseCurr = summary.baseCurrency || baseCurrencyCode;

    // 1. Total expenses KPI
    totalAmountEl.textContent = window.QuoteCraftUtils.formatCurrency(summary.totalExpenses, baseCurr);
    countEl.textContent = `${summary.count} expense${summary.count === 1 ? '' : 's'}`;

    // 2. Update category filter options with any custom categories
    const standardCategories = ['Software', 'Supplies', 'Travel', 'Other'];
    const customInSummary = (summary.byCategory || []).map((c) => c.category);
    const allCategories = Array.from(new Set([...standardCategories, ...customInSummary]));

    const currentFilterVal = categoryFilterSelect.value;
    categoryFilterSelect.innerHTML = '<option value="all">All Categories</option>';
    allCategories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categoryFilterSelect.appendChild(opt);
    });
    categoryFilterSelect.value = currentFilterVal;

    // 3. Render Category Breakdown Grid
    categoriesGridEl.innerHTML = '';
    if (!summary.byCategory || summary.byCategory.length === 0) {
      categoriesGridEl.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; font-size: 13px;">No expenses recorded for this period.</p>';
    } else {
      summary.byCategory.forEach((c) => {
        const slug = getCategorySlug(c.category);
        const card = document.createElement('div');
        card.className = 'category-subtotal-card';
        card.title = `Click to filter by ${c.category}`;

        card.innerHTML = `
          <div class="category-subtotal-header">
            <span class="badge-category badge-cat-${slug}">${escapeHtml(c.category)}</span>
            <span style="font-size: 11px; color: var(--text-faint);">${c.count} txn${c.count === 1 ? '' : 's'}</span>
          </div>
          <div class="category-subtotal-amount">${window.QuoteCraftUtils.formatCurrency(c.totalAmount, baseCurr)}</div>
          <div class="category-percentage-bar-wrapper">
            <div class="category-percentage-bar" style="width: ${Math.min(100, Math.max(0, c.percentage))}%;"></div>
          </div>
          <div class="category-percentage-text">
            <span>${c.percentage}%</span>
            <span>${window.QuoteCraftUtils.formatCurrency(c.totalAmount, baseCurr)}</span>
          </div>
        `;

        card.addEventListener('click', () => {
          categoryFilterSelect.value = c.category;
          loadExpenses();
        });

        categoriesGridEl.appendChild(card);
      });
    }

    // 4. Render Table Body
    tableBodyEl.innerHTML = '';
    if (!summary.expenses || summary.expenses.length === 0) {
      tableBodyEl.innerHTML = `
        <tr>
          <td colspan="5" class="expenses-empty">
            <p>No expenses found matching the selected criteria.</p>
          </td>
        </tr>
      `;
      return;
    }

    summary.expenses.forEach((exp) => {
      const tr = document.createElement('tr');
      const slug = getCategorySlug(exp.category);
      const isMultiCurrency = exp.currency && exp.currency !== baseCurr && Number(exp.exchange_rate) !== 1.0;
      const nativeAmountStr = window.QuoteCraftUtils.formatCurrency(exp.amount, exp.currency || baseCurr);
      let convertedSub = '';
      if (isMultiCurrency) {
        const converted = Math.round((Number(exp.amount) || 0) * Number(exp.exchange_rate) * 100) / 100;
        convertedSub = `<span class="expense-amount-original">≈ ${window.QuoteCraftUtils.formatCurrency(converted, baseCurr)} (${baseCurr})</span>`;
      }

      tr.innerHTML = `
        <td style="white-space: nowrap;">${window.QuoteCraftUtils.formatDate(exp.date)}</td>
        <td>
          <span class="badge-category badge-cat-${slug}">${escapeHtml(exp.category || 'Other')}</span>
        </td>
        <td>${escapeHtml(exp.notes || '—')}</td>
        <td class="expense-amount-cell">
          ${nativeAmountStr}
          ${convertedSub}
        </td>
        <td style="text-align: right;">
          <div class="expense-table-actions">
            <button type="button" class="expense-action-btn edit-btn" data-id="${exp.id}">Edit</button>
            <button type="button" class="expense-action-btn delete delete-btn" data-id="${exp.id}">Delete</button>
          </div>
        </td>
      `;

      const editBtn = tr.querySelector('.edit-btn');
      editBtn.addEventListener('click', () => openExpenseModal(exp));

      const deleteBtn = tr.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', () => handleDeleteExpense(exp));

      tableBodyEl.appendChild(tr);
    });
  }

  function openExpenseModal(exp = null) {
    clearErrors();
    populateCurrencyOptions(exp ? exp.currency : baseCurrencyCode);

    if (exp) {
      modalTitle.textContent = 'Edit Expense';
      editIdInput.value = exp.id;
      amountInput.value = Number(exp.amount || 0).toFixed(2);
      dateInput.value = exp.date || getISODate(new Date());
      currencySelect.value = exp.currency || baseCurrencyCode;
      exchangeRateInput.value = exp.exchange_rate || 1.0;
      notesInput.value = exp.notes || '';

      const isStandardCat = ['Software', 'Supplies', 'Travel', 'Other'].includes(exp.category);
      if (isStandardCat) {
        categorySelect.value = exp.category;
        customCategoryInput.style.display = 'none';
        customCategoryInput.value = '';
      } else {
        categorySelect.value = '__custom__';
        customCategoryInput.style.display = '';
        customCategoryInput.value = exp.category || '';
      }
    } else {
      modalTitle.textContent = 'New Expense';
      editIdInput.value = '';
      amountInput.value = '';
      dateInput.value = getISODate(new Date());
      currencySelect.value = baseCurrencyCode;
      exchangeRateInput.value = '1.0';
      categorySelect.value = 'Software';
      customCategoryInput.style.display = 'none';
      customCategoryInput.value = '';
      notesInput.value = '';
    }

    updateExchangeRateVisibility();
    modal.classList.remove('hidden');
    amountInput.focus();
  }

  function closeExpenseModal() {
    modal.classList.add('hidden');
    clearErrors();
  }

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  }

  function showFieldError(fieldName, message) {
    const el = form.querySelector(`[data-error-for="${fieldName}"]`);
    if (el) el.textContent = message;
  }

  async function handleSaveExpense(e) {
    e.preventDefault();
    clearErrors();

    const amount = Number(amountInput.value);
    if (!(amount > 0)) {
      showFieldError('amount', 'Enter a valid amount greater than zero.');
      return;
    }

    const date = (dateInput.value || '').trim();
    if (!date) {
      showFieldError('date', 'Please select a date.');
      return;
    }

    let category = categorySelect.value;
    if (category === '__custom__') {
      category = (customCategoryInput.value || '').trim() || 'Other';
    }

    const currency = currencySelect.value || baseCurrencyCode;
    const exchangeRate = Number(exchangeRateInput.value) > 0 ? Number(exchangeRateInput.value) : 1.0;
    const notes = (notesInput.value || '').trim();

    const payload = {
      amount,
      date,
      category,
      notes,
      currency,
      exchange_rate: exchangeRate,
    };

    const editId = editIdInput.value ? Number(editIdInput.value) : null;
    try {
      let res;
      if (editId) {
        res = await window.electronAPI.updateExpense(editId, payload);
      } else {
        res = await window.electronAPI.createExpense(payload);
      }

      if (!res.ok) {
        if (res.errors) {
          Object.entries(res.errors).forEach(([field, msg]) => showFieldError(field, msg));
        } else {
          window.QuoteCraftUtils.showToast('Failed to save expense.', 'error');
        }
        return;
      }

      window.QuoteCraftUtils.showToast(editId ? 'Expense updated successfully.' : 'Expense created successfully.', 'success');
      closeExpenseModal();
      loadExpenses();
    } catch (err) {
      window.QuoteCraftUtils.showToast('Error saving expense: ' + err.message, 'error');
    }
  }

  async function handleDeleteExpense(exp) {
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Delete Expense',
      message: `Are you sure you want to delete this ${window.QuoteCraftUtils.formatCurrency(exp.amount, exp.currency)} expense for ${exp.category}? This action cannot be undone.`,
      confirmLabel: 'Delete',
      confirmClass: 'btn-danger',
    });

    if (!confirmed) return;

    try {
      const res = await window.electronAPI.deleteExpense(exp.id);
      if (res && res.ok) {
        window.QuoteCraftUtils.showToast('Expense deleted.', 'success');
        loadExpenses();
      } else {
        window.QuoteCraftUtils.showToast('Could not delete expense.', 'error');
      }
    } catch (err) {
      window.QuoteCraftUtils.showToast('Error deleting expense: ' + err.message, 'error');
    }
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Event Listeners
  datePresetSelect.addEventListener('change', () => {
    applyPreset(datePresetSelect.value);
    loadExpenses();
  });

  startDateInput.addEventListener('change', () => {
    datePresetSelect.value = 'custom';
    applyPreset('custom');
    loadExpenses();
  });

  endDateInput.addEventListener('change', () => {
    datePresetSelect.value = 'custom';
    applyPreset('custom');
    loadExpenses();
  });

  categoryFilterSelect.addEventListener('change', () => {
    loadExpenses();
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadExpenses();
    }, 250);
  });

  resetBtn.addEventListener('click', () => {
    datePresetSelect.value = 'all';
    startDateInput.value = '';
    endDateInput.value = '';
    categoryFilterSelect.value = 'all';
    searchInput.value = '';
    applyPreset('all');
    loadExpenses();
  });

  newExpenseBtn.addEventListener('click', () => openExpenseModal());
  modalClose.addEventListener('click', closeExpenseModal);
  cancelBtn.addEventListener('click', closeExpenseModal);
  form.addEventListener('submit', handleSaveExpense);

  currencySelect.addEventListener('change', updateExchangeRateVisibility);

  categorySelect.addEventListener('change', () => {
    if (categorySelect.value === '__custom__') {
      customCategoryInput.style.display = '';
      customCategoryInput.focus();
    } else {
      customCategoryInput.style.display = 'none';
      customCategoryInput.value = '';
    }
  });

  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'expenses') {
      loadExpenses();
    }
  });

  window.addEventListener('qc-set-expenses-preset', (e) => {
    if (e.detail && datePresetSelect) {
      datePresetSelect.value = e.detail;
      applyPreset(e.detail);
      loadExpenses();
    }
  });

  // Initial preset
  applyPreset('all');
})();
