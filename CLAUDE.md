# Project Name: nyc-nexus
**Subtitle:** A Real-Time Semantic Data Model & Knowledge Graph for NYC Urban Mobility

## 1. Context & Objective
Act as a Senior Principal Full-Stack Engineer. I am interviewing for an engineering role at Oracle in the Hospitality sector and need to present a visually impressive, interactive Knowledge Graph demo. 

Your task is to write the complete code for a single-page Next.js application that visualizes real-world hospitality and transit data in  Manhattan, and explicitly breaks down the system architecture (Taxonomy, Data Model, Ontology, and Knowledge Graph) for an enterprise audience.

## 2. Tech Stack Requirements
* **Framework:** Next.js 14+ (App Router)
* **Language:** TypeScript
* **Styling:** Tailwind CSS (Dark mode preferred for an enterprise dashboard look)
* **Graph Library:** `react-force-graph-2d`
* **Icons:** `lucide-react`
* **Data Source:** OpenStreetMap (Overpass API) via native `fetch`

## 3. Application Layout & UI
The application must consist of a single page (`app/page.tsx`) split into two distinct vertical sections:
1.  **Top Half (The Demo):** A sleek, dark-themed container holding the interactive 2D force-directed graph. It must include a loading state (spinner) while fetching data from the API. When a user clicks a node, a sleek side-panel should slide in or appear, displaying the node's metadata (Name, Type, Coordinates, Degree of Connections).
2.  **Bottom Half (The Architecture Breakdown):** A visually distinct section using a grid layout with 5 cards explaining the engineering concepts behind the demo.

## 4. Core Logic: The Knowledge Graph (Top Section)
### A. Data Fetching
On component mount, query the public Overpass API (`https://overpass-api.de/api/interpreter`) using a bounding box for Midtown Manhattan. Fetch three types of nodes:
* Hotels (`tourism=hotel`)
* Subway Stations (`railway=station` and `station=subway`)
* Attractions (`tourism=museum` or `amenity=theatre`)

### B. Data Processing & The Model
Transform the raw OSM JSON into a strict TypeScript interface: `{ nodes: GraphNode[], links: GraphLink[] }`.
* Nodes must be strongly typed with an `id`, `name`, `type` (enum of Hotel, Subway, Attraction), `lat`, `lon`, and `color` (assign a distinct hex code for each type).

### C. Semantic Edge Creation (The Ontology)
Implement a Haversine distance formula to calculate the geographical distance between nodes. Programmatically generate the `links` array based on these strict semantic rules:
* If a `Hotel` is within 300 meters of a `Subway`, create a link with the label `TRANSIT_ACCESS`.
* If a `Hotel` is within 500 meters of an `Attraction`, create a link with the label `WALKABLE_TO`.

## 5. Educational Content: The Architecture Breakdown (Bottom Section)
Render 5 sleek UI cards below the graph containing the following explanations tailored exactly to this NYC demo:

* **Card 1: Data Taxonomy**
    * *Title:* Organizing the Chaos
    * *Body:* "Before building the graph, we classified raw OpenStreetMap points into a strict spatial hierarchy: Infrastructure -> Transit -> Subway, and Commercial -> Hospitality -> Hotel. This parent-child structure standardizes enterprise search."
* **Card 2: The Data Model**
    * *Title:* Enforcing State & Structure
    * *Body:* "Represented by our strict TypeScript interfaces, the Data Model acts as the database blueprint. It guarantees every entity has a unique ID, precise latitude/longitude coordinates, and a valid type enumeration before entering system state."
* **Card 3: Data Ontology**
    * *Title:* Defining Semantic Rules
    * *Body:* "The Ontology is our business logic. It dictates that 'Proximity < 300m implies Transit Access.' By decoupling these semantic rules from the raw data model, we allow external APIs to understand the relationships between a hotel and a subway station."
* **Card 4: The Knowledge Graph**
    * *Title:* The Populated Network
    * *Body:* "The visual network above is the Knowledge Graph in action. It connects specific real-world entities (e.g., 'The Plaza Hotel') to specific transit nodes based on the rules of our Ontology, transforming flat database tables into a multi-hop relationship web."
* **Card 5: Enterprise AI / ML Integration**
    * *Title:* Future-Proofing for ML
    * *Body:* "At scale, this graph architecture feeds directly into Machine Learning pipelines. By extracting graph features (like node centrality), Oracle can power dynamic room pricing based on real-time event proximity, or feed structured context into LLMs to prevent hallucination in guest recommendation engines."

## 6. Output Deliverables
Please output:
1.  The terminal commands to install the required dependencies.
2.  The complete, production-ready code for `app/page.tsx` in a single code block. Ensure it handles window definition checks so `react-force-graph-2d` does not break Next.js SSR (e.g., dynamic imports).