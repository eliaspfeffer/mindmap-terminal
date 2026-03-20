import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const api = {
  terminal: {
    create: (id: string, cwd: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:create', { id, cwd, cols, rows }),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    close: (id: string) =>
      ipcRenderer.invoke('terminal:close', { id }),
    onData: (cb: (id: string, data: string) => void) => {
      const handler = (_: IpcRendererEvent, payload: { id: string; data: string }) =>
        cb(payload.id, payload.data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onStatus: (cb: (id: string, busy: boolean) => void) => {
      const handler = (_: IpcRendererEvent, payload: { id: string; busy: boolean }) =>
        cb(payload.id, payload.busy)
      ipcRenderer.on('terminal:status', handler)
      return () => ipcRenderer.removeListener('terminal:status', handler)
    }
  },
  file: {
    save: (data: string, filePath?: string) =>
      ipcRenderer.invoke('file:save', { data, filePath }),
    open: (): Promise<{ success: boolean; data?: string; filePath?: string }> =>
      ipcRenderer.invoke('file:open')
  },
  env: {
    get: (): Promise<{ HOME: string }> => ipcRenderer.invoke('env:get')
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}
