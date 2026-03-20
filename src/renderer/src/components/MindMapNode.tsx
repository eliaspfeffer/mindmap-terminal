import React, { useEffect, useRef, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MindMapNodeData, TerminalStatus } from '../types'

const STATUS_COLOR: Record<TerminalStatus, string> = {
  idle: '#22c55e',
  busy: '#f59e0b',
  attention: '#ef4444'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MindMapNode: React.FC<NodeProps<any>> = ({ id, data, selected }) => {
  const d = data as MindMapNodeData
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (d.editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [d.editing])

  const commit = useCallback(
    (value: string) => {
      window.dispatchEvent(
        new CustomEvent('node:labelcommit', { detail: { id, label: value.trim() || d.label } })
      )
    },
    [id, d.label]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        commit(e.currentTarget.value)
      }
      // Prevent Tab from bubbling to canvas handler while editing
      if (e.key === 'Tab') {
        e.stopPropagation()
      }
    },
    [commit]
  )

  return (
    <div
      style={{
        background: selected ? '#1e3a5f' : '#1e293b',
        border: `2px solid ${selected ? '#3b82f6' : '#334155'}`,
        borderRadius: 10,
        padding: '8px 14px',
        minWidth: 130,
        color: '#f1f5f9',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: selected
          ? '0 0 0 3px rgba(59,130,246,0.25), 0 4px 16px rgba(0,0,0,0.5)'
          : '0 2px 10px rgba(0,0,0,0.4)',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        userSelect: 'none'
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#3b82f6', width: 8, height: 8, border: 'none' }}
      />

      {d.editing ? (
        <input
          ref={inputRef}
          defaultValue={d.label}
          onKeyDown={handleKeyDown}
          onBlur={(e) => commit(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f1f5f9',
            fontSize: 14,
            fontWeight: 500,
            width: '100%',
            minWidth: 90
          }}
        />
      ) : (
        <span>{d.label}</span>
      )}

      {d.terminalId && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: STATUS_COLOR[d.terminalStatus ?? 'idle'],
            flexShrink: 0,
            animation: d.terminalStatus === 'busy' ? 'statusPulse 1.2s ease-in-out infinite' : 'none'
          }}
        />
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#3b82f6', width: 8, height: 8, border: 'none' }}
      />
    </div>
  )
}

export default MindMapNode
