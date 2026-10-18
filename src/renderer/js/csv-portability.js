/**
 * QuoteCraft CSV Data Portability Hub Controller
 * Manages CSV import modal, column mapping confirmation wizard,
 * and filtered accounting & tax ledger exports.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Target Field Definitions
  // ---------------------------------------------------------------------------
  const CLIENT_TARGET_FIELDS = [
    { value: '', label: '— Ignore (Do not import) —' },
    { value: 'name', label: 'Client Name *' },
    { value: 'company_name', label: 'Company Name' },
    { value: 'email', label: 'Email Address' },
    { value: 'phone', label: 'Phone Number' },
    { value: 'address_line1', label: 'Address Line 1' },
    { value: 'address_line2', label: 'Address Line 2' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State / Province' },
    { value: 'postal_code', label: 'Postal Code / Zip' },
    { value: 'country', label: 'Country' },
    { value: 'notes', label: 'Notes' },
    { value: 'tags', label: 'Tags' },
    { value: 'default_currency', label: 'Default Currency' },
    { value: 'default_hourly_rate', label: 'Hourly Rate' },
  ];

  const LINE_ITEM_TARGET_FIELDS = [
    { value: '', label: '— Ignore (Do not import) —' },
    { value: 'name', label: 'Item Name *' },
    { value: 'description', label: 'Description' },
    { value: 'unit_price', label: 'Unit Price' },
    { value: 'tax_rate', label: 'Tax Rate (%)' },
    { value: 'unit_label', label: 'Unit (e.g. hrs, pcs)' },
  ];

  // ---------------------------------------------------------------------------
  // Modal State & Elements
  // ---------------------------------------------------------------------------
  let currentImportType = 'clients'; // 'clients' | 'line_items'
  let currentFilePath = null;
  let currentCsvText = null;
  let currentHeaders = [];
  let currentMapping = {};

  const importModal = document.getElementById('csvImportModal');
  const importModalTitle = document.getElementById('csvImportModalTitle');
  const importModalClose = document.getElementById('csvImportModalClose');
  const importCancelBtn = document.getElementById('csvImportCancelBtn');
  const importExecuteBtn = document.getElementById('csvImportExecuteBtn');

  const browseBtn = document.getElementById('csvBrowseBtn');
  const fileInput = document.getElementById('csvFileInput');
  const changeFileBtn = document.getElementById('csvChangeFileBtn');
  const fileInfoDiv = document.getElementById('csvFileInfo');
  const fileNameEl = document.getElementById('csvFileName');
  const fileMetaEl = document.getElementById('csvFileMeta');

  const step1Div = document.getElementById('csvImportStep1');
  const step2Div = document.getElementById('csvImportStep2');
  const mappingTableBody = document.getElementById('csvMappingTableBody');
  const importResultDiv = document.getElementById('csvImportResult');

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function toast(msg, type = 'info') {
    if (window.QuoteCraftUtils && window.QuoteCraftUtils.showToast) {
      window.QuoteCraftUtils.showToast(msg, type);
    }
  }

  function resetImportModal() {
    currentFilePath = null;
    currentCsvText = null;
    currentHeaders = [];
    currentMapping = {};

    if (fileInfoDiv) fileInfoDiv.classList.add('hidden');
    if (step2Div) step2Div.classList.add('hidden');
    if (importResultDiv) {
      importResultDiv.className = 'hidden';
      importResultDiv.innerHTML = '';
    }
    if (mappingTableBody) mappingTableBody.innerHTML = '';
    if (importExecuteBtn) {
      importExecuteBtn.disabled = true;
      importExecuteBtn.textContent = 'Import Records';
    }
    if (fileInput) fileInput.value = '';
  }

  function openImportModal(type = 'clients') {
    currentImportType = type;
    resetImportModal();

    if (importModalTitle) {
      importModalTitle.textContent = type === 'line_items'
        ? '📦 Import Line Items Library from CSV'
        : '👥 Import Clients from CSV';
    }

    if (importModal) importModal.classList.remove('hidden');
  }

  function closeImportModal() {
    if (importModal) importModal.classList.add('hidden');
    resetImportModal();
  }

  // ---------------------------------------------------------------------------
  // Step 2: Render Column Mapping Table
  // ---------------------------------------------------------------------------
  function renderMappingTable(headers, sampleRows, detectedMapping) {
    if (!mappingTableBody) return;
    mappingTableBody.innerHTML = '';

    const targetFields = currentImportType === 'line_items'
      ? LINE_ITEM_TARGET_FIELDS
      : CLIENT_TARGET_FIELDS;

    currentMapping = { ...detectedMapping };

    headers.forEach((header) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color, #2a3142)';

      // Header column
      const tdHeader = document.createElement('td');
      tdHeader.style.padding = '8px 12px';
      tdHeader.style.fontWeight = '600';
      tdHeader.textContent = header;

      // Sample value column
      const tdSample = document.createElement('td');
      tdSample.style.padding = '8px 12px';
      tdSample.style.color = 'var(--text-muted, #8b949e)';
      const firstSample = (sampleRows && sampleRows[0] && sampleRows[0][header]) || '—';
      tdSample.textContent = firstSample.length > 40 ? firstSample.slice(0, 40) + '…' : firstSample;

      // Dropdown column
      const tdSelect = document.createElement('td');
      tdSelect.style.padding = '8px 12px';

      const select = document.createElement('select');
      select.style.width = '100%';
      select.style.padding = '4px 8px';
      select.style.fontSize = '12px';

      targetFields.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.value;
        opt.textContent = f.label;
        if (f.value && detectedMapping[header] === f.value) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.addEventListener('change', (e) => {
        currentMapping[header] = e.target.value;
      });

      tdSelect.appendChild(select);

      tr.appendChild(tdHeader);
      tr.appendChild(tdSample);
      tr.appendChild(tdSelect);
      mappingTableBody.appendChild(tr);
    });

    if (step2Div) step2Div.classList.remove('hidden');
    if (importExecuteBtn) importExecuteBtn.disabled = false;
  }

  // ---------------------------------------------------------------------------
  // File Preview Handler
  // ---------------------------------------------------------------------------
  function populatePreview(preview) {
    if (!preview || !preview.ok) {
      toast(preview ? preview.error : 'Failed to preview CSV file.', 'error');
      return;
    }

    currentFilePath = preview.filePath || null;
    currentHeaders = preview.headers || [];

    if (fileNameEl) fileNameEl.textContent = preview.fileName || 'Import File';
    if (fileMetaEl) {
      fileMetaEl.textContent = `${preview.totalRows} rows detected (delimiter: "${preview.delimiter}")`;
    }
    if (fileInfoDiv) fileInfoDiv.classList.remove('hidden');

    renderMappingTable(preview.headers, preview.sampleRows, preview.detectedMapping || {});
  }

  // ---------------------------------------------------------------------------
  // Execute Import
  // ---------------------------------------------------------------------------
  async function executeImport() {
    if (!importExecuteBtn) return;
    importExecuteBtn.disabled = true;
    const originalText = importExecuteBtn.textContent;
    importExecuteBtn.textContent = '⏳ Importing…';

    const dedupeOptionEl = document.querySelector('input[name="csvDedupeOption"]:checked');
    const onDuplicate = dedupeOptionEl ? dedupeOptionEl.value : 'skip';

    try {
      let res;
      if (currentImportType === 'line_items') {
        res = await window.electronAPI.csvImportLineItems({
          filePath: currentFilePath,
          csvText: currentCsvText,
          mapping: currentMapping,
          options: { onDuplicate },
        });
      } else {
        res = await window.electronAPI.csvImportClients({
          filePath: currentFilePath,
          csvText: currentCsvText,
          mapping: currentMapping,
          options: { deduplicateBy: 'email_or_phone', onDuplicate },
        });
      }

      if (!res || !res.ok) {
        if (importResultDiv) {
          importResultDiv.className = 'app-lock-msg error';
          importResultDiv.style.background = 'rgba(248, 81, 73, 0.15)';
          importResultDiv.style.border = '1px solid rgba(248, 81, 73, 0.4)';
          importResultDiv.textContent = res ? res.error : 'Import failed.';
          importResultDiv.classList.remove('hidden');
        }
        toast(res ? res.error : 'Import failed.', 'error');
        return;
      }

      // Success Display
      const entityLabel = currentImportType === 'line_items' ? 'line items' : 'clients';
      const msg = `Successfully imported ${res.imported} new ${entityLabel}, updated ${res.updated}, skipped ${res.skipped} duplicate(s).`;
      toast(msg, 'success');

      if (importResultDiv) {
        importResultDiv.className = 'app-lock-msg success';
        importResultDiv.style.background = 'rgba(63, 185, 80, 0.15)';
        importResultDiv.style.border = '1px solid rgba(63, 185, 80, 0.4)';
        importResultDiv.style.color = '#3fb950';
        importResultDiv.innerHTML = `<strong>Import Complete!</strong><br>${msg}`;
        importResultDiv.classList.remove('hidden');
      }

      // Trigger automatic reload of relevant data
      if (currentImportType === 'clients' && window.QuoteCraftClients && typeof window.QuoteCraftClients.reload === 'function') {
        window.QuoteCraftClients.reload();
      } else if (currentImportType === 'line_items' && window.QuoteCraftItems && typeof window.QuoteCraftItems.reload === 'function') {
        window.QuoteCraftItems.reload();
      }

      // Close modal after 1.8 seconds on success
      setTimeout(() => {
        closeImportModal();
      }, 1800);
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
      if (importResultDiv) {
        importResultDiv.className = 'app-lock-msg error';
        importResultDiv.textContent = err.message;
        importResultDiv.classList.remove('hidden');
      }
    } finally {
      importExecuteBtn.disabled = false;
      importExecuteBtn.textContent = originalText;
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered Accounting Ledgers Export in Settings
  // ---------------------------------------------------------------------------
  const datasetSelect = document.getElementById('csvLedgerDataset');
  const customDateRow = document.getElementById('csvCustomDateRow');
  const startDateInput = document.getElementById('csvExportStartDate');
  const endDateInput = document.getElementById('csvExportEndDate');
  const summaryText = document.getElementById('csvLedgerSummaryText');
  const exportFilteredCsvBtn = document.getElementById('exportFilteredCsvBtn');
  const presetButtons = document.querySelectorAll('.csv-range-preset');

  let currentPreset = 'all';

  function getDateRangeForPreset(preset) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: toYMD(first), endDate: toYMD(today) };
    }
    if (preset === 'quarter') {
      const currentQuarter = Math.floor(today.getMonth() / 3);
      const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const prevYear = currentQuarter === 0 ? today.getFullYear() - 1 : today.getFullYear();
      const first = new Date(prevYear, prevQuarter * 3, 1);
      const last = new Date(prevYear, (prevQuarter + 1) * 3, 0);
      return { startDate: toYMD(first), endDate: toYMD(last) };
    }
    if (preset === 'ytd') {
      const first = new Date(today.getFullYear(), 0, 1);
      return { startDate: toYMD(first), endDate: toYMD(today) };
    }
    if (preset === 'custom') {
      return {
        startDate: (startDateInput && startDateInput.value) || null,
        endDate: (endDateInput && endDateInput.value) || null,
      };
    }
    return { startDate: null, endDate: null };
  }

  async function updateLedgerSummary() {
    if (!summaryText || !datasetSelect) return;
    const dataset = datasetSelect.value;
    const filter = getDateRangeForPreset(currentPreset);

    try {
      summaryText.textContent = 'Counting records…';
      const res = await window.electronAPI.csvGetLedgerSummary({ dataset, filter });
      if (res && res.ok) {
        const count = res.count || 0;
        const total = (res.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        summaryText.textContent = `${count} record${count === 1 ? '' : 's'} (${total} volume)`;
      } else {
        summaryText.textContent = '0 records found';
      }
    } catch (err) {
      summaryText.textContent = '—';
    }
  }

  function initLedgerExportSection() {
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        presetButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentPreset = btn.getAttribute('data-range') || 'all';

        if (currentPreset === 'custom') {
          if (customDateRow) customDateRow.classList.remove('hidden');
        } else {
          if (customDateRow) customDateRow.classList.add('hidden');
        }

        updateLedgerSummary();
      });
    });

    if (datasetSelect) {
      datasetSelect.addEventListener('change', updateLedgerSummary);
    }
    if (startDateInput) {
      startDateInput.addEventListener('change', updateLedgerSummary);
    }
    if (endDateInput) {
      endDateInput.addEventListener('change', updateLedgerSummary);
    }

    if (exportFilteredCsvBtn) {
      exportFilteredCsvBtn.addEventListener('click', async () => {
        exportFilteredCsvBtn.disabled = true;
        const originalText = exportFilteredCsvBtn.textContent;
        exportFilteredCsvBtn.textContent = '⏳ Preparing CSV…';

        const dataset = datasetSelect ? datasetSelect.value : 'invoices';
        const filter = getDateRangeForPreset(currentPreset);

        try {
          const res = await window.electronAPI.csvExportLedger({ dataset, filter });
          if (res && res.ok && !res.cancelled) {
            toast(`Exported ${res.rowCount} rows to ${res.savedPath}`, 'success');
          } else if (res && !res.ok) {
            toast(res.error || 'Failed to export CSV.', 'error');
          }
        } catch (err) {
          toast('Export failed: ' + err.message, 'error');
        } finally {
          exportFilteredCsvBtn.disabled = false;
          exportFilteredCsvBtn.textContent = originalText;
        }
      });
    }

    // Initial count
    updateLedgerSummary();
  }

  // ---------------------------------------------------------------------------
  // Modal Event Listeners
  // ---------------------------------------------------------------------------
  function initImportModal() {
    if (browseBtn) {
      browseBtn.addEventListener('click', async () => {
        const preview = await window.electronAPI.csvSelectAndPreview(currentImportType);
        if (preview && !preview.cancelled) {
          populatePreview(preview);
        }
      });
    }

    if (changeFileBtn) {
      changeFileBtn.addEventListener('click', async () => {
        const preview = await window.electronAPI.csvSelectAndPreview(currentImportType);
        if (preview && !preview.cancelled) {
          populatePreview(preview);
        }
      });
    }

    if (importModalClose) importModalClose.addEventListener('click', closeImportModal);
    if (importCancelBtn) importCancelBtn.addEventListener('click', closeImportModal);
    if (importExecuteBtn) importExecuteBtn.addEventListener('click', executeImport);

    // Close on backdrop click
    if (importModal) {
      importModal.addEventListener('click', (e) => {
        if (e.target === importModal) closeImportModal();
      });
    }

    // Buttons in Settings > Backups & Portability
    const openClientBtn = document.getElementById('openClientCsvImportBtn');
    if (openClientBtn) {
      openClientBtn.addEventListener('click', () => openImportModal('clients'));
    }

    const openLineItemBtn = document.getElementById('openLineItemCsvImportBtn');
    if (openLineItemBtn) {
      openLineItemBtn.addEventListener('click', () => openImportModal('line_items'));
    }

    // Button in Clients page header
    const clientsImportBtn = document.getElementById('clientsImportCsvBtn');
    if (clientsImportBtn) {
      clientsImportBtn.addEventListener('click', () => openImportModal('clients'));
    }
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  function init() {
    initImportModal();
    initLedgerExportSection();
  }

  // Document ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export public API
  window.QuoteCraftCsv = {
    openImportModal,
    closeImportModal,
    updateLedgerSummary,
  };
})();
