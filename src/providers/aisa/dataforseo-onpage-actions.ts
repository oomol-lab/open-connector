import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const taskId = s.string("Crawl task ID returned by submit_dataforseo_onpage; use the same connection.", {
  minLength: 1,
});

const url = s.string("Absolute page or resource URL, including its protocol.", { format: "uri" });
const tag = s.string("Caller-defined task tag returned in the response.", { maxLength: 255 });
const strings = (description: string) => s.array(description, s.string("One value."));

export const dataForSeoOnPageInputFields: Record<string, JsonSchema> = {
  target: s.string("Domain to crawl, without protocol or www; a page URL is interpreted as its domain.", {
    minLength: 1,
  }),
  maxCrawlPages: s.integer("Maximum number of pages to crawl; this controls the crawl's size and cost.", {
    minimum: 1,
  }),
  acceptLanguage: s.string("Accept-Language header for the crawl; some websites require it."),
  allowSubdomains: s.boolean("Crawl all subdomains; defaults to false."),
  allowedSubdomains: strings("Specific subdomains to crawl when allowSubdomains is false."),
  disallowedSubdomains: strings("Subdomains to exclude when allowSubdomains is true."),
  browserPreset: s.stringEnum("Browser screen preset; requires JavaScript or browser rendering.", [
    "desktop",
    "mobile",
    "tablet",
  ]),
  browserScreenHeight: s.integer(
    "Custom browser height in pixels; overrides the preset and requires JavaScript or browser rendering.",
    { minimum: 240, maximum: 9999 },
  ),
  browserScreenWidth: s.integer(
    "Custom browser width in pixels; overrides the preset and requires JavaScript or browser rendering.",
    { minimum: 240, maximum: 9999 },
  ),
  browserScreenScaleFactor: s.number("Browser device pixel ratio; requires JavaScript or browser rendering.", {
    minimum: 0.5,
    maximum: 3,
  }),
  calculateKeywordDensity: s.boolean("Calculate keyword density for later reports; incurs additional charges."),
  checkSpell: s.boolean("Check spelling with Hunspell."),
  checkSpellExceptions: s.array(
    "Words excluded from spelling checks.",
    s.string("Excluded word.", { maxLength: 100 }),
    { maxItems: 1000 },
  ),
  checkSpellLanguage: s.string("Hunspell language code; omitted values are inferred from page content."),
  checksThreshold: s.record(
    "Custom integer thresholds for supported OnPage checks.",
    s.integer("Threshold value in the units defined by the selected check."),
  ),
  crawlDelay: s.integer("Delay between crawler requests, in milliseconds; defaults to 2000.", {
    minimum: 0,
  }),
  crawlSitemapOnly: s.boolean("Crawl only sitemap pages; requires respectSitemap."),
  customJs: s.string(
    "JavaScript to execute on crawled pages, with at most 700 ms execution time. Returned values appear in custom_js_response.",
  ),
  customRobotsTxt: s.string("Custom robots.txt content to merge with or override the site's rules."),
  customSitemap: s.string("Custom sitemap URL; requires respectSitemap.", { format: "uri" }),
  customUserAgent: s.string("Custom User-Agent for the crawler."),
  disableCookiePopup: s.boolean("Dismiss cookie-consent popups during the crawl."),
  disablePageChecks: strings("Page checks to disable so they do not affect the OnPage score."),
  disableSitewideChecks: s.array(
    "Sitewide checks to disable.",
    s.stringEnum("Sitewide check.", [
      "test_page_not_found",
      "test_canonicalization",
      "test_https_redirect",
      "test_directory_browsing",
    ]),
  ),
  enableBrowserRendering: s.boolean(
    "Render pages to measure Core Web Vitals; requires enableJavascript and loadResources and incurs additional charges.",
  ),
  enableContentParsing: s.boolean("Store parsed page content for the content_parsing report."),
  enableJavascript: s.boolean("Execute page JavaScript; incurs additional charges."),
  enableWwwRedirectCheck: s.boolean("Check whether the domain redirects between www and non-www hosts."),
  enableXhr: s.boolean("Allow XMLHttpRequest; requires enableJavascript."),
  forceSitewideChecks: s.boolean("Run sitewide checks even when only one page is crawled."),
  loadResources: s.boolean("Load images, stylesheets and scripts; incurs additional charges."),
  maxCrawlDepth: s.integer("Maximum linking depth from the starting page, which has depth zero.", {
    minimum: 0,
  }),
  priorityUrls: s.array("Same-domain URLs to crawl first; subdomains also require allowSubdomains.", url, {
    maxItems: 20,
  }),
  respectSitemap: s.boolean("Follow the sitemap page order; ignores maxCrawlDepth and reports click depth as zero."),
  returnDespiteTimeout: s.boolean("Return data for pages that exceed the upstream 120-second page load timeout."),
  robotsTxtMergeMode: s.stringEnum("Merge or override robots.txt; override requires customRobotsTxt.", [
    "merge",
    "override",
  ]),
  startUrl: url,
  storeRawHtml: s.boolean("Store page HTML for the raw_html report."),
  supportCookies: s.boolean("Allow the crawler to retain cookies set by the website."),
  switchPool: s.boolean(
    "Use additional proxy pools when the upstream crawler encounters access or rate-limit failures.",
  ),
  tag,
  validateMicromarkup: s.boolean("Validate structured markup for the microdata report."),
};

const filters = s.array(
  "DataForSEO filter expression; keep nested condition arrays and logical operators unchanged.",
  s.unknown("A condition, nested expression or logical operator."),
);

const reportFields = {
  url,
  tag,
  limit: s.integer("Maximum report entries to return; defaults to 100.", {
    minimum: 1,
    maximum: 1000,
  }),
  offset: s.integer("Number of entries to skip.", { minimum: 0, maximum: 2000000 }),
  filters,
  orderBy: s.array("Sort rules in field,asc or field,desc form.", s.string("One field and sort direction.")),
  searchAfterToken: s.string("Pagination token from the preceding response; useful for deep result pagination."),
  markdownView: s.boolean("Return parsed page content as Markdown; requires enableContentParsing on submission."),
  similarity: s.integer("Duplicate-content similarity threshold; defaults to 6.", {
    minimum: 0,
    maximum: 10,
  }),
  accumulator: s.string("Specific title or description value to inspect for duplicates."),
  type: s.stringEnum("Duplicate tag type.", ["title", "description"]),
  keywordLength: s.integer("Number of words in each keyword phrase.", { minimum: 1, maximum: 5 }),
  pageFrom: s.string("Relative page URL whose outgoing links should be returned."),
  pageTo: s.string("Relative page URL whose incoming internal links should be returned."),
  relevantPagesFilters: s.array(
    "Page filter expression restricting which pages contribute resources.",
    s.unknown("A page condition, nested expression or logical operator."),
  ),
};

interface OnPageReport {
  name: string;
  description: string;
  fields: (keyof typeof reportFields)[];
  required: (keyof typeof reportFields)[];
}

const pagination: (keyof typeof reportFields)[] = ["limit", "offset"];

const dataForSeoOnPageReports: OnPageReport[] = [
  {
    name: "content_parsing",
    description: "Parsed page content; enableContentParsing must have been enabled when starting the crawl.",
    fields: ["url", "markdownView"],
    required: ["url"],
  },
  {
    name: "duplicate_content",
    description: "Pages with content similar to a selected page.",
    fields: ["url", "similarity", "tag", ...pagination],
    required: ["url"],
  },
  {
    name: "duplicate_tags",
    description: "Pages sharing title or description tags.",
    fields: ["type", "accumulator", "tag", ...pagination],
    required: ["type"],
  },
  {
    name: "keyword_density",
    description: "Keyword frequencies; calculateKeywordDensity must have been enabled when starting the crawl.",
    fields: ["keywordLength", "url", "filters", "orderBy", "limit", "tag"],
    required: ["keywordLength"],
  },
  {
    name: "links",
    description: "Internal and external links from crawled pages.",
    fields: ["filters", "pageFrom", "pageTo", "searchAfterToken", "tag", ...pagination],
    required: [],
  },
  {
    name: "microdata",
    description: "Structured markup validation; validateMicromarkup must have been enabled when starting the crawl.",
    fields: ["url", "tag"],
    required: ["url"],
  },
  {
    name: "non_indexable",
    description: "Pages that cannot be indexed.",
    fields: ["filters", ...pagination],
    required: [],
  },
  {
    name: "pages",
    description: "Crawled page metrics and checks.",
    fields: ["filters", "orderBy", "searchAfterToken", "tag", ...pagination],
    required: [],
  },
  {
    name: "pages_by_resource",
    description: "Pages using a selected resource.",
    fields: ["url", "filters", "orderBy", "tag", ...pagination],
    required: ["url"],
  },
  {
    name: "raw_html",
    description:
      "Page HTML returned inside a JSON report; storeRawHtml must have been enabled when starting the crawl.",
    fields: ["url"],
    required: ["url"],
  },
  {
    name: "redirect_chains",
    description: "Redirect chains and loops; filters supports only an is_redirect_loop condition.",
    fields: ["url", "filters", "tag", ...pagination],
    required: [],
  },
  {
    name: "resources",
    description: "Page resources and their metrics.",
    fields: ["url", "filters", "relevantPagesFilters", "orderBy", "searchAfterToken", "tag", ...pagination],
    required: [],
  },
  {
    name: "uncrawlable_resources",
    description: "Resources the crawler could not retrieve.",
    fields: ["filters", "orderBy", ...pagination],
    required: [],
  },
  {
    name: "waterfall",
    description: "Resource loading timings for a crawled page.",
    fields: ["url", "tag"],
    required: ["url"],
  },
];

const output = s.object(
  "Crawl state and complete DataForSEO response.",
  {
    taskId,
    status: s.stringEnum("Normalized crawl state; check raw for stop reasons and errors.", [
      "running",
      "completed",
      "failed",
      "cancelled",
    ]),
    output: s.unknown("Upstream crawl result with all additional fields preserved."),
    raw: s.looseObject("Complete DataForSEO response including task status, crawl progress and costs."),
  },
  { optional: [] },
);

const reportOutput = s.object(
  "The selected crawl report and complete upstream response.",
  {
    taskId,
    output: s.unknown("Upstream report data, including pagination tokens and new fields."),
    raw: s.looseObject("Complete DataForSEO response; inspect task status codes for report errors."),
  },
  { optional: [] },
);

export const dataForSeoOnPageActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "submit_dataforseo_onpage",
    operationType: "write",
    requiredScopes: [],
    description:
      "Start a DataForSEO website audit. Choose crawl limits and optional rendering or stored reports, then poll the crawl summary.",
    inputSchema: s.object(
      "Website crawl configuration; optional rendering and analysis features may incur additional charges.",
      dataForSeoOnPageInputFields,
      { required: ["target", "maxCrawlPages"] },
    ),
    outputSchema: output,
    asyncLifecycle: {
      startActionId: "aisa." + "submit_dataforseo_onpage",
      statusActionId: "aisa.get_dataforseo_onpage",
    },
  }),
  defineProviderAction("aisa", {
    name: "get_dataforseo_onpage",
    operationType: "read",
    requiredScopes: [],
    description:
      "Poll a DataForSEO website crawl and read its domain summary. Completed crawls can be explored with the crawl report action.",
    inputSchema: s.object("Identify a website crawl to inspect.", { taskId }, { optional: [] }),
    outputSchema: output,
  }),
  defineProviderAction("aisa", {
    name: "get_dataforseo_onpage_report",
    operationType: "read",
    requiredScopes: [],
    description:
      "Read a page, link, resource, duplicate, content, markup, keyword or loading report from a DataForSEO crawl, with report-specific filters and pagination.",
    inputSchema: s.anyOf(
      "Choose a crawl report and its supported options.",
      dataForSeoOnPageReports.map((report) =>
        s.object(
          report.description,
          {
            taskId,
            report: s.stringEnum("Crawl report to retrieve.", [report.name]),
            ...Object.fromEntries(report.fields.map((field) => [field, reportFields[field]])),
          },
          { required: ["taskId", "report", ...report.required] },
        ),
      ),
    ),
    outputSchema: reportOutput,
  }),
  defineProviderAction("aisa", {
    name: "cancel_dataforseo_onpage",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Stop a DataForSEO website crawl. Already crawled pages may still be charged; query the crawl summary for its final state and reports.",
    inputSchema: s.object("Identify the website crawl to stop.", { taskId }, { optional: [] }),
    outputSchema: reportOutput,
  }),
];

const submitBody = {
  target: "target",
  maxCrawlPages: "max_crawl_pages",
  acceptLanguage: "accept_language",
  allowSubdomains: "allow_subdomains",
  allowedSubdomains: "allowed_subdomains",
  disallowedSubdomains: "disallowed_subdomains",
  browserPreset: "browser_preset",
  browserScreenHeight: "browser_screen_height",
  browserScreenWidth: "browser_screen_width",
  browserScreenScaleFactor: "browser_screen_scale_factor",
  calculateKeywordDensity: "calculate_keyword_density",
  checkSpell: "check_spell",
  checkSpellExceptions: "check_spell_exceptions",
  checkSpellLanguage: "check_spell_language",
  checksThreshold: "checks_threshold",
  crawlDelay: "crawl_delay",
  crawlSitemapOnly: "crawl_sitemap_only",
  customJs: "custom_js",
  customRobotsTxt: "custom_robots_txt",
  customSitemap: "custom_sitemap",
  customUserAgent: "custom_user_agent",
  disableCookiePopup: "disable_cookie_popup",
  disablePageChecks: "disable_page_checks",
  disableSitewideChecks: "disable_sitewide_checks",
  enableBrowserRendering: "enable_browser_rendering",
  enableContentParsing: "enable_content_parsing",
  enableJavascript: "enable_javascript",
  enableWwwRedirectCheck: "enable_www_redirect_check",
  enableXhr: "enable_xhr",
  forceSitewideChecks: "force_sitewide_checks",
  loadResources: "load_resources",
  maxCrawlDepth: "max_crawl_depth",
  priorityUrls: "priority_urls",
  respectSitemap: "respect_sitemap",
  returnDespiteTimeout: "return_despite_timeout",
  robotsTxtMergeMode: "robots_txt_merge_mode",
  startUrl: "start_url",
  storeRawHtml: "store_raw_html",
  supportCookies: "support_cookies",
  switchPool: "switch_pool",
  tag: "tag",
  validateMicromarkup: "validate_micromarkup",
};

export const dataForSeoOnPageRoutes: Record<string, AisaActionRoute> = {
  submit_dataforseo_onpage: {
    method: "POST",
    path: "/apis/v1/dataforseo/on_page/task_post",
    query: {},
    body: submitBody,
    bodyArray: true,
    onPageTask: "submit",
  },
  get_dataforseo_onpage: {
    method: "GET",
    path: "/apis/v1/dataforseo/on_page/summary/{id}",
    query: {},
    pathParams: { id: "taskId" },
    onPageTask: "summary",
  },
  get_dataforseo_onpage_report: {
    method: "POST",
    path: "/apis/v1/dataforseo/on_page/{report}",
    query: {},
    pathParams: { report: "report" },
    bodyArray: true,
    onPageTask: "report",
    body: {
      taskId: "id",
      url: "url",
      tag: "tag",
      limit: "limit",
      offset: "offset",
      filters: "filters",
      orderBy: "order_by",
      searchAfterToken: "search_after_token",
      markdownView: "markdown_view",
      similarity: "similarity",
      accumulator: "accumulator",
      type: "type",
      keywordLength: "keyword_length",
      pageFrom: "page_from",
      pageTo: "page_to",
      relevantPagesFilters: "relevant_pages_filters",
    },
  },
  cancel_dataforseo_onpage: {
    method: "POST",
    path: "/apis/v1/dataforseo/on_page/force_stop",
    query: {},
    body: { taskId: "id" },
    bodyArray: true,
    onPageTask: "cancel",
  },
};
