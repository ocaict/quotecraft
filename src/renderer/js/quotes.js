(function () {
  const section = document.getElementById('page-quotes');
  if (!section) return;

  const listView = document.getElementById('quoteListView');
  const formView = document.getElementById('quoteFormView');
  const detailView = document.getElementById('quoteDetailView');

  const form = document.getElementById('quoteForm');
  const quoteIdInput = document.getElementById('quoteId');
  const formTitle = document.getElementById('quoteFormTitle');
  const clientSelect = document.getElementById('quoteClient');
  const clientSearch = document.getElementById('quoteClientSearch');
  const quoteContactSelect = document.getElementById('quoteContact');
  const itemsBody = document.getElementById('itemsBody');
  const addLineItemBtn = document.getElementById('addLineItemBtn');
  const quoteLibrarySelect = document.getElementById('quoteLibrarySelect');
  const termsArea = document.getElementById('quoteTerms');
  const saveQuoteBtn = document.getElementById('saveQuoteBtn');

  const discountTypeSelect = document.getElementById('discountType');
  const discountValueInput = document.getElementById('discountValue');
  const discountLabel = document.getElementById('discountLabel');
  const taxRateInput = document.getElementById('taxRate');
  const totalsSubtotal = document.getElementById('totalsSubtotal');
  const totalsDiscount = document.getElementById('totalsDiscount');
  const totalsTaxBreakdown = document.getElementById('totalsTaxBreakdown');
  const totalsGrand = document.getElementById('totalsGrand');

  const newQuoteBtn = document.getElementById('newQuoteBtn');
  const quotesBackBtn = document.getElementById('quotesBackBtn');
  const quoteList = document.getElementById('quoteList');
  const quoteSearch = document.getElementById('quoteSearch');
  const quoteStatusFilter = document.getElementById('quoteStatusFilter');
  const quoteSort = document.getElementById('quoteSort');
  const detailBackBtn = document.getElementById('detailBackBtn');
  const detailEditBtn = document.getElementById('detailEditBtn');
  const detailExportBtn = document.getElementById('detailExportBtn');
  const detailSendEmailBtn = document.getElementById('detailSendEmailBtn');
  const detailStatusSelect = document.getElementById('detailStatusSelect');
  const detailConvertBtn = document.getElementById('detailConvertBtn');
  const detailConvertResult = document.getElementById('detailConvertResult');
  const detailMarkAcceptedBtn = document.getElementById('detailMarkAcceptedBtn');
  const detailShareQuoteBtn = document.getElementById('detailShareQuoteBtn');

  // Acceptance Paper Trail elements
  const quoteAcceptanceCard = document.getElementById('quoteAcceptanceCard');
  const quoteAcceptanceDate = document.getElementById('quoteAcceptanceDate');
  const quoteAcceptanceMethod = document.getElementById('quoteAcceptanceMethod');
  const quoteAcceptedBy = document.getElementById('quoteAcceptedBy');
  const quoteAcceptanceNoteRow = document.getElementById('quoteAcceptanceNoteRow');
  const quoteAcceptanceNote = document.getElementById('quoteAcceptanceNote');
  const quoteDeclinedCard = document.getElementById('quoteDeclinedCard');
  const quoteDeclinedNote = document.getElementById('quoteDeclinedNote');

  // Mark Quote Accepted Modal elements
  const quoteAcceptModal = document.getElementById('quoteAcceptModal');
  const quoteAcceptModalClose = document.getElementById('quoteAcceptModalClose');
  const quoteAcceptCancelBtn = document.getElementById('quoteAcceptCancelBtn');
  const quoteAcceptForm = document.getElementById('quoteAcceptForm');
  const quoteAcceptMethod = document.getElementById('quoteAcceptMethod');
  const quoteAcceptDate = document.getElementById('quoteAcceptDate');
  const quoteAcceptedByInput = document.getElementById('quoteAcceptedBy');
  const quoteAcceptNote = document.getElementById('quoteAcceptNote');
  const quoteAcceptQuickTags = document.getElementById('quoteAcceptQuickTags');

  // Share Quote Modal elements
  const shareQuoteModal = document.getElementById('shareQuoteModal');
  const shareQuoteModalClose = document.getElementById('shareQuoteModalClose');
  const shareQuoteModalCloseBtn = document.getElementById('shareQuoteModalCloseBtn');
  const btnShareDownloadPdf = document.getElementById('btnShareDownloadPdf');
  const btnShareDownloadHtml = document.getElementById('btnShareDownloadHtml');
  const btnShareSendEmail = document.getElementById('btnShareSendEmail');
  const shareInstructionsText = document.getElementById('shareInstructionsText');
  const btnCopyShareInstructions = document.getElementById('btnCopyShareInstructions');

  let currentDetailQuote = null;

  // Convert to Invoice Modal elements
  const convertQuoteModal = document.getElementById('convertQuoteModal');
  const convertQuoteForm = document.getElementById('convertQuoteForm');
  const convertQuoteModalClose = document.getElementById('convertQuoteModalClose');
  const convertQuoteCancelBtn = document.getElementById('convertQuoteCancelBtn');
  const convertQuoteSubmitBtn = document.getElementById('convertQuoteSubmitBtn');
  const convertFullQuoteTotalDisplay = document.getElementById('convertFullQuoteTotalDisplay');
  const convertDepositSection = document.getElementById('convertDepositSection');
  const convertDepositType = document.getElementById('convertDepositType');
  const convertDepositValue = document.getElementById('convertDepositValue');
  const convertDepositValueLabel = document.getElementById('convertDepositValueLabel');
  const depositSummaryQuoteTotal = document.getElementById('depositSummaryQuoteTotal');
  const depositSummaryDueNow = document.getElementById('depositSummaryDueNow');
  const depositSummaryRemainder = document.getElementById('depositSummaryRemainder');

  let currentConvertQuote = null;

  let clients = [];
  let libraryItems = [];
  let quotes = [];
  const quoteCurrencySelect = document.getElementById('quoteCurrency');
  const quoteExchangeRateInput = document.getElementById('quoteExchangeRate');
  const quoteExchangeRateField = document.getElementById('quoteExchangeRateField');

  let rowCounter = 0;
  let currencyCode = 'USD';
  let defaultCurrencyCode = 'USD';
  let reportingCurrencyCode = 'USD';
  let editingQuoteId = null;
  let currentDetailId = null;
  let searchTerm = '';
  let statusFilter = 'all';
  let sortBy = 'date';

  function toast(message, type) {
    window.QuoteCraftUtils.showToast(message, type);
  }

  // ---------- View switching ----------
  function showListView() {
    listView.classList.add('active');
    formView.classList.remove('active');
    detailView.classList.remove('active');
  }

  function showFormView() {
    listView.classList.remove('active');
    formView.classList.add('active');
    detailView.classList.remove('active');
  }

  function showDetailView() {
    listView.classList.remove('active');
    formView.classList.remove('active');
    detailView.classList.add('active');
  }

  // ---------- Money helpers (integer cents) ----------
  function toCents(value) {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) return 0;
    return Math.round(Number(value) * 100);
  }

  function countDecimals(value) {
    const match = String(value).match(/\.(\d+)$/);
    return match ? match[1].length : 0;
  }

  function centsToFormatted(cents) {
    return window.QuoteCraftUtils.formatCurrency(cents / 100, currencyCode);
  }

  // Compute a single line item's raw and net cents
  function lineRawCents(qty, price) {
    return Math.round(toCents(qty) * toCents(price) / 100);
  }

  function lineDiscountCents(rawCents, discType, discValue) {
    if (!discType || discType === 'none' || isNaN(discValue) || discValue <= 0) return 0;
    let dc = discType === 'fixed' ? toCents(discValue) : Math.round(rawCents * discValue / 100);
    if (dc > rawCents) dc = rawCents;
    return dc;
  }

  function lineNetCents(qty, price, discType, discValue) {
    const raw = lineRawCents(qty, price);
    return raw - lineDiscountCents(raw, discType, discValue);
  }

  function formatLineTotal(qty, price, discType, discValue) {
    return centsToFormatted(lineNetCents(qty, price, discType, discValue));
  }

  // Helper: format a line-item discount label (e.g. "10%" or "-$20.00")
  function formatLineDiscountLabel(discType, discValue, currency) {
    if (!discType || discType === 'none' || !discValue || Number(discValue) <= 0) return '—';
    if (discType === 'percent') return `${Number(discValue)}%`;
    return `−${window.QuoteCraftUtils.formatCurrency(Number(discValue), currency || currencyCode)}`;
  }

  // ---------- Calculation ----------
  // Net subtotal = sum of all line net totals (after per-line discounts)
  function totalCentsOfCurrentRows() {
    let subtotalCents = 0;
    for (const tr of Array.from(itemsBody.querySelectorAll('tr.item-row'))) {
      const qty = tr.querySelector('input[name="item_quantity"]').value;
      const price = tr.querySelector('input[name="item_unit_price"]').value;
      const dType = tr.querySelector('select[name="item_discount_type"]').value;
      const dVal = Number(tr.querySelector('input[name="item_discount_value"]').value);
      subtotalCents += lineNetCents(qty, price, dType, dVal);
    }
    return subtotalCents;
  }

  function docDiscountCentsOfCurrentRows() {
    const subtotalCents = totalCentsOfCurrentRows();
    const type = discountTypeSelect.value;
    const value = Number(discountValueInput.value);
    if (type === 'none' || isNaN(value) || value <= 0) return 0;
    let dc = type === 'fixed' ? toCents(discountValueInput.value) : Math.round(subtotalCents * value / 100);
    if (dc > subtotalCents) dc = subtotalCents;
    return dc;
  }

  // Compute tax breakdown across all tax brackets from line items
  function taxBreakdownOfCurrentRows() {
    const subtotalCents = totalCentsOfCurrentRows();
    const docDiscCents = docDiscountCentsOfCurrentRows();
    const ratio = subtotalCents > 0 ? (subtotalCents - docDiscCents) / subtotalCents : 1;

    const brackets = new Map(); // rate -> { rate, netCents }

    for (const tr of Array.from(itemsBody.querySelectorAll('tr.item-row'))) {
      const qty = tr.querySelector('input[name="item_quantity"]').value;
      const price = tr.querySelector('input[name="item_unit_price"]').value;
      const dType = tr.querySelector('select[name="item_discount_type"]').value;
      const dVal = Number(tr.querySelector('input[name="item_discount_value"]').value);
      const taxInput = tr.querySelector('input[name="item_tax_rate"]');
      const taxRateVal = taxInput && !isNaN(Number(taxInput.value)) ? Number(taxInput.value) : 0;
      const netCents = lineNetCents(qty, price, dType, dVal);

      if (!brackets.has(taxRateVal)) {
        brackets.set(taxRateVal, { rate: taxRateVal, netCents: 0 });
      }
      brackets.get(taxRateVal).netCents += netCents;
    }

    const list = [];
    let totalTaxCents = 0;
    const sortedRates = Array.from(brackets.keys()).sort((a, b) => a - b);
    for (const rate of sortedRates) {
      const b = brackets.get(rate);
      const taxableBasisCents = Math.round(b.netCents * ratio);
      const taxCents = rate > 0 ? Math.round(taxableBasisCents * rate / 100) : 0;
      totalTaxCents += taxCents;
      list.push({
        rate,
        netCents: b.netCents,
        taxableBasisCents,
        taxCents,
      });
    }

    return { list, totalTaxCents };
  }

  function computeTaxBreakdown(lineItems, subtotal, discountAmount) {
    const subtotalCents = Math.round((Number(subtotal) || 0) * 100);
    const docDiscCents = Math.round((Number(discountAmount) || 0) * 100);
    const ratio = subtotalCents > 0 ? (subtotalCents - docDiscCents) / subtotalCents : 1;

    const brackets = new Map();
    for (const item of (lineItems || [])) {
      const rate = Number(item.tax_rate) || 0;
      const amountCents = Math.round((Number(item.amount) || 0) * 100);
      if (!brackets.has(rate)) {
        brackets.set(rate, { rate, netCents: 0 });
      }
      brackets.get(rate).netCents += amountCents;
    }

    const list = [];
    let totalTaxCents = 0;
    const sortedRates = Array.from(brackets.keys()).sort((a, b) => a - b);
    for (const rate of sortedRates) {
      const b = brackets.get(rate);
      const taxableBasisCents = Math.round(b.netCents * ratio);
      const taxCents = rate > 0 ? Math.round(taxableBasisCents * rate / 100) : 0;
      totalTaxCents += taxCents;
      list.push({
        rate,
        netCents: b.netCents,
        taxableBasisCents,
        taxCents,
      });
    }
    return { list, totalTaxCents };
  }

  function renderTaxBreakdown(containerEl, breakdownList, totalTaxCents, currency) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const cur = currency || currencyCode;

    if (!breakdownList || breakdownList.length === 0) {
      const row = document.createElement('div');
      row.className = 'tax-breakdown-row';
      row.innerHTML = `<span class="tax-label">Tax</span><span class="tax-val">${window.QuoteCraftUtils.formatCurrency(0, cur)}</span>`;
      containerEl.appendChild(row);
      return;
    }

    if (breakdownList.length === 1 && breakdownList[0].rate === 0) {
      const basisStr = window.QuoteCraftUtils.formatCurrency(breakdownList[0].taxableBasisCents / 100, cur);
      const row = document.createElement('div');
      row.className = 'tax-breakdown-row';
      row.innerHTML = `<span class="tax-label">Tax-exempt (0% on ${basisStr})</span><span class="tax-val">${window.QuoteCraftUtils.formatCurrency(0, cur)}</span>`;
      containerEl.appendChild(row);
      return;
    }

    for (const item of breakdownList) {
      const row = document.createElement('div');
      row.className = 'tax-breakdown-row';
      const basisStr = window.QuoteCraftUtils.formatCurrency(item.taxableBasisCents / 100, cur);
      const taxStr = window.QuoteCraftUtils.formatCurrency(item.taxCents / 100, cur);
      if (item.rate === 0) {
        row.innerHTML = `<span class="tax-label">Tax-exempt (0% on ${basisStr})</span><span class="tax-val">${taxStr}</span>`;
      } else {
        row.innerHTML = `<span class="tax-label">Tax (${item.rate}% on ${basisStr})</span><span class="tax-val">${taxStr}</span>`;
      }
      containerEl.appendChild(row);
    }

    if (breakdownList.length > 1) {
      const totalRow = document.createElement('div');
      totalRow.className = 'tax-breakdown-row';
      totalRow.style.fontWeight = '600';
      totalRow.style.borderTop = '1px dashed var(--border)';
      totalRow.style.paddingTop = '4px';
      totalRow.style.marginTop = '2px';
      totalRow.innerHTML = `<span class="tax-label">Total Tax</span><span class="tax-val">${window.QuoteCraftUtils.formatCurrency(totalTaxCents / 100, cur)}</span>`;
      containerEl.appendChild(totalRow);
    }
  }

  function centsToValue(cents) {
    return Math.round(cents) / 100;
  }

  function recalcTotals() {
    for (const tr of Array.from(itemsBody.querySelectorAll('tr.item-row'))) {
      const qty = tr.querySelector('input[name="item_quantity"]')?.value || 0;
      const price = tr.querySelector('input[name="item_unit_price"]')?.value || 0;
      const dType = tr.querySelector('select[name="item_discount_type"]')?.value || 'none';
      const dVal = Number(tr.querySelector('input[name="item_discount_value"]')?.value) || 0;
      const tdTotal = tr.querySelector('td.item-total');
      if (tdTotal) {
        tdTotal.textContent = formatLineTotal(qty, price, dType, dVal);
      }
    }
    const subtotalCents = totalCentsOfCurrentRows();
    const discountCents = docDiscountCentsOfCurrentRows();
    const { list, totalTaxCents } = taxBreakdownOfCurrentRows();
    const grandCents = subtotalCents - discountCents + totalTaxCents;

    totalsSubtotal.textContent = centsToFormatted(subtotalCents);
    totalsDiscount.textContent = centsToFormatted(discountCents);
    renderTaxBreakdown(totalsTaxBreakdown, list, totalTaxCents, currencyCode);
    totalsGrand.textContent = centsToFormatted(grandCents);
  }

  // ---------- Dates ----------
  function setDateDefaults() {
    const today = new Date();
    const todayStr = toDateInputValue(today);
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + 30);
    const expiryStr = toDateInputValue(expiry);

    const dateInput = form.elements['date_created'];
    const expiryInput = form.elements['valid_until'];
    if (dateInput && !dateInput.value) dateInput.value = todayStr;
    if (expiryInput && !expiryInput.value) expiryInput.value = expiryStr;
  }

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ---------- Clients ----------
  function populateClientSelect(filterText) {
    const q = (filterText || '').trim().toLowerCase();
    const options = clients
      .filter((c) => !q || String(c.name || '').toLowerCase().includes(q) || String(c.company_name || '').toLowerCase().includes(q))
      .map((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.company_name
          ? `${c.name} (${c.company_name})`
          : c.name;
        return opt;
      });

    const current = clientSelect.value;
    clientSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a client…';
    clientSelect.appendChild(placeholder);
    options.forEach((o) => clientSelect.appendChild(o));
    if (current && options.some((o) => o.value === current)) {
      clientSelect.value = current;
    }
  }

  async function loadClients() {
    try {
      const res = await window.electronAPI.listClients();
      if (res.ok) {
        clients = res.clients || [];
        populateClientSelect('');
      }
    } catch (e) {
      toast('Could not load clients: ' + e.message, 'error');
    }
  }

  // ---------- Client Contacts ----------
  async function populateContactsForClient(clientId, selectedContactId) {
    if (!quoteContactSelect) return;
    quoteContactSelect.innerHTML = '<option value="">Default / No specific contact</option>';

    if (!clientId) return;

    try {
      const res = await window.electronAPI.listContacts(clientId);
      if (res.ok && Array.isArray(res.contacts) && res.contacts.length > 0) {
        let defaultChoice = '';
        res.contacts.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          const rolePart = c.role ? ` — ${c.role}` : '';
          const primaryTag = c.is_primary ? ' (Primary)' : '';
          opt.textContent = `${c.name}${rolePart}${primaryTag}`;
          quoteContactSelect.appendChild(opt);

          if (c.is_primary && !defaultChoice) {
            defaultChoice = String(c.id);
          }
        });

        if (selectedContactId !== undefined && selectedContactId !== null) {
          quoteContactSelect.value = String(selectedContactId);
        } else if (defaultChoice) {
          quoteContactSelect.value = defaultChoice;
        } else if (res.contacts.length > 0) {
          // Default to first contact if none marked primary
          quoteContactSelect.value = String(res.contacts[0].id);
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- Library items ----------
  function populateLibrarySelect() {
    if (!quoteLibrarySelect) return;
    quoteLibrarySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '+ Add from Library…';
    quoteLibrarySelect.appendChild(placeholder);

    for (const item of libraryItems) {
      const opt = document.createElement('option');
      opt.value = item.id;
      const formattedPrice = window.QuoteCraftUtils.formatCurrency(item.unit_price, currencyCode);
      opt.textContent = `${item.name} (${formattedPrice})`;
      quoteLibrarySelect.appendChild(opt);
    }
  }

  async function loadLibraryItems() {
    try {
      const res = await window.electronAPI.listItems();
      if (res.ok) {
        libraryItems = res.items || [];
        populateLibrarySelect();
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- Line items ----------
  function createLineItemRow(data) {
    data = data || {};
    const tr = document.createElement('tr');
    tr.className = 'item-row';
    tr.dataset.rowId = ++rowCounter;

    const tdDesc = document.createElement('td');
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'item-desc';
    descInput.name = 'item_description';
    descInput.placeholder = 'Describe the item or service';
    descInput.value = data.description || '';
    tdDesc.appendChild(descInput);

    const tdQty = document.createElement('td');
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'item-qty';
    qtyInput.name = 'item_quantity';
    qtyInput.min = '0';
    qtyInput.step = 'any';
    qtyInput.placeholder = '0';
    qtyInput.value = data.quantity !== undefined && data.quantity !== null ? data.quantity : '';
    tdQty.appendChild(qtyInput);

    const tdPrice = document.createElement('td');
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'item-price';
    priceInput.name = 'item_unit_price';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.placeholder = '0.00';
    priceInput.value = data.unit_price !== undefined && data.unit_price !== null ? data.unit_price : '';
    tdPrice.appendChild(priceInput);

    // ── Line-item discount cell ──
    const tdDisc = document.createElement('td');
    tdDisc.className = 'cell-line-discount';
    const discWrap = document.createElement('div');
    discWrap.className = 'line-discount-wrap';

    const discTypeSelect = document.createElement('select');
    discTypeSelect.name = 'item_discount_type';
    discTypeSelect.className = 'line-disc-type';
    discTypeSelect.innerHTML = '<option value="none">None</option><option value="percent">%</option><option value="fixed">Fixed</option>';
    discTypeSelect.value = data.discount_type || 'none';

    const discValueInput = document.createElement('input');
    discValueInput.type = 'number';
    discValueInput.name = 'item_discount_value';
    discValueInput.className = 'line-disc-value';
    discValueInput.min = '0';
    discValueInput.step = '0.01';
    discValueInput.placeholder = '0';
    discValueInput.value = (data.discount_value !== undefined && data.discount_value !== null && data.discount_type && data.discount_type !== 'none') ? data.discount_value : '';
    discValueInput.disabled = !data.discount_type || data.discount_type === 'none';

    discTypeSelect.addEventListener('change', () => {
      const isNone = discTypeSelect.value === 'none';
      discValueInput.disabled = isNone;
      if (isNone) discValueInput.value = '';
      recalc();
    });

    discWrap.appendChild(discTypeSelect);
    discWrap.appendChild(discValueInput);
    tdDisc.appendChild(discWrap);

    // ── Line-item tax rate cell ──
    const tdTax = document.createElement('td');
    tdTax.className = 'cell-tax';
    const taxInput = document.createElement('input');
    taxInput.type = 'number';
    taxInput.name = 'item_tax_rate';
    taxInput.className = 'line-tax-input';
    taxInput.min = '0';
    taxInput.max = '100';
    taxInput.step = '0.01';
    taxInput.placeholder = '0';
    if (data.tax_rate !== undefined && data.tax_rate !== null && data.tax_rate !== '') {
      taxInput.value = data.tax_rate;
    } else if (taxRateInput && taxRateInput.value !== '') {
      taxInput.value = taxRateInput.value;
    } else {
      taxInput.value = '0';
    }
    tdTax.appendChild(taxInput);

    const tdTotal = document.createElement('td');
    tdTotal.className = 'item-total';
    tdTotal.textContent = formatLineTotal(qtyInput.value, priceInput.value, discTypeSelect.value, Number(discValueInput.value));

    const tdRemove = document.createElement('td');
    tdRemove.className = 'col-remove';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-small btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeRow(tr));
    tdRemove.appendChild(removeBtn);

    tr.appendChild(tdDesc);
    tr.appendChild(tdQty);
    tr.appendChild(tdPrice);
    tr.appendChild(tdDisc);
    tr.appendChild(tdTax);
    tr.appendChild(tdTotal);
    tr.appendChild(tdRemove);

    const recalc = () => {
      tdTotal.textContent = formatLineTotal(qtyInput.value, priceInput.value, discTypeSelect.value, Number(discValueInput.value));
      recalcTotals();
    };
    qtyInput.addEventListener('input', recalc);
    priceInput.addEventListener('input', recalc);
    discValueInput.addEventListener('input', recalc);
    taxInput.addEventListener('input', recalc);

    return tr;
  }

  function addEmptyRow() {
    itemsBody.appendChild(createLineItemRow({}));
    recalcTotals();
  }

  function removeRow(tr) {
    tr.remove();
    if (itemsBody.children.length === 0) {
      addEmptyRow();
    } else {
      recalcTotals();
    }
  }

  // ---------- Discount / tax controls ----------
  function updateDiscountControls() {
    const type = discountTypeSelect.value;
    const isDisabled = type === 'none';
    discountValueInput.disabled = isDisabled;
    if (isDisabled) {
      discountValueInput.value = '';
      discountLabel.textContent = 'Discount';
    } else if (type === 'percent') {
      discountLabel.textContent = 'Discount (%)';
      discountValueInput.placeholder = '0';
      discountValueInput.step = '0.01';
    } else {
      discountLabel.textContent = 'Discount (amount)';
      discountValueInput.placeholder = `0.00 (${currencyCode})`;
      discountValueInput.step = '0.01';
    }
    recalcTotals();
  }

  // ---------- Settings prefill ----------
  function populateCurrencySelect(selectedCode) {
    if (quoteCurrencySelect) {
      window.prepareCurrencySelect(quoteCurrencySelect, selectedCode || defaultCurrencyCode);
    }
    updateExchangeRateVisibility();
  }

  function updateExchangeRateVisibility() {
    if (!quoteExchangeRateField || !quoteCurrencySelect) return;
    const selected = quoteCurrencySelect.value;
    const baseCode = reportingCurrencyCode || defaultCurrencyCode || 'USD';
    const label = quoteExchangeRateField.querySelector('label');
    const hint = quoteExchangeRateField.querySelector('.hint');
    if (label) {
      label.textContent = `Exchange rate (${selected} to base ${baseCode})`;
    }
    if (hint) {
      hint.textContent = `1 ${selected} = [rate] ${baseCode}. Used only for dashboard reporting.`;
    }
    if (selected === baseCode) {
      quoteExchangeRateField.style.display = 'none';
      quoteExchangeRateInput.value = '1';
    } else {
      quoteExchangeRateField.style.display = '';
    }
  }

  if (quoteCurrencySelect) {
    quoteCurrencySelect.addEventListener('change', () => {
      currencyCode = quoteCurrencySelect.value;
      updateExchangeRateVisibility();
      recalcTotals();
    });
  }

  async function prefillFromSettings() {
    try {
      const res = await window.electronAPI.getCompanyProfile();
      if (!res.ok || !res.profile) return;
      const p = res.profile;
      if (p.default_currency) {
        currencyCode = p.default_currency;
        defaultCurrencyCode = p.default_currency;
      }
      if (p.reporting_currency) {
        reportingCurrencyCode = p.reporting_currency;
      } else if (p.default_currency) {
        reportingCurrencyCode = p.default_currency;
      }
      populateCurrencySelect(currencyCode);
      if (p.default_tax_rate !== null && p.default_tax_rate !== undefined && taxRateInput.value === '') {
        taxRateInput.value = p.default_tax_rate;
      }
      if (p.default_terms) {
        if (!termsArea.value.trim()) {
          termsArea.value = p.default_terms;
        }
      }
      updateDiscountControls();
    } catch (e) {
      updateDiscountControls();
    }
  }

  // ---------- Form (new / edit) ----------
  function resetForm() {
    editingQuoteId = null;
    quoteIdInput.value = '';
    form.reset();
    clientSearch.value = '';
    populateClientSelect('');
    if (quoteContactSelect) {
      quoteContactSelect.innerHTML = '<option value="">Default / No specific contact</option>';
    }
    discountTypeSelect.value = 'none';
    updateDiscountControls();
    taxRateInput.value = '';
    termsArea.value = '';
    itemsBody.innerHTML = '';
    currencyCode = defaultCurrencyCode;
    populateCurrencySelect(defaultCurrencyCode);
    if (quoteExchangeRateInput) quoteExchangeRateInput.value = '1';
    updateExchangeRateVisibility();
    setDateDefaults();
    formTitle.textContent = 'New Quote';
  }

  function openNewQuote() {
    resetForm();
    loadClients();
    prefillFromSettings();
    addEmptyRow();
    showFormView();
  }

  async function loadQuoteIntoForm(quote) {
    resetForm();
    editingQuoteId = quote.id;
    quoteIdInput.value = quote.id;

    if (quote.status !== 'draft') {
      const nextV = (quote.version || 1) + 1;
      formTitle.textContent = `Edit ${quote.quote_number} (Creates Revision v${nextV})`;
      saveQuoteBtn.textContent = 'Save as new revision';
    } else {
      formTitle.textContent = `Edit ${quote.quote_number}`;
      saveQuoteBtn.textContent = 'Save quote';
    }

    populateClientSelect('');
    clientSelect.value = String(quote.client_id);
    await populateContactsForClient(quote.client_id, quote.contact_id);

    if (form.elements['date_created']) form.elements['date_created'].value = quote.date_created || '';
    if (form.elements['valid_until']) form.elements['valid_until'].value = quote.valid_until || '';

    discountTypeSelect.value = quote.discount_type || 'none';
    discountValueInput.value = quote.discount_value || '';
    taxRateInput.value = quote.tax_rate || '';
    termsArea.value = quote.terms || '';

    // Set currency & exchange rate from saved quote
    if (quote.currency) {
      currencyCode = quote.currency;
      populateCurrencySelect(quote.currency);
    }
    if (quoteExchangeRateInput) {
      quoteExchangeRateInput.value = quote.exchange_rate || 1;
    }
    updateExchangeRateVisibility();

    itemsBody.innerHTML = '';
    for (const item of quote.line_items || []) {
      itemsBody.appendChild(createLineItemRow({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_type: item.discount_type || 'none',
        discount_value: item.discount_value || 0,
        tax_rate: item.tax_rate !== undefined && item.tax_rate !== null ? item.tax_rate : 0,
      }));
    }
    if (!itemsBody.children.length) addEmptyRow();

    updateDiscountControls();
    recalcTotals();
    showFormView();
  }

  function validateForm() {
    if (!clientSelect.value) {
      showFieldError('client_id', 'Please select a client.');
      return false;
    }
    clearFieldError('client_id');

    const rows = Array.from(itemsBody.querySelectorAll('tr.item-row'));
    if (rows.length === 0) {
      toast('Add at least one line item.', 'error');
      return false;
    }
    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const desc = tr.querySelector('input[name="item_description"]').value.trim();
      const qty = tr.querySelector('input[name="item_quantity"]').value;
      const priceStr = tr.querySelector('input[name="item_unit_price"]').value;
      const qtyNum = Number(qty);
      const priceNum = Number(priceStr);
      if (!desc) {
        toast(`Line item ${i + 1} is missing a description.`, 'error');
        return false;
      }
      if (qty.trim() === '' || isNaN(qtyNum) || !(qtyNum > 0)) {
        toast(`Line item ${i + 1} must have a quantity greater than zero.`, 'error');
        return false;
      }
      if (priceStr.trim() === '' || isNaN(priceNum) || !(priceNum > 0)) {
        toast(`Line item ${i + 1} must have a unit price greater than zero.`, 'error');
        return false;
      }
      if (countDecimals(priceStr) > 2) {
        toast(`Line item ${i + 1} unit price may only have up to 2 decimal places.`, 'error');
        return false;
      }
    }

    const dateCreated = form.elements['date_created'].value;
    const validUntil = form.elements['valid_until'].value;
    if (!dateCreated) {
      showFieldError('date_created', 'Quote date is required.');
      return false;
    }
    clearFieldError('date_created');
    if (validUntil && dateCreated && validUntil < dateCreated) {
      showFieldError('valid_until', 'Expiry date cannot be before the quote date.');
      return false;
    }
    clearFieldError('valid_until');

    const taxRateVal = taxRateInput.value;
    if (taxRateVal !== '') {
      const taxRateNum = Number(taxRateVal);
      if (isNaN(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) {
        showFieldError('tax_rate', 'Tax rate must be a number between 0 and 100.');
        return false;
      }
    }
    clearFieldError('tax_rate');

    if (discountTypeSelect.value !== 'none') {
      const discVal = discountValueInput.value;
      const discNum = Number(discVal);
      const isPercent = discountTypeSelect.value === 'percent';
      if (discVal === '' || isNaN(discNum) || discNum < 0 || (isPercent && discNum > 100)) {
        showFieldError('discount_value', isPercent
          ? 'Percentage discount must be between 0 and 100.'
          : 'Discount cannot be negative.');
        return false;
      }
      if (!isPercent && countDecimals(discVal) > 2) {
        showFieldError('discount_value', 'Discount amount may only have up to 2 decimal places.');
        return false;
      }
    }
    clearFieldError('discount_value');
    return true;
  }

  function showFieldError(field, message) {
    const el = form.elements[field];
    if (el) el.classList.add('invalid');
    const errEl = document.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = message || '';
  }

  function clearFieldError(field) {
    const el = form.elements[field];
    if (el) el.classList.remove('invalid');
    const errEl = document.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = '';
  }

  function collectQuoteData() {
    const subtotalCents = totalCentsOfCurrentRows();
    const discountCents = docDiscountCentsOfCurrentRows();
    const { totalTaxCents } = taxBreakdownOfCurrentRows();
    const grandCents = subtotalCents - discountCents + totalTaxCents;

    const lineItems = Array.from(itemsBody.querySelectorAll('tr.item-row')).map((tr) => {
      const qty = Number(tr.querySelector('input[name="item_quantity"]').value);
      const price = Number(tr.querySelector('input[name="item_unit_price"]').value);
      const dType = tr.querySelector('select[name="item_discount_type"]').value;
      const dVal = Number(tr.querySelector('input[name="item_discount_value"]').value) || 0;
      const itemTax = Number(tr.querySelector('input[name="item_tax_rate"]').value) || 0;
      const rawCents = lineRawCents(qty, price);
      const discCents = lineDiscountCents(rawCents, dType, dVal);
      return {
        description: tr.querySelector('input[name="item_description"]').value.trim(),
        quantity: qty,
        unit_price: price,
        tax_rate: itemTax,
        discount_type: dType,
        discount_value: dType === 'none' ? 0 : dVal,
        discount_amount: centsToValue(discCents),
        amount: centsToValue(rawCents - discCents),
      };
    });

    return {
      data: {
        client_id: clientSelect.value,
        contact_id: quoteContactSelect && quoteContactSelect.value ? Number(quoteContactSelect.value) : null,
        date_created: form.elements['date_created'].value,
        valid_until: form.elements['valid_until'].value,
        discount_type: discountTypeSelect.value,
        discount_value: discountTypeSelect.value === 'none' ? 0 : Number(discountValueInput.value),
        tax_rate: Number(taxRateInput.value) || 0,
        subtotal: centsToValue(subtotalCents),
        discount: centsToValue(discountCents),
        tax: centsToValue(totalTaxCents),
        total: centsToValue(grandCents),
        currency: quoteCurrencySelect ? quoteCurrencySelect.value : currencyCode,
        exchange_rate: quoteExchangeRateInput ? Number(quoteExchangeRateInput.value) || 1.0 : 1.0,
        notes: '',
        terms: termsArea.value,
      },
      lineItems,
    };
  }

  async function handleSave() {
    if (!validateForm()) return;
    const { data, lineItems } = collectQuoteData();
    saveQuoteBtn.disabled = true;
    try {
      const res = editingQuoteId === null
        ? await window.electronAPI.createQuote(data, lineItems)
        : await window.electronAPI.updateQuote(editingQuoteId, data, lineItems);

      if (res.ok) {
        if (res.isRevision) {
          toast(`Revision ${res.quote.quote_number} created as Draft.`, 'success');
        } else {
          toast(editingQuoteId === null
            ? `Quote ${res.quote.quote_number} saved as Draft.`
            : 'Quote updated.', 'success');
        }
        await loadQuotes();
        openDetail(res.quote.id);
      } else {
        if (res.errors && res.errors.general) toast(res.errors.general, 'error');
        else if (res.errors) {
          for (const [field, msg] of Object.entries(res.errors)) {
            if (field === 'general') toast(msg, 'error');
            else showFieldError(field, msg);
          }
        } else {
          toast('Could not save quote.', 'error');
        }
      }
    } catch (e) {
      toast('Could not save quote: ' + e.message, 'error');
    } finally {
      saveQuoteBtn.disabled = false;
    }
  }

  // ---------- List ----------
  function clientDisplayName(client) {
    if (!client) return '—';
    return client.company_name ? `${client.name} (${client.company_name})` : client.name;
  }

  function formatQuoteStatus(status) {
    const map = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
    return map[status] || status;
  }

  // Expired is calculated, not stored: past valid_until and not accepted.
  function effectiveStatus(quote) {
    if (quote.status === 'accepted') return 'accepted';
    if (quote.valid_until) {
      const expiry = new Date(quote.valid_until + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiry < today) return 'expired';
    }
    return quote.status;
  }

  function statusSelectOptions(selected) {
    return ['draft', 'sent', 'accepted', 'declined']
      .map((s) => `<option value="${s}"${s === selected ? ' selected' : ''}>${formatQuoteStatus(s)}</option>`)
      .join('');
  }

  function buildStatusCell(quote) {
    const cell = document.createElement('td');
    const eff = effectiveStatus(quote);
    if (eff === 'expired') {
      const badge = document.createElement('span');
      badge.className = 'badge status-expired';
      badge.textContent = 'Expired';
      cell.appendChild(badge);
      return cell;
    }
    const select = document.createElement('select');
    select.className = 'status-select';
    select.innerHTML = statusSelectOptions(quote.status);
    select.addEventListener('change', () => {
      changeStatus(quote.id, select.value);
    });
    cell.appendChild(select);
    return cell;
  }

  function matchesSearch(quote, q) {
    if (!q) return true;
    const hay = `${quote.quote_number || ''} ${clientDisplayName(quote.client)}`.toLowerCase();
    return hay.includes(q);
  }

  function renderQuoteList() {
    let filtered = quotes.slice();

    const q = searchTerm.trim().toLowerCase();
    if (q || statusFilter !== 'all') {
      filtered = filtered.filter((quote) => {
        if (q && !matchesSearch(quote, q)) return false;
        if (statusFilter !== 'all') {
          if (effectiveStatus(quote) !== statusFilter) return false;
        }
        return true;
      });
    }

    if (sortBy === 'total') {
      filtered.sort((a, b) => Number(b.total) - Number(a.total));
    } else {
      filtered.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
    }

    if (filtered.length === 0) {
      if (quotes.length === 0) {
        quoteList.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'quotes',
          title: 'No quotes yet',
          message: 'Create your first quote to send a professional estimate to a client.',
          actionLabel: '+ New Quote',
        });
        const action = quoteList.querySelector('[data-empty-action]');
        if (action) action.addEventListener('click', openNewQuote);
      } else {
        quoteList.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'search',
          title: 'No matching quotes',
          message: 'Nothing matches your search or status filter. Try different terms or clear the filters.',
          actionLabel: 'Clear filters',
        });
        const action = quoteList.querySelector('[data-empty-action]');
        if (action) {
          action.addEventListener('click', () => {
            quoteSearch.value = '';
            searchTerm = '';
            quoteStatusFilter.value = 'all';
            statusFilter = 'all';
            renderQuoteList();
          });
        }
      }
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>' +
      '<th>Number</th>' +
      '<th>Client</th>' +
      '<th>Date</th>' +
      '<th>Total</th>' +
      '<th>Status</th>' +
      '<th class="th-actions">Actions</th>' +
      '</tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const q of filtered) {
      const tr = document.createElement('tr');

      const numTd = document.createElement('td');
      numTd.className = 'cell-name';
      numTd.textContent = q.quote_number;

      const clientTd = document.createElement('td');
      clientTd.textContent = clientDisplayName(q.client);

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(q.date_created);

      const totalTd = document.createElement('td');
      totalTd.textContent = window.QuoteCraftUtils.formatCurrency(q.total, q.currency || currencyCode);

      const statusTd = buildStatusCell(q);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'cell-actions';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-small btn-secondary';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => openDetail(q.id));
      actionsTd.appendChild(viewBtn);

      tr.appendChild(numTd);
      tr.appendChild(clientTd);
      tr.appendChild(dateTd);
      tr.appendChild(totalTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    quoteList.innerHTML = '';
    quoteList.appendChild(table);
  }

  async function loadQuotes() {
    try {
      const res = await window.electronAPI.listQuotes();
      if (res.ok) {
        quotes = res.quotes || [];
        renderQuoteList();
      } else {
        toast('Could not load quotes.', 'error');
      }
    } catch (e) {
      toast('Could not load quotes: ' + e.message, 'error');
    }
  }

  async function changeStatus(id, status) {
    try {
      const res = await window.electronAPI.setQuoteStatus(id, status);
      if (res.ok) {
        toast(`Quote marked as ${formatQuoteStatus(status)}.`, 'success');
        await loadQuotes();
        if (currentDetailId === id) {
          const d = await window.electronAPI.getQuote(id);
          if (d.ok) renderDetail(d.quote);
        }
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not update status.', 'error');
        await loadQuotes();
      }
    } catch (e) {
      toast('Could not update status: ' + e.message, 'error');
      await loadQuotes();
    }
  }

  // ---------- Detail (read-only) ----------
  async function openDetail(id) {
    currentDetailId = id;
    try {
      const res = await window.electronAPI.getQuote(id);
      if (!res.ok) {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not load quote.', 'error');
        return;
      }
      renderDetail(res.quote);
      showDetailView();
    } catch (e) {
      toast('Could not load quote: ' + e.message, 'error');
    }
  }

  function renderDetail(q) {
    document.getElementById('detailQuoteNumber').textContent = q.quote_number;
    const eff = effectiveStatus(q);
    const statusBadge = document.getElementById('detailQuoteStatus');
    statusBadge.textContent = formatQuoteStatus(eff);
    statusBadge.className = 'badge status-' + eff;

    detailStatusSelect.value = eff === 'expired' ? 'draft' : q.status;
    detailStatusSelect.style.display = eff === 'expired' ? 'none' : '';
    detailStatusSelect.title = eff === 'expired'
      ? 'This quote has passed its expiry date and has not been accepted, so it is shown as Expired.'
      : '';

    document.getElementById('detailClient').textContent = clientDisplayName(q.client);
    const contactEl = document.getElementById('detailContact');
    if (contactEl) {
      if (q.contact) {
        contactEl.textContent = q.contact.name + (q.contact.role ? ` (${q.contact.role})` : '');
      } else {
        contactEl.textContent = '—';
      }
    }
    document.getElementById('detailDate').textContent = window.QuoteCraftUtils.formatDate(q.date_created);
    document.getElementById('detailExpiry').textContent = window.QuoteCraftUtils.formatDate(q.valid_until);

    const currency = q.currency || currencyCode;
    const detailCurrencyEl = document.getElementById('detailCurrency');
    if (detailCurrencyEl) {
      const cObj = (window.CURRENCIES || []).find(c => c.code === currency);
      detailCurrencyEl.textContent = cObj ? `${currency} (${cObj.symbol})` : currency;
    }
    const itemsBody = document.getElementById('detailItemsBody');
    itemsBody.innerHTML = '';
    for (const item of q.line_items || []) {
      const tr = document.createElement('tr');
      tr.className = 'item-row';
      const tdDesc = document.createElement('td');
      tdDesc.textContent = item.description;
      const tdQty = document.createElement('td');
      tdQty.textContent = item.quantity;
      const tdPrice = document.createElement('td');
      tdPrice.textContent = window.QuoteCraftUtils.formatCurrency(item.unit_price, currency);
      const tdDisc = document.createElement('td');
      tdDisc.textContent = formatLineDiscountLabel(item.discount_type, item.discount_value, currency);
      const tdTax = document.createElement('td');
      tdTax.textContent = Number(item.tax_rate) > 0 ? `${item.tax_rate}%` : '0% (Exempt)';
      const tdTotal = document.createElement('td');
      tdTotal.className = 'item-total';
      tdTotal.textContent = window.QuoteCraftUtils.formatCurrency(item.amount, currency);
      tr.appendChild(tdDesc);
      tr.appendChild(tdQty);
      tr.appendChild(tdPrice);
      tr.appendChild(tdDisc);
      tr.appendChild(tdTax);
      tr.appendChild(tdTotal);
      itemsBody.appendChild(tr);
    }

    document.getElementById('detailSubtotal').textContent = window.QuoteCraftUtils.formatCurrency(q.subtotal, currency);
    document.getElementById('detailDiscount').textContent = window.QuoteCraftUtils.formatCurrency(q.discount_amount, currency);

    // Render detail tax breakdown
    const detailBreakdownEl = document.getElementById('detailTaxBreakdown');
    const { list: detailList, totalTaxCents: detailTaxTotal } = computeTaxBreakdown(q.line_items, q.subtotal, q.discount_amount);
    renderTaxBreakdown(detailBreakdownEl, detailList, detailTaxTotal, currency);

    document.getElementById('detailTotal').textContent = window.QuoteCraftUtils.formatCurrency(q.total, currency);
    document.getElementById('detailTerms').textContent = q.terms || '—';

    // Version history banner & older revision alert
    const versionBanner = document.getElementById('quoteVersionBanner');
    const versionList = document.getElementById('quoteVersionList');
    const oldNotice = document.getElementById('quoteOldVersionNotice');

    const history = q.version_history || [];
    if (history.length > 1) {
      versionBanner.classList.remove('hidden');
      versionList.innerHTML = '';
      let latestItem = history[0];
      history.forEach((v) => {
        if (v.is_latest) latestItem = v;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'version-pill' + (v.id === q.id ? ' active' : '');
        const statusStr = v.status ? ` · ${formatQuoteStatus(v.status)}` : '';
        const latestTag = v.is_latest ? ' (Latest)' : '';
        pill.textContent = `v${v.version}${statusStr}${latestTag}`;
        pill.addEventListener('click', () => openDetail(v.id));
        versionList.appendChild(pill);
      });

      if (!q.is_latest && latestItem) {
        oldNotice.classList.remove('hidden');
        oldNotice.innerHTML = `
          <span>You are viewing an older revision (<strong>v${q.version}</strong>). The latest active revision is <strong>v${latestItem.version}</strong>.</span>
          <button type="button" class="btn btn-small btn-primary" id="btnViewLatestVersion">View Latest (v${latestItem.version})</button>
        `;
        const viewLatestBtn = oldNotice.querySelector('#btnViewLatestVersion');
        if (viewLatestBtn) {
          viewLatestBtn.addEventListener('click', () => openDetail(latestItem.id));
        }
      } else {
        oldNotice.classList.add('hidden');
        oldNotice.innerHTML = '';
      }
    } else {
      versionBanner.classList.add('hidden');
      oldNotice.classList.add('hidden');
    }

    // Allow editing any quote; if non-draft, editing creates a revision
    detailEditBtn.style.display = '';
    detailEditBtn.textContent = q.status === 'draft' ? 'Edit' : 'Edit (Create Revision)';

    detailConvertBtn.disabled = q.status !== 'accepted';
    if (q.status === 'accepted') {
      hideConvertResult();
    } else {
      showConvertResult('Only an accepted quote can be converted to an invoice.', 'hint');
    }

    // Last sent metadata display
    const sentRow = document.getElementById('quoteDetailSentRow');
    const sentVal = document.getElementById('quoteDetailSent');
    if (sentRow && sentVal) {
      if (q.last_sent_at) {
        sentRow.style.display = '';
        const dt = new Date(q.last_sent_at);
        const dateStr = isNaN(dt.getTime()) ? q.last_sent_at : dt.toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        sentVal.textContent = `${dateStr} to ${q.last_sent_to || 'Recipient'}`;
      } else {
        sentRow.style.display = 'none';
        sentVal.textContent = '—';
      }
    }

    currentDetailQuote = q;

    // Mark as Accepted button visibility
    if (detailMarkAcceptedBtn) {
      detailMarkAcceptedBtn.style.display = q.status === 'accepted' ? 'none' : '';
    }

    // Acceptance Paper Trail card
    const acceptMethodLabels = {
      email: 'Email reply',
      phone: 'Phone call / Verbal confirmation',
      signed_document: 'Signed document / PDF',
      purchase_order: 'Purchase Order (PO)',
      in_person: 'In-person confirmation',
      other: 'Direct confirmation',
    };

    if (q.status === 'accepted') {
      if (quoteAcceptanceCard) {
        quoteAcceptanceCard.classList.remove('hidden');
        if (quoteAcceptanceDate) quoteAcceptanceDate.textContent = window.QuoteCraftUtils.formatDate(q.date_accepted);
        if (quoteAcceptanceMethod) quoteAcceptanceMethod.textContent = acceptMethodLabels[q.acceptance_method] || q.acceptance_method || 'Direct confirmation';
        if (quoteAcceptedBy) quoteAcceptedBy.textContent = q.accepted_by || (q.contact ? q.contact.name : clientDisplayName(q.client));
        if (quoteAcceptanceNoteRow && quoteAcceptanceNote) {
          if (q.acceptance_note) {
            quoteAcceptanceNoteRow.classList.remove('hidden');
            quoteAcceptanceNote.textContent = q.acceptance_note;
          } else {
            quoteAcceptanceNoteRow.classList.add('hidden');
            quoteAcceptanceNote.textContent = '—';
          }
        }
      }
    } else {
      if (quoteAcceptanceCard) quoteAcceptanceCard.classList.add('hidden');
    }

    // Declined Card
    if (q.status === 'declined') {
      if (quoteDeclinedCard) {
        quoteDeclinedCard.classList.remove('hidden');
        if (quoteDeclinedNote) quoteDeclinedNote.textContent = q.acceptance_note || 'Declined by client.';
      }
    } else {
      if (quoteDeclinedCard) quoteDeclinedCard.classList.add('hidden');
    }

    // Email Activity history list
    const emailListEl = document.getElementById('quoteEmailActivityList');
    if (window.QuoteCraftDocumentEmail && emailListEl) {
      window.QuoteCraftDocumentEmail.renderEmailActivityList(emailListEl, q.email_logs);
    }
  }

  // ---------- Convert to invoice Modal & Logic ----------
  function showConvertResult(message, type) {
    detailConvertResult.textContent = message;
    detailConvertResult.className = 'convert-notice ' + (type === 'ok' ? 'notice-ok' : 'notice-hint');
  }

  function hideConvertResult() {
    detailConvertResult.className = 'convert-notice hidden';
    detailConvertResult.textContent = '';
  }

  function updateConvertDepositPreview() {
    if (!currentConvertQuote) return;
    const total = Number(currentConvertQuote.total) || 0;
    const curr = currentConvertQuote.currency || currencyCode;
    const depType = convertDepositType.value;
    const rawVal = parseFloat(convertDepositValue.value) || 0;

    let depAmount = 0;
    if (depType === 'percent') {
      convertDepositValueLabel.textContent = 'Deposit Percentage (%)';
      convertDepositValue.placeholder = 'e.g. 30';
      convertDepositValue.max = '99.99';
      depAmount = Math.round((total * (rawVal / 100)) * 100) / 100;
    } else {
      convertDepositValueLabel.textContent = `Deposit Amount (${curr})`;
      convertDepositValue.placeholder = '0.00';
      convertDepositValue.removeAttribute('max');
      depAmount = Math.round(rawVal * 100) / 100;
    }

    const remainder = Math.max(0, Math.round((total - depAmount) * 100) / 100);

    depositSummaryQuoteTotal.textContent = window.QuoteCraftUtils.formatCurrency(total, curr);
    depositSummaryDueNow.textContent = window.QuoteCraftUtils.formatCurrency(depAmount, curr);
    depositSummaryRemainder.textContent = window.QuoteCraftUtils.formatCurrency(remainder, curr);
  }

  async function handleOpenConvertModal() {
    if (!currentDetailId) return;
    try {
      const res = await window.electronAPI.getQuote(currentDetailId);
      if (!res.ok || !res.quote) {
        toast('Could not load quote details.', 'error');
        return;
      }
      currentConvertQuote = res.quote;
      const curr = currentConvertQuote.currency || currencyCode;
      const total = Number(currentConvertQuote.total) || 0;

      convertFullQuoteTotalDisplay.textContent = window.QuoteCraftUtils.formatCurrency(total, curr);

      // Reset form
      convertQuoteForm.elements['conversion_type'].value = 'full';
      convertDepositSection.classList.add('hidden');
      convertDepositType.value = 'percent';
      convertDepositValue.value = '30';
      updateConvertDepositPreview();

      convertQuoteModal.classList.remove('hidden');
    } catch (e) {
      toast('Error opening convert dialog: ' + e.message, 'error');
    }
  }

  function closeConvertModal() {
    convertQuoteModal.classList.add('hidden');
    currentConvertQuote = null;
  }

  async function handleConvertSubmit(e) {
    e.preventDefault();
    if (!currentConvertQuote || !currentDetailId) return;

    const conversionType = convertQuoteForm.elements['conversion_type'].value;
    const depositType = convertDepositType.value;
    const depositValue = parseFloat(convertDepositValue.value);

    if (conversionType === 'deposit') {
      if (!(depositValue > 0)) {
        toast('Please enter a valid deposit percentage or amount.', 'error');
        return;
      }
      const total = Number(currentConvertQuote.total) || 0;
      if (depositType === 'percent' && depositValue >= 100) {
        toast('Deposit percentage must be less than 100%. Choose Full Invoice for 100%.', 'error');
        return;
      }
      if (depositType === 'fixed' && depositValue >= total) {
        toast('Deposit amount must be less than the quote total.', 'error');
        return;
      }
    }

    convertQuoteSubmitBtn.disabled = true;
    try {
      const res = await window.electronAPI.convertQuoteToInvoice(currentDetailId, {
        conversion_type: conversionType,
        deposit_type: depositType,
        deposit_value: depositValue,
      });

      if (res.ok) {
        closeConvertModal();
        const typeLabel = res.invoice.invoice_type === 'deposit' ? 'Deposit Invoice' : 'Invoice';
        showConvertResult(`${typeLabel} ${res.invoice.invoice_number} created from this quote.`, 'ok');
        toast(`${typeLabel} ${res.invoice.invoice_number} created successfully.`, 'success');
        await loadQuotes();
        openDetail(currentDetailId);
      } else {
        if (res.invoice) {
          closeConvertModal();
          showConvertResult(`This quote has already been converted — invoice ${res.invoice.invoice_number}.`, 'hint');
        } else {
          toast(res.errors && res.errors.general ? res.errors.general : 'Could not convert quote.', 'error');
        }
      }
    } catch (err) {
      toast('Could not convert quote: ' + err.message, 'error');
    } finally {
      convertQuoteSubmitBtn.disabled = false;
    }
  }

  // Convert modal radio changes
  convertQuoteForm.elements['conversion_type'].forEach?.((radio) => {
    radio.addEventListener('change', () => {
      if (convertQuoteForm.elements['conversion_type'].value === 'deposit') {
        convertDepositSection.classList.remove('hidden');
        updateConvertDepositPreview();
      } else {
        convertDepositSection.classList.add('hidden');
      }
    });
  });

  convertDepositType.addEventListener('change', updateConvertDepositPreview);
  convertDepositValue.addEventListener('input', updateConvertDepositPreview);
  convertQuoteForm.addEventListener('submit', handleConvertSubmit);
  convertQuoteModalClose.addEventListener('click', closeConvertModal);
  convertQuoteCancelBtn.addEventListener('click', closeConvertModal);

  // ---------- Events ----------
  newQuoteBtn.addEventListener('click', openNewQuote);
  quotesBackBtn.addEventListener('click', () => { loadQuotes(); showListView(); });
  detailBackBtn.addEventListener('click', () => { loadQuotes(); showListView(); });
  detailEditBtn.addEventListener('click', async () => {
    if (!currentDetailId) return;
    try {
      const res = await window.electronAPI.getQuote(currentDetailId);
      if (!res.ok) {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not load quote.', 'error');
        return;
      }
      loadQuoteIntoForm(res.quote);
    } catch (e) {
      toast('Could not load quote: ' + e.message, 'error');
    }
  });

  addLineItemBtn.addEventListener('click', addEmptyRow);

  clientSearch.addEventListener('input', () => {
    populateClientSelect(clientSearch.value);
  });

  clientSelect.addEventListener('change', () => {
    clearFieldError('client_id');
    populateContactsForClient(clientSelect.value);
  });

  discountTypeSelect.addEventListener('change', () => {
    updateDiscountControls();
    clearFieldError('discount_value');
  });
  discountValueInput.addEventListener('input', () => {
    recalcTotals();
    clearFieldError('discount_value');
  });
  taxRateInput.addEventListener('input', () => {
    recalcTotals();
    clearFieldError('tax_rate');
  });
  form.elements['date_created'].addEventListener('input', () => clearFieldError('date_created'));
  form.elements['valid_until'].addEventListener('input', () => clearFieldError('valid_until'));
  saveQuoteBtn.addEventListener('click', handleSave);

  quoteSearch.addEventListener('input', () => {
    searchTerm = quoteSearch.value;
    renderQuoteList();
  });

  quoteStatusFilter.addEventListener('change', () => {
    statusFilter = quoteStatusFilter.value;
    renderQuoteList();
  });

  quoteSort.addEventListener('change', () => {
    sortBy = quoteSort.value;
    renderQuoteList();
  });

  detailStatusSelect.addEventListener('change', () => {
    if (!currentDetailId) return;
    const chosen = detailStatusSelect.value;
    if (chosen === 'accepted') {
      if (currentDetailQuote) {
        detailStatusSelect.value = currentDetailQuote.status;
      }
      openAcceptModal(currentDetailQuote);
      return;
    }
    changeStatus(currentDetailId, chosen);
  });

  if (detailMarkAcceptedBtn) {
    detailMarkAcceptedBtn.addEventListener('click', () => {
      if (!currentDetailQuote) return;
      openAcceptModal(currentDetailQuote);
    });
  }

  // ---------- Mark Quote Accepted Modal logic ----------
  function openAcceptModal(q) {
    if (!q) return;
    if (quoteAcceptDate) {
      quoteAcceptDate.value = new Date().toISOString().slice(0, 10);
    }
    if (quoteAcceptedByInput) {
      quoteAcceptedByInput.value = (q.contact && q.contact.name) || (q.client && q.client.name) || '';
    }
    if (quoteAcceptMethod) {
      quoteAcceptMethod.value = 'email';
    }
    if (quoteAcceptNote) {
      quoteAcceptNote.value = '';
    }
    if (quoteAcceptModal) {
      quoteAcceptModal.classList.remove('hidden');
    }
  }

  function closeAcceptModal() {
    if (quoteAcceptModal) {
      quoteAcceptModal.classList.add('hidden');
    }
  }

  if (quoteAcceptQuickTags) {
    quoteAcceptQuickTags.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-tag-btn');
      if (!btn) return;
      const tag = btn.getAttribute('data-tag');
      if (!tag) return;
      if (quoteAcceptNote) {
        const current = quoteAcceptNote.value.trim();
        quoteAcceptNote.value = current ? `${current}\n${tag}` : tag;
        quoteAcceptNote.focus();
      }
    });
  }

  if (quoteAcceptForm) {
    quoteAcceptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentDetailId) return;
      const method = quoteAcceptMethod ? quoteAcceptMethod.value : 'email';
      const date_accepted = quoteAcceptDate && quoteAcceptDate.value ? quoteAcceptDate.value : new Date().toISOString().slice(0, 10);
      const accepted_by = quoteAcceptedByInput ? quoteAcceptedByInput.value.trim() : '';
      const note = quoteAcceptNote ? quoteAcceptNote.value.trim() : '';

      window.QuoteCraftUtils.showBusy('Marking quote accepted…');
      try {
        const res = await window.electronAPI.markQuoteAccepted(currentDetailId, {
          method,
          date_accepted,
          accepted_by,
          note,
        });
        if (res.ok) {
          toast('Quote marked as Accepted with verified paper trail.', 'success');
          closeAcceptModal();
          await loadQuotes();
          if (currentDetailId) {
            const d = await window.electronAPI.getQuote(currentDetailId);
            if (d.ok && d.quote) renderDetail(d.quote);
          }
        } else {
          toast(res.errors && res.errors.general ? res.errors.general : 'Could not accept quote.', 'error');
        }
      } catch (err) {
        toast('Error accepting quote: ' + err.message, 'error');
      } finally {
        window.QuoteCraftUtils.hideBusy();
      }
    });
  }

  if (quoteAcceptModalClose) quoteAcceptModalClose.addEventListener('click', closeAcceptModal);
  if (quoteAcceptCancelBtn) quoteAcceptCancelBtn.addEventListener('click', closeAcceptModal);
  if (quoteAcceptModal) {
    quoteAcceptModal.addEventListener('click', (e) => {
      if (e.target === quoteAcceptModal) closeAcceptModal();
    });
  }

  // ---------- Share Quote Modal logic ----------
  async function openShareModal(q) {
    if (!q) return;
    let instructions = q.acceptance_instructions;
    if (!instructions) {
      try {
        const prof = await window.electronAPI.getCompanyProfile();
        if (prof && prof.profile && prof.profile.default_quote_acceptance_instructions) {
          instructions = prof.profile.default_quote_acceptance_instructions;
        }
      } catch (e) {
        // ignore
      }
    }
    if (!instructions) {
      instructions = 'To accept this quote, please reply to confirm via email or phone.';
    }

    if (shareInstructionsText) {
      shareInstructionsText.textContent = instructions;
    }
    if (shareQuoteModal) {
      shareQuoteModal.classList.remove('hidden');
    }
  }

  function closeShareModal() {
    if (shareQuoteModal) {
      shareQuoteModal.classList.add('hidden');
    }
  }

  if (detailShareQuoteBtn) {
    detailShareQuoteBtn.addEventListener('click', () => {
      if (!currentDetailQuote) return;
      openShareModal(currentDetailQuote);
    });
  }

  if (shareQuoteModalClose) shareQuoteModalClose.addEventListener('click', closeShareModal);
  if (shareQuoteModalCloseBtn) shareQuoteModalCloseBtn.addEventListener('click', closeShareModal);
  if (shareQuoteModal) {
    shareQuoteModal.addEventListener('click', (e) => {
      if (e.target === shareQuoteModal) closeShareModal();
    });
  }

  if (btnShareDownloadPdf) {
    btnShareDownloadPdf.addEventListener('click', () => {
      closeShareModal();
      detailExportBtn.click();
    });
  }

  if (btnShareDownloadHtml) {
    btnShareDownloadHtml.addEventListener('click', async () => {
      if (!currentDetailId) return;
      window.QuoteCraftUtils.showBusy('Exporting shareable HTML quote…');
      try {
        const res = await window.electronAPI.exportShareableQuoteHtml(currentDetailId);
        if (res.ok && res.cancelled) return;
        if (res.ok) {
          toast('Shareable HTML quote saved to ' + res.savedPath, 'success');
          closeShareModal();
        } else {
          toast(res.errors && res.errors.general ? res.errors.general : 'Could not export HTML quote.', 'error');
        }
      } catch (e) {
        toast('Could not export HTML quote: ' + e.message, 'error');
      } finally {
        window.QuoteCraftUtils.hideBusy();
      }
    });
  }

  if (btnShareSendEmail) {
    btnShareSendEmail.addEventListener('click', () => {
      closeShareModal();
      if (detailSendEmailBtn) detailSendEmailBtn.click();
    });
  }

  if (btnCopyShareInstructions) {
    btnCopyShareInstructions.addEventListener('click', async () => {
      const text = shareInstructionsText ? shareInstructionsText.textContent : '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast('Acceptance instructions copied to clipboard!', 'success');
      } catch (e) {
        toast('Could not copy to clipboard: ' + e.message, 'error');
      }
    });
  }

  detailConvertBtn.addEventListener('click', handleOpenConvertModal);

  window.addEventListener('qc-open-quote', (e) => {
    if (e.detail) openDetail(e.detail);
  });

  detailExportBtn.addEventListener('click', async () => {
    if (!currentDetailId) return;
    detailExportBtn.disabled = true;
    window.QuoteCraftUtils.showBusy('Generating PDF\u2026');
    try {
      const res = await window.electronAPI.exportQuotePdf(currentDetailId);
      if (res.ok && res.cancelled) return;
      if (res.ok) {
        toast('PDF saved to ' + res.savedPath, 'success');
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not export PDF.', 'error');
      }
    } catch (e) {
      toast('Could not export PDF: ' + e.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
      detailExportBtn.disabled = false;
    }
  });

  if (detailSendEmailBtn) {
    detailSendEmailBtn.addEventListener('click', async () => {
      if (!currentDetailId) return;
      try {
        const res = await window.electronAPI.getQuote(currentDetailId);
        if (!res.ok || !res.quote) {
          toast('Quote not found.', 'error');
          return;
        }
        if (window.QuoteCraftDocumentEmail) {
          window.QuoteCraftDocumentEmail.openSendModal({
            documentType: 'quote',
            documentId: currentDetailId,
            doc: res.quote,
            onSuccess: async () => {
              await loadQuotes();
              if (currentDetailId) {
                const updated = await window.electronAPI.getQuote(currentDetailId);
                if (updated.ok && updated.quote) {
                  renderDetail(updated.quote);
                }
              }
            },
          });
        }
      } catch (err) {
        toast('Could not initiate email: ' + err.message, 'error');
      }
    });
  }

  if (quoteLibrarySelect) {
    quoteLibrarySelect.addEventListener('change', () => {
      const selectedId = Number(quoteLibrarySelect.value);
      if (!selectedId) return;
      const item = libraryItems.find((i) => i.id === selectedId);
      if (item) {
        const desc = item.description && item.description.trim()
          ? `${item.name} - ${item.description}`
          : item.name;
        const row = createLineItemRow({
          description: desc,
          quantity: 1,
          unit_price: item.unit_price,
          tax_rate: (item.default_tax_rate !== null && item.default_tax_rate !== undefined) ? item.default_tax_rate : (taxRateInput.value || 0),
        });
        itemsBody.appendChild(row);
        recalcTotals();
      }
      quoteLibrarySelect.value = '';
    });
  }

  window.addEventListener('qc-library-updated', () => {
    loadLibraryItems();
  });

  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'quotes') {
      loadLibraryItems();
      loadClients();
    }
  });

  // ---------- Init ----------
  async function init() {
    await Promise.all([loadClients(), loadQuotes(), loadLibraryItems()]);
    prefillFromSettings();
    showListView();
  }

  init();
})();
