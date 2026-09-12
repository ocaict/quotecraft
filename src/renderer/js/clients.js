(function () {
  const section = document.getElementById('page-clients');
  if (!section) return;

  const listView = document.getElementById('clientListView');
  const overviewView = document.getElementById('clientOverviewView');
  const listEl = document.getElementById('clientList');

  const modal = document.getElementById('clientModal');
  const form = document.getElementById('clientForm');
  const modalTitle = document.getElementById('clientModalTitle');
  const submitBtn = document.getElementById('clientSubmitBtn');
  const searchInput = document.getElementById('clientSearch');
  const sortSelect = document.getElementById('clientSort');
  const tagFilterSelect = document.getElementById('clientTagFilter');
  const addBtn = document.getElementById('addClientBtn');

  const deleteDialog = document.getElementById('clientDeleteDialog');
  const deleteMessage = document.getElementById('clientDeleteMessage');

  // Contacts sub-section elements inside modal
  const contactRowsList = document.getElementById('contactRowsList');
  const addContactRowBtn = document.getElementById('addContactRowBtn');

  // Overview elements
  const overviewClientName = document.getElementById('overviewClientName');
  const overviewClientCompany = document.getElementById('overviewClientCompany');
  const overviewTagsList = document.getElementById('overviewTagsList');
  const overviewTotalBilled = document.getElementById('overviewTotalBilled');
  const overviewTotalPaid = document.getElementById('overviewTotalPaid');
  const overviewBalanceDue = document.getElementById('overviewBalanceDue');
  const overviewEmail = document.getElementById('overviewEmail');
  const overviewPhone = document.getElementById('overviewPhone');
  const overviewAddress = document.getElementById('overviewAddress');
  const overviewNotes = document.getElementById('overviewNotes');
  const overviewContactsList = document.getElementById('overviewContactsList');
  const overviewContactsSection = document.getElementById('overviewContactsSection');
  const overviewChainCount = document.getElementById('overviewChainCount');
  const overviewChainsList = document.getElementById('overviewChainsList');
  const overviewQuotesBody = document.getElementById('overviewQuotesBody');
  const overviewQuoteCount = document.getElementById('overviewQuoteCount');
  const overviewInvoicesBody = document.getElementById('overviewInvoicesBody');
  const overviewInvoiceCount = document.getElementById('overviewInvoiceCount');
  const overviewCreditNotesBody = document.getElementById('overviewCreditNotesBody');
  const overviewCreditNoteCount = document.getElementById('overviewCreditNoteCount');
  const overviewNotesTimeline = document.getElementById('overviewNotesTimeline');
  const overviewNoteForm = document.getElementById('overviewNoteForm');
  const overviewNoteInput = document.getElementById('overviewNoteInput');
  const overviewBackBtn = document.getElementById('overviewBackBtn');
  const overviewEditBtn = document.getElementById('overviewEditBtn');
  const overviewNewQuoteBtn = document.getElementById('overviewNewQuoteBtn');

  let clients = [];
  let searchTerm = '';
  let tagFilter = 'all';
  let sortBy = 'name';
  let editingId = null;
  let currentOverviewId = null;
  let pendingArchiveId = null;
  let currencyCode = 'USD';

  // In-memory contact rows while the modal is open
  let contactRows = [];
  let contactRowCounter = 0;

  function toast(message, type) {
    window.QuoteCraftUtils.showToast(message, type);
  }

  // ── View switching ───────────────────────────────────────────────────

  function showListView() {
    currentOverviewId = null;
    listView.classList.add('active');
    overviewView.classList.remove('active');
  }

  function showOverviewView() {
    listView.classList.remove('active');
    overviewView.classList.add('active');
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
    ]
      .filter(Boolean)
      .flatMap((p) => String(p).split(/[\r\n]+/))
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.join(', ') || '—';
  }

  function parseTags(tagsStr) {
    if (!tagsStr) return [];
    if (Array.isArray(tagsStr)) return tagsStr.filter(Boolean);
    return String(tagsStr)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function formatDateTime(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch (e) {
      return isoString;
    }
  }

  function populateTagFilter() {
    if (!tagFilterSelect) return;
    const allTags = new Set();
    clients.forEach((c) => {
      parseTags(c.tags).forEach((t) => allTags.add(t));
    });
    const sortedTags = Array.from(allTags).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    const current = tagFilterSelect.value;
    tagFilterSelect.innerHTML = '<option value="all">All tags</option>';
    sortedTags.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      tagFilterSelect.appendChild(opt);
    });
    if (current && (current === 'all' || sortedTags.includes(current))) {
      tagFilterSelect.value = current;
    } else {
      tagFilterSelect.value = 'all';
      tagFilter = 'all';
    }
  }

  // ── Contact rows inside modal ─────────────────────────────────────────

  function renderContactRows() {
    contactRowsList.innerHTML = '';
    if (contactRows.length === 0) {
      contactRowsList.innerHTML = '<p class="hint" style="color:var(--text-muted);font-size:13px">No contacts yet. Click "+ Add contact" to add one.</p>';
      return;
    }
    contactRows.forEach((row) => {
      const div = document.createElement('div');
      div.className = 'contact-row';
      div.dataset.rowId = row._id;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Name *';
      nameInput.value = row.name || '';
      nameInput.addEventListener('input', () => { row.name = nameInput.value; });

      const roleInput = document.createElement('input');
      roleInput.type = 'text';
      roleInput.placeholder = 'Role / Title';
      roleInput.value = row.role || '';
      roleInput.addEventListener('input', () => { row.role = roleInput.value; });

      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.placeholder = 'Email';
      emailInput.value = row.email || '';
      emailInput.addEventListener('input', () => { row.email = emailInput.value; });

      const phoneInput = document.createElement('input');
      phoneInput.type = 'tel';
      phoneInput.placeholder = 'Phone';
      phoneInput.value = row.phone || '';
      phoneInput.addEventListener('input', () => { row.phone = phoneInput.value; });

      // Primary radio
      const primaryWrap = document.createElement('div');
      primaryWrap.className = 'primary-wrap';
      const primaryRadio = document.createElement('input');
      primaryRadio.type = 'radio';
      primaryRadio.name = 'contact_primary';
      primaryRadio.value = row._id;
      primaryRadio.checked = !!row.is_primary;
      primaryRadio.title = 'Mark as primary contact';
      primaryRadio.addEventListener('change', () => {
        contactRows.forEach((r) => { r.is_primary = (r._id === row._id); });
      });
      const primaryLabel = document.createElement('span');
      primaryLabel.textContent = 'Primary';
      primaryWrap.appendChild(primaryRadio);
      primaryWrap.appendChild(primaryLabel);

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-contact';
      removeBtn.title = 'Remove contact';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', () => {
        const wasPrimary = row.is_primary;
        contactRows = contactRows.filter((r) => r._id !== row._id);
        if (wasPrimary && contactRows.length > 0) {
          contactRows[0].is_primary = true;
        }
        renderContactRows();
      });

      div.appendChild(nameInput);
      div.appendChild(roleInput);
      div.appendChild(emailInput);
      div.appendChild(phoneInput);
      div.appendChild(primaryWrap);
      div.appendChild(removeBtn);
      contactRowsList.appendChild(div);
    });
  }

  function addContactRow(data) {
    contactRowCounter++;
    const row = {
      _id: contactRowCounter,
      name: (data && data.name) || '',
      role: (data && data.role) || '',
      email: (data && data.email) || '',
      phone: (data && data.phone) || '',
      is_primary: data ? !!data.is_primary : contactRows.length === 0,
    };
    if (row.is_primary) {
      contactRows.forEach((r) => { r.is_primary = false; });
    }
    contactRows.push(row);
    renderContactRows();
  }

  function resetContactRows() {
    contactRows = [];
    contactRowCounter = 0;
    renderContactRows();
  }

  function collectContactsFromRows() {
    return contactRows.map((r) => ({
      name: String(r.name || '').trim(),
      role: String(r.role || '').trim(),
      email: String(r.email || '').trim(),
      phone: String(r.phone || '').trim(),
      is_primary: !!r.is_primary ? 1 : 0,
    }));
  }

  if (addContactRowBtn) {
    addContactRowBtn.addEventListener('click', () => addContactRow(null));
  }

  // ── Client list rendering ─────────────────────────────────────────────

  function renderList() {
    let filtered = clients.slice();

    if (tagFilter !== 'all') {
      filtered = filtered.filter((c) => parseTags(c.tags).includes(tagFilter));
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((c) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.company_name || '').toLowerCase().includes(q) ||
        String(c.email || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q) ||
        String(c.tags || '').toLowerCase().includes(q)
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
          message: 'Nothing matches your current filter or search criteria. Try a different tag or clear the search.',
          actionLabel: 'Clear filters',
        });
        const action = listEl.querySelector('[data-empty-action]');
        if (action) {
          action.addEventListener('click', () => {
            searchInput.value = '';
            searchTerm = '';
            if (tagFilterSelect) tagFilterSelect.value = 'all';
            tagFilter = 'all';
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
      const nameLink = document.createElement('a');
      nameLink.href = '#';
      nameLink.className = 'client-primary-name';
      nameLink.style.cursor = 'pointer';
      nameLink.textContent = c.name;
      nameLink.addEventListener('click', (e) => {
        e.preventDefault();
        openOverview(c.id);
      });
      nameTd.appendChild(nameLink);

      const tags = parseTags(c.tags);
      if (tags.length > 0) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'client-tags-list';
        tags.forEach((t) => {
          const pill = document.createElement('span');
          pill.className = 'tag-badge';
          pill.textContent = t;
          tagsWrap.appendChild(pill);
        });
        nameTd.appendChild(tagsWrap);
      }

      const companyTd = document.createElement('td');
      companyTd.className = 'cell-company';
      companyTd.textContent = c.company_name || '—';

      const emailTd = document.createElement('td');
      emailTd.className = 'cell-email';
      emailTd.textContent = c.email || '—';

      const phoneTd = document.createElement('td');
      phoneTd.className = 'cell-phone';
      phoneTd.textContent = c.phone || '—';

      const addrTd = document.createElement('td');
      addrTd.className = 'cell-address';
      const addrStr = fullAddress(c);
      addrTd.textContent = addrStr;
      if (addrStr !== '—') {
        addrTd.title = addrStr;
      }

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(c.created_at);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'cell-actions';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-small btn-secondary';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => openOverview(c.id));

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

      actionsTd.appendChild(viewBtn);
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

  // ── Client Overview / Portal Rendering ────────────────────────────────

  async function openOverview(clientId) {
    currentOverviewId = clientId;
    try {
      const res = await window.electronAPI.getClientOverview(clientId);
      if (!res.ok || !res.overview) {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not load client overview.', 'error');
        return;
      }
      renderOverview(res.overview);
      showOverviewView();
    } catch (e) {
      toast('Could not load client overview: ' + e.message, 'error');
    }
  }

  function renderOverview(overview) {
    const c = overview.client;
    const stats = overview.stats;

    overviewClientName.textContent = c.name;
    overviewClientCompany.textContent = c.company_name ? c.company_name : 'No company listed';

    // Tags
    overviewTagsList.innerHTML = '';
    const tags = parseTags(c.tags);
    tags.forEach((t) => {
      const pill = document.createElement('span');
      pill.className = 'tag-badge';
      pill.textContent = t;
      overviewTagsList.appendChild(pill);
    });

    // KPI stats
    overviewTotalBilled.textContent = window.QuoteCraftUtils.formatCurrency(stats.totalBilled, currencyCode);
    overviewTotalPaid.textContent = window.QuoteCraftUtils.formatCurrency(stats.totalPaid, currencyCode);
    overviewBalanceDue.textContent = window.QuoteCraftUtils.formatCurrency(stats.outstandingBalance, currencyCode);

    const balanceCard = overviewBalanceDue.closest('.kpi-card');
    if (balanceCard) {
      if (stats.outstandingBalance > 0.001) {
        balanceCard.classList.add('has-balance');
      } else {
        balanceCard.classList.remove('has-balance');
      }
    }

    // Client info
    overviewEmail.textContent = c.email || '—';
    overviewPhone.textContent = c.phone || '—';
    overviewAddress.textContent = fullAddress(c);
    overviewNotes.textContent = c.notes || '—';

    // Contacts
    const contacts = c.contacts || [];
    if (contacts.length === 0) {
      overviewContactsSection.style.display = 'none';
    } else {
      overviewContactsSection.style.display = 'block';
      overviewContactsList.innerHTML = '';
      contacts.forEach((ct) => {
        const card = document.createElement('div');
        card.className = 'contact-card';

        const header = document.createElement('div');
        header.className = 'contact-card-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'contact-card-name';
        nameSpan.textContent = ct.name;

        header.appendChild(nameSpan);
        if (ct.is_primary) {
          const badge = document.createElement('span');
          badge.className = 'tag-badge';
          badge.style.borderColor = 'rgba(63, 185, 80, 0.4)';
          badge.style.background = 'rgba(63, 185, 80, 0.12)';
          badge.style.color = '#3fb950';
          badge.textContent = 'Primary';
          header.appendChild(badge);
        }

        const meta = document.createElement('div');
        meta.className = 'contact-card-meta';
        if (ct.role) {
          const roleDiv = document.createElement('div');
          roleDiv.className = 'contact-card-role';
          roleDiv.textContent = ct.role;
          meta.appendChild(roleDiv);
        }
        if (ct.email) {
          const em = document.createElement('div');
          em.textContent = ct.email;
          meta.appendChild(em);
        }
        if (ct.phone) {
          const ph = document.createElement('div');
          ph.textContent = ct.phone;
          meta.appendChild(ph);
        }

        card.appendChild(header);
        card.appendChild(meta);
        overviewContactsList.appendChild(card);
      });
    }

    // Project & Deposit Billing Chains
    const chains = overview.chains || [];
    if (overviewChainCount) {
      overviewChainCount.textContent = `${chains.length} chain${chains.length === 1 ? '' : 's'}`;
    }
    if (overviewChainsList) {
      overviewChainsList.innerHTML = '';
      if (chains.length === 0) {
        overviewChainsList.innerHTML = '<p class="empty" style="color:var(--text-muted);font-style:italic;padding:12px 0;">No connected billing chains for this client yet.</p>';
      } else {
        chains.forEach((chain) => {
          const chainCard = document.createElement('div');
          chainCard.className = 'billing-chain-card';

          const chainHeader = document.createElement('div');
          chainHeader.className = 'chain-card-header';

          const titleWrap = document.createElement('div');
          const title = document.createElement('h3');
          title.className = 'chain-title';
          title.textContent = chain.quote ? `Project: Quote ${chain.quote.quote_number}` : 'Deposit Flow';
          const subtitle = document.createElement('span');
          subtitle.className = 'chain-subtitle';
          subtitle.textContent = `Total Value: ${window.QuoteCraftUtils.formatCurrency(chain.quote_total, chain.currency)} • Paid: ${window.QuoteCraftUtils.formatCurrency(chain.total_paid, chain.currency)} • Balance: ${window.QuoteCraftUtils.formatCurrency(chain.balance_remaining, chain.currency)}`;
          titleWrap.appendChild(title);
          titleWrap.appendChild(subtitle);

          const chainStatusBadge = document.createElement('span');
          chainStatusBadge.className = `badge ${chain.is_complete ? 'status-paid' : (chain.total_paid > 0 ? 'status-partially_paid' : 'status-sent')}`;
          chainStatusBadge.textContent = chain.is_complete ? 'Complete (Paid)' : (chain.total_paid > 0 ? 'In Progress' : 'Pending');

          chainHeader.appendChild(titleWrap);
          chainHeader.appendChild(chainStatusBadge);
          chainCard.appendChild(chainHeader);

          // Flow nodes row
          const flowRow = document.createElement('div');
          flowRow.className = 'chain-flow-row';

          // Node 1: Quote
          if (chain.quote) {
            const quoteNode = document.createElement('div');
            quoteNode.className = 'chain-node chain-node-quote';
            quoteNode.innerHTML = `
              <div class="node-badge">QUOTE</div>
              <div class="node-number">${chain.quote.quote_number}</div>
              <div class="node-amount">${window.QuoteCraftUtils.formatCurrency(chain.quote.total, chain.currency)}</div>
              <span class="badge status-${chain.quote.status}">${chain.quote.status}</span>
            `;
            quoteNode.addEventListener('click', () => {
              window.QuoteCraftUtils.goToPage('quotes');
              setTimeout(() => window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: chain.quote.id })), 50);
            });
            flowRow.appendChild(quoteNode);

            const arrow1 = document.createElement('div');
            arrow1.className = 'chain-arrow';
            arrow1.innerHTML = '➔';
            flowRow.appendChild(arrow1);
          }

          // Deposit Flow
          if (chain.chain_type === 'deposit_flow') {
            if (chain.deposit_invoice) {
              const depNode = document.createElement('div');
              depNode.className = 'chain-node chain-node-deposit';
              const depEff = chain.deposit_invoice.amount_paid >= chain.deposit_invoice.total ? 'paid' : (chain.deposit_invoice.amount_paid > 0 ? 'partially_paid' : 'sent');
              depNode.innerHTML = `
                <div class="node-badge">DEPOSIT (${chain.deposit_invoice.deposit_percent || ''}%)</div>
                <div class="node-number">${chain.deposit_invoice.invoice_number}</div>
                <div class="node-amount">${window.QuoteCraftUtils.formatCurrency(chain.deposit_invoice.total, chain.currency)}</div>
                <span class="badge status-${depEff}">${depEff.replace('_', ' ')}</span>
              `;
              depNode.addEventListener('click', () => {
                window.QuoteCraftUtils.goToPage('invoices');
                setTimeout(() => window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: chain.deposit_invoice.id })), 50);
              });
              flowRow.appendChild(depNode);
            }

            const arrow2 = document.createElement('div');
            arrow2.className = 'chain-arrow';
            arrow2.innerHTML = '➔';
            flowRow.appendChild(arrow2);

            if (chain.final_invoice) {
              const finNode = document.createElement('div');
              finNode.className = 'chain-node chain-node-final';
              const finEff = chain.final_invoice.amount_paid >= chain.final_invoice.total ? 'paid' : (chain.final_invoice.amount_paid > 0 ? 'partially_paid' : 'sent');
              finNode.innerHTML = `
                <div class="node-badge">FINAL BALANCE</div>
                <div class="node-number">${chain.final_invoice.invoice_number}</div>
                <div class="node-amount">${window.QuoteCraftUtils.formatCurrency(chain.final_invoice.total, chain.currency)}</div>
                <span class="badge status-${finEff}">${finEff.replace('_', ' ')}</span>
              `;
              finNode.addEventListener('click', () => {
                window.QuoteCraftUtils.goToPage('invoices');
                setTimeout(() => window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: chain.final_invoice.id })), 50);
              });
              flowRow.appendChild(finNode);
            } else {
              const pendingNode = document.createElement('div');
              pendingNode.className = 'chain-node chain-node-pending';
              const isDepositPaid = chain.deposit_invoice && chain.deposit_invoice.amount_paid >= chain.deposit_invoice.total;
              pendingNode.innerHTML = `
                <div class="node-badge">FINAL INVOICE</div>
                <div class="node-number">${isDepositPaid ? 'Ready to Generate' : 'Awaiting Deposit'}</div>
                <div class="node-amount">${window.QuoteCraftUtils.formatCurrency(chain.balance_remaining, chain.currency)}</div>
                <span class="badge status-draft">${isDepositPaid ? 'Deposit Settled' : 'Pending'}</span>
              `;
              if (isDepositPaid && chain.deposit_invoice) {
                pendingNode.style.cursor = 'pointer';
                pendingNode.addEventListener('click', () => {
                  window.QuoteCraftUtils.goToPage('invoices');
                  setTimeout(() => window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: chain.deposit_invoice.id })), 50);
                });
              }
              flowRow.appendChild(pendingNode);
            }
          } else if (chain.standard_invoice) {
            const stdNode = document.createElement('div');
            stdNode.className = 'chain-node chain-node-final';
            const stdEff = chain.standard_invoice.amount_paid >= chain.standard_invoice.total ? 'paid' : (chain.standard_invoice.amount_paid > 0 ? 'partially_paid' : 'sent');
            stdNode.innerHTML = `
              <div class="node-badge">FULL INVOICE</div>
              <div class="node-number">${chain.standard_invoice.invoice_number}</div>
              <div class="node-amount">${window.QuoteCraftUtils.formatCurrency(chain.standard_invoice.total, chain.currency)}</div>
              <span class="badge status-${stdEff}">${stdEff.replace('_', ' ')}</span>
            `;
            stdNode.addEventListener('click', () => {
              window.QuoteCraftUtils.goToPage('invoices');
              setTimeout(() => window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: chain.standard_invoice.id })), 50);
            });
            flowRow.appendChild(stdNode);
          }

          chainCard.appendChild(flowRow);
          overviewChainsList.appendChild(chainCard);
        });
      }
    }

    // Quotes History
    const quotes = overview.quotes || [];
    overviewQuoteCount.textContent = `${quotes.length} quote${quotes.length === 1 ? '' : 's'}`;
    overviewQuotesBody.innerHTML = '';
    if (quotes.length === 0) {
      overviewQuotesBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No quotes recorded for this client.</td></tr>';
    } else {
      quotes.forEach((q) => {
        const tr = document.createElement('tr');

        const numTd = document.createElement('td');
        numTd.className = 'cell-number';
        numTd.textContent = q.quote_number;

        const dateTd = document.createElement('td');
        dateTd.textContent = window.QuoteCraftUtils.formatDate(q.date_created);

        const expTd = document.createElement('td');
        expTd.textContent = window.QuoteCraftUtils.formatDate(q.valid_until);

        const totalTd = document.createElement('td');
        totalTd.textContent = window.QuoteCraftUtils.formatCurrency(q.total, q.currency || currencyCode);

        const statusTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge status-${q.status}`;
        badge.textContent = q.status;
        statusTd.appendChild(badge);

        const actionTd = document.createElement('td');
        actionTd.className = 'cell-actions';
        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.className = 'btn btn-small btn-secondary';
        viewBtn.textContent = 'View Quote';
        viewBtn.addEventListener('click', () => {
          window.QuoteCraftUtils.goToPage('quotes');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: q.id }));
          }, 50);
        });
        actionTd.appendChild(viewBtn);

        tr.appendChild(numTd);
        tr.appendChild(dateTd);
        tr.appendChild(expTd);
        tr.appendChild(totalTd);
        tr.appendChild(statusTd);
        tr.appendChild(actionTd);
        overviewQuotesBody.appendChild(tr);
      });
    }

    // Invoices History
    const invoices = overview.invoices || [];
    overviewInvoiceCount.textContent = `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`;
    overviewInvoicesBody.innerHTML = '';
    if (invoices.length === 0) {
      overviewInvoicesBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px;">No invoices recorded for this client.</td></tr>';
    } else {
      invoices.forEach((inv) => {
        const tr = document.createElement('tr');

        const numTd = document.createElement('td');
        numTd.className = 'cell-number';
        numTd.textContent = inv.invoice_number;
        if (inv.invoice_type === 'deposit') {
          const depBadge = document.createElement('span');
          depBadge.className = 'badge badge-deposit';
          depBadge.textContent = `Deposit (${inv.deposit_percent || 0}%)`;
          depBadge.style.marginLeft = '6px';
          numTd.appendChild(depBadge);
        } else if (inv.invoice_type === 'final') {
          const finBadge = document.createElement('span');
          finBadge.className = 'badge badge-final';
          finBadge.textContent = 'Final';
          finBadge.style.marginLeft = '6px';
          numTd.appendChild(finBadge);
        }

        const dateTd = document.createElement('td');
        dateTd.textContent = window.QuoteCraftUtils.formatDate(inv.date_created);

        const dueTd = document.createElement('td');
        dueTd.textContent = window.QuoteCraftUtils.formatDate(inv.date_due);

        const invCurr = inv.currency || currencyCode;
        const totalTd = document.createElement('td');
        totalTd.textContent = window.QuoteCraftUtils.formatCurrency(inv.total, invCurr);

        const paidTd = document.createElement('td');
        const credited = Number(inv.amount_credited) || 0;
        const netPaid = Math.max(0, Math.round(((Number(inv.amount_paid) || 0) - credited) * 100) / 100);
        if (credited > 0.0001) {
          paidTd.innerHTML = `<div>${window.QuoteCraftUtils.formatCurrency(inv.amount_paid, invCurr)}</div>` +
            `<div class="cell-sub" style="color:var(--text-muted);font-size:11px;">Credited: −${window.QuoteCraftUtils.formatCurrency(credited, invCurr)} (Net: ${window.QuoteCraftUtils.formatCurrency(netPaid, invCurr)})</div>`;
        } else {
          paidTd.textContent = window.QuoteCraftUtils.formatCurrency(inv.amount_paid, invCurr);
        }

        const balanceTd = document.createElement('td');
        balanceTd.className = 'cell-balance';
        balanceTd.textContent = window.QuoteCraftUtils.formatCurrency(inv.balance_due, invCurr);

        // Effective status
        let effStatus = inv.status;
        if (Number(inv.balance_due) <= 0.0001) {
          effStatus = 'paid';
        } else if (netPaid > 0.0001) {
          effStatus = 'partially_paid';
        } else if (inv.date_due && new Date(inv.date_due + 'T00:00:00') < new Date()) {
          effStatus = 'overdue';
        } else {
          effStatus = inv.date_sent ? 'sent' : (inv.status || 'draft');
        }

        const statusTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge status-${effStatus}`;
        badge.textContent = effStatus.replace('_', ' ');
        statusTd.appendChild(badge);

        const actionTd = document.createElement('td');
        actionTd.className = 'cell-actions';
        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.className = 'btn btn-small btn-secondary';
        viewBtn.textContent = 'View Invoice';
        viewBtn.addEventListener('click', () => {
          window.QuoteCraftUtils.goToPage('invoices');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: inv.id }));
          }, 50);
        });
        actionTd.appendChild(viewBtn);

        tr.appendChild(numTd);
        tr.appendChild(dateTd);
        tr.appendChild(dueTd);
        tr.appendChild(totalTd);
        tr.appendChild(paidTd);
        tr.appendChild(balanceTd);
        tr.appendChild(statusTd);
        tr.appendChild(actionTd);
        overviewInvoicesBody.appendChild(tr);
      });
    }

    // Credit Notes table
    const creditNotes = overview.creditNotes || [];
    overviewCreditNoteCount.textContent = `${creditNotes.length} credit note${creditNotes.length === 1 ? '' : 's'}`;
    overviewCreditNotesBody.innerHTML = '';
    if (creditNotes.length === 0) {
      overviewCreditNotesBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No credit notes issued for this client.</td></tr>';
    } else {
      creditNotes.forEach((cn) => {
        const tr = document.createElement('tr');
        const numTd = document.createElement('td');
        numTd.className = 'cell-name';
        numTd.textContent = cn.credit_note_number;

        const invTd = document.createElement('td');
        invTd.textContent = cn.invoice_number || '—';

        const dateTd = document.createElement('td');
        dateTd.textContent = window.QuoteCraftUtils.formatDate(cn.date_created);

        const cnCurr = currencyCode;
        const amtTd = document.createElement('td');
        amtTd.textContent = window.QuoteCraftUtils.formatCurrency(cn.amount, cnCurr);
        amtTd.style.color = 'var(--danger)';

        const reasonTd = document.createElement('td');
        reasonTd.textContent = cn.reason || '—';

        const actionTd = document.createElement('td');
        actionTd.className = 'cell-actions';
        const pdfBtn = document.createElement('button');
        pdfBtn.type = 'button';
        pdfBtn.className = 'btn btn-small btn-secondary';
        pdfBtn.textContent = 'Download PDF';
        pdfBtn.addEventListener('click', () => handleOverviewExportCreditNote(cn.id));
        actionTd.appendChild(pdfBtn);

        tr.appendChild(numTd);
        tr.appendChild(invTd);
        tr.appendChild(dateTd);
        tr.appendChild(amtTd);
        tr.appendChild(reasonTd);
        tr.appendChild(actionTd);
        overviewCreditNotesBody.appendChild(tr);
      });
    }

    // Notes timeline
    renderNotesTimeline(overview.notes || []);
  }

  // ── Notes Timeline ───────────────────────────────────────────────────

  async function handleOverviewExportCreditNote(creditNoteId) {
    try {
      const res = await window.electronAPI.exportCreditNotePdf(creditNoteId);
      if (res.ok && res.cancelled) return;
      if (res.ok) {
        toast('PDF saved to ' + res.savedPath, 'success');
      } else {
        toast((res.errors && res.errors.general) || 'Could not export PDF.', 'error');
      }
    } catch (e) {
      toast('Could not export PDF: ' + e.message, 'error');
    }
  }

  function renderNotesTimeline(notes) {
    overviewNotesTimeline.innerHTML = '';
    if (!notes || notes.length === 0) {
      overviewNotesTimeline.innerHTML = '<p class="hint" style="color:var(--text-muted);font-size:13px;padding:12px 0;">No activity notes recorded yet. Add your first note above.</p>';
      return;
    }

    notes.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'timeline-note-card';
      card.dataset.noteId = item.id;

      const header = document.createElement('div');
      header.className = 'timeline-note-header';

      const dateWrap = document.createElement('div');
      const dateSpan = document.createElement('span');
      dateSpan.className = 'timeline-note-date';
      dateSpan.textContent = formatDateTime(item.created_at);
      dateWrap.appendChild(dateSpan);

      const isEdited = item.updated_at && item.created_at &&
        Math.abs(new Date(item.updated_at).getTime() - new Date(item.created_at).getTime()) > 2000;

      if (isEdited) {
        const editedSpan = document.createElement('span');
        editedSpan.className = 'timeline-note-edited';
        editedSpan.textContent = `(edited · ${formatDateTime(item.updated_at)})`;
        dateWrap.appendChild(editedSpan);
      }

      const actions = document.createElement('div');
      actions.className = 'timeline-note-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-small btn-ghost';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openNoteEditor(card, item));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-small btn-ghost';
      delBtn.style.color = 'var(--danger)';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => handleNoteDelete(item.id));

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      header.appendChild(dateWrap);
      header.appendChild(actions);

      const textDiv = document.createElement('div');
      textDiv.className = 'timeline-note-text';
      textDiv.textContent = item.note;

      card.appendChild(header);
      card.appendChild(textDiv);
      overviewNotesTimeline.appendChild(card);
    });
  }

  function openNoteEditor(card, item) {
    const textDiv = card.querySelector('.timeline-note-text');
    const headerActions = card.querySelector('.timeline-note-actions');
    if (!textDiv) return;

    textDiv.style.display = 'none';
    if (headerActions) headerActions.style.display = 'none';

    let editor = card.querySelector('.note-inline-editor');
    if (!editor) {
      editor = document.createElement('div');
      editor.className = 'note-inline-editor';

      const textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.value = item.note;

      const actDiv = document.createElement('div');
      actDiv.className = 'note-inline-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-small btn-ghost';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        editor.remove();
        textDiv.style.display = '';
        if (headerActions) headerActions.style.display = '';
      });

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-small btn-primary';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', async () => {
        const val = textarea.value.trim();
        if (!val) {
          toast('Note cannot be empty.', 'error');
          return;
        }
        try {
          const res = await window.electronAPI.updateClientNote(item.id, val);
          if (res.ok) {
            toast('Note updated.', 'success');
            if (currentOverviewId) await openOverview(currentOverviewId);
          } else {
            toast(res.error || 'Could not update note.', 'error');
          }
        } catch (e) {
          toast('Could not update note: ' + e.message, 'error');
        }
      });

      actDiv.appendChild(cancelBtn);
      actDiv.appendChild(saveBtn);
      editor.appendChild(textarea);
      editor.appendChild(actDiv);
      card.appendChild(editor);
      textarea.focus();
    }
  }

  async function handleNoteDelete(noteId) {
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Delete this note?',
      message: 'This activity note will be permanently removed.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const res = await window.electronAPI.deleteClientNote(noteId);
      if (res.ok) {
        toast('Note deleted.', 'success');
        if (currentOverviewId) await openOverview(currentOverviewId);
      } else {
        toast('Could not delete note.', 'error');
      }
    } catch (e) {
      toast('Could not delete note: ' + e.message, 'error');
    }
  }

  if (overviewNoteForm) {
    overviewNoteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentOverviewId) return;
      const text = overviewNoteInput.value.trim();
      if (!text) {
        toast('Please enter note text.', 'error');
        return;
      }

      try {
        const res = await window.electronAPI.addClientNote(currentOverviewId, text);
        if (res.ok) {
          overviewNoteInput.value = '';
          toast('Note added.', 'success');
          await openOverview(currentOverviewId);
        } else {
          toast(res.error || 'Could not add note.', 'error');
        }
      } catch (err) {
        toast('Could not add note: ' + err.message, 'error');
      }
    });
  }

  if (overviewBackBtn) {
    overviewBackBtn.addEventListener('click', () => {
      showListView();
      loadClients();
    });
  }

  if (overviewEditBtn) {
    overviewEditBtn.addEventListener('click', () => {
      if (!currentOverviewId) return;
      const c = clients.find((x) => x.id === currentOverviewId);
      if (c) openEditModal(c);
    });
  }

  if (overviewNewQuoteBtn) {
    overviewNewQuoteBtn.addEventListener('click', () => {
      if (!currentOverviewId) return;
      window.QuoteCraftUtils.goToPage('quotes');
      // Trigger new quote button then preselect client
      setTimeout(() => {
        const newQuoteBtn = document.getElementById('newQuoteBtn');
        if (newQuoteBtn) newQuoteBtn.click();
        setTimeout(() => {
          const clientSel = document.getElementById('quoteClient');
          if (clientSel) {
            clientSel.value = String(currentOverviewId);
            clientSel.dispatchEvent(new Event('change'));
          }
        }, 100);
      }, 50);
    });
  }

  // ── Modal form handling ───────────────────────────────────────────────

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
      tags: form.elements['tags'] ? form.elements['tags'].value : '',
      notes: form.elements['notes'].value,
      contacts: collectContactsFromRows(),
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
    if (form.elements['tags']) form.elements['tags'].value = client.tags || '';
    form.elements['notes'].value = client.notes || '';
  }

  function openAddModal() {
    editingId = null;
    clearAllErrors();
    form.reset();
    resetContactRows();
    modalTitle.textContent = 'Add Client';
    submitBtn.textContent = 'Save client';
    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  async function openEditModal(client) {
    editingId = client.id;
    clearAllErrors();
    form.reset();
    fillFields(client);
    resetContactRows();

    // Load existing contacts for this client
    try {
      const res = await window.electronAPI.listContacts(client.id);
      if (res.ok && Array.isArray(res.contacts)) {
        res.contacts.forEach((c) => addContactRow(c));
      }
    } catch (e) {
      /* ignore */
    }

    modalTitle.textContent = 'Edit Client';
    submitBtn.textContent = 'Save changes';
    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    editingId = null;
    resetContactRows();
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
        populateTagFilter();
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
        if (currentOverviewId === client.id) {
          showListView();
        }
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
        if (currentOverviewId === id) {
          showListView();
        }
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

  if (tagFilterSelect) {
    tagFilterSelect.addEventListener('change', () => {
      tagFilter = tagFilterSelect.value;
      renderList();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    // Validate contacts
    const contacts = collectContactsFromRows();
    for (let i = 0; i < contacts.length; i++) {
      if (!contacts[i].name) {
        toast(`Contact row ${i + 1} is missing a name.`, 'error');
        return;
      }
    }

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
        if (currentOverviewId === res.client.id) {
          await openOverview(res.client.id);
        }
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

  window.addEventListener('qc-open-client-overview', (e) => {
    if (e.detail) openOverview(e.detail);
  });

  async function init() {
    try {
      const profileRes = await window.electronAPI.getCompanyProfile();
      if (profileRes.ok && profileRes.profile && profileRes.profile.default_currency) {
        currencyCode = profileRes.profile.default_currency;
      }
    } catch (e) {
      /* ignore */
    }
    loadClients();
  }

  init();

  // Public helper
  window.QuoteCraftClients = window.QuoteCraftClients || {};
  window.QuoteCraftClients.getContacts = async function (clientId) {
    try {
      const res = await window.electronAPI.listContacts(clientId);
      return (res.ok && Array.isArray(res.contacts)) ? res.contacts : [];
    } catch (e) {
      return [];
    }
  };
  window.QuoteCraftClients.openOverview = openOverview;
})();
