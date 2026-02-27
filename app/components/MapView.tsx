'use client';

/**
 * MapView — Leaflet-based geographic view of the NYC Nexus knowledge graph.
 *
 * Renders the same nodes and edges as the force-directed graph, but plotted
 * at their true WGS84 coordinates on a CartoDB Dark Matter basemap.
 *
 * Imported dynamically (ssr: false) from page.tsx — Leaflet requires the DOM.
 */

import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import type { GraphNode, RawLink } from '@/app/lib/types';

// ─────────────────────────────────────────────────────────────────────────────

export interface MapViewProps {
  nodes:        GraphNode[];
  rawLinks:     RawLink[];
  selectedNode: GraphNode | null;
  onNodeSelect: (n: GraphNode | null) => void;
}

// ── FitBounds ─────────────────────────────────────────────────────────────────
// Child component: uses the internal map instance to auto-fit bounds on load.

function FitBounds({ nodes }: { nodes: GraphNode[] }) {
  const map = useMap();

  useEffect(() => {
    if (nodes.length === 0) return;
    const lats = nodes.map((n) => n.lat);
    const lons = nodes.map((n) => n.lon);
    const bounds: LatLngBoundsExpression = [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ];
    map.fitBounds(bounds, { padding: [48, 48] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, nodes.length]); // re-fit only when the node count changes

  return null;
}

// ── MapView ───────────────────────────────────────────────────────────────────

export default function MapView({
  nodes,
  rawLinks,
  selectedNode,
  onNodeSelect,
}: MapViewProps) {
  // Build an O(1) node lookup so edge endpoints resolve quickly
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Default center — Midtown Manhattan
  const center: LatLngTuple = [40.7548, -73.9840];

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: '100%', width: '100%', background: '#030712' }}
      zoomControl
    >
      {/* CartoDB Dark Matter — free, no API key required */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      <FitBounds nodes={nodes} />

      {/* ── Ontology edges — dashed polylines ──────────────────────────────── */}
      {rawLinks.map((link, i) => {
        const src = nodeMap.get(link.source);
        const tgt = nodeMap.get(link.target);
        if (!src || !tgt) return null;

        const positions: LatLngTuple[] = [
          [src.lat, src.lon],
          [tgt.lat, tgt.lon],
        ];
        const strokeColor =
          link.label === 'TRANSIT_ACCESS' ? '#10B981' : '#F59E0B';

        return (
          <Polyline
            key={`link-${i}`}
            positions={positions}
            pathOptions={{
              color:     strokeColor,
              weight:    1.5,
              opacity:   0.55,
              dashArray: '5, 8',
            }}
          />
        );
      })}

      {/* ── Selected-node glow ring (rendered behind the node itself) ──────── */}
      {selectedNode && (
        <CircleMarker
          center={[selectedNode.lat, selectedNode.lon]}
          radius={20}
          pathOptions={{
            color:       selectedNode.color,
            fillColor:   selectedNode.color,
            fillOpacity: 0.15,
            weight:      2,
            opacity:     0.6,
          }}
          interactive={false}
        />
      )}

      {/* ── Node CircleMarkers ──────────────────────────────────────────────── */}
      {nodes.map((node) => {
        const isSelected = selectedNode?.id === node.id;
        // Radius scales with degree centrality so hub nodes are unmistakably larger
        const radius = 5 + Math.min(node.degree * 1.5, 16);

        return (
          <CircleMarker
            key={node.id}
            center={[node.lat, node.lon]}
            radius={radius}
            pathOptions={{
              color:       isSelected ? '#FFFFFF' : node.color,
              fillColor:   node.color,
              fillOpacity: 0.88,
              weight:      isSelected ? 2 : 1,
            }}
            eventHandlers={{
              click: () => onNodeSelect(isSelected ? null : node),
            }}
          >
            <Tooltip
              className="nycnexus-tooltip"
              direction="top"
              offset={[0, -(radius + 4)]}
              permanent={false}
            >
              <span style={{
                display:    'block',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              }}>
                <span style={{
                  display:    'block',
                  fontWeight: 600,
                  fontSize:   '12px',
                  color:      '#F1F5F9',
                }}>
                  {node.name}
                </span>
                <span style={{
                  display:    'block',
                  fontSize:   '10px',
                  color:      '#94A3B8',
                  marginTop:  '2px',
                }}>
                  {node.type} · {node.degree} edge{node.degree !== 1 ? 's' : ''}
                </span>
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
