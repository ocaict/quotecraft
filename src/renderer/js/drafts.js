// Draft autosave for document editors (quotes / invoices).
// Pure renderer feature: drafts live in localStorage, are never sent over IPC,
// and are cleared the moment the document is saved successfully. Restore is an
// explicit, per-form prompt so a draft can never silently re-clobber saved data.
(function () {
  const PREFIX = 'qcdraft:';

  function save(key, data) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (e) {
      /* storage full / unavailable — drafts are best-effort */
    }
  }

  function load(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed.data : null;
    } catch (e) {
      return null;
    }
  }

  function clear(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch (e) {
      /* ignore */
    }
  }

  function exists(key) {
    return load(key) !== null;
  }

  function formatAge(savedAt) {
    if (!savedAt) return '';
    const secs = Math.max(0, Math.floor((Date.now() - Number(savedAt)) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  // Watches a form for input/change and debounces writes to localStorage.
  // opts: { key: string | () => string, capture: () => (object|null),
  //         onSaved?: () => void } // fired once per session on first write
  // capture() returning null skips the write (e.g. form not in an editable
  // state). Returns { flush, clearPending, cancel }.
  function startAutosave(formEl, opts) {
    if (!formEl || !opts) return { flush: () => {}, clearPending: () => {}, cancel: () => {} };

    let timer = null;
    let notified = false;

    const evalKey = () => (typeof opts.key === 'function' ? opts.key() : opts.key);
    const writeNow = () => {
      clearTimeout(timer);
      timer = null;
      try {
        if (formEl.offsetParent === null) return;
        const data = opts.capture();
        if (data === null || data === undefined) return;
        save(evalKey(), data);
        if (!notified && typeof opts.onSaved === 'function') {
          notified = true;
          opts.onSaved();
        }
      } catch (e) {
        /* ignore */
      }
    };

    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(writeNow, 900);
    };

    ['input', 'change'].forEach((ev) => formEl.addEventListener(ev, onChange));

    window.addEventListener('pagehide', writeNow);

    return {
      flush: writeNow,
      clearPending: () => {
        clearTimeout(timer);
        timer = null;
      },
      cancel: () => {
        clearTimeout(timer);
        timer = null;
      },
    };
  }

  // Asks the user whether to restore an unsaved draft. Resolves true when the
  // draft should be applied, false when it should be discarded (which clears it).
  async function promptRestore({ label, draft, key }) {
    let msg = `You have unsaved ${label} changes saved ${formatAge(draft && draft.savedAt)}.`;
    if (draft && draft.line_items) {
      msg += ` Includes ${draft.line_items.length} line item${draft.line_items.length === 1 ? '' : 's'}.`;
    }
    const ok = await window.QuoteCraftUtils.confirmAction({
      title: 'Restore unsaved changes?',
      message: msg,
      confirmText: 'Restore draft',
      cancelText: 'No, discard',
    });
    if (!ok && key) clear(key);
    return ok;
  }

  window.QuoteCraftDrafts = {
    save,
    load,
    clear,
    exists,
    formatAge,
    startAutosave,
    promptRestore,
  };
})();