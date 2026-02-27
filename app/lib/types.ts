// ═══════════════════════════════════════════════════════════════════════════════
// SHARED TYPES — consumed by page.tsx and MapView.tsx
// Extracting here prevents circular dependencies and keeps each file focused.
// ═══════════════════════════════════════════════════════════════════════════════

// ── LAYER 1: DATA TAXONOMY ───────────────────────────────────────────────────
// Raw OSM tags are classified into a strict three-class hierarchy:
//   Commercial  → Hospitality → Hotel
//   Infrastructure → Transit → Subway
//   Cultural    → Attraction → (Museum | Theatre)

export enum NodeType {
  Hotel      = 'Hotel',
  Subway     = 'Subway',
  Attraction = 'Attraction',
}

export type EdgeLabel = 'TRANSIT_ACCESS' | 'WALKABLE_TO';

export const NODE_COLORS: Record<NodeType, string> = {
  [NodeType.Hotel]:      '#3B82F6', // Blue  — Hospitality
  [NodeType.Subway]:     '#10B981', // Green — Transit
  [NodeType.Attraction]: '#F59E0B', // Amber — Cultural
};

export const EDGE_COLORS: Record<EdgeLabel, string> = {
  TRANSIT_ACCESS: 'rgba(16,185,129,0.50)',
  WALKABLE_TO:    'rgba(245,158,11,0.50)',
};

// ── LAYER 2: DATA MODEL ──────────────────────────────────────────────────────
// Every entity entering system state must satisfy the GraphNode interface.
// The force-simulation adds x/y at runtime; we preserve lat/lon for ontology.

export interface GraphNode {
  id:     string;   // Unique OSM element ID (string for force-graph compat)
  name:   string;   // Human-readable label from OSM tags
  type:   NodeType; // Validated taxonomy classification
  lat:    number;   // WGS84 geographic latitude
  lon:    number;   // WGS84 geographic longitude
  color:  string;   // Hex colour derived from type
  degree: number;   // Computed edge count (degree centrality)
  // Injected by force-simulation at runtime:
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string; // GraphNode.id of origin (ForceGraph2D may mutate to object ref)
  target: string; // GraphNode.id of destination
  label:  EdgeLabel;
  color:  string; // Rgba string for canvas rendering
}

/**
 * Pristine snapshot of a link — source/target are always plain string IDs.
 * ForceGraph2D mutates GraphLink.source/target in-place; RawLink is immune
 * because it is snapshotted before the graph simulation starts.
 */
export interface RawLink {
  source: string;
  target: string;
  label:  EdgeLabel;
  color:  string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
