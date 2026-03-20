import * as pty from 'node-pty'
import { platform } from 'os'

interface TerminalSession {
  pty: pty.IPty
  onData: (data: string) => void
  onStatus: (busy: boolean) => void
  busy: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
}

const SHELL = platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
const IDLE_TIMEOUT_MS = 600

class TerminalManager {
  private sessions = new Map<string, TerminalSession>()

  create(
    id: string,
    cwd: string,
    cols: number,
    rows: number,
    onData: (data: string) => void,
    onStatus: (busy: boolean) => void
  ): void {
    if (this.sessions.has(id)) return

    const ptyProcess = pty.spawn(SHELL, [], {
      name: 'xterm-256color',
      cols: Math.max(cols, 10),
      rows: Math.max(rows, 5),
      cwd: cwd || process.env.HOME || '/',
      env: process.env as Record<string, string>
    })

    const session: TerminalSession = {
      pty: ptyProcess,
      onData,
      onStatus,
      busy: false,
      idleTimer: null
    }

    ptyProcess.onData((data) => {
      onData(data)
      if (!session.busy) {
        session.busy = true
        onStatus(true)
      }
      if (session.idleTimer) clearTimeout(session.idleTimer)
      session.idleTimer = setTimeout(() => {
        session.busy = false
        onStatus(false)
      }, IDLE_TIMEOUT_MS)
    })

    ptyProcess.onExit(() => {
      if (session.idleTimer) clearTimeout(session.idleTimer)
      this.sessions.delete(id)
      onStatus(false)
    })

    this.sessions.set(id, session)
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    try {
      session.pty.resize(Math.max(cols, 10), Math.max(rows, 5))
    } catch {
      // ignore resize errors
    }
  }

  close(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.idleTimer) clearTimeout(session.idleTimer)
    try { session.pty.kill() } catch { /* already dead */ }
    this.sessions.delete(id)
  }

  closeAll(): void {
    for (const [id] of this.sessions) this.close(id)
  }
}

export const terminalManager = new TerminalManager()
