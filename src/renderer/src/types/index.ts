export type TerminalStatus = 'idle' | 'busy' | 'attention'

export interface MindMapNodeData extends Record<string, unknown> {
  label: string
  terminalId?: string
  terminalStatus?: TerminalStatus
  editing?: boolean
}

export interface TerminalNodeData extends Record<string, unknown> {
  terminalId: string
  parentNodeId: string
  size: 'small' | 'large'
  status: TerminalStatus
  cwd: string
}

export type AppNode =
  | { id: string; type: 'mindmap'; position: { x: number; y: number }; data: MindMapNodeData; selected?: boolean }
  | { id: string; type: 'terminal'; position: { x: number; y: number }; data: TerminalNodeData; selected?: boolean }

export interface AppEdge {
  id: string
  source: string
  target: string
  type?: string
}

export interface SavedState {
  nodes: AppNode[]
  edges: AppEdge[]
}
