# Geek Rank Radar — Implementation Plan

> **Project:** Geek-Rank-Radar-Backend
> **Type:** Node.js/TypeScript backend service (Express.js)
> **Port:** 5004
> **Gateway route:** `/api/rank-radar` via ControllerBackend (Port 4000)
> **Database:** PostgreSQL via Supabase (Prisma ORM)
> **Created:** 2026-02-19

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Database Schema](#5-database-schema)
6. [Search Engine Implementations](#6-search-engine-implementations)
7. [Core Features](#7-core-features)
8. [REST API Endpoints](#8-rest-api-endpoints)
9. [Anti-Detection & Throttling](#9-anti-detection--throttling)
10. [Seed Data](#10-seed-data)
11. [Environment Variables](#11-environment-variables)
12. [Implementation Phases](#12-implementation-phases)
13. [Critical Implementation Notes](#13-critical-implementation-notes)
14. [Integration with Existing Architecture](#14-integration-with-existing-architecture)

---

## 1. Project Vision

Geek Rank Radar is a self-hosted local business intelligence platform — the
modern, API-driven version of the Yellow Pages. It combines the best
capabilities of SerpAPI, DataForSEO, and ValueSERP into a zero-cost,
multi-engine SERP scraping and local business data aggregation system.

**This is NOT just a rank tracker.** It is a **local business database
engine.** Every scan harvests, verifies, enriches, and categorizes local
business data across multiple search engines and business directories. The
rank tracking is one view into this data. The business database IS the
product.

### Why It Matters

- **For Geek At Your Spot:** Track your own rankings across South Florida for
  IT consulting, web development, and SEO services. Identify geographic gaps
  and keyword opportunities.
- **For GetOrderStack:** The restaurant category database becomes the
  prospecting list for sales outreach. Every restaurant in Palm Beach County
  with ratings, reviews, hours, and contact info — automatically maintained.
- **For clients:** Offer SEO auditing and competitive intelligence as a
  service, backed by real multi-engine data.

---

## 2. Architecture Overview

### Microservice Placement

```
ControllerBackend (Port 4000) — API Gateway
  /api/web-dev          → WebDevelopmentBackend       (Port 3000)
  /api/ai-analytics     → AIBusinessAnalyticsBackend  (Port 5001)
  /api/marketing        → MarketingBackend            (Port 5002)
  /api/website-analytics→ WebsiteAnalyticsBackend     (Port 5003)
  /api/rank-radar       → Geek-Rank-Radar-Backend     (Port 5004) ← NEW
```

### Internal Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Express.js App                     │
│                   (Port 5004)                        │
├──────────┬──────────┬──────────┬────────────────────┤
│  Routes  │  Middleware  │  Config  │                 │
├──────────┴──────────┴──────────┴────────────────────┤
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Scanner    │  │   Business   │  │  Analytics  │ │
│  │ Orchestrator │  │   Matcher    │  │   Engine    │ │
│  │   + Queue    │  │  + Enricher  │  │  + Gaps     │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                 │         │
│  ┌──────┴──────────────────────────────────┘        │
│  │                                                   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │  │  Google   │ │   Bing   │ │   DDG    │         │
│  │  │  Search   │ │   API    │ │  Search  │         │
│  │  │  Maps     │ │  Local   │ │          │         │
│  │  │  Local    │ │  Places  │ │          │         │
│  │  │  Places   │ │          │ │          │         │
│  │  └──────────┘ └──────────┘ └──────────┘         │
│  │       ↕              ↕            ↕               │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │  │  Google   │ │   Bing   │ │   DDG    │         │
│  │  │  Parsers  │ │  Parser  │ │  Parser  │         │
│  │  └──────────┘ └──────────┘ └──────────┘         │
│  └───────────────────┬───────────────────────────── │
│                      │                               │
│               ┌──────┴──────┐                        │
│               │    Prisma    │                        │
│               │  (Supabase)  │                        │
│               └─────────────┘                        │
└─────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 20+ | |
| Language | TypeScript | strict mode | |
| Framework | Express.js | Current | Match existing backend patterns |
| Database | PostgreSQL via Supabase | Free tier (500MB) | New Supabase project |
| ORM | Prisma | Current | Match existing backend patterns |
| HTTP Client | axios | Current | For SERP requests |
| HTML Parser | cheerio | Current | Google, DDG, Bing organic HTML |
| Scheduling | node-cron | Current | In-process scan scheduling |
| Logging | Winston | Current | Match existing shared logger pattern |
| Rate Limiting | Custom token bucket | — | Per-engine throttling |
| Validation | Zod | Current | Request/env validation |

**Do NOT use:** Puppeteer, Playwright, Selenium, or any headless browser. All
scraping is done via direct HTTP requests with cheerio parsing.

---

## 4. Directory Structure

```
Geek-Rank-Radar-Workspace/
  Plan.md                           ← This file
  CLAUDE.md                         ← Project-specific Claude context
  .claude/
    settings.json                   ← Claude Code permissions
  projects/
    Geek-Rank-Radar-Backend/
      package.json
      tsconfig.json
      eslint.config.mjs
      .env.example
      .gitignore
      prisma/
        schema.prisma               # Database schema
        seed.ts                     # Seed data (areas, categories, keywords)
      src/
        index.ts                    # Express app entry point (Port 5004)
        config/
          environment.ts            # Zod-validated env config
          engines.ts                # Search engine configs & throttle settings
          categories.ts             # Business category definitions & keyword sets
          serviceAreas.ts           # Geographic service area definitions
          database.ts               # Prisma client singleton
          logger.ts                 # Winston logger (match existing pattern)
        services/
          grid/
            gridGenerator.ts        # GPS coordinate grid math
          engines/
            BaseEngine.ts           # Abstract base class for all engines
            GoogleSearchEngine.ts   # Google organic + local pack
            GoogleMapsEngine.ts     # Google Maps search results
            GoogleLocalEngine.ts    # Google Local Finder (tbm=lcl)
            BingSearchEngine.ts     # Bing Web Search API (legitimate)
            BingLocalEngine.ts      # Bing Local / Maps scraping
            DuckDuckGoEngine.ts     # DDG HTML search
            GooglePlacesAPI.ts      # Legitimate API for enrichment
          parsers/
            GoogleSearchParser.ts   # Parse Google SERP HTML
            GoogleMapsParser.ts     # Parse Google Maps HTML/JSON
            GoogleLocalParser.ts    # Parse Google Local Finder HTML
            BingSearchParser.ts     # Parse Bing Web API JSON
            BingLocalParser.ts      # Parse Bing Local HTML
            DuckDuckGoParser.ts     # Parse DDG HTML
          scanner/
            ScanOrchestrator.ts     # Coordinates full scan runs
            ScanQueue.ts            # Priority queue with throttling
            ScanScheduler.ts        # Cron-based recurring scans
          business/
            BusinessMatcher.ts      # Deduplication & entity resolution
            BusinessEnricher.ts     # Enrichment from multiple sources
            BusinessScorer.ts       # Competitive scoring & signals
          analytics/
            RankAnalytics.ts        # Rank trends, movement detection
            GapAnalyzer.ts          # Geographic & keyword gap analysis
            CompetitorIntel.ts      # Competitor profiling & alerts
        routes/
          scan.routes.ts            # Scan management endpoints
          business.routes.ts        # Business database endpoints
          analytics.routes.ts       # Analytics & reporting endpoints
          category.routes.ts        # Category & service area endpoints
          schedule.routes.ts        # Scan schedule endpoints
          system.routes.ts          # System status endpoints
          health.routes.ts          # Health check
        middleware/
          rateLimiter.ts            # API rate limiting
          errorHandler.ts           # Centralized error handling
          validator.ts              # Zod request validation middleware
        utils/
          uule.ts                   # Google UULE location encoding
          userAgents.ts             # User agent rotation pool
          delay.ts                  # Human-like delay with jitter
          retry.ts                  # Exponential backoff retry logic
          geo.ts                    # Haversine distance, coordinate utils
          phone.ts                  # Phone number normalization (E.164)
          text.ts                   # Text normalization (business names)
          response.ts               # Standardized API response wrapper
          errors.ts                 # Error types & toErrorMessage helper
        types/
          engine.types.ts           # Engine interfaces & configs
          business.types.ts         # Business entity types
          scan.types.ts             # Scan & grid types
          analytics.types.ts        # Analytics & report types
```

---

## 5. Database Schema

### Entity Relationship Overview

```
ServiceArea ──< Scan >── Category
                 │
                 ├──< ScanPoint
                 │       │
                 │       └──< ScanRanking >── Business
                 │
Category ──< CategoryKeyword
   │
   └── Category (self-referential parent/child tree)

Business ──< ScanRanking
         ──< ReviewSnapshot
         ──< EnrichmentLog
         ──> Category

ScanSchedule (standalone, references IDs in arrays)
```

### Models

#### ServiceArea — Geographic scan targets

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | "Delray Beach" |
| state | String | Default "FL" |
| centerLat | Decimal(10,7) | Center latitude |
| centerLng | Decimal(10,7) | Center longitude |
| radiusMiles | Decimal(5,2) | Default 3.0 |
| isActive | Boolean | Default true |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

Relations: `scans[]`

#### Category — Business taxonomy (self-referential tree)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | "Restaurants" |
| slug | String | Unique, "restaurants" |
| parentId | String? | FK to self for subcategories |
| isActive | Boolean | Default true |
| createdAt | DateTime | Auto |

Relations: `parent?`, `children[]`, `keywords[]`, `businesses[]`, `scans[]`

#### CategoryKeyword — Search terms per category

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| categoryId | String | FK to Category |
| keyword | String | "italian restaurant near me" |
| priority | Int | Higher = scan first. Default 1 |
| isActive | Boolean | Default true |
| createdAt | DateTime | Auto |

Unique constraint: `[categoryId, keyword]`

#### Business — The core asset

This is the central entity. Every scan enriches this table.

**Identity fields:**

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | Business name as displayed |
| normalizedName | String | Lowercase, stripped for matching |
| phone | String? | Normalized |
| website | String? | |
| email | String? | |

**Location fields:**

| Field | Type | Notes |
|-------|------|-------|
| address | String? | Street address |
| addressLine2 | String? | Suite, unit |
| city | String? | |
| state | String? | |
| zip | String? | |
| lat | Decimal(10,7)? | |
| lng | Decimal(10,7)? | |

**Classification fields:**

| Field | Type | Notes |
|-------|------|-------|
| categoryId | String? | FK to Category |
| primaryType | String? | Google type: "restaurant" |
| types | String[] | All types array |

**Google Business Profile fields:**

| Field | Type | Notes |
|-------|------|-------|
| googlePlaceId | String? | Unique. Google Place ID |
| googleCid | String? | Google CID |
| googleMapsUrl | String? | |

**Bing fields:**

| Field | Type | Notes |
|-------|------|-------|
| bingPlaceId | String? | |

**Ratings (aggregated across sources):**

| Field | Type | Notes |
|-------|------|-------|
| googleRating | Decimal(2,1)? | e.g. 4.5 |
| googleReviewCount | Int? | |
| bingRating | Decimal(2,1)? | |
| bingReviewCount | Int? | |

**Business details:**

| Field | Type | Notes |
|-------|------|-------|
| description | String? | |
| priceLevel | String? | "$", "$$", "$$$", "$$$$" |
| hours | Json? | Structured weekly hours |
| attributes | Json? | Accessibility, amenities |
| serviceOptions | Json? | Dine-in, takeout, delivery |
| menuUrl | String? | For restaurants |
| orderUrl | String? | Online ordering link |
| reservationUrl | String? | Reservation link |

**Competitive signals (computed):**

| Field | Type | Notes |
|-------|------|-------|
| websiteQuality | String? | "modern", "outdated", "none" |
| reviewVelocity | String? | "accelerating", "stable", "slowing", "stale" |
| rankingMomentum | String? | "rising", "stable", "falling" |
| lastReviewDate | DateTime? | |

**Ownership flags:**

| Field | Type | Notes |
|-------|------|-------|
| isMine | Boolean | Default false. Flag own businesses |
| isCompetitor | Boolean | Default false. Marked competitors |

**Metadata:**

| Field | Type | Notes |
|-------|------|-------|
| firstSeenAt | DateTime | When first discovered |
| lastSeenAt | DateTime | Last seen in any scan |
| lastEnrichedAt | DateTime? | Last enrichment run |
| verifiedAt | DateTime? | Manual verification |
| isActive | Boolean | Default true. Still appearing |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

Relations: `rankings[]`, `reviewSnapshots[]`, `enrichmentLogs[]`, `category?`

Indexes: `[normalizedName, city, state]`, `[categoryId]`, `[googlePlaceId]`,
`[city, state, categoryId]`, `[isMine]`, `[isCompetitor]`, `[lastSeenAt]`

#### ReviewSnapshot — Review tracking time series

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| businessId | String | FK to Business |
| source | String | "google", "bing", "yelp" |
| rating | Decimal(2,1) | |
| reviewCount | Int | |
| capturedAt | DateTime | Auto |

Index: `[businessId, source, capturedAt]`

#### Scan — Scan execution tracking

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| serviceAreaId | String | FK to ServiceArea |
| categoryId | String | FK to Category |
| keyword | String | Actual keyword used |
| searchEngine | String | "google_search", "bing_api", etc. |
| gridSize | Int | Default 7 (7x7) |
| radiusMiles | Decimal(5,2) | |
| status | String | pending/queued/running/completed/failed/cancelled |
| errorMessage | String? | |
| pointsTotal | Int | Default 0 |
| pointsCompleted | Int | Default 0 |
| scheduledAt | DateTime? | |
| startedAt | DateTime? | |
| completedAt | DateTime? | |
| createdAt | DateTime | Auto |

Relations: `serviceArea`, `category`, `points[]`

Indexes: `[serviceAreaId, categoryId, keyword, searchEngine]`, `[status]`, `[createdAt]`

#### ScanPoint — Individual grid point within a scan

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| scanId | String | FK to Scan (cascade delete) |
| gridRow | Int | |
| gridCol | Int | |
| lat | Decimal(10,7) | |
| lng | Decimal(10,7) | |
| status | String | pending/completed/failed |
| rawHtml | String? | Optional debug storage |
| createdAt | DateTime | Auto |

Relations: `scan`, `rankings[]`

Index: `[scanId]`

#### ScanRanking — Business ranking at a grid point

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| scanPointId | String | FK to ScanPoint (cascade delete) |
| businessId | String | FK to Business |
| rankPosition | Int | 1, 2, 3, etc. |
| resultType | String | "local_pack", "organic", "maps", "local_finder" |
| snippet | String? | Description text from SERP |
| createdAt | DateTime | Auto |

Indexes: `[scanPointId]`, `[businessId]`, `[businessId, createdAt]`

#### EnrichmentLog — Tracks enrichment attempts

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| businessId | String | FK to Business |
| source | String | "google_places_api", "bing_places", etc. |
| status | String | "success", "failed", "partial" |
| dataAdded | Json? | What fields were updated |
| createdAt | DateTime | Auto |

Index: `[businessId]`

#### ScanSchedule — Recurring scan definitions

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | "Weekly Full Scan" |
| cronExpression | String | "0 2 * * 0" |
| serviceAreaIds | String[] | Which areas |
| categoryIds | String[] | Which categories |
| engineIds | String[] | Which engines |
| gridSize | Int | Default 7 |
| isActive | Boolean | Default true |
| lastRunAt | DateTime? | |
| nextRunAt | DateTime? | |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

---

## 6. Search Engine Implementations

### Engine Architecture

All engines extend `BaseEngine`:

```typescript
abstract class BaseEngine {
  abstract readonly engineId: string;       // "google_search", "bing_api", etc.
  abstract readonly engineName: string;     // Human-readable
  abstract readonly throttleConfig: ThrottleConfig;

  abstract search(query: string, location: GeoPoint): Promise<SERPResult>;

  protected getRandomUserAgent(): string;
  protected getDelay(): number;             // With jitter
  protected buildHeaders(): Record<string, string>;
  protected detectCaptcha(body: string): boolean;
}
```

Each engine has a paired parser class that handles HTML/JSON parsing
separately from the HTTP request logic.

### Engine 1: Google Web Search (Organic + Local Pack)

**File:** `GoogleSearchEngine.ts` + `GoogleSearchParser.ts`

**Purpose:** Captures organic results AND the Local Pack (3-pack of map
results embedded in regular search).

**Request:**
```
GET https://www.google.com/search?q={query}&gl=us&hl=en&uule={encoded_location}&num=20
```

**UULE encoding:** Google's UULE parameter simulates searching from specific
GPS coordinates. Format: `w+CAIQICI{length_char}{base64(canonical_name)}`.
Implemented in `utils/uule.ts`.

**Result types to parse:**

| Result Type | What to Extract |
|-------------|----------------|
| `local_pack` | Business name, rating, review count, address, phone, type, place_id, hours snippet, service options, GPS, thumbnail |
| `organic` | Position, title, URL, domain, snippet, sitelinks |
| `knowledge_panel` | All structured data (name, address, phone, hours, rating, reviews, website, description, attributes) |
| `people_also_ask` | Questions (for content strategy) |
| `related_searches` | Search terms (for keyword expansion) |
| `ads` | Paid results (track which competitors run ads) |

**Throttle:** 8–18s delay, max 40/hr, max 200/day, 24hr pause on CAPTCHA.

### Engine 2: Google Maps

**File:** `GoogleMapsEngine.ts` + `GoogleMapsParser.ts`

**Purpose:** Direct Maps search — up to 20 listings per page with richer data
than the Local Pack.

**Request:**
```
GET https://www.google.com/maps/search/{query}/@{lat},{lng},{zoom}z
```

Zoom: 13z–15z for local business scanning.

**Fields to parse:** Business name, place_id, data_cid, full address, GPS,
rating, review count, price level, primary type, all types, phone, website,
full weekly hours, service options (dine_in, takeout, delivery,
curbside_pickup), attributes (wheelchair, wifi, outdoor_seating), description,
photo URLs, menu/order/reservation URLs, open/closed state.

**Throttle:** Shares Google reputation — same limits as Google Search. All
three Google engines (search, maps, local) share a combined daily cap.

### Engine 3: Google Local Finder

**File:** `GoogleLocalEngine.ts` + `GoogleLocalParser.ts`

**Purpose:** The expanded local results page (clicking "More places" under
the Local Pack). Returns 20+ businesses per page with pagination. Different
ranking signals from Google Maps.

**Request:**
```
GET https://www.google.com/search?q={query}&gl=us&hl=en&tbm=lcl&uule={encoded_location}
```

`tbm=lcl` triggers Local Finder mode. Pagination: `start=20`, `start=40`, etc.

**Parse:** Same fields as Google Maps plus local_results position ranking.

**Throttle:** Shares Google reputation.

### Engine 4: Bing Web Search API (Legitimate — Free Tier)

**File:** `BingSearchEngine.ts` + `BingSearchParser.ts`

**Purpose:** 1,000 free API calls/month. Structured JSON — no scraping needed.
Returns organic results AND local business listings.

**Request:**
```
GET https://api.bing.microsoft.com/v7.0/search
  ?q={query}&mkt=en-US&count=50&responseFilter=Webpages,Places
Headers: Ocp-Apim-Subscription-Key: {BING_SEARCH_API_KEY}
```

**Parse from JSON:**
- `webPages.value[]` — Organic: name, url, snippet, dateLastCrawled
- `places.value[]` — Local businesses: name, url, phone, full structured
  address, lat/lng, entityTypeDisplayHint

**Throttle:** 1–3s between requests (legitimate API). Max 900/day to stay
within monthly free tier.

**This is the workhorse engine.** Legitimate, fast, structured JSON, free.
Lean on it heavily. Scraping is supplementary.

### Engine 5: Bing Local / Bing Places Scraping

**File:** `BingLocalEngine.ts` + `BingLocalParser.ts`

**Purpose:** Bing's local search results page. Supplements the API with
additional local business data.

**Request:**
```
GET https://www.bing.com/maps?q={query}&where1={lat},{lng}
```

**Parse:** Business name, address, phone, rating, review count, categories,
hours, website, photos.

**Throttle:** 5–12s between requests. Max 60/hr.

### Engine 6: DuckDuckGo

**File:** `DuckDuckGoEngine.ts` + `DuckDuckGoParser.ts`

**Purpose:** Uses Bing's index but provides an independent ranking signal.
Extremely permissive — minimal bot detection.

**Request:**
```
GET https://html.duckduckgo.com/html/?q={query}
```

Append city/state to query for location targeting.

**Parse:** Organic results — position, title, url, snippet. No local pack,
but local businesses often appear in organic results with address/phone in
snippets.

**Throttle:** 8–15s between requests. Max 60/hr.

### Engine 7: Google Places API (Legitimate — Free $200/Month Credit)

**File:** `GooglePlacesAPI.ts`

**Purpose:** NOT for rank tracking. Used exclusively for **business
enrichment** after discovery. ~6,600 free Place Details calls/month.

**Request:**
```
GET https://places.googleapis.com/v1/places/{place_id}
  ?fields=displayName,formattedAddress,rating,userRatingCount,priceLevel,
          types,regularOpeningHours,websiteUri,nationalPhoneNumber,reviews,
          editorialSummary,accessibilityOptions,delivery,dineIn,takeout
Headers: X-Goog-Api-Key: {GOOGLE_PLACES_API_KEY}
```

**Enrichment priority order:**
1. Your own businesses (`isMine = true`) — always enrich
2. Businesses flagged as competitors (`isCompetitor = true`)
3. Businesses ranking in top 5 for any keyword
4. New businesses not yet enriched (`lastEnrichedAt IS NULL`)
5. Businesses not enriched in 30+ days

**Data preference when merging:** Google Places API > Google Maps scrape >
Bing API > Bing scrape > DDG

---

## 7. Core Features

### Feature 1: Grid-Based Geo-Scanning

Generate an NxN grid of GPS coordinates centered on a service area. At each
point, execute a search query and record which businesses appear and at what
position.

**Grid math (South Florida latitudes ~26.4°N):**
- 1 mile latitude ≈ 0.01449° (1/69.0)
- 1 mile longitude ≈ 0.01617° (adjusted for cos(latitude))

**Supported grid sizes:**

| Size | Points | Use Case |
|------|--------|----------|
| 3×3 | 9 | Quick scan |
| 5×5 | 25 | Standard |
| 7×7 | 49 | Detailed (default) |
| 9×9 | 81 | Comprehensive |

**Implementation:** `services/grid/gridGenerator.ts`

```typescript
interface GridPoint {
  row: number;
  col: number;
  lat: number;
  lng: number;
}

function generateGrid(
  centerLat: number,
  centerLng: number,
  radiusMiles: number,
  gridSize: number
): GridPoint[];
```

### Feature 2: Multi-Engine Scan Orchestration

A single "Full Scan" accepts service area(s), category(ies), engine(s), and
grid size, then:

1. Generates grid points for each service area
2. For each grid point × keyword × engine, creates a scan task
3. Queues tasks with per-engine throttling
4. Executes with human-like delays and jitter
5. Parses results, matches/creates business entities, records rankings
6. Reports progress via status endpoint

**Scan spreading:** Scans spread across hours. Never burst.

Example timing for 7×7 grid, 3 cities, 5 keywords, 3 engines:
- Google: 49 pts × 15 keywords × ~13s avg ≈ 2.6 hours
- Bing API: 49 pts × 15 keywords × ~2s avg ≈ 25 minutes
- DDG: 49 pts × 15 keywords × ~12s avg ≈ 2.5 hours
- **Total sequential: ~5.5 hours** (run overnight)
- Engines run in parallel (different endpoints/reputations)

**Implementation:** `services/scanner/ScanOrchestrator.ts`, `ScanQueue.ts`

### Feature 3: Business Entity Resolution (Deduplication)

The same business appears across multiple engines and scans. Fuzzy matching
deduplicates on every insert.

**Matching algorithm (score-based):**

| Match Type | Confidence | Action |
|-----------|------------|--------|
| Exact Google Place ID match | 100% | Merge immediately |
| Normalized name + address within 50m (haversine) | 95% | Merge |
| Phone number match (E.164 normalized) | 90% | Merge |
| Fuzzy name (Levenshtein ≤ 3) + same phone | 85% | Merge |
| Website domain match + same city | 80% | Merge |

**Name normalization:** Lowercase, remove LLC/Inc/Corp/& Co, strip
punctuation, collapse whitespace.

**Implementation:** `services/business/BusinessMatcher.ts`

### Feature 4: Competitive Intelligence Signals

Computed and stored per business after each scan:

| Signal | Computation | Values |
|--------|-------------|--------|
| Review Velocity | Compare review count across snapshots over time | accelerating (>5/mo), stable (1–5/mo), slowing (<1/mo), stale (0 for 3+ mo) |
| Ranking Momentum | Compare avg rank position across last 3 scans | rising, stable, falling |
| Website Quality | Future: crawl to detect HTTPS, mobile, speed | "modern", "outdated", "none" |
| Ad Spend Signal | Appearing in paid ads? How often? | Tracked via `ads` result type |
| GBP Completeness | Has hours? photos? description? posts? | Scored during enrichment |
| Geographic Dominance | Where does this business rank top 3? | Computed per service area |

**Implementation:** `services/business/BusinessScorer.ts`

### Feature 5: Analytics & Gap Analysis

**Rank Trend Analysis:**
- For a given business + keyword + service area: rank position over time across
  all engines
- Detect significant rank changes (moved 3+ positions) and flag

**Geographic Gap Analysis:**
- "You rank #2 in Delray Beach but #11 in Boca Raton for the same keyword"
- "Competitor X dominates Boynton Beach but is invisible in Delray"

**Cross-Engine Comparison:**
- "You rank #3 on Google but #1 on Bing for this keyword"
- Highlights where Bing optimization could be quick wins

**Keyword Gap Analysis:**
- "Competitors rank for 'custom software development' but you're not found"

**Implementation:** `services/analytics/RankAnalytics.ts`, `GapAnalyzer.ts`,
`CompetitorIntel.ts`

### Feature 6: Scheduled Recurring Scans

Using node-cron:
- Weekly full scan (all areas, all categories, all engines)
- Daily quick scan (own businesses only, top 5 keywords, Google only)
- Custom schedules with configurable scope

**Implementation:** `services/scanner/ScanScheduler.ts`

---

## 8. REST API Endpoints

All endpoints return standardized JSON:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { message: string; code?: string };
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}
```

### Scan Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scans` | Create and queue a new scan |
| `GET` | `/api/scans` | List all scans (filterable by status, engine, area, category) |
| `GET` | `/api/scans/:id` | Get scan details & progress |
| `GET` | `/api/scans/:id/results` | Get scan results (grid data with rankings) |
| `DELETE` | `/api/scans/:id` | Cancel a pending/running scan |
| `POST` | `/api/scans/full` | Trigger a full scan (all areas, all categories, all engines) |

### Business Database

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/businesses` | List businesses (filter by category, city, engine, ranking) |
| `GET` | `/api/businesses/:id` | Full business profile |
| `GET` | `/api/businesses/:id/rankings` | Rank history for a business |
| `GET` | `/api/businesses/:id/reviews` | Review count history |
| `PUT` | `/api/businesses/:id` | Update business (mark mine, competitor, notes) |
| `POST` | `/api/businesses/:id/enrich` | Trigger enrichment |
| `GET` | `/api/businesses/search` | Full-text search across database |
| `GET` | `/api/businesses/competitors` | List marked competitors with latest data |
| `GET` | `/api/businesses/mine` | Own businesses with latest rankings |

### Categories & Service Areas

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/categories` | List all categories with keyword counts |
| `POST` | `/api/categories` | Create new category |
| `PUT` | `/api/categories/:id` | Update category |
| `POST` | `/api/categories/:id/keywords` | Add keywords to category |
| `GET` | `/api/service-areas` | List service areas |
| `POST` | `/api/service-areas` | Create new service area |
| `PUT` | `/api/service-areas/:id` | Update service area |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/analytics/rank-trends` | Rank position over time |
| `GET` | `/api/analytics/geo-heatmap` | Grid heatmap data for keyword/area/engine |
| `GET` | `/api/analytics/gap-analysis` | Geographic and keyword gaps |
| `GET` | `/api/analytics/competitors` | Competitor comparison dashboard data |
| `GET` | `/api/analytics/cross-engine` | Cross-engine rank comparison |
| `GET` | `/api/analytics/market-overview` | Category-level overview per service area |

### Schedules

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/schedules` | List scan schedules |
| `POST` | `/api/schedules` | Create schedule |
| `PUT` | `/api/schedules/:id` | Update schedule |
| `DELETE` | `/api/schedules/:id` | Delete schedule |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check: `{ status, timestamp, service }` |
| `GET` | `/api/system/engine-status` | Per-engine status (healthy/throttled/blocked) |
| `GET` | `/api/system/scan-queue` | Current queue depth per engine |
| `GET` | `/api/system/stats` | DB stats (business count, scan count, etc.) |

---

## 9. Anti-Detection & Throttling

### Per-Engine Throttle Configuration

| Engine | Min Delay | Max Delay | Max/Hr | Max/Day | CAPTCHA Pause | Notes |
|--------|-----------|-----------|--------|---------|---------------|-------|
| `google_search` | 8s | 18s | 40 | 200 | 24hr | Shares reputation with maps/local |
| `google_maps` | 8s | 18s | 40 | 200 | 24hr | Shares reputation with search/local |
| `google_local` | 8s | 18s | 40 | 200 | 24hr | Shares reputation with search/maps |
| `bing_api` | 1s | 3s | 200 | 900 | none | Legitimate API |
| `bing_local` | 5s | 12s | 60 | 300 | 12hr | Scraping |
| `duckduckgo` | 8s | 15s | 60 | 300 | 1hr | Very permissive |
| `google_places_api` | 200ms | 500ms | 500 | 5000 | none | Legitimate API, budget-limited |

**CRITICAL:** All three Google engines (search, maps, local) share the same
IP reputation. Their daily limits are **combined**, not independent. Track
them as a group. Combined Google max: 200/day total across all three.

### Jitter

Every delay gets ±500ms random jitter (±200ms for APIs). This prevents
machine-detectable periodic patterns.

### User Agent Pool

20+ real, current browser user agents. Rotate randomly per request. Include
Chrome, Firefox, Safari, Edge on Windows and macOS. Update quarterly.

**Implementation:** `utils/userAgents.ts`

### Request Headers (Scraped Engines)

Every request includes:
- Randomized `User-Agent` from pool
- `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`
- `Accept-Language: en-US,en;q=0.9` (with occasional variation)
- `Accept-Encoding: gzip, deflate, br`
- `Connection: keep-alive`
- `Cache-Control: no-cache`
- Cookie jar maintained per engine session

### CAPTCHA Detection (Google)

Check response body for: "unusual traffic", "captcha", "Our systems have
detected", "sorry/index". On detection:

1. Log event with timestamp
2. Set engine status to "blocked"
3. Pause all requests to that engine for `pauseOnCaptchaHours`
4. Emit event so ScanOrchestrator skips remaining tasks for that engine

### Token Bucket Rate Limiter

Custom implementation tracking per-engine request counts:
- Hourly bucket (refills every hour)
- Daily bucket (refills at midnight UTC)
- Before every request: check both buckets, wait if exhausted
- On error: multiply delay by `backoffOnError` multiplier

**Implementation:** `services/scanner/ScanQueue.ts` (internal),
`middleware/rateLimiter.ts` (API-level)

---

## 10. Seed Data

### Service Areas (South Florida)

| Name | State | Center Lat | Center Lng | Radius |
|------|-------|-----------|-----------|--------|
| Delray Beach | FL | 26.4615 | -80.0728 | 3 mi |
| Boca Raton | FL | 26.3683 | -80.1289 | 3 mi |
| Boynton Beach | FL | 26.5254 | -80.0662 | 3 mi |

### Categories & Keywords

| Category | Parent | Keywords |
|----------|--------|----------|
| IT Consulting | — | "IT consulting", "tech consulting near me", "computer consulting", "IT support small business", "technology consultant" |
| Web Development | — | "web developer near me", "website development", "custom software development", "web design", "app development near me" |
| SEO Services | — | "SEO services near me", "SEO company", "local SEO", "search engine optimization", "SEO agency" |
| Computer Repair | — | "computer repair near me", "laptop repair", "PC repair", "computer fix near me", "tech repair" |
| Managed IT Services | — | "managed IT services", "managed service provider", "IT managed services near me", "MSP near me" |
| Restaurants | — | "restaurants near me", "best restaurants", "food near me", "dinner near me", "lunch spots" |
| Pizza | Restaurants | "pizza near me", "best pizza", "pizza delivery", "pizzeria near me" |
| Mexican Restaurants | Restaurants | "mexican food near me", "mexican restaurant", "tacos near me", "best mexican food" |
| Italian Restaurants | Restaurants | "italian restaurant near me", "italian food", "pasta near me", "best italian restaurant" |
| Fast Food | Restaurants | "fast food near me", "drive through near me", "quick food", "cheap eats near me" |
| Coffee Shops | Restaurants | "coffee near me", "coffee shop", "cafe near me", "best coffee" |
| Bars & Nightlife | Restaurants | "bars near me", "happy hour near me", "sports bar", "cocktail bar near me" |

**Note:** Restaurant categories exist to support GetOrderStack marketing. The
business database of restaurants across Palm Beach County becomes the
prospecting list for GetOrderStack sales outreach.

---

## 11. Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Bing Search API (Free tier: 1,000/month)
BING_SEARCH_API_KEY=

# Google Places API (Free $200/month credit)
GOOGLE_PLACES_API_KEY=

# Optional: Bing Maps API
BING_MAPS_API_KEY=

# Server
PORT=5004
NODE_ENV=development
LOG_LEVEL=info

# Scan Defaults
DEFAULT_GRID_SIZE=7
MAX_CONCURRENT_ENGINES=3
STORE_RAW_HTML=false
```

---

## 12. Implementation Phases

### Phase 1: Foundation

**Goal:** Working Express server with database, seed data, grid generator,
and one legitimate API integration (Bing). Prove the architecture end-to-end.

| Step | Task | Files |
|------|------|-------|
| 1.1 | Project scaffold: package.json, tsconfig.json, eslint.config.mjs, .gitignore, .env.example | Root config files |
| 1.2 | Express app entry point with Winston logger, error handler, health check | `src/index.ts`, `src/config/logger.ts`, `src/config/environment.ts`, `src/middleware/errorHandler.ts`, `src/routes/health.routes.ts`, `src/utils/response.ts`, `src/utils/errors.ts` |
| 1.3 | Prisma schema + initial migration | `prisma/schema.prisma` |
| 1.4 | Database client singleton | `src/config/database.ts` |
| 1.5 | Seed script (service areas, categories, keywords) | `prisma/seed.ts`, `src/config/serviceAreas.ts`, `src/config/categories.ts` |
| 1.6 | Grid coordinate generator with Haversine math | `src/services/grid/gridGenerator.ts`, `src/utils/geo.ts` |
| 1.7 | Type definitions | `src/types/engine.types.ts`, `src/types/business.types.ts`, `src/types/scan.types.ts`, `src/types/analytics.types.ts` |
| 1.8 | Utility modules: delay, retry, phone normalization, text normalization | `src/utils/delay.ts`, `src/utils/retry.ts`, `src/utils/phone.ts`, `src/utils/text.ts` |
| 1.9 | BaseEngine abstract class | `src/services/engines/BaseEngine.ts` |
| 1.10 | User agent rotation pool | `src/utils/userAgents.ts` |
| 1.11 | Engine throttle configuration | `src/config/engines.ts` |
| 1.12 | Bing Search API engine + parser | `src/services/engines/BingSearchEngine.ts`, `src/services/parsers/BingSearchParser.ts` |
| 1.13 | Business entity creation + basic deduplication (exact match) | `src/services/business/BusinessMatcher.ts` |
| 1.14 | Basic ScanOrchestrator (single engine, single area) | `src/services/scanner/ScanOrchestrator.ts`, `src/services/scanner/ScanQueue.ts` |
| 1.15 | Scan routes: POST create, GET list, GET detail, GET results | `src/routes/scan.routes.ts` |
| 1.16 | Business routes: GET list, GET detail, PUT update | `src/routes/business.routes.ts` |
| 1.17 | Category + service area routes | `src/routes/category.routes.ts` |
| 1.18 | System routes: engine-status, scan-queue, stats | `src/routes/system.routes.ts` |
| 1.19 | Request validation middleware (Zod) | `src/middleware/validator.ts` |
| 1.20 | API rate limiter middleware | `src/middleware/rateLimiter.ts` |

**Deliverable:** Can create a scan via API, execute it against Bing, store
businesses in the database, query results. Health check working. Ready for
ControllerBackend routing.

### Phase 2: Multi-Engine Scraping

**Goal:** Add all scraping engines with full anti-detection. Multi-engine
scan orchestration working.

| Step | Task | Files |
|------|------|-------|
| 2.1 | UULE encoding utility | `src/utils/uule.ts` |
| 2.2 | Google Search engine + parser (organic + local pack + knowledge panel + PAA + related + ads) | `src/services/engines/GoogleSearchEngine.ts`, `src/services/parsers/GoogleSearchParser.ts` |
| 2.3 | Google Maps engine + parser | `src/services/engines/GoogleMapsEngine.ts`, `src/services/parsers/GoogleMapsParser.ts` |
| 2.4 | Google Local Finder engine + parser | `src/services/engines/GoogleLocalEngine.ts`, `src/services/parsers/GoogleLocalParser.ts` |
| 2.5 | Bing Local / Places scraping engine + parser | `src/services/engines/BingLocalEngine.ts`, `src/services/parsers/BingLocalParser.ts` |
| 2.6 | DuckDuckGo engine + parser | `src/services/engines/DuckDuckGoEngine.ts`, `src/services/parsers/DuckDuckGoParser.ts` |
| 2.7 | CAPTCHA detection + engine pause system | Update all Google engines, `ScanQueue.ts` |
| 2.8 | Multi-engine ScanOrchestrator: parallel engines, per-engine queues, progress tracking | Update `ScanOrchestrator.ts`, `ScanQueue.ts` |
| 2.9 | Business entity resolution: fuzzy name matching (Levenshtein), phone match, domain match | Update `BusinessMatcher.ts` |
| 2.10 | Full scan endpoint (POST /api/scans/full) | Update `scan.routes.ts` |

**Deliverable:** Full multi-engine scans working. Businesses discovered across
all engines and deduplicated into single entities.

### Phase 3: Enrichment & Intelligence

**Goal:** Google Places API enrichment, review tracking, competitive signals,
rank trend analytics.

| Step | Task | Files |
|------|------|-------|
| 3.1 | Google Places API integration | `src/services/engines/GooglePlacesAPI.ts` |
| 3.2 | Business enrichment orchestrator (priority queue, budget tracking) | `src/services/business/BusinessEnricher.ts` |
| 3.3 | Enrichment trigger endpoint (POST /api/businesses/:id/enrich) | Update `business.routes.ts` |
| 3.4 | Review snapshot capture (on every scan, store rating + count per source) | Update `ScanOrchestrator.ts` |
| 3.5 | Competitive signal computation (review velocity, ranking momentum) | `src/services/business/BusinessScorer.ts` |
| 3.6 | Rank trend analytics endpoint | `src/services/analytics/RankAnalytics.ts`, `src/routes/analytics.routes.ts` |
| 3.7 | Geographic heatmap data endpoint | Update `analytics.routes.ts` |
| 3.8 | Cross-engine comparison endpoint | Update `analytics.routes.ts` |
| 3.9 | Business rank history endpoint (GET /api/businesses/:id/rankings) | Update `business.routes.ts` |
| 3.10 | Business review history endpoint (GET /api/businesses/:id/reviews) | Update `business.routes.ts` |

**Deliverable:** Businesses enriched with Places API data. Review tracking
over time. Rank trends and heatmaps available via API.

### Phase 4: Advanced Analytics & Scheduling

**Goal:** Gap analysis, competitor profiling, market overview, scheduled scans,
full-text search.

| Step | Task | Files |
|------|------|-------|
| 4.1 | Geographic gap analysis | `src/services/analytics/GapAnalyzer.ts` |
| 4.2 | Keyword gap analysis | Update `GapAnalyzer.ts` |
| 4.3 | Competitor profiling & intel | `src/services/analytics/CompetitorIntel.ts` |
| 4.4 | Market overview per category/area | Update `analytics.routes.ts` |
| 4.5 | Gap analysis endpoint | Update `analytics.routes.ts` |
| 4.6 | Competitor comparison endpoint | Update `analytics.routes.ts` |
| 4.7 | Business full-text search (GET /api/businesses/search) | Update `business.routes.ts` |
| 4.8 | Business competitors list (GET /api/businesses/competitors) | Update `business.routes.ts` |
| 4.9 | Business own list (GET /api/businesses/mine) | Update `business.routes.ts` |
| 4.10 | Scan scheduling with node-cron | `src/services/scanner/ScanScheduler.ts` |
| 4.11 | Schedule CRUD routes | `src/routes/schedule.routes.ts` |

**Deliverable:** Full analytics suite. Scheduled recurring scans. Complete
REST API ready for Angular frontend consumption.

---

## 13. Critical Implementation Notes

1. **Respect rate limits absolutely.** Getting blocked by Google wastes far
   more time than being patient. The throttle configs are conservative on
   purpose.

2. **Business entity is king.** Every parser must normalize results into a
   common business format before storage. Never store raw engine-specific data
   without normalization.

3. **Deduplication runs on every insert.** Before creating a new business,
   always check for existing matches. The matcher must be fast (indexed
   queries), not naive (full table scan).

4. **Store scan metadata even on failure.** Failed scans with error messages
   are valuable for debugging throttle limits.

5. **All Google engines share a reputation.** `google_search`,
   `google_maps`, and `google_local` all hit google.com. Their daily limits
   are **SHARED**, not independent. Track them as a group.

6. **Bing API is your workhorse.** Legitimate, fast, structured JSON, free.
   Lean on it heavily. Scraping is supplementary.

7. **Restaurant categories support GetOrderStack marketing.** The business
   database of restaurants across Palm Beach County becomes the prospecting
   list for GetOrderStack sales outreach.

8. **Design for the API consumer from day one.** Every endpoint returns
   clean, paginated JSON that an Angular frontend can consume directly.
   Include total counts, page info, and filter metadata in responses.

9. **Git discipline.** Commit after each working feature. Meaningful messages.
   Never commit API keys.

10. **Match existing codebase patterns.** Same logger, same error handling,
    same response format, same health check pattern as the other backends in
    the GeekQuoteAI microservices architecture.

---

## 14. Integration with Existing Architecture

### ControllerBackend Gateway Route

Add to ControllerBackend (Port 4000):

```typescript
// Route: /api/rank-radar -> Geek-Rank-Radar-Backend (Port 5004)
app.use('/api/rank-radar', createProxyMiddleware({
  target: 'http://localhost:5004',
  pathRewrite: { '^/api/rank-radar': '/api' },
}));
```

### Supabase Project

Create a **new** Supabase project for Rank Radar (separate from the existing
`yeeguhmyukjkmpnodvqm` project used by GeekQuote backends). The 500MB free
tier is sufficient for the business database.

### Deployment (Render.com)

Deploy as a new Render Web Service:
- **Name:** geek-rank-radar-backend
- **Build command:** `npm install && npx prisma generate && npm run build`
- **Start command:** `npm start`
- **Environment:** Node 20+
- **Port:** 5004

### Shared Patterns to Match

| Pattern | Reference |
|---------|-----------|
| Winston logger | `geek-at-your-spot-backend-workspace` shared logger |
| Error handling | Centralized `errorHandler.ts` middleware |
| Response format | `{ success, data, error?, pagination? }` |
| Health check | `GET /health` → `{ status: "ok", timestamp, service: "rank-radar" }` |
| Zod env validation | `config/environment.ts` with `z.object()` |
| Prisma singleton | `config/database.ts` with connection pooling |
| ESLint flat config | `eslint.config.mjs` at workspace root |

---

*Last Updated: 2026-02-19*
