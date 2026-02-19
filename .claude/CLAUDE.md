
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.
- Do not write arrow functions in templates (they are not supported).

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

---

# RankPilot — AI SEO Auditor + Content Optimizer

## Project Overview

SaaS product that crawls websites, scores SEO per-page (0-100), generates AI-written fixes via Claude API, and produces PDF reports. Built as Angular Elements on WordPress + Express backend.

## Workspace Structure

```
RankPilot-Workspace/
  projects/
    rankpilot-library/        # Angular library — components, services, models
      src/
        public-api.ts         # Library entry point
        lib/
          models/             # TypeScript interfaces
          services/           # API service
          components/         # UI components
    rankpilot-elements/       # Angular Elements app — registers custom elements
      src/main.ts             # Registers <rankpilot-dashboard>, <rankpilot-page-detail>
    rankpilot-backend/        # Express + TypeScript backend
      prisma/schema.prisma    # Database schema
      src/
        server.ts             # Express entry point (port 3100)
        config/               # Environment, logger, database
        crawler/              # Playwright crawler engine
        analysis/             # SEO scorer + AI fix generator
        reports/              # PDF report generator
        routes/               # API route handlers
        middleware/            # Error handler
        utils/                # Error helpers, response helpers
```

## Component Inventory

| Custom Element Tag | Component | Directory |
|---|---|---|
| `<rankpilot-dashboard>` | `SiteDashboardComponent` | `rankpilot-library/src/lib/components/site-dashboard/` |
| `<rankpilot-page-detail>` | `PageDetailComponent` | `rankpilot-library/src/lib/components/page-detail/` |
| (internal) | `ScoreGaugeComponent` | `rankpilot-library/src/lib/components/score-gauge/` |
| (internal) | `PageListComponent` | `rankpilot-library/src/lib/components/page-list/` |
| (internal) | `CrawlProgressComponent` | `rankpilot-library/src/lib/components/crawl-progress/` |
| (internal) | `FixQueueComponent` | `rankpilot-library/src/lib/components/fix-queue/` |
| (internal) | `AnalyticsComparisonComponent` | `rankpilot-library/src/lib/components/analytics-comparison/` |

## Service Inventory

| Service | Location | Purpose |
|---|---|---|
| `RankPilotApiService` | `rankpilot-library/src/lib/services/` | HTTP client for all backend endpoints |
| `CrawlerService` | `rankpilot-backend/src/crawler/` | Playwright headless browser crawler |
| `ScoringService` | `rankpilot-backend/src/analysis/` | Per-page SEO scoring (0-100) |
| `FixGeneratorService` | `rankpilot-backend/src/analysis/` | AI fix generation via Claude API |
| `CrawlOrchestrator` | `rankpilot-backend/src/crawler/` | Coordinates crawl → score → fix pipeline |
| `ReportService` | `rankpilot-backend/src/reports/` | PDF generation via Puppeteer |
| `AnalyticsParsingService` | `rankpilot-backend/src/analysis/` | GA4 CSV parsing with Zod validation |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/sites` | Register a new site |
| `GET` | `/api/sites` | List all sites |
| `GET` | `/api/sites/:id` | Get site details with recent crawls |
| `POST` | `/api/sites/:id/crawl` | Trigger a new crawl (async) |
| `GET` | `/api/crawls/:id` | Get crawl status and results |
| `GET` | `/api/crawls/:id/pages` | Get paginated page results |
| `GET` | `/api/crawls/:id/pages/:pageId` | Get single page detail with fixes |
| `GET` | `/api/crawls/:id/report` | Download PDF report |
| `POST` | `/api/sites/:siteId/analytics` | Upload GA4 CSV snapshot (BEFORE/AFTER) |
| `GET` | `/api/sites/:siteId/analytics` | List analytics snapshots for a site |
| `GET` | `/api/sites/:siteId/analytics/comparison` | Get before/after comparison diff |
| `DELETE` | `/api/sites/:siteId/analytics/:id` | Delete an analytics snapshot |

## Build Commands

```bash
# Library
ng build rankpilot-library

# Elements app (produces main.js + styles.css)
ng build rankpilot-elements

# Backend
cd projects/rankpilot-backend
npm run dev          # Development with hot reload
npm run build        # TypeScript compilation
npm run lint         # ESLint check
npx prisma generate  # Regenerate Prisma client
npx prisma migrate dev  # Run migrations
```

## Environment Variables (Backend)

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3100) |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `DIRECT_URL` | Direct connection (bypasses pooler) |
| `ANTHROPIC_API_KEY` | Claude API key for AI scoring/fixes |
| `CORS_ORIGIN` | Allowed origin (default: geekatyourspot.com) |
| `CRAWL_DEPTH_DEFAULT` | Default max pages per crawl (default: 50) |
| `CRAWL_CONCURRENCY` | Concurrent page crawls (default: 3) |

## Database Models (Prisma)

- **Site** — Registered websites to audit
- **Crawl** — Audit runs with status tracking (PENDING → RUNNING → COMPLETE/FAILED)
- **CrawlPage** — Per-page results with SEO score, issues, and AI fixes
- **Alert** — Score drops, page errors, SSL warnings
- **Report** — Generated PDF report records

## Deployment

| Service | URL | Platform |
|---|---|---|
| Backend API | `https://rankpilot-backend.onrender.com` | Render (auto-deploy from GitHub `main`) |
| Frontend | `geekatyourspot.com/rankpilot/` | WordPress (Angular Elements via FTP) |
| Database | Supabase PostgreSQL (`nvcfdbhmsdansrsxhwwv`) | Supabase (us-west-2) |
| GitHub | `github.com/jmartinemployment/rankpilot` | GitHub |

### Render Service Details

- **Service ID:** `srv-d69l4t75r7bs73fajaf0`
- **Build command:** `cd projects/rankpilot-backend && npm install && npx prisma generate && npm run build`
- **Start command:** `cd projects/rankpilot-backend && node dist/server.js`
- **Outbound IP:** `74.220.50.254`
- **Env vars:** DATABASE_URL (pooler, us-west-2), DIRECT_URL, ANTHROPIC_API_KEY, CORS_ORIGIN, PLAYWRIGHT_BROWSERS_PATH

### Supabase Connection Strings

- **Pooler (for Render/production):** `postgresql://postgres.nvcfdbhmsdansrsxhwwv:PASSWORD@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
- **Direct (for local dev/migrations):** `postgresql://postgres:PASSWORD@db.nvcfdbhmsdansrsxhwwv.supabase.co:5432/postgres`
- Region must be `us-west-2` for pooler (other regions return "Tenant or user not found")

### WordPress Integration

- Page slug: `rankpilot` (template: "RankPilot SEO Dashboard")
- PHP template: `page-rankpilot.php`
- JS/CSS loaded via `wp_enqueue_script_module()` / `wp_enqueue_style()` in `functions.php`
- Assets path: `assets/geek-elements/rankpilot/` (main.js + styles.css)
- FTP upload via curl with `--ssl-reqd --insecure` (SiteGround cert mismatch)

### SiteGround Bot Protection

- SiteGround's AI Anti-Bot WAF blocks data center IPs by default
- Render's outbound IP (`74.220.50.254`) was whitelisted by SiteGround support (Velina Hristova, Feb 16 2026)
- Contact SiteGround support via Help Desk > Other > AI Crawlers Setup if IP changes
- `robots.txt` was changed from `Disallow: /` to `Allow: /` (was blocking all bots including Google)

## Key Decisions

- **Playwright over HTTP fetch for crawling:** Needed for JS-rendered pages and accurate DOM analysis
- **`channel: 'chromium'` launch:** Uses full Chrome binary in headless mode (harder for bot detection than headless shell)
- **CAPTCHA detection:** Crawler detects `sgcaptcha`/`captcha`/`challenge` in URLs and skips those pages
- **`navigator.webdriver` override:** Removes headless detection signal via `addInitScript()`
- **Build deps in `dependencies`:** typescript, @types/*, prisma moved from devDependencies because Render's production `npm install` skips devDependencies
- **`postinstall` script:** Runs `npx playwright install chromium` to download browser binary on Render
- **`PLAYWRIGHT_BROWSERS_PATH` env var:** Set to project directory so browser persists from build to runtime on Render

## Known Issues

- Render free tier has limited memory — crawls of large sites (50+ pages) take 5-10 minutes
- PDF report generation via Puppeteer may OOM on free tier for very large reports
- SiteGround IP whitelist may need updating if Render's outbound IP changes

## Session Notes

**February 16, 2026 (Session 1):**
- Phase 1 MVP implementation complete
- Created: Backend scaffold (Express + TypeScript + Prisma + ESLint)
- Created: Prisma schema with 5 models (Site, Crawl, CrawlPage, Alert, Report)
- Created: Crawler engine (Playwright headless, page extraction, technical checks)
- Created: AI Scoring Service (per-page 0-100 score across 8 categories)
- Created: Fix Generator Service (Claude API for AI-written SEO fixes)
- Created: API routes (sites, crawls, pages, reports)
- Created: PDF Report Service (Puppeteer-based)
- Created: Angular library with 6 components + API service
- Created: Angular Elements app registering `<rankpilot-dashboard>` and `<rankpilot-page-detail>`
- Fixed: tsconfig paths pointing to library source (not dist)
- Fixed: outputHashing set to "none" for predictable filenames
- Both library and elements app build successfully
- Backend compiles with zero TypeScript errors

**February 16, 2026 (Session 2):**
- Full production deployment completed
- Deployed backend to Render.com (auto-deploy from GitHub main)
- Deployed Angular Elements bundle to WordPress via FTPS
- Created WordPress page template and updated functions.php
- Fixed: Render build failure (moved build deps from devDependencies to dependencies)
- Fixed: Supabase pooler region (us-west-2, not us-east-1)
- Fixed: Playwright browser install on Render (postinstall script + PLAYWRIGHT_BROWSERS_PATH)
- Fixed: SiteGround bot protection blocking Render IP (whitelisted by SiteGround support)
- Fixed: robots.txt was `Disallow: /` blocking all bots — changed to `Allow: /`
- Added: Setup view for dashboard (URL input form for creating sites without pre-existing siteId)
- Added: CAPTCHA detection in crawler (skips bot challenge pages)
- Added: Chrome stealth measures (realistic UA, webdriver override, AutomationControlled disabled)
- Added: Debug fetch-test endpoint for diagnosing connectivity issues
- Successful end-to-end crawl of geekatyourspot.com: 52 pages, score 88/100, 0 errors
- Next: Remove debug endpoint, improve dashboard UX, add loading states, mobile responsive testing

**February 17, 2026 (Session 3):**
- Fixed: Supabase database password rotation broke connectivity
- Fixed: Supabase Network Ban — Render's IPv6 was auto-banned due to failed auth attempts from old password
- Root cause chain: password change → auth failures → Supabase auto-banned Render IP → "Can't reach database server"
- Fixed: `loadSite()` bug — was using `this.siteId()` (empty string from input) instead of `this.site()?.id` after setup flow, causing "No audits yet" after crawl completed
- Fixed: `onCrawlComplete()` — now loads data before switching view to prevent empty state flash
- Fixed: Footer jump — added `min-height: calc(100vh - 10rem)` to `.dashboard`
- Improved: CrawlOrchestrator now updates `pageCount` incrementally after each page is analyzed (was only set on completion)
- Redesigned: CrawlProgressComponent with two-phase display (Discovering pages → Scoring & AI fixes), live counters, elapsed timer, determinate progress bar
- Added: MCP servers to `.mcp.json` — Supabase (project-level, ref `nvcfdbhmsdansrsxhwwv`), Sequential Thinking, Filesystem
- Decision: Supabase MCP configured per-project (not global) since each project has different project-ref
- Known issue: Render free tier OOM on large crawls — user experienced memory restart
- Known issue: Anthropic API credit balance depleted — AI fix generation returns 400 errors (fixes array will be empty)
- Files changed: `CrawlOrchestrator.ts`, `crawl-progress.component.ts`, `site-dashboard.component.ts`, `.mcp.json`
- Next: Review crawl results display after fresh audit, mobile responsive testing, clean up duplicate test sites in DB, remove debug fetch-test endpoint, address Anthropic API credits for fix generation

**February 17, 2026 (Session 4):**
- Feature: GA4 Analytics CSV Upload & Before/After Comparison
- Created: `AnalyticsSnapshot` Prisma model with `SnapshotLabel` enum (BEFORE/AFTER), migration applied to Supabase
- Created: `AnalyticsParsingService` — parses GA4 CSV exports (skips `#` comment headers, maps GA4 column names, Zod validation)
- Created: Analytics API routes (POST upload, GET list, GET comparison, DELETE) at `/api/sites/:siteId/analytics`
- Created: `AnalyticsComparisonComponent` — collapsible section with CSV upload zones, snapshot badges, before/after comparison table
- Added: `multer` (file upload), `csv-parse` (CSV parser), `@types/multer` to backend dependencies
- Added: 4 analytics methods to `RankPilotApiService` (uploadAnalytics, getAnalyticsSnapshots, getAnalyticsComparison, deleteAnalyticsSnapshot)
- Added: `AnalyticsRow`, `AnalyticsSnapshot`, `AnalyticsComparisonRow`, `AnalyticsComparison` interfaces to site.model.ts
- Integrated: `<rp-analytics-comparison>` into dashboard overview below page list (only visible when expanded)
- Exported: `AnalyticsComparisonComponent` from public-api.ts
- Fixed: Express 5 `req.params` type (`string | string[]`) — cast to `string` for Prisma compatibility
- Fixed: Prisma JSON field type — used `JSON.parse(JSON.stringify())` for rows insertion
- All builds pass: backend `tsc`, `ng build rankpilot-library`, `ng build rankpilot-elements`
- Files changed: `schema.prisma`, `server.ts`, `package.json`, `site.model.ts`, `rankpilot-api.service.ts`, `site-dashboard.component.ts`, `public-api.ts`
- Files created: `AnalyticsParsingService.ts`, `analytics.ts` (routes), `analytics-comparison.component.ts`
- Fixed: NG0600 crash in FixQueueComponent — was writing to signal inside `computed()`, replaced with `linkedSignal`
- Fixed: Layout shift when starting scan — added `min-height: 280px` to crawl-progress card, used `visibility: hidden` on Run button during crawl
- Deployed: Updated `main.js` to WordPress via FTPS (NG0600 fix + layout shift fix + analytics UI)
- Issue: 3 duplicate sites created in DB (setup view has no dedup) — all triggered concurrent crawls, SiteGround rate-limited/timed out
- Issue: Anthropic API credits still depleted — fix generation returns 400 errors
- NOT deployed: Backend analytics code (not committed/pushed to GitHub, Render still running old code)
- Next: Clean up duplicate sites in DB, add site URL dedup check, commit+push all changes for Render deploy, replenish Anthropic API credits, mobile responsive testing

**February 18, 2026 (Session 5):**
- Cleaned up: 19 duplicate sites + 1 test site from DB, kept `cmlr6mku6002zah1el7k61ftn`
- Added: URL dedup check in POST /api/sites (normalize URL, case-insensitive findFirst, return existing)
- Fixed: Express route ordering — analytics routes mounted BEFORE sites routes (was causing 404 on `/api/sites/:siteId/analytics`)
- Disabled: AI fix generation (Anthropic API credits depleted) — commented out `fixGenerator.generateFixes()`, made ANTHROPIC_API_KEY optional, set fixes to empty array
- Fixed: Dashboard auto-loads first site when no `siteId` attribute (added `loadFirstSite()`)
- Removed: FixQueue sidebar from dashboard — issues now shown inline under each page row
- Redesigned: PageListComponent — issues displayed directly beneath each page row (severity dots + messages, always visible, no arrows/expand/collapse)
- Added: EXCLUDED_PATTERNS to CrawlerService — skips `/category/`, `/tag/`, `?cat=`, `/page/N`, `/author/`, `/feed/`, `/wp-json/` URLs
- Fixed: Accidentally deleted `function geek_theme_setup()` from functions.php causing 500 — restored
- Deleted: Bad crawl data (`cmlry8nu00001a61ehwu4f6hf`) that scored 68 during the 500 outage
- Fixed: Unused `toErrorMessage` import in ReportService.ts (lint fix)
- Bumped: functions.php version to `0.7.0` for cache busting
- Committed: 4 commits pushed to GitHub, Render auto-deployed all backend changes
- Commits: `38c7cf8` (analytics+dedup+bugfixes), `c6bf417` (route ordering), `350f55c` (auto-load first site), `b39deeb` (issues sidebar refactor), `6e80115` (category exclusion)
- Files changed: `sites.ts`, `server.ts`, `CrawlOrchestrator.ts`, `environment.ts`, `CrawlerService.ts`, `site-dashboard.component.ts`, `page-list.component.ts`, `fix-queue.component.ts`, `ReportService.ts`, `functions.php`
- Dashboard verified working: score 88, Run SEO Audit button, inline issues, pagination, analytics comparison section
- SiteGround cache: Persistent issue — FTP uploads succeed but SiteGround serves cached HTML/JS. Must purge from wp-admin > SG Optimizer.
- Current crawl data still shows category/tag pages from old crawl — need fresh crawl to get clean results
- Next: Run fresh crawl (will exclude category/tag/pagination URLs), mobile responsive testing, replenish Anthropic API credits to re-enable AI fix generation

---

# Geek-Rank-Radar — Local SEO Grid Rank Tracker

## Session Notes (Geek-Rank-Radar-Backend)

**February 19, 2026 (Session — Phase 2 Multi-Engine Scraping):**
- Phase 2 implementation complete: 5 new scraping engines + multi-engine orchestration
- Created: `GoogleSearchEngine.ts` — Google Web Search with UULE location targeting, CAPTCHA detection
- Created: `GoogleSearchParser.ts` — Cheerio parser for Google SERP (local pack 3-pack, organic results, People Also Ask, related searches)
- Created: `GoogleMapsEngine.ts` — Google Maps scraper at lat/lng coordinates with zoom level 13
- Created: `GoogleMapsParser.ts` — Extracts businesses from Maps embedded JSON arrays (APP_INITIALIZATION_STATE patterns)
- Created: `GoogleLocalEngine.ts` — Google Local Finder (`tbm=lcl`) for expanded 20+ local results per page
- Created: `GoogleLocalParser.ts` — Cheerio parser for local finder HTML
- Created: `BingLocalEngine.ts` — Bing Maps HTML scraper (no API key needed, unlike bing_api)
- Created: `BingLocalParser.ts` — Cheerio parser for Bing Maps + JSON-LD fallback extraction
- Created: `DuckDuckGoEngine.ts` — DDG HTML-only version scraper (minimal bot detection)
- Created: `DuckDuckGoParser.ts` — Parses DDG organic results, extracts businesses from snippets with phone numbers
- Modified: `BusinessMatcher.ts` — Added Level 3.5 fuzzy name + phone matching (Levenshtein distance ≤ 3 + matching phone = 85% confidence). Uses existing `levenshteinDistance()` from `text.ts` and existing `fuzzy_name_phone` MatchType.
- Modified: `ScanOrchestrator.ts` — Registers all 6 engines (BingSearch, GoogleSearch, GoogleMaps, GoogleLocal, BingLocal, DuckDuckGo) each wrapped in try/catch. Added `createFullScan()` method that creates scans for every (serviceArea × keyword × engine) combination. Added `getGoogleDailyTotal()` helper summing requestsToday across 3 Google engines.
- Modified: `ScanQueue.ts` — Added `setGoogleLimitChecker()` callback, `isGoogleEngine()` helper, checks combined Google daily limit (GOOGLE_COMBINED_DAILY_LIMIT = 200) before dequeuing any Google engine task.
- Modified: `scan.routes.ts` — Added `POST /api/scans/full` endpoint with `fullScanSchema` Zod validation (optional serviceAreaIds, categoryIds, engineIds, gridSize arrays).
- Build: `npm run build` — zero TypeScript errors
- Lint: `npm run lint` — zero ESLint errors
- Fixed: Removed unused `dataPatterns` variable in GoogleMapsParser (lint error)
- Fixed: Removed unused `GOOGLE_COMBINED_DAILY_LIMIT` import in ScanOrchestrator (import only needed in ScanQueue)
- All 6 engines extend `BaseEngine` which provides: throttling, user agent rotation, delay, CAPTCHA detection, request counting, block management
- Engine configs already defined in `config/engines.ts` with per-engine throttle settings (Google engines: 8-18s delay, 40/hr, 200/day, 24hr captcha pause)
- Files created: 10 new files (5 engines + 5 parsers)
- Files modified: 4 files (BusinessMatcher, ScanOrchestrator, ScanQueue, scan.routes)
- Next: Integration testing (start dev server, call POST /api/scans with each engine), full scan test, CAPTCHA handling verification, frontend components for Geek-Rank-Radar

**February 19, 2026 (Session — Phase 3 Parser Calibration, Queue Fix & Stealth):**
- Phase 3 implementation complete: parser calibration, queue concurrency fix, stealth features
- **Queue Fix (Step 5):**
  - Rewrote `ScanQueue.ts` — replaced single `processing: boolean` with `processingEngines: Set<string>`
  - `enqueueBatch()` now calls `ensureProcessing()` which auto-starts per-engine processing
  - Multiple concurrent scans now process correctly (each engine runs independently)
  - Added `getProcessingEngines()` for monitoring which engines are active
  - Rewrote `ScanOrchestrator.ts` — replaced `await queue.processAll()` with poll-based `monitorScan()`
  - `monitorScan()` polls every 5s with 30-min timeout, checks `pointsCompleted === pointsTotal`
  - Failed task points now increment `pointsCompleted` too (prevents scans from never completing)
- **Parser Calibration (Steps 1-4):**
  - Created `scripts/fetch-samples.ts` — fetches real Google HTML for selector development
  - Fetched 3 samples: google-search.html (bot challenge page!), google-maps.html (SPA shell), google-local.html (20 real results)
  - Finding: `google-search.html` was a bot challenge page — Google blocked the HTTP request
  - Finding: `google-maps.html` is a JS SPA shell — no business data in HTML, requires Playwright
  - Finding: `google-local.html` has 20 real pizza businesses near Delray Beach — calibrated selectors from this
  - Calibrated `GoogleLocalParser.ts` — primary selector `div.VkpGBb`, name from `.dbg0pd .OSrXXb`, rating/reviews from `span.Y0A0hc[aria-label]` (handles K/M suffixes), address from 3rd child div, category extraction from middot-separated rating line, regex fallback
  - Calibrated `GoogleSearchParser.ts` — aligned local pack selectors with GoogleLocalParser patterns, added `parseRatingAriaLabel()`, `parseCompactNumber()`, `extractCategory()`, regex fallback for when Cheerio fails
  - Calibrated `GoogleMapsParser.ts` — documented SPA limitation, 4-strategy extraction: JSON arrays, ld+json, proto arrays, text patterns. Maps engine needs Playwright for reliable results.
  - Added `parserVersion` field to `SERPMetadata` type and all parsers (version `2026-02-19`)
- **Stealth Features (Steps 6-9):**
  - Created `src/utils/proxy.ts` — `ProxyRotator` class with round-robin rotation, 30-min failure cooldown, loads from `PROXY_LIST` or `PROXY_FILE` env vars
  - Created `src/utils/cookies.ts` — `CookieJar` class for per-engine session cookie persistence, auto-expiry
  - Rewrote `src/utils/userAgents.ts` — 9 consistent browser profiles (UA + Client Hints match), session rotation after 20 requests, `buildStealthHeaders()` with engine-specific Referer
  - Rewrote `BaseEngine.ts` — exponential backoff (`2^errorCount`, capped at 5 min), graduated CAPTCHA response (15min → 2hr → 24hr), ±30% timing variation, cookie jar per engine, proxy config pass-through, profile rotation on CAPTCHA
  - Updated all 5 scraping engines (GoogleSearch, GoogleMaps, GoogleLocal, BingLocal, DuckDuckGo) to pass domain for cookies and proxy config
  - Added `PROXY_LIST` and `PROXY_FILE` optional env vars to `environment.ts`
- Added `scripts/samples/` to `.gitignore`
- Build: `npm run build` — zero TypeScript errors
- Lint: `npm run lint` — zero ESLint errors
- Files created: `scripts/fetch-samples.ts`, `src/utils/proxy.ts`, `src/utils/cookies.ts`
- Files modified: `ScanQueue.ts`, `ScanOrchestrator.ts`, `BaseEngine.ts`, `userAgents.ts`, `environment.ts`, `GoogleSearchParser.ts`, `GoogleMapsParser.ts`, `GoogleLocalParser.ts`, `GoogleSearchEngine.ts`, `GoogleMapsEngine.ts`, `GoogleLocalEngine.ts`, `BingLocalEngine.ts`, `DuckDuckGoEngine.ts`, `engine.types.ts`, `.gitignore`
- Known limitation: Google Maps scraping via HTTP returns SPA shell — needs Playwright for full results
- Known limitation: Google Search sometimes returns bot challenge page to HTTP requests
- Next: Integration test (POST /api/scans with google_local engine — most likely to return results), consider Playwright-based GoogleMapsEngine, frontend components
