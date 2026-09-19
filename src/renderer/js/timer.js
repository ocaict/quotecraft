(function () {
  'use strict';

  var indicator = document.getElementById('liveTimerIndicator');
  if (!indicator) return;

  var Q = window.QuoteCraftUtils;
  var toast = function (message, type) {
    if (Q) Q.showToast(message, type);
  };

  // ---------- Modal refs ----------
  var startModal = document.getElementById('startTimerModal');
  var startForm = document.getElementById('startTimerForm');
  var startModalClose = document.getElementById('startTimerModalClose');
  var startCancelBtn = document.getElementById('startTimerCancelBtn');
  var startSubmitBtn = document.getElementById('startTimerSubmitBtn');
  var timerClient = document.getElementById('timerClient');
  var timerProject = document.getElementById('timerProject');
  var timerDescription = document.getElementById('timerDescription');

  // ---------- State ----------
  var state = {
    timer: null,
    startOffset: 0,
    roundingMinutes: 6,
    recovered: false,
    clients: [],
    allProjects: [],
    projectsByClient: {},
  };

  var elapsedEl = indicator.querySelector('.live-timer-elapsed');
  var clientEl = document.getElementById('liveTimerClient');
  var stopBtn = document.getElementById('liveTimerStopBtn');
  var discardBtn = document.getElementById('liveTimerDiscardBtn');
  var sidebarTimerBadge = document.getElementById('sidebarTimerBadge');
  var sidebarTimerTime = document.getElementById('sidebarTimerTime');
  var timerClickArea = document.getElementById('liveTimerClickArea');

  // ---------- Formatting ----------
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function fmtElapsed(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h + ':' + pad(m) + ':' + pad(sec);
  }

  function formatFull(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var parts = [];
    if (h > 0) parts.push(h + 'h');
    if (m > 0 || h > 0) parts.push(m + 'm');
    parts.push(sec + 's');
    return parts.join(' ');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function previewHours(ms) {
    if (!state.roundingMinutes) {
      return Math.round((ms / 3600000) * 100) / 100;
    }
    var inc = state.roundingMinutes / 60;
    return Math.round((ms / 3600000) / inc) * inc;
  }

  // ---------- Render ----------
  function render() {
    if (!state.timer) {
      indicator.classList.add('hidden');
      if (sidebarTimerBadge) sidebarTimerBadge.classList.add('hidden');
      if (document.title !== 'QuoteCraft') document.title = 'QuoteCraft';
      return;
    }
    var elapsed = Date.now() - state.startOffset;
    var formatted = fmtElapsed(elapsed);
    indicator.classList.remove('hidden');
    elapsedEl.textContent = formatted;
    if (sidebarTimerBadge) {
      sidebarTimerBadge.classList.remove('hidden');
      if (sidebarTimerTime) sidebarTimerTime.textContent = formatted;
    }
    document.title = '⏱ ' + formatted + ' · QuoteCraft';
  }

  function setInfo(timer) {
    var label = timer.client_name || 'Client #' + timer.client_id;
    if (timer.client_company) label += ' (' + timer.client_company + ')';
    if (timer.project_name) label += ' — ' + timer.project_name;
    if (state.recovered) label += ' · resumed';
    clientEl.textContent = label;
  }

  // ---------- Load ----------
  async function load() {
    try {
      const [timerRes, setRes] = await Promise.all([
        window.electronAPI.getTimer(),
        window.electronAPI.getTimerSettings(),
      ]);
      if (setRes.ok && setRes.settings) {
        state.roundingMinutes = setRes.settings.roundingMinutes;
      }
      if (timerRes.ok && timerRes.timer) {
        state.timer = timerRes.timer;
        state.recovered = true;
        state.startOffset = Date.now() - timerRes.timer.elapsed_ms;
        setInfo(timerRes.timer);
      }
    } catch (e) {
      /* indicator stays hidden; timer page still works */
    }
    render();
    window.setInterval(render, 1000);
  }

  function clearTimer() {
    state.timer = null;
    state.recovered = false;
    render();
  }

  // ---------- Stop / Discard ----------
  async function handleStop() {
    if (!state.timer) return;
    var mgr = getManagerLabel();
    var elapsed = Date.now() - state.startOffset;
    var rounded = previewHours(elapsed);
    var msg =
      'Stop the timer for ' + mgr + ' (' + fmtElapsed(elapsed) + ')?\n' +
      'This logs ' + (rounded > 0 ? rounded.toFixed(2) : '0') + 'h as a new Unbilled time entry (rounded to ' +
      (state.roundingMinutes ? state.roundingMinutes + ' minutes' : 'exact time') + ').';
    var confirmed = await Q.confirmAction({
      title: 'Stop timer & log time entry?',
      message: msg,
      confirmText: "Stop & Log",
    });
    if (!confirmed) return;

    try {
      const res = await window.electronAPI.stopTimer();
      if (res.ok) {
        toast('Logged ' + Number(res.hours).toFixed(2) + 'h for ' + mgr + '.', 'success');
        clearTimer();
        window.dispatchEvent(new CustomEvent('qc-timer-stopped', { detail: res.entry }));
      } else {
        var errMsg = res.errors && res.errors.general ? res.errors.general : 'Could not stop the timer.';
        toast(errMsg, 'error');
      }
    } catch (e) {
      toast('Could not stop the timer: ' + e.message, 'error');
    }
  }

  function getManagerLabel() {
    if (state.timer && state.timer.client_name) {
      var label = state.timer.client_name;
      if (state.timer.project_name) label += ' / ' + state.timer.project_name;
      return label;
    }
    return 'the client';
  }

  async function handleDiscard() {
    if (!state.timer) return;
    var elapsed = Date.now() - state.startOffset;
    var confirmed = await Q.confirmAction({
      title: 'Discard running timer?',
      message: 'Discard the running timer (' + fmtElapsed(elapsed) + ' elapsed) without logging any time? This cannot be undone.',
      confirmText: 'Discard',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const res = await window.electronAPI.discardTimer();
      if (res.ok) {
        toast('Timer discarded — no time was logged.', 'success');
        clearTimer();
        window.dispatchEvent(new CustomEvent('qc-timer-discarded'));
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not discard the timer.', 'error');
      }
    } catch (e) {
      toast('Could not discard the timer: ' + e.message, 'error');
    }
  }

  // ---------- Start modal ----------
  function projectsFor(clientId) {
    return clientId ? (state.projectsByClient[clientId] || []) : state.allProjects;
  }

  function clientLabel(c) {
    return c && (c.name || '').trim()
      ? c.name + (c.company_name ? ' (' + c.company_name + ')' : '')
      : 'Client #' + (c ? c.id : '?');
  }

  function fillClientOptions() {
    var html = '<option value="">Select a client…</option>';
    state.clients.forEach(function (c) {
      html += '<option value="' + c.id + '">' + escapeHtml(clientLabel(c)) + '</option>';
    });
    timerClient.innerHTML = html;
  }

  function fillProjectOptions() {
    var list = projectsFor(timerClient.value);
    var html = '<option value="">No project (client only)</option>';
    list.forEach(function (p) {
      html += '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>';
    });
    timerProject.innerHTML = html;
  }

  async function ensureOptions() {
    if (state.clients.length === 0) {
      try {
        const cliRes = await window.electronAPI.listClients();
        if (cliRes.ok) state.clients = cliRes.clients || [];
      } catch (e) { /* ignore */ }
    }
    if (state.allProjects.length === 0) {
      try {
        const projRes = await window.electronAPI.listProjects();
        if (projRes.ok) {
          state.allProjects = projRes.projects || [];
          state.projectsByClient = {};
          state.allProjects.forEach(function (p) {
            var key = String(p.client_id);
            if (!state.projectsByClient[key]) state.projectsByClient[key] = [];
            state.projectsByClient[key].push(p);
          });
        }
      } catch (e) { /* ignore */ }
    }
  }

  function closeStartModal() {
    startModal.classList.add('hidden');
    startForm.querySelectorAll('.field-error').forEach(function (el) { el.textContent = ''; });
  }

  function showFieldError(fieldName, message) {
    const el = startForm.querySelector('[data-error-for="' + fieldName + '"]');
    if (el) el.textContent = message;
  }

  async function openStart() {
    await ensureOptions();
    fillClientOptions();
    fillProjectOptions();
    closeStartModal();
    startModal.classList.remove('hidden');
    timerClient.focus();
  }

  async function handleStartSubmit(e) {
    e.preventDefault();
    startForm.querySelectorAll('.field-error').forEach(function (el) { el.textContent = ''; });

    if (state.timer) {
      // A timer is already running — never silently lose it. Confirm stopping
      // (logs the entry) before opening a fresh start; we're already here with
      // the modal open, so stop first then re-render options.
      const mgr = getManagerLabel();
      const elapsed = Date.now() - state.startOffset;
      const rounded = previewHours(elapsed);
      const confirmed = await Q.confirmAction({
        title: 'Stop the running timer first?',
        message:
          'A timer is already running for ' + mgr + ' (' + fmtElapsed(elapsed) + ' elapsed).\n' +
          'Starting a new one will stop it first and log ' +
          (rounded > 0 ? rounded.toFixed(2) : '0') + 'h as a time entry. Continue?',
        confirmText: 'Stop & Start New',
      });
      if (!confirmed) return;

      try {
        const res = await window.electronAPI.stopTimer();
        if (res.ok) {
          toast('Logged ' + Number(res.hours).toFixed(2) + 'h for ' + mgr + '.', 'success');
          window.dispatchEvent(new CustomEvent('qc-timer-stopped', { detail: res.entry }));
        } else {
          toast(res.errors && res.errors.general ? res.errors.general : 'Could not stop the current timer.', 'error');
          return;
        }
      } catch (err) {
        toast('Could not stop the current timer: ' + err.message, 'error');
        return;
      }
      clearTimer();
    }

    const payload = {
      client_id: timerClient.value,
      project_id: timerProject.value,
      description: timerDescription.value.trim(),
    };

    try {
      const res = await window.electronAPI.startTimer(payload);
      if (res.ok) {
        state.timer = res.timer;
        state.recovered = false;
        state.startOffset = Date.now() - res.timer.elapsed_ms;
        setInfo(res.timer);
        render();
        closeStartModal();
        toast('Timer started for ' + (res.timer.client_name || 'the client') + '.', 'success');
        window.dispatchEvent(new CustomEvent('qc-timer-started', { detail: res.timer }));
      } else {
        if (res.errors) {
          let showed = false;
          for (const [field, msg] of Object.entries(res.errors)) {
            if (field === 'general') toast(msg, 'error');
            else { showFieldError(field, msg); showed = true; }
          }
          if (showed) toast('Please correct the highlighted fields.', 'error');
        } else {
          toast('Could not start the timer.', 'error');
        }
      }
    } catch (e) {
      toast('Could not start the timer: ' + e.message, 'error');
    }
  }

  // ---------- Wiring ----------
  stopBtn.addEventListener('click', handleStop);
  discardBtn.addEventListener('click', handleDiscard);
  startModalClose.addEventListener('click', closeStartModal);
  startCancelBtn.addEventListener('click', closeStartModal);
  startModal.addEventListener('click', function (e) {
    if (e.target === startModal) closeStartModal();
  });
  timerClient.addEventListener('change', fillProjectOptions);
  startForm.addEventListener('submit', handleStartSubmit);

  if (timerClickArea) {
    timerClickArea.addEventListener('click', function () {
      if (window.QuoteCraftUtils && window.QuoteCraftUtils.goToPage) {
        window.QuoteCraftUtils.goToPage('time-entries');
      }
    });
  }

  window.QuoteCraftTimer = {
    openStart: openStart,
    isRunning: function () { return !!state.timer; },
    getElapsedMs: function () { return state.timer ? Date.now() - state.startOffset : 0; },
  };

  load();
})();