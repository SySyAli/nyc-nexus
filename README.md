# NYC Nexus

**Real-Time Semantic Knowledge Graph for Manhattan Hospitality & Transit**

A single-page Next.js application that fetches live OpenStreetMap data, applies semantic proximity rules, and renders an interactive force-directed knowledge graph connecting hotels, subway stations, and cultural attractions across Lower and Midtown Manhattan. Built as an Oracle Hospitality engineering demo.

---

## What It Does

On load, the app queries the public Overpass API for real POIs inside a bounding box from Battery Park to 59th Street. It then runs a proximity-based ontology engine that draws semantic edges between entities:

- **TRANSIT_ACCESS** — a hotel is within 300 m of a subway station
- **WALKABLE_TO** — a hotel is within 500 m of a museum or theatre

The resulting graph is visualized as a live force-directed network. Clicking any node opens a detail panel showing its name, type, coordinates, and degree centrality.

Below the graph, five architecture cards explain the engineering concepts in terms a hospitality enterprise audience can act on.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Graph | react-force-graph-2d |
| Geo math | Haversine formula (d3-geo available) |
| Icons | lucide-react |
| Data source | OpenStreetMap via Overpass API |

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The graph loads automatically — no API key required.

```bash
npm run build   # production build
npm start       # serve the production build
```

---

## Project Structure

```
nyc-nexus/
├── app/
│   ├── layout.tsx      # Root layout, metadata, Inter font
│   ├── globals.css     # Tailwind base directives
│   └── page.tsx        # Entire application (single client component)
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

All logic — data fetching, type definitions, ontology rules, graph rendering, and the architecture breakdown — lives in `app/page.tsx`.

---

## Architecture

The application encodes five distinct engineering layers, each explained in the on-page breakdown section.

### 1. Data Taxonomy

Raw OSM tags are classified into a strict three-class hierarchy before any node enters the graph:

```
Commercial     → Hospitality → Hotel
Infrastructure → Transit     → Subway
Cultural       → Attraction  → Museum | Theatre
```

### 2. Data Model

Every entity must satisfy the `GraphNode` interface before it enters system state:

```typescript
interface GraphNode {
  id: string;      // Unique OSM element ID
  name: string;    // Human-readable label from OSM tags
  type: NodeType;  // Hotel | Subway | Attraction
  lat: number;     // WGS84 latitude
  lon: number;     // WGS84 longitude
  color: string;   // Hex colour derived from type
  degree: number;  // Computed edge count (degree centrality)
}
```

### 3. Ontology (Semantic Edge Rules)

Edges are generated programmatically using the Haversine formula — decoupled from the data model so the rules can be changed independently of the schema:

```
distance(Hotel, Subway)     ≤ 300 m  →  TRANSIT_ACCESS edge  (green)
distance(Hotel, Attraction) ≤ 500 m  →  WALKABLE_TO edge     (amber)
```

### 4. Knowledge Graph

The force-directed canvas renders the populated entity network. Node radius scales with degree centrality so high-connectivity hubs are visually prominent. Directional particles animate along edges to show relationship direction.

### 5. Enterprise AI / ML Integration

The graph structure feeds directly into downstream ML pipelines:

- **Dynamic pricing** — node centrality and neighbourhood features as input signals for room rate models sensitive to real-time event proximity
- **Guest itinerary recommendation** — graph traversal over WALKABLE_TO / TRANSIT_ACCESS edges with graph-structured context fed to LLMs to prevent hallucination

---

## Data Source

All geographic data is fetched at runtime from the [Overpass API](https://overpass-api.de), which serves OpenStreetMap data under the [ODbL license](https://opendatacommons.org/licenses/odbl/).

The bounding box covers Manhattan from Battery Park to 59th Street:

```
South: 40.7000°N  West: 74.0200°W
North: 40.7680°N  East: 73.9700°W
```

The query uses `out center;` so that OSM *ways* (building footprints) are also included alongside point *nodes*, giving a more complete hotel and museum dataset.

---

## Node Color Reference

| Type | Color | Hex |
|------|-------|-----|
| Hotel | Blue | `#3B82F6` |
| Subway Station | Green | `#10B981` |
| Attraction | Amber | `#F59E0B` |
