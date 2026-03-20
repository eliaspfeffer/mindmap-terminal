import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.eliaspfeffer.mindmapterminal')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // ── Terminal IPC ────────────────────────────────────────────────────────────
  ipcMain.handle('terminal:create', (_, { id, cwd, cols, rows, initialCommand }) => {
    terminalManager.create(id, cwd, cols, rows,
      (data) => mainWindow.webContents.send('terminal:data', { id, data }),
      (busy) => mainWindow.webContents.send('terminal:status', { id, busy }),
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
