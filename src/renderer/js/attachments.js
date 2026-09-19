// Attachments panel: shared controller mounted by the client, project, quote
// and invoice detail views. Files are copied into the app's data folder by the
// main process; this only renders metadata and relays user actions.
(function () {
  'use strict';

  const MAX_LABEL_FALLBACK = '25 MB';

  function utils() {
    return window.QuoteCraftUtils || {};
  }

  function toast(message, type) {
    const fn = utils().showToast;
    if (typeof fn === 'function') fn(message, type);
  }

  function busy(label) {
    const fn = utils().showBusy;
    if (typeof fn === 'function') fn(label);
  }

  function unbusy() {
    const fn = utils().hideBusy;
    if (typeof fn === 'function') fn();
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function humanSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function extensionLabel(name) {
    const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
    return m ? m[1].toUpperCase().slice(0, 4) : 'FILE';
  }

  function typeLabel(attachment) {
    const ext = extensionLabel(attachment.original_filename);
    const mime = attachment.mime_type || '';
    if (mime.indexOf('image/') === 0) return 'Image';
    if (mime === 'application/pdf') return 'PDF';
    return ext;
  }

  function emptyStateHTML() {
    return (
      '<div class="attachments-empty">' +
      '<div class="attachments-empty-icon">📎</div>' +
      '<div class="attachments-empty-title">No attachments yet</div>' +
      '<div class="attachments-empty-text">Drag files here or use <strong>Attach Files</strong> to add signed contracts, scopes, or photos.</div>' +
      '</div>'
    );
  }

  function rowHTML(a) {
    const name = esc(a.original_filename);
    const meta = [
      esc(typeLabel(a)),
      esc(humanSize(a.file_size)),
      'Attached ' + esc(formatDate(a.created_at)),
    ].join(' · ');
    return (
      '<div class="attachment-row" data-id="' + esc(a.id) + '">' +
        '<div class="attachment-badge" title="' + esc(typeLabel(a)) + '">' + esc(extensionLabel(a.original_filename)) + '</div>' +
        '<div class="attachment-main">' +
          '<button type="button" class="attachment-name" data-action="open" title="Open attachment">' + name + '</button>' +
          '<div class="attachment-meta">' + meta + '</div>' +
        '</div>' +
        '<div class="attachment-actions">' +
          '<button type="button" class="btn btn-secondary btn-small" data-action="open">Open</button>' +
          '<button type="button" class="btn btn-secondary btn-small" data-action="save">Save a copy</button>' +
          '<button type="button" class="btn btn-secondary btn-small" data-action="folder">Show in folder</button>' +
          '<button type="button" class="btn btn-danger btn-small" data-action="delete">Delete</button>' +
        '</div>' +
      '</div>'
    );
  }

  function render(panel, state) {
    const list = state.attachments || [];
    const total = list.reduce((sum, a) => sum + (Number(a.file_size) || 0), 0);
    const summary = list.length
      ? list.length + ' file' + (list.length === 1 ? '' : 's') + ' · ' + humanSize(total)
      : 'No files';

    panel.innerHTML =
      '<div class="attachments-toolbar">' +
        '<span class="attachments-summary">' + esc(summary) + '</span>' +
        '<button type="button" class="btn btn-primary btn-small" data-action="add">＋ Attach Files</button>' +
      '</div>' +
      '<div class="attachments-dropzone' + (list.length ? '' : ' is-empty') + '">' +
        (list.length ? list.map(rowHTML).join('') : emptyStateHTML()) +
      '</div>' +
      '<div class="attachments-hint">Files are copied into the app. Max ' +
        esc(state.limit || MAX_LABEL_FALLBACK) + ' per file.</div>';
  }

  function setState(panel, patch) {
    panel._attachmentsState = Object.assign({}, panel._attachmentsState, patch);
  }

  async function reload(panel) {
    const state = panel._attachmentsState;
    if (!state || !state.entityType || !state.entityId) return;
    try {
      const res = await window.electronAPI.listAttachments(state.entityType, state.entityId);
      setState(panel, { attachments: (res && res.attachments) || [] });
    } catch (e) {
      setState(panel, { attachments: [] });
      toast('Could not load attachments: ' + e.message, 'error');
    }
    render(panel, panel._attachmentsState);
  }

  function reportAddResult(panel, res) {
    if (!res) return;
    if (res.ok === false) {
      const errors = res.errors || {};
      toast(errors.general || 'Could not add attachments.', 'error');
      return;
    }
    if (res.cancelled) return;
    const added = res.added || [];
    const skipped = res.skipped || [];
    if (added.length) {
      toast('Attached ' + added.length + ' file' + (added.length === 1 ? '' : 's') + '.', 'success');
    }
    for (const item of skipped) {
      toast(item.reason || (item.name + ' could not be attached.'), 'error');
    }
    if (!added.length && !skipped.length) {
      toast('No files were added.', 'info');
    }
  }

  async function addViaDialog(panel) {
    const state = panel._attachmentsState;
    busy('Adding attachments…');
    try {
      const res = await window.electronAPI.addAttachments({
        entity_type: state.entityType,
        entity_id: state.entityId,
      });
      reportAddResult(panel, res);
      if (res && res.ok && !res.cancelled) await reload(panel);
    } catch (e) {
      toast('Could not add attachments: ' + e.message, 'error');
    } finally {
      unbusy();
    }
  }

  async function addPaths(panel, paths) {
    const state = panel._attachmentsState;
    if (!state || !paths || !paths.length) {
      if (paths && !paths.length) toast('Only files can be attached.', 'warning');
      return;
    }
    busy('Adding attachments…');
    try {
      const res = await window.electronAPI.addAttachments({
        entity_type: state.entityType,
        entity_id: state.entityId,
        paths,
      });
      reportAddResult(panel, res);
      if (res && res.ok) await reload(panel);
    } catch (e) {
      toast('Could not add attachments: ' + e.message, 'error');
    } finally {
      unbusy();
    }
  }

  async function openAttachment(id) {
    try {
      const res = await window.electronAPI.openAttachment(id);
      if (res && res.ok === false) {
        toast((res.errors && res.errors.general) || 'Could not open attachment.', 'error');
      }
    } catch (e) {
      toast('Could not open attachment: ' + e.message, 'error');
    }
  }

  async function showInFolder(id) {
    try {
      const res = await window.electronAPI.showAttachmentInFolder(id);
      if (res && res.ok === false) {
        toast((res.errors && res.errors.general) || 'Could not reveal attachment.', 'error');
      }
    } catch (e) {
      toast('Could not reveal attachment: ' + e.message, 'error');
    }
  }

  async function saveAs(id) {
    try {
      const res = await window.electronAPI.saveAttachmentAs(id);
      if (res && res.ok && res.savedPath) {
        toast('Saved a copy to ' + res.savedPath, 'success');
      } else if (res && res.ok === false) {
        toast((res.errors && res.errors.general) || 'Could not save a copy.', 'error');
      }
    } catch (e) {
      toast('Could not save a copy: ' + e.message, 'error');
    }
  }

  async function removeAttachment(panel, id, name) {
    const confirmAction = utils().confirmAction;
    let ok = true;
    if (typeof confirmAction === 'function') {
      ok = await confirmAction({
        title: 'Delete attachment?',
        message: 'Delete "' + name + '"? The copied file will be removed. This cannot be undone.',
        confirmText: 'Delete',
        danger: true,
      });
    }
    if (!ok) return;
    try {
      const res = await window.electronAPI.deleteAttachment(id);
      if (res && res.ok) {
        toast('Attachment deleted.', 'success');
        await reload(panel);
      } else {
        toast((res && res.errors && res.errors.general) || 'Could not delete attachment.', 'error');
      }
    } catch (e) {
      toast('Could not delete attachment: ' + e.message, 'error');
    }
  }

  function bindOnce(panel) {
    if (panel._attachmentsBound) return;
    panel._attachmentsBound = true;

    panel.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      if (action === 'add') {
        addViaDialog(panel);
        return;
      }
      const row = button.closest('.attachment-row');
      if (!row) return;
      const id = Number(row.getAttribute('data-id'));
      const name = (row.querySelector('.attachment-name') || {}).textContent || 'this file';
      if (action === 'open') openAttachment(id);
      else if (action === 'save') saveAs(id);
      else if (action === 'folder') showInFolder(id);
      else if (action === 'delete') removeAttachment(panel, id, name);
    });

    panel.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.add('drag-over');
    });
    panel.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === panel) panel.classList.remove('drag-over');
    });
    panel.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.remove('drag-over');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      const paths = [];
      for (const file of files) {
        let p = '';
        try {
          p = window.electronAPI.getPathForFile(file);
        } catch (err) {
          p = '';
        }
        if (p) paths.push(p);
      }
      if (!paths.length) {
        toast('Only files can be attached (folders are not supported).', 'warning');
        return;
      }
      addPaths(panel, paths);
    });
  }

  // Mount (or re-mount) the panel for a record. Safe to call repeatedly on
  // every detail render; the state is reset each time.
  function mount(panel, options) {
    if (!panel || !window.electronAPI) return;
    const opts = options || {};
    const entityId = Number(opts.entityId);
    panel._attachmentsState = {
      entityType: opts.entityType,
      entityId: entityId > 0 ? entityId : null,
      attachments: [],
      limit: opts.limit || MAX_LABEL_FALLBACK,
    };
    bindOnce(panel);

    if (!panel._attachmentsState.entityId) {
      panel.innerHTML = '<div class="attachments-empty"><div class="attachments-empty-text">Save this record before adding attachments.</div></div>';
      return;
    }
    reload(panel);

    // Refresh the configured limit label once, so the hint reflects the real value.
    if (!panel._attachmentsLimitFetched) {
      panel._attachmentsLimitFetched = true;
      window.electronAPI.getAttachmentStats()
        .then((res) => {
          if (res && res.ok && res.limit) {
            setState(panel, { limit: res.limit });
            if (panel._attachmentsState.entityId) render(panel, panel._attachmentsState);
          }
        })
        .catch(() => {});
    }
  }

  window.QuoteCraftAttachments = { mount: mount };
})();
