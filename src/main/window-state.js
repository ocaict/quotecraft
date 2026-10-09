const fs = require('fs');
const path = require('path');
const { app, screen } = require('electron');

function getWindowStatePath() {
  const userData = app.getPath('userData');
  return path.join(userData, 'window-state.json');
}

function loadWindowState(defaults = { width: 1280, height: 800 }) {
  const statePath = getWindowStatePath();
  let state = {
    width: defaults.width,
    height: defaults.height,
    x: undefined,
    y: undefined,
    isMaximized: false,
  };

  try {
    if (fs.existsSync(statePath)) {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (Number.isInteger(data.width) && data.width >= 800) state.width = data.width;
      if (Number.isInteger(data.height) && data.height >= 500) state.height = data.height;
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        // Validate coordinates exist within currently visible displays
        const visible = screen.getAllDisplays().some((display) => {
          const { x, y, width, height } = display.bounds;
          return (
            data.x >= x - 50 &&
            data.x < x + width &&
            data.y >= y - 50 &&
            data.y < y + height
          );
        });
        if (visible) {
          state.x = data.x;
          state.y = data.y;
        }
      }
      if (typeof data.isMaximized === 'boolean') state.isMaximized = data.isMaximized;
    }
  } catch (e) {
    /* ignore and use defaults */
  }

  return state;
}

function trackWindowState(win) {
  if (!win) return;
  const statePath = getWindowStatePath();
  let debounceTimer = null;

  function save() {
    if (!win || win.isDestroyed()) return;
    try {
      const isMaximized = win.isMaximized();
      let bounds = win.getBounds();
      const state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
      };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
      /* ignore */
    }
  }

  function debouncedSave() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(save, 500);
  }

  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);
  win.on('close', save);
}

module.exports = {
  loadWindowState,
  trackWindowState,
};
