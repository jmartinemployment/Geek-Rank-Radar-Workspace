# GeekRadar — Angular Frontend Implementation Plan

> **Projects:** `geek-rank-radar-library` + `geek-rank-radar-elements`
> **Type:** Angular 21 library + Angular Elements app (Web Components)
> **Consumes:** Geek-Rank-Radar-Backend API (Port 5004 via `/api/rank-radar`)
> **Created:** 2026-02-19

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Application Structure](#3-application-structure)
4. [Key Views — Detailed Specifications](#4-key-views--detailed-specifications)
5. [Design System](#5-design-system)
6. [Leaflet Map Implementation](#6-leaflet-map-implementation)
7. [Responsive Considerations](#7-responsive-considerations)
8. [Integration with Existing Architecture](#8-integration-with-existing-architecture)
9. [Implementation Phases](#9-implementation-phases)

---

## 1. Overview

GeekRadar is a single-page application that serves as both a personal local
SEO command center and a future client-facing business intelligence dashboard.
It consumes the Geek-Rank-Radar-Backend API.

**Inspired by the best frontend patterns from:**
- **Local Falcon** — Geo-grid heatmap with color-coded rank pins, SoLV (Share
  of Local Voice) metric, scan campaigns, competitor overlays, click-to-drill
  grid nodes
- **SerpAPI** — Interactive playground for testing queries, structured JSON
  result viewer, search history, usage dashboard
- **DataForSEO** — API Explorer with parameter builder, task management
  dashboard, business listings browser, cost/usage analytics
- **ValueSERP** — Batch scan management, Places results with map integration,
  cross-engine comparison tables
- **BrightLocal** — Local audit dashboards, citation views, rank tracker trend
  graphs, white-label PDF reports
- **GMB Crush** — Location authority detection, competitor benchmarking
  breakdown, reverse-engineering competitor profiles, lead generation views

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Angular 21 | Standalone components, signals, OnPush, zoneless |
| UI Library | Angular Material | Theming, layout, tables, dialogs |
| Maps | Leaflet.js + OpenStreetMap | Free, no API key. Use `ngx-leaflet` |
| Charts | ngx-charts or Chart.js | Rank trends, review velocity, market share |
| State | Angular Signals + Services | No NgRx — keep it simple |
| HTTP | Angular HttpClient | Interceptors for error handling, loading states |
| Styling | SCSS + Angular Material theming | Dark mode default from day one |
| Build | Angular CLI | `outputHashing: "none"` for Elements build |
| Icons | Material Icons + custom SVGs | Consistent iconography |

**Do NOT use:** Google Maps (costs money), Mapbox (freemium limits), D3
directly (use charting wrappers), NgRx (overkill for this scope).

---

## 3. Application Structure

### Workspace Layout

```
Geek-Rank-Radar-Workspace/
  projects/
    Geek-Rank-Radar-Backend/          ← Backend (separate package.json)
    geek-rank-radar-library/          ← Angular library
      src/
        public-api.ts                 # Library entry point
        lib/                          # All components, services, models
    geek-rank-radar-elements/         ← Angular Elements app
      src/
        main.ts                       # Registers custom elements
  angular.json
  tsconfig.json
  package.json
```

### Library Source Structure

```
projects/geek-rank-radar-library/src/lib/
├── core/
│   ├── services/
│   │   ├── api.service.ts              # Base HTTP service with interceptors
│   │   ├── scan.service.ts             # Scan CRUD & status polling
│   │   ├── business.service.ts         # Business database queries
│   │   ├── analytics.service.ts        # Analytics & reporting data
│   │   ├── category.service.ts         # Category & keyword management
│   │   ├── service-area.service.ts     # Service area management
│   │   └── system.service.ts           # Engine status, queue, health
│   ├── interceptors/
│   │   ├── loading.interceptor.ts      # Global loading state
│   │   └── error.interceptor.ts        # Global error handling & toast
│   ├── models/
│   │   ├── business.model.ts
│   │   ├── scan.model.ts
│   │   ├── analytics.model.ts
│   │   └── category.model.ts
│   └── guards/
│       └── data-loaded.guard.ts        # Ensure seed data loaded
│
├── features/
│   ├── dashboard/                      # Home dashboard (overview)
│   │   ├── dashboard.component.ts
│   │   ├── dashboard.component.html
│   │   ├── dashboard.component.scss
│   │   ├── widgets/
│   │   │   ├── rank-summary-card.component.ts
│   │   │   ├── recent-scans-widget.component.ts
│   │   │   ├── engine-status-widget.component.ts
│   │   │   ├── competitor-alert-widget.component.ts
│   │   │   └── market-pulse-widget.component.ts
│   │   └── dashboard.routes.ts
│   │
│   ├── heatmap/                        # THE FLAGSHIP — Geo-grid heatmap
│   │   ├── heatmap.component.ts
│   │   ├── heatmap.component.html
│   │   ├── heatmap.component.scss
│   │   ├── components/
│   │   │   ├── grid-overlay.component.ts
│   │   │   ├── grid-node-popup.component.ts
│   │   │   ├── scan-controls.component.ts
│   │   │   ├── solv-gauge.component.ts
│   │   │   ├── heatmap-legend.component.ts
│   │   │   ├── competitor-toggle.component.ts
│   │   │   └── scan-comparison.component.ts
│   │   └── heatmap.routes.ts
│   │
│   ├── businesses/                     # Business database browser
│   │   ├── business-list.component.ts
│   │   ├── business-detail.component.ts
│   │   ├── components/
│   │   │   ├── business-card.component.ts
│   │   │   ├── rank-history-chart.component.ts
│   │   │   ├── review-trend-chart.component.ts
│   │   │   ├── cross-engine-table.component.ts
│   │   │   ├── business-map-pin.component.ts
│   │   │   ├── competitive-signals.component.ts
│   │   │   └── enrichment-status.component.ts
│   │   └── businesses.routes.ts
│   │
│   ├── competitors/                    # Competitor intelligence center
│   │   ├── competitor-dashboard.component.ts
│   │   ├── components/
│   │   │   ├── competitor-comparison.component.ts
│   │   │   ├── competitor-grid.component.ts
│   │   │   ├── geographic-dominance.component.ts
│   │   │   ├── gap-analysis-view.component.ts
│   │   │   └── competitor-reverse-engineer.component.ts
│   │   └── competitors.routes.ts
│   │
│   ├── scans/                          # Scan management
│   │   ├── scan-list.component.ts
│   │   ├── scan-detail.component.ts
│   │   ├── new-scan.component.ts
│   │   ├── components/
│   │   │   ├── scan-progress.component.ts
│   │   │   ├── scan-schedule-form.component.ts
│   │   │   ├── engine-selector.component.ts
│   │   │   └── scan-history-table.component.ts
│   │   └── scans.routes.ts
│   │
│   ├── analytics/                      # Analytics & reports
│   │   ├── analytics-dashboard.component.ts
│   │   ├── components/
│   │   │   ├── rank-trend-chart.component.ts
│   │   │   ├── market-overview.component.ts
│   │   │   ├── review-velocity-chart.component.ts
│   │   │   ├── cross-engine-radar.component.ts
│   │   │   ├── keyword-performance.component.ts
│   │   │   └── visibility-score.component.ts
│   │   └── analytics.routes.ts
│   │
│   ├── categories/                     # Category & keyword management
│   │   ├── category-list.component.ts
│   │   ├── category-detail.component.ts
│   │   ├── components/
│   │   │   ├── keyword-manager.component.ts
│   │   │   └── category-tree.component.ts
│   │   └── categories.routes.ts
│   │
│   ├── service-areas/                  # Service area management
│   │   ├── service-area-list.component.ts
│   │   ├── components/
│   │   │   ├── area-map-editor.component.ts
│   │   │   └── area-radius-slider.component.ts
│   │   └── service-areas.routes.ts
│   │
│   ├── playground/                     # SerpAPI-style query playground
│   │   ├── playground.component.ts
│   │   ├── components/
│   │   │   ├── query-builder.component.ts
│   │   │   ├── json-viewer.component.ts
│   │   │   └── result-preview.component.ts
│   │   └── playground.routes.ts
│   │
│   └── system/                         # System health & monitoring
│       ├── system-dashboard.component.ts
│       ├── components/
│       │   ├── engine-health.component.ts
│       │   ├── queue-monitor.component.ts
│       │   ├── usage-stats.component.ts
│       │   └── rate-limit-gauge.component.ts
│       └── system.routes.ts
│
├── shared/
│   ├── components/
│   │   ├── map/
│   │   │   ├── leaflet-map.component.ts
│   │   │   ├── map-marker.component.ts
│   │   │   └── map-grid-layer.component.ts
│   │   ├── data-table.component.ts
│   │   ├── loading-spinner.component.ts
│   │   ├── empty-state.component.ts
│   │   ├── status-badge.component.ts
│   │   ├── star-rating.component.ts
│   │   ├── trend-indicator.component.ts
│   │   └── search-bar.component.ts
│   ├── pipes/
│   │   ├── time-ago.pipe.ts
│   │   ├── rank-color.pipe.ts
│   │   └── truncate.pipe.ts
│   └── directives/
│       └── tooltip.directive.ts
│
├── layout/
│   ├── shell.component.ts
│   ├── sidenav.component.ts
│   ├── header.component.ts
│   └── footer.component.ts
│
└── app.routes.ts
```

---

## 4. Key Views — Detailed Specifications

### View 1: Geo-Grid Heatmap (THE FLAGSHIP)

This is the signature view. Inspired by Local Falcon. It must be visually
stunning and immediately understandable.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│ [Controls Bar]                                                  │
│ Service Area: [Delray Beach v]  Keyword: [IT consulting v]      │
│ Engine: [Google v]  Grid: [7x7 v]  Scan Date: [Feb 15 v]       │
│ [Run New Scan]  [Compare Scans]                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│              ┌──────────────────────────┐                       │
│              │                          │ ┌───────────────────┐ │
│              │    LEAFLET MAP           │ │ SOLV GAUGE        │ │
│              │    with NxN grid         │ │ Your Score: 67%   │ │
│              │    overlay of            │ │                   │ │
│              │    color-coded           │ │ LEGEND            │ │
│              │    circular pins         │ │  #1-3  (Top 3)    │ │
│              │                          │ │  #4-10            │ │
│              │    Each pin shows        │ │  #11-20           │ │
│              │    rank number           │ │  Not Ranking      │ │
│              │    inside circle         │ │                   │ │
│              │                          │ │ QUICK STATS       │ │
│              │    Click pin ->          │ │ Top 3: 28/49 pts  │ │
│              │    popup with            │ │ Avg Rank: 4.2     │ │
│              │    all businesses        │ │ Best: #1 (3 pts)  │ │
│              │    ranked at that        │ │ Worst: #18 (1 pt) │ │
│              │    grid point            │ │                   │ │
│              └──────────────────────────┘ └───────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [Competitor Overlay Toggle]                                 │ │
│ │ [x] Geek @ Your Spot  [ ] Competitor A  [ ] Competitor B   │ │
│ │ Toggle to overlay competitor grids with transparency        │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Grid Pin Design (Critical — this IS the product):**

| Rank Range | Fill Color | Hex |
|-----------|------------|-----|
| 1–3 (Top 3 / Local Pack) | Green | `#22C55E` |
| 4–7 | Yellow | `#EAB308` |
| 8–15 | Orange | `#F97316` |
| 16–20 | Red | `#EF4444` |
| Not found | Gray | `#6B7280` |

- Each grid point is a Leaflet `CircleMarker` on the map
- Circle contains the **rank number** in white text (e.g., "1", "5", "14")
- Circle size can optionally scale with rank (larger = better)
- **Hover** → tooltip: rank, business name(s) at position 1–3, keyword
- **Click** → popup panel:
  - Full ranked list of all businesses found at that coordinate
  - Each business: name, rank position, rating, review count, type
  - Link to business detail page
  - "View in Google Maps" link for that coordinate

**Share of Local Voice (SoLV):**
- Formula: (grid points where rank <= 3) / total grid points x 100
- Circular gauge with percentage
- Gauge fill color: green (70%+), yellow (40–69%), red (<40%)
- Trend arrow vs previous scan

**Competitor Overlay:**
- Toggle checkboxes for any competitor
- Overlay their grid with semi-transparent pins
- Different pin shapes per business (circle, square, diamond)

**Scan Comparison Mode:**
- Select two scan dates
- Side-by-side maps or toggle between them
- Highlight changed pins: improved (blue ring), declined (orange ring),
  new (white ring), lost (X overlay)
- Delta summary: "Improved at 12 points, declined at 3, unchanged at 34"

---

### View 2: Business Database

**Business List:**

```
┌─────────────────────────────────────────────────────────────────┐
│ [Search businesses...]                                          │
│ Filters: Category [All v]  City [All v]  Rating [Any v]         │
│          Status [Active v]  Sort [Last Seen v]                   │
│          [x] My Businesses  [x] Competitors  [ ] All            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ Business Card ──────────────────────────────────────────┐    │
│ │ Geek @ Your Spot                             [MINE]      │    │
│ │ IT Consulting - Delray Beach, FL                         │    │
│ │ 4.8 (23 reviews)  561-526-3512  geekatyourspot.com       │    │
│ │                                                          │    │
│ │ Rank Signals:                                            │    │
│ │ Google: #3 avg UP  Bing: #1 avg ->  DDG: #5 avg DOWN    │    │
│ │                                                          │    │
│ │ Competitive Signals:                                     │    │
│ │ Reviews: Accelerating  Website: Modern                   │    │
│ │ Momentum: Rising       GBP: Partial                      │    │
│ │                                                          │    │
│ │ Last Seen: 2 days ago  First Seen: Jan 15, 2026          │    │
│ │ [View Detail]  [Compare]  [Enrich Now]                   │    │
│ └──────────────────────────────────────────────────────────┘    │
│                                                                 │
│ Showing 1-20 of 347 businesses  [< 1 2 3 4 5 ... 18 >]         │
└─────────────────────────────────────────────────────────────────┘
```

**Business Detail Page — Tabbed Layout:**

| Tab | Content |
|-----|---------|
| Rankings | Keyword/area selectors, rank history line chart (Y inverted: 1 at top), one line per engine color-coded |
| Reviews | Review count and rating over time (bar + line combo chart), per-source breakdown |
| Cross-Engine | Table: keyword rows, columns per engine with rank + trend arrow, overall trend column |
| Map | Business location pin on Leaflet map, nearby competitors shown |
| Raw Data | All stored fields in key-value format, data source badges, enrichment log |

**Profile Header Fields:**
- Name, category, address, rating, reviews, price level, phone, website
- Google Maps link, hours, service options, attributes
- Data source badges (Google, Bing, DDG, Places API — checkmark per source)
- Last enriched timestamp, [Mark as Mine / Competitor] dropdown

---

### View 3: Competitor Intelligence Center

**Head-to-Head Comparison Table:**

| Metric | You | Competitor |
|--------|-----|-----------|
| Avg Google Rank | #3.2 | #5.8 |
| Avg Bing Rank | #1.4 | #4.2 |
| Google Rating | 4.8 | 4.2 |
| Review Count | 23 | 67 |
| Review Velocity | Accelerating | Stable |
| SoLV (per area) | Per-area breakdown | Per-area breakdown |
| GBP Completeness | Partial | Complete |
| Website Quality | Modern | Outdated |
| Running Ads? | No | Yes |

**Geographic Dominance Map:**
- Full Leaflet map showing all service areas
- Green zones = you dominate, Red = competitor dominates
- Yellow = contested, Gray = neither ranks well

**Competitor Reverse Engineer (GMB Crush-style):**
- GBP categories (primary + secondary)
- Keywords they rank for that you don't (keyword gap)
- Review highlights: count, recency, velocity
- Identified weaknesses (no HTTPS, outdated website, stale reviews)

---

### View 4: Scan Management

**New Scan Builder — 3-step wizard:**

| Step | Content |
|------|---------|
| 1. What to Scan | Service area checkboxes, category checkboxes, keyword checkboxes (auto-populated from categories) |
| 2. How to Scan | Engine multi-select, grid size dropdown, estimated queries count, estimated time, Bing API credits remaining |
| 3. When to Run | Run Now / Schedule (day + time) / One-time (date + time) |

**Scan Progress (real-time polling):**
- Overall progress bar with percentage and query count
- Per-engine progress bars with status badge (Healthy / Throttled / Done)
- Discovery stats: new businesses, updated businesses, rankings recorded
- ETA calculation
- Pause / Cancel / View Partial Results buttons

**Scan List:**
- Table: scan name/keyword, status badge, engine, area, progress, date,
  actions (view, re-run, delete)
- Status badges: Pending (gray), Running (blue pulse), Completed (green),
  Failed (red), Cancelled (orange)

---

### View 5: Analytics Dashboard

**Market Overview Layout:**

- Stats row: Total Businesses, Your Visibility (SoLV), Top Competitor
- **Keyword x Area Performance Matrix:** rows = keywords, columns = service
  areas, cells = rank position color-coded (green/yellow/orange/red)
- **Rank Trend Chart:** multi-line, Y inverted (1 at top, 20 at bottom),
  X = scan dates, one line per keyword, highlight significant movements
  (3+ positions)
- **Review Activity:** bar chart, reviews per month, your business vs
  top 3 competitors stacked, annotations for spikes

---

### View 6: Query Playground

**Split-pane layout:**

| Left Panel | Right Panel |
|-----------|-------------|
| Engine dropdown, query text input, lat/lng fields with "Pick on Map" button, Execute button | Visual result cards (ranked, with business name, rating, address) |
| | Raw JSON response in syntax-highlighted viewer |

For debugging and understanding raw SERP data from any engine at any
coordinate.

---

### View 7: System Health Dashboard

**Sections:**

| Section | Content |
|---------|---------|
| Engine Health | Per-engine row: name, status badge, hourly usage gauge (used/max), daily usage gauge (used/max) |
| Monthly Usage | Bing API progress bar (used/1000), Places API progress bar (used/6600), month label |
| Database Stats | Business count, scan count, ranking count, storage used/500MB |
| Scan Queue | Pending count, running count, completed today count |

**Status badges:**
- Blocked (CAPTCHA) = red
- Throttled (at limit) = yellow
- Healthy = green
- Disabled = gray

---

## 5. Design System

### Color Palette

```scss
// Rank Colors (consistent everywhere)
$rank-top3:     #22C55E;   // Green — Local Pack / Top 3
$rank-4-7:      #EAB308;   // Yellow — Page 1 mid-pack
$rank-8-15:     #F97316;   // Orange — Page 1 bottom / Page 2 top
$rank-16-plus:  #EF4444;   // Red — Low visibility
$rank-none:     #6B7280;   // Gray — Not found

// Trend Colors
$trend-up:      #22C55E;   // Green
$trend-stable:  #6B7280;   // Gray
$trend-down:    #EF4444;   // Red

// Competitive Signal Colors
$signal-strong:  #22C55E;  // Green dot
$signal-medium:  #EAB308;  // Yellow dot
$signal-weak:    #EF4444;  // Red dot

// App Theme
$primary:       #2563EB;   // Blue — actions, links, active states
$secondary:     #7C3AED;   // Purple — accent
$surface:       #1E1E2E;   // Dark background (dark mode default)
$surface-card:  #2A2A3E;   // Card backgrounds
$text-primary:  #F8FAFC;   // White text
$text-secondary:#94A3B8;   // Muted text
$border:        #334155;   // Subtle borders
```

### Dark Mode First

The entire app defaults to **dark mode**. Light mode is secondary/optional.
SERP tools, dashboards, and map interfaces look better dark — reduces eye
strain during long analysis sessions and makes color-coded rank pins pop on
the map.

### Typography

- Headers: Inter or system font stack, bold
- Body: 14px base, comfortable for data-dense tables
- Monospace: JetBrains Mono or similar for JSON viewer, coordinates, API data

### Component Patterns

| Pattern | Usage |
|---------|-------|
| Cards | Subtle border + shadow for business listings |
| Status badges | Colored dots for quick scanning |
| Trend arrows | Up/stable/down with color for directional data |
| Gauges | Percentage metrics (SoLV, GBP completeness) |
| Data tables | Sortable columns, sticky headers, row hover |
| Toast notifications | Scan completions, errors, discoveries |
| Loading skeletons | Not spinners — use skeletons for async data |

---

## 6. Leaflet Map Implementation

### Grid Overlay Layer

```typescript
// Each grid point becomes a Leaflet CircleMarker
const gridLayer = L.layerGroup();

scanPoints.forEach(point => {
  const color = getRankColor(point.rankPosition);

  const marker = L.circleMarker([point.lat, point.lng], {
    radius: 16,
    fillColor: color,
    fillOpacity: 0.85,
    color: '#FFFFFF',
    weight: 2,
    opacity: 0.9,
  });

  // Rank number always visible
  marker.bindTooltip(String(point.rankPosition || '–'), {
    permanent: true,
    direction: 'center',
    className: 'grid-rank-label',
  });

  // Click popup with full business list
  marker.bindPopup(buildPopupHTML(point));

  gridLayer.addLayer(marker);
});

map.addLayer(gridLayer);
```

### Map Tile Layers (Free)

```typescript
// Standard (light):
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '(c) OpenStreetMap contributors',
  maxZoom: 19,
});

// Dark mode (default):
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '(c) CartoDB',
  maxZoom: 19,
});
```

### Map Zoom for Grid Display

- 3x3 grid: zoom 12–13
- 5x5 grid: zoom 12
- 7x7 grid: zoom 11–12
- 9x9 grid: zoom 11

Auto-fit map bounds to contain all grid points with padding.

---

## 7. Responsive Considerations

- **Desktop first** — this is a power-user analytics tool
- **Tablet:** Collapse sidebar, stack side panels below map
- **Mobile:** Simplified views — heatmap is map-only (no side panel),
  business list is single-column cards, charts stack vertically
- The heatmap view should work on mobile but it's acceptable to show a
  "best viewed on desktop" note

---

## 8. Integration with Existing Architecture

### Angular Elements Build

Built as Web Components following the standard workspace pattern:

```typescript
// geek-rank-radar-elements/src/main.ts
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';
import { ShellComponent } from 'geek-rank-radar-library';
import { APP_ROUTES } from 'geek-rank-radar-library';

(async () => {
  const appRef = await createApplication({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideRouter(APP_ROUTES, withHashLocation()),
    ],
  });

  customElements.define('geek-rank-radar',
    createCustomElement(ShellComponent, { injector: appRef.injector }));
})();
```

Build config: `outputHashing: "none"` for predictable `main.js` + `styles.css`.

### WordPress Embedding

Loaded via `wp_enqueue_script_module()`, embedded as
`<geek-rank-radar></geek-rank-radar>` on a dedicated WordPress page.

Alternatively: standalone SPA on a subdomain (e.g.,
`radar.geekatyourspot.com`).

### API Routing

All API calls go through:
```
https://geekquote-controller.onrender.com/api/rank-radar/...
```

ControllerBackend proxies to Geek-Rank-Radar-Backend on Port 5004.

### Hash Routing

Use `withHashLocation()` so internal app routes don't conflict with WordPress
page URLs.

---

## 9. Implementation Phases

### Phase 1: Core Map Experience

| Step | Task | Key Files |
|------|------|-----------|
| 1.1 | Angular workspace setup (library + elements) | `angular.json`, `tsconfig.json`, `package.json` |
| 1.2 | App shell with Material sidenav routing | `layout/shell.component.ts`, `layout/sidenav.component.ts`, `layout/header.component.ts` |
| 1.3 | Core services: API base, scan service, business service | `core/services/api.service.ts`, `scan.service.ts`, `business.service.ts` |
| 1.4 | Models and type definitions | `core/models/*.model.ts` |
| 1.5 | Shared Leaflet map wrapper component | `shared/components/map/leaflet-map.component.ts` |
| 1.6 | Heatmap view with dark CartoDB tile layer | `features/heatmap/heatmap.component.ts` |
| 1.7 | Grid overlay component (color-coded CircleMarkers with rank numbers) | `features/heatmap/components/grid-overlay.component.ts` |
| 1.8 | Grid node click popup (ranked business list) | `features/heatmap/components/grid-node-popup.component.ts` |
| 1.9 | Scan controls bar (area, keyword, engine, grid size, date selectors) | `features/heatmap/components/scan-controls.component.ts` |
| 1.10 | SoLV gauge component | `features/heatmap/components/solv-gauge.component.ts` |
| 1.11 | Heatmap legend component | `features/heatmap/components/heatmap-legend.component.ts` |
| 1.12 | Shared components: status-badge, trend-indicator, loading-spinner, empty-state | `shared/components/*.component.ts` |
| 1.13 | Shared pipes: rank-color, time-ago, truncate | `shared/pipes/*.pipe.ts` |
| 1.14 | Dark mode Material theme + global SCSS variables | `styles.scss`, theme files |

### Phase 2: Business Database

| Step | Task | Key Files |
|------|------|-----------|
| 2.1 | Business list with filtering, search, pagination | `features/businesses/business-list.component.ts` |
| 2.2 | Business card component (compact summary) | `features/businesses/components/business-card.component.ts` |
| 2.3 | Business detail page with tabbed layout | `features/businesses/business-detail.component.ts` |
| 2.4 | Rank history line chart (Y inverted, per-engine lines) | `features/businesses/components/rank-history-chart.component.ts` |
| 2.5 | Review trend chart (count + rating over time) | `features/businesses/components/review-trend-chart.component.ts` |
| 2.6 | Cross-engine comparison table | `features/businesses/components/cross-engine-table.component.ts` |
| 2.7 | Competitive signal indicators | `features/businesses/components/competitive-signals.component.ts` |
| 2.8 | Business map pin on Leaflet | `features/businesses/components/business-map-pin.component.ts` |
| 2.9 | Enrichment status badges | `features/businesses/components/enrichment-status.component.ts` |
| 2.10 | Star rating component | `shared/components/star-rating.component.ts` |
| 2.11 | Reusable data table component | `shared/components/data-table.component.ts` |

### Phase 3: Scan Management

| Step | Task | Key Files |
|------|------|-----------|
| 3.1 | Scan list with status badges and actions | `features/scans/scan-list.component.ts` |
| 3.2 | New scan builder — 3-step wizard form | `features/scans/new-scan.component.ts` |
| 3.3 | Engine selector multi-select | `features/scans/components/engine-selector.component.ts` |
| 3.4 | Scan progress with real-time polling | `features/scans/components/scan-progress.component.ts` |
| 3.5 | Scan detail view (results summary) | `features/scans/scan-detail.component.ts` |
| 3.6 | Scan history table | `features/scans/components/scan-history-table.component.ts` |
| 3.7 | Scan schedule form (cron builder) | `features/scans/components/scan-schedule-form.component.ts` |

### Phase 4: Analytics & Intelligence

| Step | Task | Key Files |
|------|------|-----------|
| 4.1 | Analytics dashboard with stat cards | `features/analytics/analytics-dashboard.component.ts` |
| 4.2 | Keyword x area performance matrix | `features/analytics/components/keyword-performance.component.ts` |
| 4.3 | Rank trend multi-line chart | `features/analytics/components/rank-trend-chart.component.ts` |
| 4.4 | Market overview | `features/analytics/components/market-overview.component.ts` |
| 4.5 | Review velocity chart | `features/analytics/components/review-velocity-chart.component.ts` |
| 4.6 | Cross-engine radar chart | `features/analytics/components/cross-engine-radar.component.ts` |
| 4.7 | Visibility score component | `features/analytics/components/visibility-score.component.ts` |
| 4.8 | Competitor dashboard | `features/competitors/competitor-dashboard.component.ts` |
| 4.9 | Head-to-head comparison table | `features/competitors/components/competitor-comparison.component.ts` |
| 4.10 | Geographic dominance map | `features/competitors/components/geographic-dominance.component.ts` |
| 4.11 | Gap analysis view | `features/competitors/components/gap-analysis-view.component.ts` |
| 4.12 | Competitor reverse-engineer breakdown | `features/competitors/components/competitor-reverse-engineer.component.ts` |
| 4.13 | Dashboard home with widgets | `features/dashboard/dashboard.component.ts` + all widgets |

### Phase 5: Advanced Features

| Step | Task | Key Files |
|------|------|-----------|
| 5.1 | Scan comparison mode (two dates, delta highlights) | `features/heatmap/components/scan-comparison.component.ts` |
| 5.2 | Competitor overlay on heatmap | `features/heatmap/components/competitor-toggle.component.ts` |
| 5.3 | Query playground (split-pane) | `features/playground/playground.component.ts` + sub-components |
| 5.4 | System health dashboard | `features/system/system-dashboard.component.ts` + sub-components |
| 5.5 | Category management (CRUD + tree view) | `features/categories/category-list.component.ts`, `category-detail.component.ts` |
| 5.6 | Service area management (map editor + radius) | `features/service-areas/service-area-list.component.ts` + sub-components |
| 5.7 | Scheduled scan management UI | Update `features/scans/` with schedule CRUD |
| 5.8 | Angular Elements build + WordPress integration | `geek-rank-radar-elements/src/main.ts` |

---

*Last Updated: 2026-02-19*
