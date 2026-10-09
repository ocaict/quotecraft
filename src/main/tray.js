const { Tray, Menu, app } = require('electron');
const path = require('path');

let tray = null;

function setupTray(mainWindow) {
  // Only create once
  if (tray) return tray;

  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'icons', 'icon.png');

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('QuoteCraft');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open QuoteCraft',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    /* Tray might fail if icon missing in headless test environment; silent fallback */
  }

  return tray;
}

function destroyTray() {
  if (tray) {
    try {
      tray.destroy();
    } catch (e) {
      /* ignore */
    }
    tray = null;
  }
}

module.exports = {
  setupTray,
  destroyTray,
};
