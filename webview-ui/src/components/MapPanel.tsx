import { GraphView, IndexingStatus } from '../types';

interface MapPanelProps {
  graph: GraphView | null;
  status: IndexingStatus | null;
  reverse: boolean;
  depth: number;
  search: string;
  onDepthChange: (depth: number) => void;
  onReverseChange: (reverse: boolean) => void;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  onOpenNode: (filePath: string) => void;
}

export function MapPanel({ graph, status, reverse, depth, search, onDepthChange, onReverseChange, onSearchChange, onRefresh, onOpenNode }: MapPanelProps) {
  const query = search.trim().toLowerCase();
  const filteredNodes = graph?.nodes.filter(node => !query || node.label.toLowerCase().includes(query) || node.file.toLowerCase().includes(query)) ?? [];
  const nodeIds = new Set(filteredNodes.map(node => node.id));
  const filteredEdges = graph?.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)) ?? [];

  return (
    <section className="preview-panel">
      <div className="provider-panel-head">
        <div className="section-headline">Workspace Map</div>
        <button type="button" className="button-secondary compact-button" onClick={onRefresh}>Refresh Map</button>
      </div>

      <div className="provider-status-grid map-status-grid">
        <div><span>Status</span><strong>{status?.state ?? 'idle'}</strong></div>
        <div><span>Files</span><strong>{status?.filesIndexed ?? 0}</strong></div>
        <div><span>Entities</span><strong>{status?.entities ?? 0}</strong></div>
        <div><span>Relationships</span><strong>{status?.relationships ?? 0}</strong></div>
      </div>

      <div className="context-config-grid map-controls">
        <label className="field compact-field">
          <span>Depth</span>
          <input type="number" min={1} max={4} value={depth} onChange={event => onDepthChange(Number(event.target.value) || 1)} />
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={reverse} onChange={event => onReverseChange(event.target.checked)} />
          <span>Reverse dependencies</span>
        </label>
        <label className="field compact-field map-search-field">
          <span>Search nodes</span>
          <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search files/modules" />
        </label>
      </div>

      {!graph && <p className="empty-state">Select a prompt tab with an active file and refresh the map.</p>}

      {graph && (
        <div className="map-grid">
          <div className="map-node-list">
            <div className="section-headline">Nodes</div>
            {filteredNodes.length === 0 && <p className="empty-state">No nodes in the current filtered graph.</p>}
            {filteredNodes.map(node => (
              <button key={node.id} type="button" className={`map-node-card${graph.focusId === node.id ? ' is-active' : ''}`} onClick={() => onOpenNode(node.file)}>
                <strong>{node.label}</strong>
                <span>{node.type}</span>
                <span>{String(node.metadata?.relativePath ?? node.file)}</span>
              </button>
            ))}
          </div>
          <div className="map-edge-list">
            <div className="section-headline">Edges</div>
            {filteredEdges.length === 0 && <p className="empty-state">No dependency edges in the current view.</p>}
            {filteredEdges.map((edge, index) => (
              <div key={`${edge.source}-${edge.target}-${index}`} className="history-item">
                <div className="history-item-main">
                  <strong>{edge.type}</strong>
                  <span>{edge.source}</span>
                  <span>{edge.target}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}