'use client';

/**
 * NYC Nexus — Real-Time Semantic Knowledge Graph
 * Oracle Hospitality Engineering Demo
 *
 * Architecture layers encoded here:
 *  1. TAXONOMY   — NodeType enum classifies every OSM entity into a strict hierarchy
 *  2. DATA MODEL — GraphNode / GraphLink TypeScript interfaces enforce the schema
 *  3. ONTOLOGY   — Haversine proximity rules generate semantic edges at runtime
 *  4. KNOWLEDGE GRAPH — react-force-graph-2d renders the populated entity network
 *  5. AI/ML INTEGRATION — Architecture cards explain the enterprise extension path
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Wifi, MapPin, Hash, GitBranch, Network, Map as MapIcon } from 'lucide-react';
import type ForceGraph2DComponent from 'react-force-graph-2d';
import type MapViewComponent from './components/MapView';
import { NodeType, NODE_COLORS, EDGE_COLORS } from '@/app/lib/types';
import type { GraphNode, GraphLink, GraphData, RawLink } from '@/app/lib/types';

// ─── SSR-safe dynamic import (react-force-graph-2d requires canvas/window) ───
type ForceGraph2DProps = React.ComponentProps<typeof ForceGraph2DComponent>;

const ForceGraph2D = dynamic<ForceGraph2DProps>(
  () => import('react-force-graph-2d'),
  { ssr: false, loading: () => null },
);

// ─── SSR-safe dynamic import for Leaflet-based map view ──────────────────────
type MapViewProps = React.ComponentProps<typeof MapViewComponent>;

const MapView = dynamic<MapViewProps>(
  () => import('./components/MapView'),
  { ssr: false },
);

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3 — ONTOLOGY UTILITIES
// Proximity-based semantic rules are the core ontology:
//   Rule 1: distance(hotel, subway)     < 300 m  →  TRANSIT_ACCESS edge
//   Rule 2: distance(hotel, attraction) < 500 m  →  WALKABLE_TO edge
// ═══════════════════════════════════════════════════════════════════════════════

/** Haversine formula — returns great-circle distance in metres between two WGS84 points. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth's mean radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Classify an OSM element's tags into our three-tier taxonomy. */
function classifyOsmElement(tags: Record<string, string>): NodeType {
  if (tags.tourism === 'hotel') return NodeType.Hotel;
  if (tags.railway === 'station' && tags.station === 'subway') return NodeType.Subway;
  return NodeType.Attraction;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA FETCHING & GRAPH CONSTRUCTION
// Bounding box: Battery Park (40.700°N) → 59th Street (40.768°N)
// ═══════════════════════════════════════════════════════════════════════════════

// Raw OSM element shape returned by Overpass API
interface OsmElement {
  id:      number;
  type:    'node' | 'way' | 'relation';
  lat?:    number;
  lon?:    number;
  center?: { lat: number; lon: number };
  tags?:   Record<string, string>;
}

// Midtown Manhattan only — 34th St → 59th St, 8th Ave → Lexington Ave
const BBOX = '40.7484,-73.9967,40.7688,-73.9710';

const OVERPASS_QUERY = `
[out:json][timeout:30];
(
  node["tourism"="hotel"](${BBOX});
  way["tourism"="hotel"](${BBOX});
  node["railway"="station"]["station"="subway"](${BBOX});
  node["tourism"="museum"](${BBOX});
  way["tourism"="museum"](${BBOX});
  node["amenity"="theatre"](${BBOX});
  way["amenity"="theatre"](${BBOX});
);
out center;
`.trim();

async function buildNycGraph(): Promise<GraphData> {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: HTTP ${res.status} ${res.statusText}`);
  }

  const raw      = (await res.json()) as { elements: OsmElement[] };
  const elements = raw.elements ?? [];

  // ── Transform OSM elements → typed GraphNodes ────────────────────────────
  const seenIds = new Set<string>();
  const nodes: GraphNode[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const id = `${el.type}-${el.id}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const tags = el.tags ?? {};
    const type = classifyOsmElement(tags);

    nodes.push({
      id,
      name:   tags.name ?? tags['name:en'] ?? `OSM ${el.id}`,
      type,
      lat,
      lon,
      color:  NODE_COLORS[type],
      degree: 0,
    });
  }

  // ── Apply ontology rules → generate semantic edges ───────────────────────
  const hotels      = nodes.filter((n) => n.type === NodeType.Hotel);
  const subways     = nodes.filter((n) => n.type === NodeType.Subway);
  const attractions = nodes.filter((n) => n.type === NodeType.Attraction);

  const links: GraphLink[] = [];

  for (const hotel of hotels) {
    // Rule 1: TRANSIT_ACCESS — hotel within 300 m of a subway station
    for (const subway of subways) {
      if (haversine(hotel.lat, hotel.lon, subway.lat, subway.lon) <= 300) {
        links.push({
          source: hotel.id,
          target: subway.id,
          label:  'TRANSIT_ACCESS',
          color:  EDGE_COLORS.TRANSIT_ACCESS,
        });
      }
    }

    // Rule 2: WALKABLE_TO — hotel within 500 m of an attraction
    for (const attraction of attractions) {
      if (haversine(hotel.lat, hotel.lon, attraction.lat, attraction.lon) <= 500) {
        links.push({
          source: hotel.id,
          target: attraction.id,
          label:  'WALKABLE_TO',
          color:  EDGE_COLORS.WALKABLE_TO,
        });
      }
    }
  }

  // ── Compute degree centrality per node ───────────────────────────────────
  const degreeMap = new Map<string, number>();
  for (const { source, target } of links) {
    degreeMap.set(source, (degreeMap.get(source) ?? 0) + 1);
    degreeMap.set(target, (degreeMap.get(target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.degree = degreeMap.get(node.id) ?? 0;
  }

  return { nodes, links };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE BREAKDOWN CARD CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

interface ArchCard {
  num:    string;
  tag:    string;
  title:  string;
  icon:   string;
  accent: string;
  body:   string;
}

const ARCH_CARDS: ArchCard[] = [
  {
    num:    '01',
    tag:    'DATA TAXONOMY',
    title:  'Organizing the Chaos',
    icon:   '🗂️',
    accent: '#3B82F6',
    body:   'Before building the graph we classified every raw OSM point into a strict spatial hierarchy: Infrastructure → Transit → Subway, and Commercial → Hospitality → Hotel. This parent-child taxonomy standardizes enterprise search and guarantees every ingested entity has an unambiguous position in the system\'s ontological tree — a prerequisite for scalable data governance.',
  },
  {
    num:    '02',
    tag:    'DATA MODEL',
    title:  'Enforcing State & Structure',
    icon:   '🏗️',
    accent: '#8B5CF6',
    body:   'Encoded as strict TypeScript interfaces, the Data Model is the database blueprint. It enforces that every entity carries a unique OSM ID, precise WGS84 lat/lon coordinates, and a validated NodeType enum before entering system state — making it structurally impossible to persist a malformed entity. Degree centrality is pre-computed and stored on each node.',
  },
  {
    num:    '03',
    tag:    'DATA ONTOLOGY',
    title:  'Defining Semantic Rules',
    icon:   '🔗',
    accent: '#10B981',
    body:   'The Ontology layer encodes our business logic using the Haversine formula over WGS84 coordinates: "distance(Hotel, Subway) < 300 m ⟹ TRANSIT_ACCESS edge" and "distance(Hotel, Attraction) < 500 m ⟹ WALKABLE_TO edge." Decoupling these semantic rules from the raw data model means downstream ML systems can reason about relationships without touching the database.',
  },
  {
    num:    '04',
    tag:    'KNOWLEDGE GRAPH',
    title:  'The Populated Network',
    icon:   '🌐',
    accent: '#F59E0B',
    body:   'The force-directed graph above is the Knowledge Graph in action. It connects specific real-world entities — "The Plaza Hotel" to "5th Ave/59th St Station" — based purely on ontology rules applied to geographic coordinates. Flat relational tables become a multi-hop relationship web, enabling traversal queries (shortest path, neighbourhood expansion) that are impossible in SQL.',
  },
  {
    num:    '05',
    tag:    'ENTERPRISE AI / ML',
    title:  'Future-Proofing for Oracle',
    icon:   '🤖',
    accent: '#EF4444',
    body:   'At Oracle scale this graph feeds ML pipelines directly. (1) Node centrality & neighbourhood features power dynamic room pricing models that adjust rates in real time based on proximity to live events. (2) Graph traversal powers personalized guest itinerary engines — and graph-structured context fed into LLMs prevents hallucination in AI concierge systems, making the graph the semantic grounding layer for the entire hospitality stack.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function Page() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [rawLinks, setRawLinks]   = useState<RawLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selected, setSelected]   = useState<GraphNode | null>(null);
  const [view, setView]           = useState<'graph' | 'map'>('graph');
  const [dims, setDims]           = useState({ w: 800, h: 600 });
  const containerRef              = useRef<HTMLDivElement>(null);

  // ── Responsive sizing via ResizeObserver ──────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Fetch real OSM data on mount ──────────────────────────────────────────
  useEffect(() => {
    buildNycGraph()
      .then((data) => {
        // Snapshot pristine links BEFORE ForceGraph2D mutates source/target
        // from string IDs → node object references in-place.
        setRawLinks(
          data.links.map((l) => ({
            source: l.source,
            target: l.target,
            label:  l.label,
            color:  l.color,
          })),
        );
        setGraphData(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Node click: toggle selection ─────────────────────────────────────────
  const handleNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any) => setSelected((prev) => (prev?.id === node.id ? null : (node as GraphNode))),
    [],
  );

  const handleBgClick = useCallback(() => setSelected(null), []);

  // ── Custom canvas node renderer ───────────────────────────────────────────
  const paintNode = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n          = node as GraphNode & { x: number; y: number };
      const isSelected = selected?.id === n.id;
      // All nodes share the same radius — degree is shown as a number badge inside.
      const BASE_R = 7;

      // Selected-state glow
      if (isSelected) {
        ctx.shadowColor = n.color;
        ctx.shadowBlur  = 20;
      }

      // Core circle — uniform size
      ctx.beginPath();
      ctx.arc(n.x, n.y, BASE_R, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.shadowBlur  = 0;
      }

      // Degree count badge — white number centered inside the node.
      // Font size scales inversely with zoom so the badge is always legible.
      if (n.degree > 0) {
        const fs = Math.max(4, 9 / globalScale);
        ctx.font         = `bold ${fs}px ui-monospace, monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(255,255,255,0.92)';
        ctx.fillText(String(n.degree), n.x, n.y);
      }

      // Name label below node — visible when zoomed in or selected
      if (globalScale >= 2.3 || isSelected) {
        const raw   = n.name;
        const label = raw.length > 24 ? raw.slice(0, 24) + '…' : raw;
        const fs    = Math.max(5.5, 8 / globalScale);
        ctx.font         = `${fs}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle    = '#CBD5E1';
        ctx.fillText(label, n.x, n.y + BASE_R + 1.5);
      }
    },
    [selected],
  );

  // Larger hit area for click detection
  const paintPointer = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode & { x: number; y: number };
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
      ctx.fill();
    },
    [],
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  const counts = {
    hotels:      graphData.nodes.filter((n) => n.type === NodeType.Hotel).length,
    subways:     graphData.nodes.filter((n) => n.type === NodeType.Subway).length,
    attractions: graphData.nodes.filter((n) => n.type === NodeType.Attraction).length,
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#030712] text-slate-100 antialiased">

      {/* ══════════════════════════ HEADER ══════════════════════════════════ */}
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#030712]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-5 py-3 md:px-8">

          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-lg font-bold tracking-tight text-white">
                NYC <span className="text-blue-400">Nexus</span>
              </span>
            </div>
            <p className="pl-4 text-[10px] text-slate-500">
              Real-Time Semantic Knowledge Graph · Manhattan
            </p>
          </div>

          {/* ── View toggle pill ── */}
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
            <button
              onClick={() => setView('graph')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'graph'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Network size={12} />
              Force Graph
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'map'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon size={12} />
              Map View
            </button>
          </div>

          {/* Legend + live badge */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {([
              { type: NodeType.Hotel,      label: 'Hotel' },
              { type: NodeType.Subway,     label: 'Subway' },
              { type: NodeType.Attraction, label: 'Attraction' },
            ] as const).map(({ type, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: NODE_COLORS[type] }}
                />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
            ))}

            {!loading && !error && (
              <span className="rounded-full border border-emerald-700/50 bg-emerald-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                ● LIVE &nbsp;{graphData.nodes.length} nodes · {graphData.links.length} edges
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════ GRAPH / MAP PANEL ═══════════════════════ */}
      <section className="relative" style={{ height: 'calc(100vh - 57px)' }}>

        {/* Sizing container — always rendered so ResizeObserver stays attached */}
        <div ref={containerRef} className="absolute inset-0">

          {/* Loading state */}
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5">
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 rounded-full border-2 border-blue-900" />
                <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-blue-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-200">Querying Overpass API</p>
                <p className="mt-1 text-xs text-slate-500">
                  Fetching real-time OSM data for Manhattan…
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <div className="max-w-sm rounded-2xl border border-red-800 bg-red-950/60 px-8 py-6 text-center">
                <p className="font-bold text-red-400">API Error</p>
                <p className="mt-2 text-sm text-red-300/80">{error}</p>
                <p className="mt-3 text-xs text-slate-500">
                  Overpass API may be rate-limited. Please wait 60 s and refresh.
                </p>
              </div>
            </div>
          )}

          {/* ── Force-directed graph view ── */}
          {!loading && !error && view === 'graph' && (
            <ForceGraph2D
              graphData={graphData}
              width={dims.w}
              height={dims.h}
              backgroundColor="#030712"
              // Node rendering
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={paintPointer}
              nodeLabel=""
              // Link rendering — cast to our typed link inside the callbacks
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              linkColor={(link: any) => (link as GraphLink).color}
              linkWidth={0.8}
              // Interaction
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBgClick}
              // Simulation
              cooldownTicks={220}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.35}
            />
          )}

          {/* ── Geographic map view ── */}
          {!loading && !error && view === 'map' && (
            <div className="h-full w-full">
              <MapView
                nodes={graphData.nodes}
                rawLinks={rawLinks}
                selectedNode={selected}
                onNodeSelect={setSelected}
              />
            </div>
          )}

        </div>{/* /containerRef */}

        {/* ─── NODE DETAIL PANEL — z-[1000] floats above Leaflet layers ──── */}
        <aside
          className={`absolute right-4 top-4 z-[1000] w-72 transition-all duration-300 ${
            selected
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none translate-x-4 opacity-0'
          }`}
        >
          {selected && (
            <div className="relative rounded-2xl border border-slate-700 bg-slate-900/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-sm">
              <button
                onClick={() => setSelected(null)}
                className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300"
                aria-label="Close panel"
              >
                <X size={13} />
              </button>

              {/* Type badge */}
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: selected.color }}
                />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {selected.type}
                </span>
              </div>

              {/* Entity name */}
              <h3 className="mb-4 pr-5 text-[15px] font-bold leading-snug text-white">
                {selected.name}
              </h3>

              {/* Metadata rows */}
              <div className="space-y-2.5">
                {[
                  { Icon: Hash,      label: 'Node ID',     value: selected.id },
                  { Icon: MapPin,    label: 'Latitude',    value: selected.lat.toFixed(6) },
                  { Icon: MapPin,    label: 'Longitude',   value: selected.lon.toFixed(6) },
                  { Icon: GitBranch, label: 'Connections', value: `${selected.degree} edge${selected.degree !== 1 ? 's' : ''}` },
                ].map(({ Icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Icon size={11} />
                      <span>{label}</span>
                    </div>
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Ontology rules that apply to this node */}
              {selected.type === NodeType.Hotel && (
                <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Active Ontology Rules
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[11px] text-slate-400">TRANSIT_ACCESS &lt; 300 m</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span className="text-[11px] text-slate-400">WALKABLE_TO &lt; 500 m</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ─── EDGE LEGEND — z-[1000] floats above Leaflet layers ──────────── */}
        <div className="absolute bottom-5 left-5 z-[1000] flex flex-col gap-2">
          {([
            { label: 'TRANSIT_ACCESS', sub: '< 300 m', color: 'rgba(16,185,129,0.9)' },
            { label: 'WALKABLE_TO',    sub: '< 500 m', color: 'rgba(245,158,11,0.9)'  },
          ] as const).map(({ label, sub, color }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-900/80 px-3 py-2 backdrop-blur-sm"
            >
              <div className="h-px w-8 flex-shrink-0" style={{ background: color }} />
              <div>
                <span className="font-mono text-[10px] text-slate-300">{label}</span>
                <span className="ml-1 text-[9px] text-slate-500">({sub})</span>
              </div>
            </div>
          ))}
        </div>

        {/* ─── STAT CHIPS — z-[1000] floats above Leaflet layers ───────────── */}
        {!loading && !error && (
          <div className="absolute left-5 top-4 z-[1000] flex gap-2">
            {([
              { type: NodeType.Hotel,      count: counts.hotels,      label: 'Hotels' },
              { type: NodeType.Subway,     count: counts.subways,     label: 'Stations' },
              { type: NodeType.Attraction, count: counts.attractions,  label: 'Attractions' },
            ] as const).map(({ type, count, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-900/80 px-2.5 py-1 backdrop-blur-sm"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: NODE_COLORS[type] }}
                />
                <span className="text-[11px] font-semibold text-slate-300">{count}</span>
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ─── HINT PILL — z-[1000] floats above Leaflet layers ────────────── */}
        {!loading && !error && (
          <div className="absolute bottom-5 right-5 z-[1000] flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 backdrop-blur-sm">
            <Wifi size={11} className="text-slate-500" />
            <span className="text-[10px] text-slate-500">
              {view === 'graph'
                ? 'Scroll to zoom · Click node for details'
                : 'Click node for details · Scroll to zoom'}
            </span>
          </div>
        )}
      </section>

      {/* ══════════════════════════ ARCHITECTURE BREAKDOWN ══════════════════ */}
      <section className="border-t border-slate-800 bg-slate-950 px-5 py-20 md:px-8">
        <div className="mx-auto max-w-screen-2xl">

          {/* Section header */}
          <div className="mb-12">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400">
              System Architecture Breakdown
            </p>
            <h2 className="text-4xl font-bold tracking-tight text-white">
              Engineering the NYC Nexus
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-500">
              Five layers that transform raw OpenStreetMap geo-data into an enterprise-grade
              semantic knowledge graph ready for Oracle&apos;s AI/ML hospitality stack.
            </p>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {ARCH_CARDS.map((card) => (
              <article
                key={card.num}
                className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-xl"
                style={{ '--card-accent': card.accent } as React.CSSProperties}
              >
                {/* Top accent line */}
                <div
                  className="absolute inset-x-0 top-0 h-[2px] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${card.accent} 50%, transparent 100%)`,
                  }}
                />

                {/* Card number watermark */}
                <div
                  className="pointer-events-none absolute -bottom-4 -right-2 select-none text-8xl font-black opacity-[0.04]"
                  style={{ color: card.accent }}
                >
                  {card.num}
                </div>

                {/* Icon */}
                <div className="mb-4 text-3xl">{card.icon}</div>

                {/* Tag */}
                <p
                  className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: card.accent }}
                >
                  {card.num} / {card.tag}
                </p>

                {/* Title */}
                <h3 className="mb-3 text-[15px] font-bold leading-snug text-white">
                  {card.title}
                </h3>

                {/* Body */}
                <p className="text-[13px] leading-relaxed text-slate-400">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ FOOTER ══════════════════════════════════ */}
      <footer className="border-t border-slate-800 bg-slate-950 px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-2 text-[11px] text-slate-600 sm:flex-row">
          <p>Data © OpenStreetMap contributors · Overpass API (overpass-api.de)</p>
          <p>Built for Oracle Hospitality Engineering Demo</p>
        </div>
      </footer>
    </main>
  );
}
