import { AlertTriangle, ArrowDown, ExternalLink, Filter, RefreshCw, Search, ShieldCheck, Terminal, Cpu, HardDrive, Compass, Settings, Tag, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  getHealth,
  getLatestScan,
  getOpportunities,
  getOpportunityDetail,
  triggerScan,
  getLogs,
  searchWireActions,
  type Health,
  type Opportunity,
  type ScanRun,
  type DiscoveredAction
} from "./api";

type SortKey = "roiPercent" | "netProfit" | "confidence" | "askPrice";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  targetBuy: number;
  resellValue: number;
  expectedRoi: number;
  image: string;
  actionId: string;
  searchParams: Record<string, unknown>;
  description: string;
}

const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "rtx-4070",
    name: "NVIDIA GeForce RTX 4070 FE",
    category: "Graphics Cards",
    targetBuy: 420,
    resellValue: 560,
    expectedRoi: 20.5,
    image: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=300&q=80",
    actionId: "am_search_products",
    searchParams: { query: "rtx 4070 graphics card used", limit: 20 },
    description: "High demand Founders Edition GPU. Resells quickly. Stable margins."
  },
  {
    id: "sony-a7iii",
    name: "Sony Alpha a7 III Camera",
    category: "Cameras",
    targetBuy: 850,
    resellValue: 1150,
    expectedRoi: 33.5,
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=300&q=80",
    actionId: "am_search_products",
    searchParams: { query: "sony a7 iii body used", limit: 20 },
    description: "Stable camera body resell market. Shutter count affects final price."
  },
  {
    id: "canon-rf50",
    name: "Canon RF 50mm f/1.2 L USM",
    category: "Lenses",
    targetBuy: 1350,
    resellValue: 1750,
    expectedRoi: 26.6,
    image: "https://images.unsplash.com/photo-1617005082133-548c4dd27f35?auto=format&fit=crop&w=300&q=80",
    actionId: "am_search_products",
    searchParams: { query: "canon rf 50mm f1.2 used", limit: 20 },
    description: "Premium L-series prime lens. Excellent optics and high liquid demand."
  },
  {
    id: "ps5-slim",
    name: "PlayStation 5 Slim Console",
    category: "Gaming",
    targetBuy: 320,
    resellValue: 430,
    expectedRoi: 25.0,
    image: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=300&q=80",
    actionId: "am_search_products",
    searchParams: { query: "ps5 slim console used", limit: 20 },
    description: "Very high volume. Best resold locally to maximize net margins."
  },
  {
    id: "iphone-15-pro",
    name: "iPhone 15 Pro Max 256GB",
    category: "Smartphones",
    targetBuy: 700,
    resellValue: 950,
    expectedRoi: 22.0,
    image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=300&q=80",
    actionId: "am_search_products",
    searchParams: { query: "iphone 15 pro max used", limit: 20 },
    description: "Extremely liquid market. High transaction speed and price tracking."
  }
];

function matchesCatalogItem(item: Opportunity, catalogId: string): boolean {
  const title = item.title.toLowerCase();
  if (catalogId === "rtx-4070") return title.includes("4070");
  if (catalogId === "sony-a7iii") return title.includes("a7 iii") || title.includes("a7iii");
  if (catalogId === "canon-rf50") return title.includes("50mm") && (title.includes("rf") || title.includes("canon"));
  if (catalogId === "ps5-slim") return title.includes("ps5") || title.includes("playstation 5");
  if (catalogId === "iphone-15-pro") return title.includes("iphone 15");
  return false;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [latestScan, setLatestScan] = useState<ScanRun | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [rawDetail, setRawDetail] = useState<unknown>(null);
  const [sortKey, setSortKey] = useState<SortKey>("roiPercent");
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    minRoi: 10,
    minConfidence: 0.55,
    riskLevel: "",
    minPrice: "",
    maxPrice: "",
    source: ""
  });

  // Dynamic Scraper Discovery States
  const [actionQuery, setActionQuery] = useState("amazon");
  const [discoveredActions, setDiscoveredActions] = useState<DiscoveredAction[]>([]);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [searchParamsJson, setSearchParamsJson] = useState('{"query":"rtx 4070 graphics card used","limit":20}');
  const [activeProvider, setActiveProvider] = useState<string>("nvidia");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);

  // Live Console Logs & Stepper States
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLPreElement>(null);

  async function refreshData() {
    const [healthData, scanData, opportunityData] = await Promise.all([
      getHealth(),
      getLatestScan(),
      getOpportunities(filters)
    ]);
    setHealth(healthData);
    setLatestScan(scanData);
    setOpportunities(opportunityData);
  }

  useEffect(() => {
    refreshData().catch((err: Error) => setError(err.message));
  }, [filters]);

  useEffect(() => {
    if (!health?.scanIntervalSeconds) return;
    const timer = window.setInterval(() => {
      refreshData().catch((err: Error) => setError(err.message));
    }, health.scanIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [health?.scanIntervalSeconds, filters]);

  // Logs polling hook
  useEffect(() => {
    let interval: number | undefined;
    if (isScanning) {
      interval = window.setInterval(async () => {
        try {
          const res = await getLogs();
          setLogs(res.logs);
          if (logEndRef.current) {
            logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
          }
        } catch (e) {
          // ignore
        }
      }, 1000);
    } else {
      getLogs().then(res => setLogs(res.logs)).catch(() => {});
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [isScanning]);

  const activeStep = useMemo(() => {
    if (!isScanning) return 0;
    let step = 1;
    for (const log of logs) {
      if (log.includes("[WIRE SERVICE] Task Dispatched")) step = 1;
      if (log.includes("[APPRAISER] Split")) step = 2;
      if (log.includes("Dispatching batch") || log.includes("[DEEPSEEK]") || log.includes("[GEMINI]") || log.includes("[OPENROUTER]")) step = 3;
      if (log.includes("Lock Automatically Released")) step = 4;
    }
    return step;
  }, [logs, isScanning]);

  useEffect(() => {
    handleSearchActions();
  }, []);

  function useStaticFallbackActions() {
    const fallbacks: DiscoveredAction[] = [
      {
        action_id: "am_search_products",
        name: "Amazon Search Products",
        description: "Scrapes product titles, prices, and images from Amazon search results.",
        catalog_slug: "Amazon"
      },
      {
        action_id: "ebay_search_deals",
        name: "eBay Realtime Product Search",
        description: "Scrapes auctions, buy-it-now prices, and shipping fees from eBay.",
        catalog_slug: "eBay"
      },
      {
        action_id: "craigslist_crawler",
        name: "Craigslist Local Classifieds",
        description: "Crawls local Craigslist items for camera and GPU cash listings.",
        catalog_slug: "Craigslist"
      },
      {
        action_id: "walmart_scraper",
        name: "Walmart Marketplace Scraper",
        description: "Fetches price data and conditions from Walmart online catalog.",
        catalog_slug: "Walmart"
      }
    ];

    const filtered = fallbacks.filter(
      item =>
        item.name.toLowerCase().includes(actionQuery.toLowerCase()) ||
        item.catalog_slug?.toLowerCase().includes(actionQuery.toLowerCase()) ||
        item.action_id.toLowerCase().includes(actionQuery.toLowerCase())
    );

    const result = filtered.length > 0 ? filtered : fallbacks;
    setDiscoveredActions(result);
    
    // Automatically set selected action if not set
    if (result.length > 0 && (!selectedAction || !result.some(a => a.action_id === selectedAction))) {
      setSelectedAction(result[0].action_id);
    }
  }

  async function handleSearchActions() {
    try {
      const res = await searchWireActions(actionQuery);
      if (res && Array.isArray(res.data) && res.data.length > 0) {
        setDiscoveredActions(res.data);
        if (!selectedAction || !res.data.some(a => a.action_id === selectedAction)) {
          setSelectedAction(res.data[0].action_id);
        }
      } else {
        useStaticFallbackActions();
      }
    } catch (err) {
      useStaticFallbackActions();
    }
  }

  function handleSelectCatalogItem(item: CatalogItem) {
    if (selectedCatalogId === item.id) {
      setSelectedCatalogId(null);
    } else {
      setSelectedCatalogId(item.id);
      setSearchParamsJson(JSON.stringify(item.searchParams, null, 2));
      setSelectedAction(item.actionId);
    }
  }

  const catalogHits = useMemo(() => {
    const hits: Record<string, number> = {};
    for (const item of CATALOG_ITEMS) {
      hits[item.id] = opportunities.filter((op) => matchesCatalogItem(op, item.id)).length;
    }
    return hits;
  }, [opportunities]);

  const sortedOpportunities = useMemo(() => {
    return [...opportunities].sort((a, b) => b[sortKey] - a[sortKey] || b.netProfit - a.netProfit);
  }, [opportunities, sortKey]);

  const filteredOpportunities = useMemo(() => {
    if (!selectedCatalogId) return sortedOpportunities;
    return sortedOpportunities.filter((item) => matchesCatalogItem(item, selectedCatalogId));
  }, [sortedOpportunities, selectedCatalogId]);

  const kpis = useMemo(() => {
    const totalProfit = opportunities.reduce((sum, item) => sum + item.netProfit, 0);
    const roiValues = opportunities.map((item) => item.roiPercent).sort((a, b) => a - b);
    const medianRoi = roiValues.length ? roiValues[Math.floor(roiValues.length / 2)] : 0;
    return { totalProfit, medianRoi, count: opportunities.length };
  }, [opportunities]);
  const isConfigReady = Boolean(health && health.missingConfig.length === 0);

  async function handleScan() {
    setIsScanning(true);
    setLogs(["[SYSTEM] Initializing scan routing..."]);
    setError("");

    let parsedParams: Record<string, unknown> | undefined;
    if (searchParamsJson) {
      try {
        parsedParams = JSON.parse(searchParamsJson);
      } catch (err) {
        setError("Invalid Search Parameters JSON. Ensure it is a valid JSON object.");
        setIsScanning(false);
        return;
      }
    }

    try {
      const result = await triggerScan(
        selectedAction || undefined,
        parsedParams,
        activeProvider
      );
      setLatestScan(result);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      await refreshData().catch(() => undefined);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleCatalogScan(item: CatalogItem) {
    setIsScanning(true);
    setLogs([`[SYSTEM] Initializing scan routing for ${item.name}...`]);
    setError("");
    setSelectedCatalogId(item.id);

    // Pre-fill parameters and action
    setSearchParamsJson(JSON.stringify(item.searchParams, null, 2));
    if (!selectedAction) {
      setSelectedAction(item.actionId);
    }

    try {
      const result = await triggerScan(
        item.actionId,
        item.searchParams,
        activeProvider
      );
      setLatestScan(result);
      await refreshData();
      
      if (logEndRef.current) {
        logEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      await refreshData().catch(() => undefined);
    } finally {
      setIsScanning(false);
    }
  }

  async function openDetail(opportunity: Opportunity) {
    setSelected(opportunity);
    setRawDetail(null);
    try {
      const detail = await getOpportunityDetail(opportunity.id);
      setRawDetail(detail.rawListing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load detail");
    }
  }

  return (
    <main className="appShell">
      <section className="topBar">
        <div>
          <p className="eyebrow">Administrative Arbitrage Terminal</p>
          <h1>AI Arbitrage Engine</h1>
        </div>
        <div className="statusCluster">
          <span className={isConfigReady ? "modeBadge live" : "modeBadge incomplete"}>
            {isConfigReady ? "LIVE WIRE" : "CONFIG"}
          </span>
          <button className="iconButton" onClick={() => refreshData().catch((err: Error) => setError(err.message))} title="Refresh">
            <RefreshCw size={18} />
          </button>
          <button className="primaryButton" onClick={handleScan} disabled={isScanning || !isConfigReady}>
            <Search size={17} />
            {isScanning ? "Scanning" : "Run scan"}
          </button>
        </div>
      </section>

      {/* Visual Stepper */}
      {isScanning && (
        <section className="stepperSection">
          <div className={`step ${activeStep >= 1 ? "active" : ""}`}>
            <Compass className="icon" size={18} />
            <div>
              <strong>1. Data Scraping</strong>
              <span>Anakin Holocron Task</span>
            </div>
          </div>
          <div className="stepLine" />
          <div className={`step ${activeStep >= 2 ? "active" : ""}`}>
            <HardDrive className="icon" size={18} />
            <div>
              <strong>2. Batch Slicing</strong>
              <span>5 Listings / Query</span>
            </div>
          </div>
          <div className="stepLine" />
          <div className={`step ${activeStep >= 3 ? "active" : ""}`}>
            <Cpu className="icon" size={18} />
            <div>
              <strong>3. NIM AI Reasoning</strong>
              <span>Valuation appraisal</span>
            </div>
          </div>
          <div className="stepLine" />
          <div className={`step ${activeStep >= 4 ? "active" : ""}`}>
            <Terminal className="icon" size={18} />
            <div>
              <strong>4. Commit to SQLite</strong>
              <span>Database write complete</span>
            </div>
          </div>
        </section>
      )}

      {/* Real-time Scrolling Console logs */}
      {isScanning && (
        <section className="consoleSection">
          <div className="consoleTitle">
            <Terminal size={16} />
            <span>AI Real-time Tracing Logs</span>
          </div>
          <pre ref={logEndRef} className="consoleLogs">
            {logs.map((log, index) => (
              <div key={index} className="logLine">{log}</div>
            ))}
          </pre>
        </section>
      )}

      {error ? <div className="errorBanner">{error}</div> : null}
      {health && health.missingConfig.length ? (
        <div className="configBanner">Missing live configuration: {health.missingConfig.join(", ")}</div>
      ) : null}

      <section className="kpiGrid">
        <Kpi label="Opportunities" value={String(kpis.count)} />
        <Kpi label="Median ROI" value={`${percent.format(kpis.medianRoi)}%`} />
        <Kpi label="Est. Profit" value={money.format(kpis.totalProfit)} />
        <Kpi
          label="Last Scan"
          value={latestScan ? latestScan.status.toUpperCase() : "NONE"}
          sub={latestScan ? `${latestScan.listingCount} listings / ${latestScan.opportunityCount} hits` : "No scan has run"}
        />
      </section>

      {/* Curated Arbitrage Opportunities Catalog */}
      <section className="catalogSection">
        <div className="sectionHeader">
          <div className="sectionTitle">
            <Tag className="headerIcon" size={18} />
            <h2>Curated Arbitrage Catalog</h2>
          </div>
          {selectedCatalogId && (
            <button className="clearFilterButton" onClick={() => setSelectedCatalogId(null)}>
              Clear Filter
            </button>
          )}
        </div>
        <p className="sectionSub">Select a catalog item to filter matching deals, or trigger a live scan directly with pre-configured search parameters.</p>
        
        <div className="catalogGrid">
          {CATALOG_ITEMS.map((item) => {
            const hits = catalogHits[item.id] || 0;
            const isSelected = selectedCatalogId === item.id;
            return (
              <div
                key={item.id}
                className={`catalogCard ${isSelected ? "selected" : ""}`}
                onClick={() => handleSelectCatalogItem(item)}
              >
                <div className="catalogCardImageWrapper">
                  <img src={item.image} alt={item.name} className="catalogCardImage" />
                  {hits > 0 && <span className="catalogHitsBadge">{hits}</span>}
                </div>
                <div className="catalogCardBody">
                  <div className="catalogCardHeader">
                    <span className="catalogCardCategory">{item.category}</span>
                    <h3 className="catalogCardTitle">{item.name}</h3>
                  </div>
                  <p className="catalogCardDesc">{item.description}</p>
                  
                  <div className="catalogMetrics">
                    <div className="metric">
                      <span>Buy Target</span>
                      <strong>{money.format(item.targetBuy)}</strong>
                    </div>
                    <div className="metric">
                      <span>Resell FMV</span>
                      <strong>{money.format(item.resellValue)}</strong>
                    </div>
                    <div className="metric">
                      <span>Exp. ROI</span>
                      <strong className="profitText">+{percent.format(item.expectedRoi)}%</strong>
                    </div>
                  </div>
                </div>
                <div className="catalogCardFooter" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="catalogScanButton"
                    onClick={() => handleCatalogScan(item)}
                    disabled={isScanning || !isConfigReady}
                  >
                    <Search size={13} />
                    Scan Deals
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Advanced Control Panel & Scraper Action Discovery */}
      <section className="advancedPanelGrid">
        <div className="panelCard actionCenter">
          <div className="panelHeader">
            <Compass size={18} className="headerIcon" />
            <h2>Anakin Scraper Discovery</h2>
          </div>

          <div className="actionSearchBand">
            <input
              type="text"
              placeholder="Search scrapers (e.g. ebay)..."
              value={actionQuery}
              onChange={(e) => setActionQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchActions()}
            />
            <button className="secondaryButton" onClick={handleSearchActions}>Find Scrapers</button>
          </div>

          <div className="discoveredList">
            {discoveredActions.map((action) => (
              <div
                key={action.action_id}
                className={`actionCard ${selectedAction === action.action_id ? "selected" : ""}`}
                onClick={() => setSelectedAction(action.action_id)}
              >
                <strong>{action.name}</strong>
                <span className="slug">{action.catalog_slug || "General"}</span>
                {action.description ? <p className="desc">{action.description}</p> : null}
              </div>
            ))}
            {discoveredActions.length === 0 ? <p className="emptySearch">No scrapers found. Try another query.</p> : null}
          </div>
        </div>

        <div className="panelCard configCenter">
          <div className="panelHeader">
            <Settings size={18} className="headerIcon" />
            <h2>Active Scraper Config</h2>
          </div>

          <label className="paramLabel">
            Selected Action ID
            <input type="text" className="fullWidthInput" readOnly value={selectedAction || "None selected"} />
          </label>

          <label className="paramLabel">
            Active AI Appraisal Provider
            <select className="fullWidthInput" value={activeProvider} onChange={(e) => setActiveProvider(e.target.value)}>
              <option value="nvidia">Nvidia NIM (DeepSeek v4)</option>
              <option value="gemini">Google AI Studio (Gemini 1.5 Flash)</option>
              <option value="openrouter">OpenRouter (Gemini 2.5 Flash)</option>
            </select>
          </label>

          <label className="paramLabel">
            Anakin Wire Search Parameters (JSON)
            <textarea
              className="jsonTextarea"
              rows={4}
              value={searchParamsJson}
              onChange={(e) => setSearchParamsJson(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="controlBand">
        <div className="controlTitle">
          <Filter size={18} />
          Filters
        </div>
        <label>
          Min ROI
          <input
            type="number"
            value={filters.minRoi}
            onChange={(event) => setFilters({ ...filters, minRoi: Number(event.target.value) })}
          />
        </label>
        <label>
          Min Confidence
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={filters.minConfidence}
            onChange={(event) => setFilters({ ...filters, minConfidence: Number(event.target.value) })}
          />
        </label>
        <label>
          Risk
          <select value={filters.riskLevel} onChange={(event) => setFilters({ ...filters, riskLevel: event.target.value })}>
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Source
          <input value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} />
        </label>
        <span className="refreshText">Auto-refresh {health?.scanIntervalSeconds ?? 120}s</span>
      </section>

      <section className="tableShell">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <Sortable label="Ask" active={sortKey === "askPrice"} onClick={() => setSortKey("askPrice")} />
              <th>FMV</th>
              <Sortable label="Net" active={sortKey === "netProfit"} onClick={() => setSortKey("netProfit")} />
              <Sortable label="ROI" active={sortKey === "roiPercent"} onClick={() => setSortKey("roiPercent")} />
              <Sortable label="Confidence" active={sortKey === "confidence"} onClick={() => setSortKey("confidence")} />
              <th>Risk</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredOpportunities.map((item) => (
              <tr key={item.id} onClick={() => openDetail(item)}>
                <td>
                  <div className="assetCell">
                    <img src={item.imageUrl || "/placeholder.svg"} alt="" />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.sourcePlatform}</span>
                    </div>
                  </div>
                </td>
                <td>{money.format(item.askPrice)}</td>
                <td>{money.format(item.estimatedMarketValue)}</td>
                <td className="profit">{money.format(item.netProfit)}</td>
                <td className="roi">{percent.format(item.roiPercent)}%</td>
                <td>{percent.format(item.confidence * 100)}%</td>
                <td>
                  <RiskBadge risk={item.riskLevel} />
                </td>
                <td>
                  <button className="textButton" onClick={(event) => event.stopPropagation()}>
                    <a href={item.listingUrl} target="_blank" rel="noreferrer">
                      Open <ExternalLink size={14} />
                    </a>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredOpportunities.length ? <div className="emptyState">No opportunities match the current filters.</div> : null}
      </section>

      <aside className={selected ? "drawer open" : "drawer"} aria-hidden={!selected}>
        {selected ? (
          <>
            <button className="closeButton" onClick={() => setSelected(null)}>
              Close
            </button>
            <img className="drawerImage" src={selected.imageUrl || "/placeholder.svg"} alt="" />
            <h2>{selected.title}</h2>

            {/* Redesigned metrics and graphs */}
            <div className="drawerVisualSection">
              <div className="gaugeContainer">
                <svg viewBox="0 0 100 50" className="confidenceGauge">
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="url(#gaugeGrad)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={125.6}
                    strokeDashoffset={125.6 - (125.6 * selected.confidence)}
                  />
                  <defs>
                    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="50%" stopColor="#eab308" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                  <text x="50" y="44" className="gaugeText" textAnchor="middle">
                    {Math.round(selected.confidence * 100)}%
                  </text>
                </svg>
                <span className="gaugeLabel">AI Confidence</span>
              </div>
              <div className="metricChips">
                <div className="chip">
                  <span>ROI</span>
                  <strong>{percent.format(selected.roiPercent)}%</strong>
                </div>
                <div className="chip">
                  <span>Profit</span>
                  <strong>{money.format(selected.netProfit)}</strong>
                </div>
              </div>
            </div>

            {/* Price Spread horizontal comparison chart */}
            <div className="drawerPriceChart">
              <h3>Price Appraisal Spread</h3>
              <div className="priceChartBar">
                <div className="priceSegment ask" style={{ flex: selected.askPrice }} title={`Ask Price: ${money.format(selected.askPrice)}`}>
                  <span>Ask: {money.format(selected.askPrice)}</span>
                </div>
                <div className="priceSegment profit" style={{ flex: selected.netProfit }} title={`Est. Profit: ${money.format(selected.netProfit)}`}>
                  <span>Profit: {money.format(selected.netProfit)}</span>
                </div>
              </div>
              <div className="chartLabels">
                <span>Ask: {money.format(selected.askPrice)}</span>
                <span>FMV: {money.format(selected.estimatedMarketValue)}</span>
              </div>
            </div>

            <p className="summaryText">{selected.reasoningSummary}</p>

            <h3>Flagged Issues</h3>
            <ul className="flaggedIssues">
              {selected.detectedIssues.length ? (
                selected.detectedIssues.map((issue) => <li key={issue} className="issueItem">{issue}</li>)
              ) : (
                <li className="noIssues">No major issues flagged.</li>
              )}
            </ul>

            <h3>Recommended Action</h3>
            <p className="actionText">{selected.recommendedAction}</p>

            <h3>Raw Listing Metadata</h3>
            <pre>{JSON.stringify(rawDetail, null, 2)}</pre>
          </>
        ) : null}
      </aside>
    </main>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function Sortable({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th>
      <button className={active ? "sort active" : "sort"} onClick={onClick}>
        {label}
        <ArrowDown size={14} />
      </button>
    </th>
  );
}

function RiskBadge({ risk }: { risk: Opportunity["riskLevel"] }) {
  return (
    <span className={`riskBadge ${risk}`}>
      {risk === "low" ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
      {risk}
    </span>
  );
}
