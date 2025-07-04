import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
} from 'reactflow';
import dagre from 'dagre';
import {v4 as uuidv4} from 'uuid';
import 'reactflow/dist/style.css';
import './App.css';

// Custom Node Component
const CustomNode = ({ data, selected }) => {
  return (
    <div className={`custom-node ${selected ? 'selected' : ''}`}>
      <Handle 
        type="target" 
        position={Position.Left} 
        className="custom-handle target-handle"
      />
      <div className="node-label">{data.label}</div>
      
      <Handle 
        type="source" 
        position={Position.Right} 
        className="custom-handle source-handle"
      />
    </div>
  );
};

// Validation Status Component
const ValidationStatus = ({ isValid, message }) => {
  return (
    <div className={`validation-status ${isValid ? 'valid' : 'invalid'}`}>
      <span className="status-icon">{isValid ? '✓' : '⚠'}</span>
      {message}
    </div>
  );
};

// Control Panel Component
const ControlPanel = ({ onAddNode, onAutoLayout, onClear, nodeCount, edgeCount }) => {
  return (
    <div className="control-panel">
      <div className="panel-title">Pipeline Editor</div>
      
      <button className="btn btn-primary" onClick={onAddNode}>
        <span className="btn-icon">+</span> Add Node
      </button>
      
      <button className="btn btn-secondary" onClick={onAutoLayout}>
        <span className="btn-icon">⚡</span> Auto Layout
      </button>
      
      <button className="btn btn-danger" onClick={onClear}>
        <span className="btn-icon">🗑</span> Clear All
      </button>
      
      <div className="stats-container">
        <div className="stat-item">Nodes: <strong>{nodeCount}</strong></div>
        <div className="stat-item">Edges: <strong>{edgeCount}</strong></div>
      </div>
      <div className="tips-container">
      
        <div className="tip-title">💡 Instructions:</div>
        <ul className="list-alignment">
        <li className="tip-item"> Click Add node to create a new node</li>
        <li className="tip-item">Drag from right to left handle</li>
    
        <li className="tip-item">No self-connections allowed</li>
        <li className="tip-item-delete-ins">To remove a node or edge, select it and then press [Backspace or Delete] key.</li>
      </ul>
      </div>
    </div>
  );
};

// Modal Component for Node Creation
const NodeModal = ({ isOpen, onClose, onSubmit }) => {
  const [nodeName, setNodeName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (nodeName.trim()) {
      onSubmit(nodeName.trim());
      setNodeName('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Create New Node</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={nodeName}
            onChange={(e) => setNodeName(e.target.value)}
            placeholder="Enter node name..."
            className="modal-input"
            autoFocus
          />
          <div className="modal-buttons">
            <button type="submit" className="btn btn-modal-primary">
              Create
            </button>
            <button type="button" onClick={onClose} className="btn btn-modal-cancel">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Flow Component
function Flow() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [isValidDag, setIsValidDag] = useState({ valid: false, message: 'Add at least 2 nodes' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const reactFlowInstance = useReactFlow();

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  // DAG Validation Function
  const validateDAG = useCallback((nodes, edges) => {
    // Check 1: At least 2 nodes
    if (nodes.length < 2) {
      return { valid: false, message: 'Pipeline needs at least 2 nodes' };
    }

    // Check 2: All nodes connected
    const connectedNodes = new Set();
    edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });

    const unconnectedNodes = nodes.filter(node => !connectedNodes.has(node.id));
    if (unconnectedNodes.length > 0) {
      return { 
        valid: false, 
        message: `Unconnected: ${unconnectedNodes.map(n => n.data.label).join(', ')}` 
      };
    }

    // Check 3: No cycles (using DFS)
    const hasCycle = () => {
      const graph = {};
      nodes.forEach(node => {
        graph[node.id] = [];
      });
      edges.forEach(edge => {
        graph[edge.source].push(edge.target);
      });

      const visited = new Set();
      const recursionStack = new Set();

      const dfs = (nodeId) => {
        visited.add(nodeId);
        recursionStack.add(nodeId);

        for (const neighbor of graph[nodeId] || []) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor)) return true;
          } else if (recursionStack.has(neighbor)) {
            return true;
          }
        }

        recursionStack.delete(nodeId);
        return false;
      };

      for (const node of nodes) {
        if (!visited.has(node.id)) {
          if (dfs(node.id)) return true;
        }
      }

      return false;
    };

    if (hasCycle()) {
      return { valid: false, message: 'Pipeline contains a cycle!' };
    }

    return { valid: true, message: 'Valid DAG ✓' };
  }, []);

  // Auto Layout Function
  const getLayoutedElements = useCallback((nodes, edges, direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 100 });

    const nodeWidth = 180;
    const nodeHeight = 80;

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    });

    return { nodes: layoutedNodes, edges };
  }, []);

  // Handlers
  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params) => {
      if (params.source === params.target) {
        alert('⚠️ Self-connections are not allowed!');
        return;
      }
      setEdges((eds) => 
        addEdge({
          ...params,
          type: 'smoothstep',
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#667eea',
          },
          style: {
            strokeWidth: 2,
            stroke: '#667eea',
          },
        }, eds)
      );
    },
    []
  );

  // Add node handler
  const handleAddNode = useCallback((nodeName) => {
    const nodeId=uuidv4();
    const newNode = {
      id: nodeId,
      type: 'custom',
      position: { 
        x: Math.random() * 400 + 100, 
        y: Math.random() * 300 + 100 
      },
      data: { 
        label: nodeName,
        id: nodeId,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setIsModalOpen(false);
  }, []);

  // Auto layout handler
  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges);
    setNodes(layoutedNodes);
    
    window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 200 });
    });
  }, [nodes, edges, getLayoutedElements, reactFlowInstance]);

  // Clear all handler
  const handleClear = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all nodes and edges?')) {
      setNodes([]);
      setEdges([]);
    }
  }, []);

  // Validate DAG whenever nodes or edges change
  useEffect(() => {
    const validation = validateDAG(nodes, edges);
    setIsValidDag(validation);
  }, [nodes, edges, validateDAG]);

  // Delete key handler
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter((node) => node.selected);
        const selectedEdges = edges.filter((edge) => edge.selected);

        if (selectedNodes.length > 0) {
          const nodeIds = selectedNodes.map((node) => node.id);
          setNodes((nds) => nds.filter((node) => !nodeIds.includes(node.id)));
          // Remove edges connected to deleted nodes
          setEdges((eds) =>
            eds.filter(
              (edge) => !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)
            )
          );
        }

        if (selectedEdges.length > 0) {
          const edgeIds = selectedEdges.map((edge) => edge.id);
          setEdges((eds) => eds.filter((edge) => !edgeIds.includes(edge.id)));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges]);

  return (
    <div className="app">
      <ValidationStatus isValid={isValidDag.valid} message={isValidDag.message} />
      <ControlPanel 
        onAddNode={() => setIsModalOpen(true)}
        onAutoLayout={handleAutoLayout}
        onClear={handleClear}
        nodeCount={nodes.length}
        edgeCount={edges.length}
      />
      <NodeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddNode}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="react-flow-container"
      >
        <Background variant="dots" gap={12} size={1} />
        <Controls />
        <MiniMap 
          style={{
            height: 100,
            width: 120,
          }}
          maskColor="rgb(50, 50, 50, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}

// Main App Component
function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}

export default App;