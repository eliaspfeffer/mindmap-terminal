import React, { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeChange,
  type EdgeChange,
  type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import MindMapNode from './MindMapNode'
import TerminalNode from './TerminalNode'
import { useStore } from '../store/mindmapStore'

const NODE_TYPES = { mindmap: MindMapNode, terminal: TerminalNode }

const MindMapCanvas: React.FC = () => {
  const store = useStore()
  const homeRef = useRef<string>('/Users')

  // Fetch HOME from main process once
  useEffect(() => {
    window.api.env.get().then(({ HOME }) => { homeRef.current = HOME })
  }, [])

  // ── React Flow change handlers (write-through to store) ────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      store.setNodes(applyNodeChanges(changes, store.nodes as any) as any)
    },
    [store]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      store.setEdges(applyEdgeChanges(changes, store.edges as any) as any)
    },
    [store]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      store.setEdges(addEdge(connection, store.edges as any) as any)
    },
    [store]
  )

  // ── Click handlers ─────────────────────────────────────────────────────────
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      store.setSelected(node.id)
    },
    [store]
  )

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: { id: string; type?: string }) => {
      if (node.type === 'mindmap') store.startEditing(node.id)
    },
    [store]
  )

  const onPaneClick = useCallback(() => store.setSelected(null), [store])

  // ── Label commit + single-keypress node creation from within input ─────────
  useEffect(() => {
    const onCommit = (e: Event) => {
      const { id, label } = (e as CustomEvent<{ id: string; label: string }>).detail
      store.updateNodeLabel(id, label)
    }
    const onCreateChild = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail
      store.addChildNode(id)
    }
    const onCreateSibling = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail
      store.addSiblingNode(id)
    }
    window.addEventListener('node:labelcommit', onCommit)
    window.addEventListener('node:createchild', onCreateChild)
    window.addEventListener('node:createsibling', onCreateSibling)
    return () => {
      window.removeEventListener('node:labelcommit', onCommit)
      window.removeEventListener('node:createchild', onCreateChild)
      window.removeEventListener('node:createsibling', onCreateSibling)
    }
  }, [store])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handle = async (e: KeyboardEvent) => {
      const { selectedNodeId, nodes } = store
      // e.target is the element that dispatched the event (always accurate for
      // keyboard events). document.activeElement can be stale between frames.
      const target = e.target as Element | null

      // Don't intercept keys while focus is inside a terminal or any text input
      if (
        target?.closest('.xterm') ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA'
      ) return

      // ── File operations (no node required) ────────────────────────────────
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        const state = { nodes: store.nodes, edges: store.edges }
        const res = await window.api.file.save(
          JSON.stringify(state, null, 2),
          store.currentFilePath ?? undefined
        )
        if (res.success && res.filePath) store.setFilePath(res.filePath)
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        const res = await window.api.file.open()
        if (res.success && res.data && res.filePath) {
          const { nodes, edges } = JSON.parse(res.data)
          store.loadState(nodes, edges, res.filePath)
        }
        return
      }

      if (!selectedNodeId) return
      const selectedNode = nodes.find((n) => n.id === selectedNodeId)
      if (!selectedNode) return

      // ── Arrow key navigation (any node type) ──────────────────────────────
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const { edges } = store
        let targetId: string | null = null

        if (e.key === 'ArrowLeft') {
          // Go to parent
          const parentEdge = edges.find((ed) => ed.target === selectedNodeId)
          if (parentEdge) targetId = parentEdge.source
        } else if (e.key === 'ArrowRight') {
          // Go to first mindmap child
          const childEdge = edges.find(
            (ed) => ed.source === selectedNodeId && nodes.find((n) => n.id === ed.target && n.type === 'mindmap')
          )
          if (childEdge) targetId = childEdge.target
        } else {
          // Up / Down → navigate siblings (same parent, mindmap nodes only)
          const parentEdge = edges.find((ed) => ed.target === selectedNodeId)
          if (parentEdge) {
            const siblings = edges
              .filter(
                (ed) =>
                  ed.source === parentEdge.source &&
                  nodes.find((n) => n.id === ed.target && n.type === 'mindmap')
              )
              .map((ed) => ed.target)
            const idx = siblings.indexOf(selectedNodeId)
            if (e.key === 'ArrowUp' && idx > 0) targetId = siblings[idx - 1]
            if (e.key === 'ArrowDown' && idx < siblings.length - 1) targetId = siblings[idx + 1]
          }
        }

        if (targetId) {
          store.setNodes(store.nodes.map((n) => ({ ...n, selected: n.id === targetId })))
          store.setSelected(targetId)
        }
        return
      }

      // ── Mindmap-node-only shortcuts ────────────────────────────────────────
      if (selectedNode.type === 'mindmap') {
        // Tab → add child
        if (e.key === 'Tab') {
          e.preventDefault()
          store.addChildNode(selectedNodeId)
          return
        }

        // Enter (no modifier) → add sibling
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          store.addSiblingNode(selectedNodeId)
          return
        }

        // F2 → start editing
        if (e.key === 'F2') {
          e.preventDefault()
          store.startEditing(selectedNodeId)
          return
        }

        // Ctrl+T → attach terminal with Claude already running
        if (e.ctrlKey && !e.metaKey && e.key === 't' && !e.shiftKey) {
          e.preventDefault()
          store.attachTerminal(selectedNodeId, homeRef.current, 'claude')
          return
        }

        // Ctrl+Shift+T → attach plain terminal
        if (e.ctrlKey && !e.metaKey && e.shiftKey && e.key === 'T') {
          e.preventDefault()
          store.attachTerminal(selectedNodeId, homeRef.current)
          return
        }

        // Ctrl+Enter → toggle terminal size
        if (e.ctrlKey && !e.metaKey && e.key === 'Enter') {
          e.preventDefault()
          store.toggleTerminalSize(selectedNodeId)
          return
        }

        // Ctrl+K → close/detach terminal from node
        if (e.ctrlKey && !e.metaKey && e.key === 'k') {
          e.preventDefault()
          const node = selectedNode as any
          if (node.data.terminalId) {
            window.api.terminal.close(node.data.terminalId)
            store.detachTerminal(selectedNodeId)
          }
          return
        }
      }

      // Delete / Backspace → remove node
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const node = selectedNode as any
        if (node.data?.terminalId) window.api.terminal.close(node.data.terminalId)
        store.deleteNode(selectedNodeId)
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [store])

  // ── Edge style overrides ───────────────────────────────────────────────────
  const styledEdges = store.edges.map((e: any) => ({
    ...e,
    style:
      e.type === 'terminal'
        ? { stroke: '#1e40af', strokeWidth: 1.5, strokeDasharray: '5 3' }
        : { stroke: '#334155', strokeWidth: 1.5 }
  }))

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .react-flow__controls { background: #1e293b !important; border: 1px solid #334155 !important; border-radius: 8px !important; }
        .react-flow__controls-button { background: #1e293b !important; border-bottom-color: #334155 !important; color: #94a3b8 !important; }
        .react-flow__controls-button:hover { background: #334155 !important; }
        .react-flow__minimap { border: 1px solid #1e293b !important; border-radius: 8px !important; overflow: hidden; }
        .react-flow__handle { opacity: 0; transition: opacity 0.15s; }
        .react-flow__node:hover .react-flow__handle,
        .react-flow__node.selected .react-flow__handle { opacity: 1; }
      `}</style>

      <ReactFlow
        nodes={store.nodes as any}
        edges={styledEdges as any}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick as any}
        onNodeDoubleClick={onNodeDoubleClick as any}
        onPaneClick={onPaneClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#1e293b"
          gap={22}
          size={1}
        />
        <Controls showInteractive={false} />
        <MiniMap
          style={{ background: '#0a0f1e' }}
          nodeColor="#1e293b"
          maskColor="rgba(0,0,0,0.55)"
        />
      </ReactFlow>

      {/* ── Hint bar ────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #1e293b',
          borderRadius: 8,
          padding: '5px 16px',
          color: '#475569',
          fontSize: 11,
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        Tab child · Enter sibling · F2 rename · ← → ↑ ↓ navigate · ^T claude · ^⇧T terminal · ^↩ resize · ^K close terminal · Del delete · ⌘S save · ⌘O open
      </div>
    </div>
  )
}

export default MindMapCanvas
