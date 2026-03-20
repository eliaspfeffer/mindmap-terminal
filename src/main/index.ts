import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { terminalManager } from './terminalManager'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function buildMenu(): void {
  // Custom app menu: keeps standard macOS items (copy/paste, devtools, etc.)
  // but removes "Close Window" (⌘W) so it doesn't conflict with our Ctrl+K shortcut.
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' }
        // ⌘W "Close Window" intentionally omitted — handled by the app
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.eliaspfeffer.mindmapterminal')

  buildMenu()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // ── Terminal IPC ────────────────────────────────────────────────────────────
  const safeSend = (channel: string, payload: unknown) => {
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('terminal:create', (_, { id, cwd, cols, rows, initialCommand }) => {
    terminalManager.create(id, cwd, cols, rows,
      (data) => safeSend('terminal:data', { id, data }),
      (busy) => safeSend('terminal:status', { id, busy }),
      initialCommand
    )
  })

  ipcMain.handle('terminal:write', (_, { id, data }) => terminalManager.write(id, data))
  ipcMain.handle('terminal:resize', (_, { id, cols, rows }) => terminalManager.resize(id, cols, rows))
  ipcMain.handle('terminal:close', (_, { id }) => terminalManager.close(id))

  // ── File IPC ─────────────────────────────────────────────────────────────────
  ipcMain.handle('file:save', async (_, { data, filePath }) => {
    let targetPath: string = filePath
    if (!targetPath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: 'mindmap.json',
        filters: [{ name: 'Mindmap', extensions: ['json'] }]
      })
      if (result.canceled || !result.filePath) return { success: false }
      targetPath = result.filePath
    }
    writeFileSync(targetPath, data, 'utf-8')
    return { success: true, filePath: targetPath }
  })

  ipcMain.handle('file:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Mindmap', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false }
    const data = readFileSync(result.filePaths[0], 'utf-8')
    return { success: true, data, filePath: result.filePaths[0] }
  })

  // ── Env IPC ───────────────────────────────────────────────────────────────
  ipcMain.handle('env:get', () => ({
    HOME: process.env.HOME || '/Users'
  }))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  terminalManager.closeAll()
  if (process.platform !== 'darwin') app.quit()
})
