import type { ProviderDefinition, ProviderScenario } from "./types.ts";

/**
 * Broad task-oriented group used to discover providers in catalog clients.
 *
 * This deliberately complements, rather than replaces, a provider's source
 * categories. Source categories remain the detailed technical taxonomy while
 * a scenario gives every provider one stable place in a task-first browser.
 */
const scenarioByService = new Map<string, ProviderScenario>([
  // Shared SaaS providers keep the same primary scenario as the hosted Console.
  // Service ids are compacted before lookup, so this also covers underscore and
  // hyphen variants used by the open-source catalog.
  ["17track", "cross-border-ecommerce"],
  ["adobecommerce", "cross-border-ecommerce"],
  ["aftership", "cross-border-ecommerce"],
  ["algolia", "data-storage"],
  ["aliyunoss", "data-storage"],
  ["amap", "productivity"],
  ["aivoov", "ai"],
  ["aifinmarket", "investment"],
  ["alpaca", "investment"],
  ["alphavantage", "investment"],
  ["anthropic", "ai"],
  ["apininjas", "developer"],
  ["awss3", "data-storage"],
  ["asindataapi", "cross-border-ecommerce"],
  ["baselinker", "cross-border-ecommerce"],
  ["beaconchain", "investment"],
  ["benzinga", "investment"],
  ["bigcommerce", "cross-border-ecommerce"],
  ["captainbi", "cross-border-ecommerce"],
  ["cin7core", "cross-border-ecommerce"],
  ["circleci", "developer"],
  ["coinbase", "investment"],
  ["coingecko", "investment"],
  ["coinmarketcal", "investment"],
  ["coinmarketcap", "investment"],
  ["coinranking", "investment"],
  ["cryptoapis", "investment"],
  ["clickup", "productivity"],
  ["cloudflaredns", "developer"],
  ["cloudflarer2", "data-storage"],
  ["cloudflareworker", "developer"],
  ["databricks", "data-storage"],
  ["deepseek", "ai"],
  ["devto", "developer"],
  ["dingtalkbot", "communication"],
  ["dida365", "productivity"],
  ["discord", "communication"],
  ["discordbot", "communication"],
  ["dockerhub", "developer"],
  ["elevenlabs", "ai"],
  ["easypost", "cross-border-ecommerce"],
  ["eodhdapis", "investment"],
  ["exa", "ai"],
  ["falai", "ai"],
  ["feishu", "communication"],
  ["feishuappbot", "communication"],
  ["feishucustombot", "communication"],
  ["figma", "productivity"],
  ["finage", "investment"],
  ["finchina", "investment"],
  ["financialmodelingprep", "investment"],
  ["firecrawl", "developer"],
  ["futunn", "investment"],
  ["gangtise", "investment"],
  ["gemini", "ai"],
  ["giphy", "marketing"],
  ["gildata", "investment"],
  ["github", "developer"],
  ["gitlab", "developer"],
  ["gmail", "communication"],
  ["googleanalytics", "marketing"],
  ["googlebigquery", "data-storage"],
  ["googlecalendar", "productivity"],
  ["googleforms", "productivity"],
  ["googlephotos", "communication"],
  ["googlesearchconsole", "marketing"],
  ["googlesheets", "productivity"],
  ["googletasks", "productivity"],
  ["hubspot", "marketing"],
  ["helium10", "cross-border-ecommerce"],
  ["hithinkfinance", "investment"],
  ["investodaymcp", "investment"],
  ["intrinio", "investment"],
  ["jin10", "investment"],
  ["jumpseller", "cross-border-ecommerce"],
  ["linkfox", "cross-border-ecommerce"],
  ["lingxingmcp", "cross-border-ecommerce"],
  ["longbridge", "investment"],
  ["luno", "investment"],
  ["mailchimp", "marketing"],
  ["mailgun", "communication"],
  ["marketstack", "investment"],
  ["metatraderapi", "investment"],
  ["monday", "productivity"],
  ["nasdaq", "investment"],
  ["polygonio", "investment"],
  ["quantdata", "investment"],
  ["openai", "ai"],
  ["outlook", "communication"],
  ["perplexity", "ai"],
  ["printify", "cross-border-ecommerce"],
  ["sellerspace", "cross-border-ecommerce"],
  ["sellersprite", "cross-border-ecommerce"],
  ["sellerspritemcp", "cross-border-ecommerce"],
  ["sif", "cross-border-ecommerce"],
  ["sorftime", "cross-border-ecommerce"],
  ["stripe", "marketing"],
  ["storecensus", "cross-border-ecommerce"],
  ["storeleads", "cross-border-ecommerce"],
  ["telegram", "communication"],
  ["tokenmetrics", "investment"],
  ["tongdaxin", "investment"],
  ["trello", "productivity"],
  ["tushare", "investment"],
  ["twelvedata", "investment"],
  ["twilio", "communication"],
  ["triplewhale", "cross-border-ecommerce"],
  ["vercel", "developer"],
  ["shopify", "cross-border-ecommerce"],
  ["shopifyadmin", "cross-border-ecommerce"],
  ["shopifypartner", "cross-border-ecommerce"],
  ["shopifystorefront", "cross-border-ecommerce"],
  ["shipbob", "cross-border-ecommerce"],
  ["shipengine", "cross-border-ecommerce"],
  ["shippo", "cross-border-ecommerce"],
  ["shipstation", "cross-border-ecommerce"],
  ["vtex", "cross-border-ecommerce"],
  ["uniswapapi", "investment"],
  ["yingmimcp", "investment"],
  ["woocommerce", "cross-border-ecommerce"],
  ["box", "communication"],
  ["confluence", "communication"],
  ["crowdin", "communication"],
  ["docparser", "communication"],
  ["dropbox", "communication"],
  ["googledocs", "communication"],
  ["googledrive", "communication"],
  ["googleslides", "communication"],
  ["notion", "communication"],
  ["onlyofficedocspace", "communication"],
]);

const scenarioByCategory = new Map<string, ProviderScenario>([
  ["ai", "ai"],
  ["communication", "communication"],
  ["collaboration", "communication"],
  ["data", "data-storage"],
  ["dataanalytics", "data-storage"],
  ["developertools", "developer"],
  ["docs", "communication"],
  ["documents", "communication"],
  ["infrastructure", "developer"],
  ["marketing", "marketing"],
  ["knowledge", "communication"],
  ["productivity", "productivity"],
  ["security", "developer"],
  ["social", "marketing"],
  ["storage", "data-storage"],
]);

const scenarioKeywords: ReadonlyArray<readonly [ProviderScenario, readonly string[]]> = [
  ["ai", ["agent", "ai", "embedding", "llm", "model", "prompt", "transcrib", "vector"]],
  ["cross-border-ecommerce", ["ecommerce", "marketplace", "order fulfillment", "seller", "storefront"]],
  ["investment", ["brokerage", "crypto", "investment", "market data", "portfolio", "stock market", "trading"]],
  [
    "communication",
    [
      "chat",
      "document",
      "drive",
      "email",
      "inbox",
      "knowledge base",
      "messaging",
      "notification",
      "sms",
      "video meeting",
      "wiki",
    ],
  ],
  ["productivity", ["calendar", "project management", "schedule", "task management", "todo"]],
  ["marketing", ["advertising", "analytics", "crm", "lead generation", "marketing", "seo"]],
  ["data-storage", ["database", "data warehouse", "object storage", "search index"]],
  ["developer", ["api", "ci cd", "code", "deployment", "developer", "devops", "observability"]],
];

/** Resolve one stable discovery scenario for a provider catalog entry. */
export function resolveProviderScenario(provider: ProviderDefinition): ProviderScenario {
  const serviceScenario = scenarioByService.get(compactValue(provider.service));
  if (serviceScenario) {
    return serviceScenario;
  }

  for (const category of provider.categories) {
    const categoryScenario = scenarioByCategory.get(compactValue(category));
    if (categoryScenario) {
      return categoryScenario;
    }
  }

  const searchableText = normalizeValue([provider.service, provider.displayName, provider.description].join(" "));
  for (const [scenario, keywords] of scenarioKeywords) {
    if (keywords.some((keyword) => matchesScenarioKeyword(searchableText, keyword))) {
      return scenario;
    }
  }

  return "other";
}

function compactValue(value: string): string {
  return normalizeValue(value).replace(/\s+/g, "");
}

function matchesScenarioKeyword(source: string, keyword: string): boolean {
  const normalizedKeyword = normalizeValue(keyword);
  if (normalizedKeyword === "transcrib") {
    return source.split(" ").some((token) => token.startsWith(normalizedKeyword));
  }

  return ` ${source} `.includes(` ${normalizedKeyword} `);
}

function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}
