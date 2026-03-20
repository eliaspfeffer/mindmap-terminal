import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { AppNode, AppEdge, TerminalStatus } from '../types'

const ROOT: AppNode = {
  id: 'root',
  type: 'mindmap',
  position: { x: 600, y: 340 },
  data: { label: 'My Project' }
}

interface Store {
  nodes: AppNode[]
  edges: AppEdge[]
  selectedNodeId: string | null
  currentFilePath: string | null

  setNodes: (nodes: AppNode[]) => void
  setEdges: (edges: AppEdge[]) => void
  setSelected: (id: string | null) => void

  addChildNode: (parentId: string) => string
  addSiblingNode: (nodeId: string) => string
  deleteNode: (id: string) => void
  updateNodeLabel: (id: string, label: string) => void
  startEditing: (id: string) => void

  attachTerminal: (nodeId: string, cwd: string, initialCommand?: string) => string
  detachTerminal: (nodeId: string) => void
  updateTerminalStatus: (terminalId: string, status: TerminalStatus) => void
  toggleTerminalSize: (nodeId: string) => void

  loadState: (nodes: AppNode[], edges: AppEdge[], filePath: string) => void
  setFilePath: (path: string) => void
}

export const useStore = create<Store>((set, get) => ({
  nodes: [ROOT],
  edges: [],
  selectedNodeId: null,
  currentFilePath: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelected: (id) => set({ selectedNodeId: id }),

  // ── Node operations ─────────────────────────────────────────────────────────

  addChildNode: (parentId) => {
    const { nodes, edges } = get()
    const parent = nodes.find((n) => n.id === parentId)
    if (!parent) return parentId

    // Stack children vertically with 80px spacing
    const childCount = edges.filter((e) => e.source === parentId).length
    const newId = uuid()
    const newNode: AppNode = {
      id: newId,
      type: 'mindmap',
      position: { x: parent.position.x + 240, y: parent.position.y + childCount * 80 },
      data: { label: 'New node', editing: true },
      selected: true
    }
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), newNode],
      edges: [...edges, { id: `e-${parentId}-${newId}`, source: parentId, target: newId }],
      selectedNodeId: newId
    })
    return newId
  },

  addSiblingNode: (nodeId) => {
    const { nodes, edges } = get()
    if (nodeId === 'root') return nodeId
    const parentEdge = edges.find((e) => e.target === nodeId)
    if (!parentEdge) return nodeId
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return nodeId

    const newId = uuid()
    const newNode: AppNode = {
      id: newId,
      type: 'mindmap',
      position: { x: node.position.x, y: node.position.y + 80 },
      data: { label: 'New node', editing: true },
      selected: true
    }
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), newNode],
      edges: [
        ...edges,
        { id: `e-${parentEdge.source}-${newId}`, source: parentEdge.source, target: newId }
      ],
      selectedNodeId: newId
    })
    return newId
  },

  deleteNode: (id) => {
    if (id === 'root') return
    const { nodes, edges } = get()

    // Collect this node + all descendants
    const toDelete = new Set<string>()
    const queue = [id]
    while (queue.length) {
      const cur = queue.shift()!
      toDelete.add(cur)
      edges.filter((e) => e.source === cur).forEach((e) => queue.push(e.target))
    }

    set({
      nodes: nodes.filter((n) => !toDelete.has(n.id)),
      edges: edges.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)),
      selectedNodeId: null
    })
  },

  updateNodeLabel: (id, label) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label: label || 'Node', editing: false } } : n
      )
    }))
  },

  startEditing: (id) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id && n.type === 'mindmap' ? { ...n, data: { ...n.data, editing: true } } : n
      )
    }))
  },

  // ── Terminal operations ──────────────────────────────────────────────────────

  attachTerminal: (nodeId, cwd, initialCommand) => {
    const { nodes, edges } = get()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'mindmap') return ''
    if (node.data.terminalId) return node.data.terminalId  // already has one

    const terminalId = uuid()
    const termNodeId = `term-${terminalId}`

    const termNode: AppNode = {
      id: termNodeId,
      type: 'terminal',
      position: { x: node.position.x, y: node.position.y + 120 },
      data: { terminalId, parentNodeId: nodeId, size: 'small', status: 'idle', cwd, initialCommand },
      // Prevent React Flow from calling focus() on this node's wrapper element,
      // which would steal keyboard focus away from xterm's hidden textarea.
      focusable: false
    }

    set({
      nodes: [
        ...nodes.map((n) =>
          n.id === nodeId && n.type === 'mindmap'
            ? { ...n, data: { ...n.data, terminalId, terminalStatus: 'idle' as TerminalStatus } }
            : n
        ),
        termNode
      ],
      edges: [
        ...edges,
        {
          id: `e-term-${nodeId}-${termNodeId}`,
          source: nodeId,
          target: termNodeId,
          type: 'terminal'
        }
      ]
    })

    return terminalId
  },

  detachTerminal: (nodeId) => {
    const { nodes, edges } = get()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'mindmap' || !node.data.terminalId) return

    const termNodeId = `term-${node.data.terminalId}`
    set({
      nodes: nodes
        .filter((n) => n.id !== termNodeId)
        .map((n) =>
          n.id === nodeId && n.type === 'mindmap'
            ? { ...n, data: { ...n.data, terminalId: undefined, terminalStatus: undefined } }
            : n
        ),
      edges: edges.filter((e) => e.source !== termNodeId && e.target !== termNodeId)
    })
  },

  updateTerminalStatus: (terminalId, status) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.type === 'mindmap' && n.data.terminalId === terminalId)
          return { ...n, data: { ...n.data, terminalStatus: status } }
        if (n.type === 'terminal' && n.data.terminalId === terminalId)
          return { ...n, data: { ...n.data, status } }
        return n
      })
    }))
  },

  toggleTerminalSize: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'mindmap' || !node.data.terminalId) return
    const termNodeId = `term-${node.data.terminalId}`
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id === termNodeId && n.type === 'terminal')
          return { ...n, data: { ...n.data, size: n.data.size === 'small' ? 'large' : 'small' } }
        return n
      })
    }))
  },

  loadState: (nodes, edges, filePath) =>
    set({ nodes, edges, currentFilePath: filePath, selectedNodeId: null }),

  setFilePath: (path) => set({ currentFilePath: path })
}))
