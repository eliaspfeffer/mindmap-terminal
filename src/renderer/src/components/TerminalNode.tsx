import React, { useEffect, useRef, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useStore } from '../store/mindmapStore'
import type { TerminalNodeData, TerminalStatus } from '../types'

const SMALL = { width: 440, termHeight: 160 }
const LARGE = { width: 760, termHeight: 420 }

const STATUS_COLOR: Record<TerminalStatus, string> = {
  idle: '#22c55e',
  busy: '#f59e0b',
  attention: '#ef4444'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TerminalNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const d = data as TerminalNodeData
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const mountedRef = useRef(false)
  // Refs so the custom key handler always sees the latest values without re-registering
  const parentNodeIdRef = useRef(d.parentNodeId)
  const toggleTerminalSize = useStore((s) => s.toggleTerminalSize)
  const updateTerminalStatus = useStore((s) => s.updateTerminalStatus)
  const toggleTerminalSizeRef = useRef(toggleTerminalSize)

  useEffect(() => { parentNodeIdRef.current = d.parentNodeId }, [d.parentNodeId])
  useEffect(() => { toggleTerminalSizeRef.current = toggleTerminalSize }, [toggleTerminalSize])

  const { width, termHeight } = d.size === 'large' ? LARGE : SMALL

  // ── Bootstrap terminal once ────────────────────────────────────────────────
  const boot = useCallback(async () => {
    if (mountedRef.current || !containerRef.current) return
    mountedRef.current = true

    const term = new Terminal({
      theme: {
        background: '#0a0f1e',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#0a0f1e',
        selectionBackground: '#1e40af55',
        black: '#1e293b',
        brightBlack: '#475569'
      },
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Standard xterm.js input path: forward everything typed to the PTY.
    // xterm handles all key-to-sequence translation, IME, paste, etc.
    term.onData(data => window.api.terminal.write(d.terminalId, data))

    // Intercept Ctrl+Enter before xterm sees it — that's our resize shortcut.
    // Return false = xterm ignores the key (but DOM event still propagates).
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && !e.metaKey && e.key === 'Enter') {
        toggleTerminalSizeRef.current(parentNodeIdRef.current)
        return false
      }
      return true
    })

    // React Flow v12 uses pointer events (pointerdown) for drag/selection handling.
    // We must stop BOTH pointerdown and mousedown to prevent React Flow from
    // processing the event and stealing keyboard focus away from xterm.
    const stopAndFocus = (e: Event) => {
      e.stopPropagation()
      term.focus()
      console.log('[xterm] focus called, activeElement:', document.activeElement?.tagName, document.activeElement?.className)
    }
    containerRef.current.addEventListener('pointerdown', stopAndFocus)
    containerRef.current.addEventListener('mousedown', stopAndFocus)


    term.onResize(({ cols, rows }) => window.api.terminal.resize(d.terminalId, cols, rows))

    await window.api.terminal.create(d.terminalId, d.cwd, term.cols, term.rows, d.initialCommand)

    // Focus after PTY is ready
    term.focus()
  }, [d.terminalId, d.cwd])

  useEffect(() => {
    boot()
    return () => {
      xtermRef.current?.dispose()
      xtermRef.current = null
      mountedRef.current = false
      window.api.terminal.close(d.terminalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Receive output ─────────────────────────────────────────────────────────
  useEffect(() => {
    return window.api.terminal.onData((id, raw) => {
      if (id === d.terminalId) xtermRef.current?.write(raw)
    })
  }, [d.terminalId])

  // ── Receive status updates ─────────────────────────────────────────────────
  useEffect(() => {
    return window.api.terminal.onStatus((id, busy) => {
      if (id === d.terminalId) updateTerminalStatus(d.terminalId, busy ? 'busy' : 'idle')
    })
  }, [d.terminalId, updateTerminalStatus])

  // ── Refit on size toggle ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => fitAddonRef.current?.fit(), 60)
    return () => clearTimeout(t)
  }, [d.size])

  // ── Focus xterm whenever this node becomes selected (keyboard navigation) ──
  useEffect(() => {
    if (selected) {
      setTimeout(() => xtermRef.current?.focus(), 50)
    }
  }, [selected])

  const headerLabel = d.cwd.replace(/^\/Users\/[^/]+/, '~')

  return (
    <div
      style={{
        width,
        background: '#0a0f1e',
        border: `2px solid ${selected ? '#3b82f6' : d.status === 'attention' ? '#ef4444' : '#1e293b'}`,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: selected
          ? '0 0 0 3px rgba(59,130,246,0.25), 0 8px 32px rgba(0,0,0,0.7)'
          : '0 4px 24px rgba(0,0,0,0.6)',
        transition: 'border-color 0.12s, width 0.2s, box-shadow 0.12s',
        outline: 'none'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#1e40af', width: 8, height: 8, border: 'none' }}
      />

      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '5px 10px',
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          gap: 7,
          userSelect: 'none'
        }}
      >
        {/* Traffic-light status dot */}
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: STATUS_COLOR[d.status],
            flexShrink: 0,
            animation: d.status === 'busy' ? 'statusPulse 1.2s ease-in-out infinite' : 'none'
          }}
        />
        <span style={{ color: '#64748b', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {headerLabel}
        </span>
        <span style={{ color: '#334155', fontSize: 10, letterSpacing: '0.03em', flexShrink: 0 }}>
          ^↩ {d.size === 'small' ? 'expand' : 'shrink'} · ^K close
        </span>
      </div>

      {/* ── xterm.js viewport ───────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="nodrag"
        style={{ height: termHeight, padding: '2px 4px', outline: 'none' }}
      />
    </div>
  )
}

export default TerminalNode
