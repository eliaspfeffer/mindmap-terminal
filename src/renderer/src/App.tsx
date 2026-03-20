import React from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import MindMapCanvas from './components/MindMapCanvas'

const App: React.FC = () => (
  <div style={{ width: '100vw', height: '100vh', background: '#0f172a' }}>
    <ReactFlowProvider>
      <MindMapCanvas />
    </ReactFlowProvider>
  </div>
)

export default App
