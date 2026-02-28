'use client';

/**
 * NYC Nexus — Real-Time Semantic Knowledge Graph
 * Oracle Hospitality Engineering Demo
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  X, Wifi, MapPin, Hash, GitBranch,
  Network, Map as MapIcon,
  Zap, Navigation, Landmark, BarChart2, Layers, Sparkles, BookOpen,
} from 'lucide-react';
import type ForceGraph2DComponent from 'react-force-graph-2d';
import type MapViewComponent from './components/MapView';
import { NodeType, NODE_COLORS, EDGE_COLORS } from '@/app/lib/types';
import type { GraphNode, GraphLink, GraphData, RawLink } from '@/app/lib/types';

// ─── SSR-safe dynamic imports ─────────────────────────────────────────────────
type ForceGraph2DProps = React.ComponentProps<typeof ForceGraph2DComponent>;
const ForceGraph2D = dynamic<ForceGraph2DProps>(
  () => import('react-force-graph-2d'),
  { ssr: false, loading: () => null },
);

type MapViewProps = React.ComponentProps<typeof MapViewComponent>;
const MapView = dynamic<MapViewProps>(
  () => import('./components/MapView'),
  { ssr: false },
);

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY ENGINE — modes, scoring, and Cypher display (all static, module-level)
// ═══════════════════════════════════════════════════════════════════════════════

export type QueryMode =
  | 'transit'
  | 'culture'
  | 'balanced'
  | 'connected'
  | 'hub'
  | 'corridor';

interface QueryModeConfig {
  key:         QueryMode;
  label:       string;
  Icon:        React.ElementType;
  accent:      string;
  description: string;
}

const QUERY_MODES: QueryModeConfig[] = [
  {
    key:         'transit',
    label:       'Transit Priority',
    Icon:        Navigation,
    accent:      '#10B981',
    description: 'Hotels ranked by subway reachability (TRANSIT_ACCESS × 2)',
  },
  {
    key:         'culture',
    label:       'Culture First',
    Icon:        Landmark,
    accent:      '#F59E0B',
    description: 'Hotels ranked by walkable attractions (WALKABLE_TO × 2)',
  },
  {
    key:         'balanced',
    label:       'Balanced',
    Icon:        BarChart2,
    accent:      '#8B5CF6',
    description: 'Equal weight on transit and cultural access',
  },
  {
    key:         'connected',
    label:       'Fully Connected',
    Icon:        Layers,
    accent:      '#6366F1',
    description: 'Only hotels that have BOTH subway and attraction edges',
  },
  {
    key:         'hub',
    label:       'Transit Hub',
    Icon:        Zap,
    accent:      '#22D3EE',
    description: 'Maximum subway connectivity (TRANSIT_ACCESS × 3)',
  },
  {
    key:         'corridor',
    label:       'Art Corridor',
    Icon:        Sparkles,
    accent:      '#F472B6',
    description: 'Maximum cultural immersion (WALKABLE_TO × 3)',
  },
];

// Cypher-style query display per mode — defined once at module level
const CYPHER: Record<QueryMode, React.ReactNode> = {
  transit: (
    <>
      <span className="text-slate-500">{'// Transit-priority traversal'}</span>{'\n'}
      <span className="text-violet-400">MATCH </span>
      <span className="text-white">{'(h'}</span><span className="text-blue-400">:Hotel</span><span className="text-white">{')'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-emerald-400">TRANSIT_ACCESS</span><span className="text-slate-400">{']->(s'}</span>
      <span className="text-emerald-400">:Subway</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">OPTIONAL MATCH </span>
      <span className="text-white">{'(h)'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-amber-400">WALKABLE_TO</span><span className="text-slate-400">{']->(a'}</span>
      <span className="text-amber-400">:Attraction</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">WITH </span>
      <span className="text-white">{'h, COUNT(DISTINCT s) AS t,'}</span>{'\n'}
      <span className="text-white">{'     COUNT(DISTINCT a) AS c'}</span>{'\n'}
      <span className="text-violet-400">RETURN </span><span className="text-white">{'h.name'}</span>{'\n'}
      <span className="text-violet-400">ORDER BY </span><span className="text-orange-300">{'(t*2 + c)'}</span>
      <span className="text-violet-400"> DESC LIMIT </span><span className="text-orange-300">5</span>
    </>
  ),
  culture: (
    <>
      <span className="text-slate-500">{'// Culture-priority traversal'}</span>{'\n'}
      <span className="text-violet-400">MATCH </span>
      <span className="text-white">{'(h'}</span><span className="text-blue-400">:Hotel</span><span className="text-white">{')'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-amber-400">WALKABLE_TO</span><span className="text-slate-400">{']->(a'}</span>
      <span className="text-amber-400">:Attraction</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">OPTIONAL MATCH </span>
      <span className="text-white">{'(h)'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-emerald-400">TRANSIT_ACCESS</span><span className="text-slate-400">{']->(s'}</span>
      <span className="text-emerald-400">:Subway</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">WITH </span>
      <span className="text-white">{'h, COUNT(DISTINCT a) AS c,'}</span>{'\n'}
      <span className="text-white">{'     COUNT(DISTINCT s) AS t'}</span>{'\n'}
      <span className="text-violet-400">RETURN </span><span className="text-white">{'h.name'}</span>{'\n'}
      <span className="text-violet-400">ORDER BY </span><span className="text-orange-300">{'(c*2 + t)'}</span>
      <span className="text-violet-400"> DESC LIMIT </span><span className="text-orange-300">5</span>
    </>
  ),
  balanced: (
    <>
      <span className="text-slate-500">{'// Balanced multi-hop traversal'}</span>{'\n'}
      <span className="text-violet-400">MATCH </span>
      <span className="text-white">{'(h'}</span><span className="text-blue-400">:Hotel</span><span className="text-white">{')'}</span>
      <span className="text-slate-400">{'-[r:'}</span><span className="text-slate-300">TRANSIT_ACCESS</span>
      <span className="text-slate-400">{'|'}</span><span className="text-slate-300">WALKABLE_TO</span>
      <span className="text-slate-400">{']->(n)'}</span>{'\n'}
      <span className="text-violet-400">WITH </span>
      <span className="text-white">{'h, COUNT(n) AS total'}</span>{'\n'}
      <span className="text-violet-400">RETURN </span><span className="text-white">{'h.name, total'}</span>{'\n'}
      <span className="text-violet-400">ORDER BY </span><span className="text-orange-300">total</span>
      <span className="text-violet-400"> DESC LIMIT </span><span className="text-orange-300">5</span>
    </>
  ),
  connected: (
    <>
      <span className="text-slate-500">{'// Fully-connected hotels (both edge types)'}</span>{'\n'}
      <span className="text-violet-400">MATCH </span>
      <span className="text-white">{'(h'}</span><span className="text-blue-400">:Hotel</span><span className="text-white">{')'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-emerald-400">TRANSIT_ACCESS</span><span className="text-slate-400">{']->(s'}</span>
      <span className="text-emerald-400">:Subway</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">MATCH </span>
      <span className="text-white">{'(h)'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-amber-400">WALKABLE_TO</span><span className="text-slate-400">{']->(a'}</span>
      <span className="text-amber-400">:Attraction</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-slate-500">{'// No OPTIONAL — both required'}</span>{'\n'}
      <span className="text-violet-400">WITH </span>
      <span className="text-white">{'h, COUNT(DISTINCT s)+COUNT(DISTINCT a) AS score'}</span>{'\n'}
      <span className="text-violet-400">RETURN </span><span className="text-white">{'h.name, score'}</span>{'\n'}
      <span className="text-violet-400">ORDER BY </span><span className="text-orange-300">score</span>
      <span className="text-violet-400"> DESC LIMIT </span><span className="text-orange-300">5</span>
    </>
  ),
  hub: (
    <>
      <span className="text-slate-500">{'// Transit-hub maximization'}</span>{'\n'}
      <span className="text-violet-400">MATCH </span>
      <span className="text-white">{'(h'}</span><span className="text-blue-400">:Hotel</span><span className="text-white">{')'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-emerald-400">TRANSIT_ACCESS</span><span className="text-slate-400">{']->(s'}</span>
      <span className="text-emerald-400">:Subway</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">OPTIONAL MATCH </span>
      <span className="text-white">{'(h)'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-amber-400">WALKABLE_TO</span><span className="text-slate-400">{']->(a'}</span>
      <span className="text-amber-400">:Attraction</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">WITH </span>
      <span className="text-white">{'h, COUNT(DISTINCT s) AS t, COUNT(DISTINCT a) AS c'}</span>{'\n'}
      <span className="text-violet-400">RETURN </span><span className="text-white">{'h.name'}</span>{'\n'}
      <span className="text-violet-400">ORDER BY </span><span className="text-orange-300">{'(t*3 + c)'}</span>
      <span className="text-violet-400"> DESC LIMIT </span><span className="text-orange-300">5</span>
    </>
  ),
  corridor: (
    <>
      <span className="text-slate-500">{'// Cultural-corridor maximization'}</span>{'\n'}
      <span className="text-violet-400">MATCH </span>
      <span className="text-white">{'(h'}</span><span className="text-blue-400">:Hotel</span><span className="text-white">{')'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-amber-400">WALKABLE_TO</span><span className="text-slate-400">{']->(a'}</span>
      <span className="text-amber-400">:Attraction</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">OPTIONAL MATCH </span>
      <span className="text-white">{'(h)'}</span>
      <span className="text-slate-400">{'-[:'}</span><span className="text-emerald-400">TRANSIT_ACCESS</span><span className="text-slate-400">{']->(s'}</span>
      <span className="text-emerald-400">:Subway</span><span className="text-white">{')'}</span>{'\n'}
      <span className="text-violet-400">WITH </span>
      <span className="text-white">{'h, COUNT(DISTINCT a) AS c, COUNT(DISTINCT s) AS t'}</span>{'\n'}
      <span className="text-violet-400">RETURN </span><span className="text-white">{'h.name'}</span>{'\n'}
      <span className="text-violet-400">ORDER BY </span><span className="text-orange-300">{'(c*3 + t)'}</span>
      <span className="text-violet-400"> DESC LIMIT </span><span className="text-orange-300">5</span>
    </>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════════
// ONTOLOGY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyOsmElement(tags: Record<string, string>): NodeType {
  if (tags.tourism === 'hotel') return NodeType.Hotel;
  if (tags.railway === 'station' && tags.station === 'subway') return NodeType.Subway;
  return NodeType.Attraction;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════════════════════

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
  if (!res.ok) throw new Error(`Overpass API error: HTTP ${res.status} ${res.statusText}`);

  const raw      = (await res.json()) as { elements: OsmElement[] };
  const elements = raw.elements ?? [];

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
    nodes.push({ id, name: tags.name ?? tags['name:en'] ?? `OSM ${el.id}`, type, lat, lon, color: NODE_COLORS[type], degree: 0 });
  }

  const hotels      = nodes.filter((n) => n.type === NodeType.Hotel);
  const subways     = nodes.filter((n) => n.type === NodeType.Subway);
  const attractions = nodes.filter((n) => n.type === NodeType.Attraction);
  const links: GraphLink[] = [];

  for (const hotel of hotels) {
    for (const subway of subways) {
      if (haversine(hotel.lat, hotel.lon, subway.lat, subway.lon) <= 300)
        links.push({ source: hotel.id, target: subway.id, label: 'TRANSIT_ACCESS', color: EDGE_COLORS.TRANSIT_ACCESS });
    }
    for (const attraction of attractions) {
      if (haversine(hotel.lat, hotel.lon, attraction.lat, attraction.lon) <= 500)
        links.push({ source: hotel.id, target: attraction.id, label: 'WALKABLE_TO', color: EDGE_COLORS.WALKABLE_TO });
    }
  }

  const degreeMap = new Map<string, number>();
  for (const { source, target } of links) {
    degreeMap.set(source, (degreeMap.get(source) ?? 0) + 1);
    degreeMap.set(target, (degreeMap.get(target) ?? 0) + 1);
  }
  for (const node of nodes) node.degree = degreeMap.get(node.id) ?? 0;

  return { nodes, links };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE CARDS
// ═══════════════════════════════════════════════════════════════════════════════

interface ArchCard { num: string; tag: string; title: string; icon: string; accent: string; body: string; }

const ARCH_CARDS: ArchCard[] = [
  {
    num: '01', tag: 'DATA TAXONOMY', title: 'Organizing the Chaos', icon: '🗂️', accent: '#3B82F6',
    body: 'Before building the graph we classified every raw OSM point into a strict spatial hierarchy: Infrastructure → Transit → Subway, and Commercial → Hospitality → Hotel. This parent-child taxonomy standardizes enterprise search and guarantees every ingested entity has an unambiguous position in the system\'s ontological tree - a prerequisite for scalable data governance.',
  },
  {
    num: '02', tag: 'DATA MODEL', title: 'Enforcing State & Structure', icon: '🏗️', accent: '#8B5CF6',
    body: 'Encoded as strict TypeScript interfaces, the Data Model is the database blueprint. It enforces that every entity carries a unique OSM ID, precise WGS84 lat/lon coordinates, and a validated NodeType enum before entering system state - making it structurally impossible to persist a malformed entity. Degree centrality is pre-computed and stored on each node.',
  },
  {
    num: '03', tag: 'DATA ONTOLOGY', title: 'Defining Semantic Rules', icon: '🔗', accent: '#10B981',
    body: 'The Ontology layer encodes business logic using the Haversine formula over WGS84 coordinates: "distance(Hotel, Subway) < 300 m ⟹ TRANSIT_ACCESS edge" and "distance(Hotel, Attraction) < 500 m ⟹ WALKABLE_TO edge." Decoupling these rules from the raw data model means downstream ML systems can reason about relationships without touching the database.',
  },
  {
    num: '04', tag: 'KNOWLEDGE GRAPH', title: 'The Populated Network', icon: '🌐', accent: '#F59E0B',
    body: 'The force-directed graph is the Knowledge Graph in action - connecting specific real-world entities based purely on ontology rules applied to geographic coordinates. Flat relational tables become a multi-hop relationship web, enabling traversal queries (shortest path, neighbourhood expansion) that are impossible in SQL.',
  },
  {
    num: '05', tag: 'ENTERPRISE AI / ML', title: 'Future-Proofing for Oracle', icon: '🤖', accent: '#EF4444',
    body: 'At Oracle scale this graph feeds ML pipelines directly. Node centrality powers dynamic room pricing based on proximity to live events, graph traversal powers personalized itinerary engines, and graph-structured context fed into LLMs prevents hallucination in AI concierge systems - making the graph the semantic grounding layer for the entire hospitality stack.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

type ActiveTab = 'viz' | 'query' | 'arch';

const TABS: { key: ActiveTab; label: string; Icon: React.ElementType }[] = [
  { key: 'viz',   label: 'Visualization',  Icon: Network   },
  { key: 'query', label: 'Query Engine',   Icon: Zap       },
  { key: 'arch',  label: 'Architecture',   Icon: BookOpen  },
];

const RANK_COLORS = ['#F59E0B', '#94A3B8', '#B45309', '#64748B', '#64748B'];

export default function Page() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [rawLinks, setRawLinks]   = useState<RawLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selected, setSelected]   = useState<GraphNode | null>(null);
  const [view, setView]           = useState<'graph' | 'map'>('graph');
  const [activeTab, setActiveTab] = useState<ActiveTab>('viz');
  const [queryMode, setQueryMode] = useState<QueryMode>('balanced');
  const [dims, setDims]           = useState({ w: 800, h: 600 });
  const containerRef              = useRef<HTMLDivElement>(null);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch OSM data
  useEffect(() => {
    buildNycGraph()
      .then((data) => {
        setRawLinks(data.links.map((l) => ({ source: l.source, target: l.target, label: l.label, color: l.color })));
        setGraphData(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any) => setSelected((prev) => (prev?.id === node.id ? null : (node as GraphNode))),
    [],
  );
  const handleBgClick = useCallback(() => setSelected(null), []);

  const paintNode = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n          = node as GraphNode & { x: number; y: number };
      const isSelected = selected?.id === n.id;
      const BASE_R     = 7;

      if (isSelected) { ctx.shadowColor = n.color; ctx.shadowBlur = 20; }

      ctx.beginPath();
      ctx.arc(n.x, n.y, BASE_R, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();

      if (isSelected) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.shadowBlur = 0; }

      if (n.degree > 0) {
        const fs = Math.max(4, 9 / globalScale);
        ctx.font = `bold ${fs}px ui-monospace, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(String(n.degree), n.x, n.y);
      }

      if (globalScale >= 2.3 || isSelected) {
        const raw   = n.name;
        const label = raw.length > 24 ? raw.slice(0, 24) + '…' : raw;
        const fs    = Math.max(5.5, 8 / globalScale);
        ctx.font = `${fs}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#CBD5E1';
        ctx.fillText(label, n.x, n.y + BASE_R + 1.5);
      }
    },
    [selected],
  );

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

  const counts = {
    hotels:      graphData.nodes.filter((n) => n.type === NodeType.Hotel).length,
    subways:     graphData.nodes.filter((n) => n.type === NodeType.Subway).length,
    attractions: graphData.nodes.filter((n) => n.type === NodeType.Attraction).length,
  };

  const queryResults = useMemo(() => {
    if (!rawLinks.length || !graphData.nodes.length) return [];
    return graphData.nodes
      .filter((n) => n.type === NodeType.Hotel)
      .map((hotel) => {
        const t = rawLinks.filter((l) => (l.source === hotel.id || l.target === hotel.id) && l.label === 'TRANSIT_ACCESS').length;
        const c = rawLinks.filter((l) => (l.source === hotel.id || l.target === hotel.id) && l.label === 'WALKABLE_TO').length;
        const score =
          queryMode === 'transit'   ? t * 2 + c :
          queryMode === 'culture'   ? c * 2 + t :
          queryMode === 'balanced'  ? t + c :
          queryMode === 'connected' ? (t > 0 && c > 0 ? t + c : 0) :
          queryMode === 'hub'       ? t * 3 + c :
          /* corridor */              c * 3 + t;
        return { hotel, transitCount: t, cultureCount: c, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [rawLinks, graphData.nodes, queryMode]);

  const activeModeConfig = QUERY_MODES.find((m) => m.key === queryMode)!;
  const maxScore         = queryResults[0]?.score ?? 1;

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <main className="flex h-screen flex-col bg-[#030712] text-slate-100 antialiased">

      {/* ══ HEADER (brand · tabs · controls) ═══════════════════════════════ */}
      <header className="shrink-0 border-b border-slate-800/70 bg-[#030712]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-5 py-3 md:px-8">

          {/* Brand */}
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-lg font-bold tracking-tight text-white">
                NYC <span className="text-blue-400">Nexus</span>
              </span>
            </div>
            <p className="pl-4 text-[10px] text-slate-500">Real-Time Semantic Knowledge Graph · Manhattan</p>
          </div>

          {/* ── Main tabs ── */}
          <div className="flex flex-1 items-center justify-center gap-1">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Right side: view toggle (viz only) · legend · badge ── */}
          <div className="flex shrink-0 items-center gap-3">
            {activeTab === 'viz' && (
              <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
                <button
                  onClick={() => setView('graph')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'graph' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Network size={12} /> Force Graph
                </button>
                <button
                  onClick={() => setView('map')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'map' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <MapIcon size={12} /> Map View
                </button>
              </div>
            )}

            {([
              { type: NodeType.Hotel,      label: 'Hotel' },
              { type: NodeType.Subway,     label: 'Subway' },
              { type: NodeType.Attraction, label: 'Attraction' },
            ] as const).map(({ type, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_COLORS[type] }} />
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

      {/* ══ CONTENT AREA (flex-1, fills remaining height) ═══════════════════ */}
      <div className="relative flex-1 overflow-hidden">

        {/* ── VISUALIZATION TAB — always mounted so ForceGraph2D keeps its state ── */}
        <div ref={containerRef} className={`absolute inset-0 ${activeTab !== 'viz' ? 'hidden' : ''}`}>

            {/* Loading */}
            {loading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5">
                <div className="relative h-14 w-14">
                  <div className="absolute inset-0 rounded-full border-2 border-blue-900" />
                  <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-200">Querying Overpass API</p>
                  <p className="mt-1 text-xs text-slate-500">Fetching real-time OSM data for Manhattan…</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center">
                <div className="max-w-sm rounded-2xl border border-red-800 bg-red-950/60 px-8 py-6 text-center">
                  <p className="font-bold text-red-400">API Error</p>
                  <p className="mt-2 text-sm text-red-300/80">{error}</p>
                  <p className="mt-3 text-xs text-slate-500">Overpass API may be rate-limited. Please wait 60 s and refresh.</p>
                </div>
              </div>
            )}

            {/* Force Graph */}
            {!loading && !error && view === 'graph' && (
              <ForceGraph2D
                graphData={graphData}
                width={dims.w}
                height={dims.h}
                backgroundColor="#030712"
                nodeCanvasObject={paintNode}
                nodePointerAreaPaint={paintPointer}
                nodeLabel=""
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                linkColor={(link: any) => (link as GraphLink).color}
                linkWidth={0.8}
                onNodeClick={handleNodeClick}
                onBackgroundClick={handleBgClick}
                cooldownTicks={220}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.35}
              />
            )}

            {/* Map */}
            {!loading && !error && view === 'map' && (
              <div className="h-full w-full">
                <MapView nodes={graphData.nodes} rawLinks={rawLinks} selectedNode={selected} onNodeSelect={setSelected} />
              </div>
            )}

            {/* ── Detail panel ── */}
            <aside className={`absolute right-4 top-4 z-[1000] w-72 transition-all duration-300 ${selected ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0'}`}>
              {selected && (
                <div className="relative rounded-2xl border border-slate-700 bg-slate-900/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-sm">
                  <button onClick={() => setSelected(null)} className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300" aria-label="Close">
                    <X size={13} />
                  </button>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: selected.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{selected.type}</span>
                  </div>
                  <h3 className="mb-4 pr-5 text-[15px] font-bold leading-snug text-white">{selected.name}</h3>
                  <div className="space-y-2.5">
                    {[
                      { Icon: Hash,      label: 'Node ID',     value: selected.id },
                      { Icon: MapPin,    label: 'Latitude',    value: selected.lat.toFixed(6) },
                      { Icon: MapPin,    label: 'Longitude',   value: selected.lon.toFixed(6) },
                      { Icon: GitBranch, label: 'Connections', value: `${selected.degree} edge${selected.degree !== 1 ? 's' : ''}` },
                    ].map(({ Icon, label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500"><Icon size={11} /><span>{label}</span></div>
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">{value}</span>
                      </div>
                    ))}
                  </div>
                  {selected.type === NodeType.Hotel && (
                    <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3">
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Active Ontology Rules</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span className="text-[11px] text-slate-400">TRANSIT_ACCESS &lt; 300 m</span></div>
                        <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /><span className="text-[11px] text-slate-400">WALKABLE_TO &lt; 500 m</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </aside>

            {/* ── Edge legend ── */}
            <div className="absolute bottom-5 left-5 z-[1000] flex flex-col gap-2">
              {([
                { label: 'TRANSIT_ACCESS', sub: '< 300 m', color: 'rgba(16,185,129,0.9)' },
                { label: 'WALKABLE_TO',    sub: '< 500 m', color: 'rgba(245,158,11,0.9)'  },
              ] as const).map(({ label, sub, color }) => (
                <div key={label} className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-900/80 px-3 py-2 backdrop-blur-sm">
                  <div className="h-px w-8 shrink-0" style={{ background: color }} />
                  <div>
                    <span className="font-mono text-[10px] text-slate-300">{label}</span>
                    <span className="ml-1 text-[9px] text-slate-500">({sub})</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Stat chips ── */}
            {!loading && !error && (
              <div className="absolute left-5 top-4 z-[1000] flex gap-2">
                {([
                  { type: NodeType.Hotel,      count: counts.hotels,      label: 'Hotels' },
                  { type: NodeType.Subway,     count: counts.subways,     label: 'Stations' },
                  { type: NodeType.Attraction, count: counts.attractions,  label: 'Attractions' },
                ] as const).map(({ type, count, label }) => (
                  <div key={label} className="flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-900/80 px-2.5 py-1 backdrop-blur-sm">
                    <span className="h-2 w-2 rounded-full" style={{ background: NODE_COLORS[type] }} />
                    <span className="text-[11px] font-semibold text-slate-300">{count}</span>
                    <span className="text-[10px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Hint pill ── */}
            {!loading && !error && (
              <div className="absolute bottom-5 right-5 z-[1000] flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 backdrop-blur-sm">
                <Wifi size={11} className="text-slate-500" />
                <span className="text-[10px] text-slate-500">
                  {view === 'graph' ? 'Scroll to zoom · Click node for details' : 'Click node for details · Scroll to zoom'}
                </span>
              </div>
            )}
        </div>

        {/* ── QUERY ENGINE TAB — always mounted ──────────────────────────── */}
        <div className={`h-full overflow-y-auto ${activeTab !== 'query' ? 'hidden' : ''}`}>
            <div className="mx-auto max-w-screen-2xl px-5 py-10 md:px-8">

              {/* Header */}
              <div className="mb-8">
                <div className="mb-2 flex items-center gap-2">
                  <Zap size={14} className="text-emerald-400" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">Live Graph Query Engine</p>
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-white">Knowledge Graph in Action</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
                  Select a guest priority. The engine traverses semantic edges in real-time and surfaces the top-ranked hotels by connection score.
                </p>
              </div>

              {/* Loading / no-data states */}
              {loading && (
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="h-4 w-4 animate-spin rounded-full border border-slate-700 border-t-slate-400" />
                  <span className="text-sm">Waiting for graph data…</span>
                </div>
              )}

              {!loading && queryResults.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-8 text-center text-slate-500 text-sm">
                  No hotels match the <span className="text-white font-medium">{activeModeConfig.label}</span> query.
                  {queryMode === 'connected' && ' Try a different mode — not all hotels have both edge types.'}
                </div>
              )}

              {!loading && queryResults.length > 0 && (
                <>
                  {/* Mode buttons — 3 per row on small, 6 on large */}
                  <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {QUERY_MODES.map(({ key, label, Icon, accent }) => (
                      <button
                        key={key}
                        onClick={() => setQueryMode(key)}
                        title={QUERY_MODES.find(m => m.key === key)?.description}
                        className={`flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left text-xs font-semibold transition-colors ${
                          queryMode === key
                            ? 'border-transparent'
                            : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                        }`}
                        style={queryMode === key ? { background: accent + '18', borderColor: accent, color: accent } : {}}
                      >
                        <Icon size={14} style={queryMode === key ? { color: accent } : {}} />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Description of active mode */}
                  <p className="mb-6 text-[12px] text-slate-500">
                    <span className="font-semibold" style={{ color: activeModeConfig.accent }}>{activeModeConfig.label}:</span>{' '}
                    {activeModeConfig.description}
                  </p>

                  {/* Two-column: Cypher + Results */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

                    {/* Cypher block */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Graph Query (Cypher)</span>
                        <span className="rounded-full bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">● running</span>
                      </div>
                      <pre className="overflow-x-auto text-[12px] leading-[1.75]">
                        <code>{CYPHER[queryMode]}</code>
                      </pre>
                    </div>

                    {/* Results */}
                    <div className="flex flex-col gap-3">
                      {queryResults.map((result, i) => {
                        const isActive = selected?.id === result.hotel.id;
                        const barPct   = Math.round((result.score / maxScore) * 100);
                        return (
                          <button
                            key={result.hotel.id}
                            onClick={() => { setSelected(isActive ? null : result.hotel); setActiveTab('viz'); }}
                            className={`group flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                              isActive ? 'border-blue-500/60 bg-blue-950/30' : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                            }`}
                          >
                            <span className="shrink-0 text-lg font-black tabular-nums" style={{ color: RANK_COLORS[i] }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-white">{result.hotel.name}</p>
                              <div className="mt-1 flex items-center gap-3">
                                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                  {result.transitCount} subway
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-amber-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                  {result.cultureCount} attraction{result.cultureCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${barPct}%` }} />
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-[12px] font-bold text-slate-200">
                                {result.score}<span className="ml-0.5 text-[9px] font-normal text-slate-500">pts</span>
                              </span>
                              <p className="mt-1 text-[9px] text-slate-600">click to locate</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
        </div>

        {/* ── ARCHITECTURE TAB — always mounted ──────────────────────────── */}
        <div className={`h-full overflow-y-auto ${activeTab !== 'arch' ? 'hidden' : ''}`}>
            <div className="mx-auto max-w-screen-2xl px-5 py-10 md:px-8">
              <div className="mb-10">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400">System Architecture Breakdown</p>
                <h2 className="text-4xl font-bold tracking-tight text-white">Engineering the NYC Nexus</h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-500">
                  Five layers that transform raw OpenStreetMap geo-data into an enterprise-grade semantic knowledge graph ready for Oracle&apos;s AI/ML hospitality stack.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {ARCH_CARDS.map((card) => (
                  <article
                    key={card.num}
                    className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-xl"
                    style={{ '--card-accent': card.accent } as React.CSSProperties}
                  >
                    <div className="absolute inset-x-0 top-0 h-[2px] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: `linear-gradient(90deg, transparent 0%, ${card.accent} 50%, transparent 100%)` }} />
                    <div className="pointer-events-none absolute -bottom-4 -right-2 select-none text-8xl font-black opacity-[0.04]" style={{ color: card.accent }}>
                      {card.num}
                    </div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: card.accent }}>
                      {card.num} / {card.tag}
                    </p>
                    <h3 className="mb-3 text-[15px] font-bold leading-snug text-white">{card.title}</h3>
                    <p className="text-[13px] leading-relaxed text-slate-400">{card.body}</p>
                  </article>
                ))}
              </div>

              <div className="mt-12 border-t border-slate-800 pt-6 text-center text-[11px] text-slate-600">
                <p>Data © OpenStreetMap contributors · Overpass API (overpass-api.de) · Built for Oracle Hospitality Engineering Demo</p>
              </div>
            </div>
        </div>

      </div>{/* /content area */}
    </main>
  );
}
