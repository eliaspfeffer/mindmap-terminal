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

  // ── Label commit ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, label } = (e as CustomEvent<{ id: string; label: string }>).detail
      store.updateNodeLabel(id, label)
    }
    window.addEventListener('node:labelcommit', handler)
    return () => window.removeEventListener('node:labelcommit', handler)
  }, [store])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handle = async (e: KeyboardEvent) => {
      const { selectedNodeId, nodes } = store
      const active = document.activeElement

      // Don't intercept inside xterm or input fields
      if (active?.closest('.xterm') || active?.tagName === 'INPUT') return

      const isEditing = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
      if (isEditing) return

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

        // ⌘T → attach terminal
        if ((e.metaKey || e.ctrlKey) && e.key === 't') {
          e.preventDefault()
          store.attachTerminal(selectedNodeId, homeRef.current)
          return
        }

        // ⌘Enter → toggle terminal size
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          store.toggleTerminalSize(selectedNodeId)
          return
        }

        // ⌘W → close terminal
        if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
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
        Tab add child · Enter add sibling · F2 rename · ⌘T terminal · ⌘↩ resize · ⌘W close terminal · Del delete · ⌘S save · ⌘O open
      </div>
    </div>
  )
}

export default MindMapCanvas
