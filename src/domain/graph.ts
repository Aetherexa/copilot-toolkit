export interface CodeEntity {
  id: string;
  type: string;
  name: string;
  file: string;
  language: string;
  metadata?: Record<string, unknown>;
}

export interface CodeRelation {
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface GraphFileAnalysis {
  entities: CodeEntity[];
  relations: CodeRelation[];
}

export interface IndexingStatus {
  state: 'idle' | 'indexing' | 'ready' | 'error';
  filesIndexed: number;
  entities: number;
  relationships: number;
  lastUpdated?: number;
  message?: string;
}

export interface GraphNodeView {
  id: string;
  label: string;
  type: string;
  file: string;
  language: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdgeView {
  source: string;
  target: string;
  type: string;
}

export interface GraphView {
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  focusId?: string;
}