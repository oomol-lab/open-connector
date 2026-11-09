import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const fields = {
  priority: {
    ...s.integer("Execution priority: 1 is normal; 2 costs extra for faster execution."),
    enum: [1, 2],
  },
  tag: s.string("A caller-defined task identifier returned with the result.", { maxLength: 255 }),
  app_id: s.string("App Store numeric ID or Google Play package ID for the selected store.", {
    minLength: 1,
  }),
  app_category: s.string(
    "App category from the store's category directory; unavailable with Google Play featured collection.",
  ),
  app_collection: s.string("Store chart or collection to retrieve."),
  age_rating: s.stringEnum("Google Play audience age group.", ["ages_up_to_5", "ages_6_8", "ages_9_12"]),
  depth: s.integer("Maximum results to retrieve; deeper retrieval can increase the charge.", {
    minimum: 1,
  }),
  keyword: s.string(
    "Search text, up to 700 characters. Encode literal percent as %25 and plus as %2B because DataForSEO decodes them.",
    { minLength: 1, maxLength: 700 },
  ),
  language_code: s.string("Language code from the corresponding DataForSEO language directory.", {
    minLength: 1,
  }),
  language_name: s.string("Language name instead of its code.", { minLength: 1 }),
  location_code: s.integer("Location code from the corresponding DataForSEO location directory."),
  location_name: s.string("Full location name instead of its code.", { minLength: 1 }),
  location_coordinate: s.string(
    "Location as latitude,longitude,radius; use up to seven decimal places and a radius of at least 199.9 in the upstream coordinate format.",
    { minLength: 1 },
  ),
  sort_by: s.string("Upstream result sorting rule."),
  rating: s.integer("Only return Google Play reviews with this star rating.", {
    minimum: 1,
    maximum: 5,
  }),
  cid: s.string("Google business CID instead of keyword or placeId.", { minLength: 1 }),
  place_id: s.string("Google Maps place ID instead of keyword or cid.", { minLength: 1 }),
  url_path: s.string("Tripadvisor business page URL or path instead of keyword.", { minLength: 1 }),
  months: s.array(
    "Filter by months of the traveller's visit.",
    s.stringEnum("Visit month.", [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ]),
  ),
  ratings: s.array(
    "Filter Tripadvisor reviews by traveller rating.",
    s.stringEnum("Traveller rating.", ["excellent", "very_good", "average", "poor", "terrible"]),
  ),
  visit_type: s.array(
    "Filter Tripadvisor reviews by traveller type.",
    s.stringEnum("Traveller type.", ["families", "couples", "solo", "business", "friends"]),
  ),
  translate_reviews: s.boolean(
    "Translate Tripadvisor reviews into the language of urlPath; defaults to true upstream.",
  ),
  domain: s.string("Business domain from its Trustpilot review URL, such as example.com.", {
    minLength: 1,
  }),
  data_docid: s.string("Google Shopping SERP data identifier returned by a product search.", {
    minLength: 1,
  }),
  gid: s.string("Google Shopping global product identifier returned by a product search.", {
    minLength: 1,
  }),
  product_id: s.string("Google Shopping product identifier returned by a product search.", {
    minLength: 1,
  }),
  se_domain: s.string("Search engine domain; omitted values use the supplied location and language."),
  max_crawl_pages: s.integer("Maximum search result pages to crawl; complements depth and can increase charges.", {
    minimum: 1,
  }),
  price_max: s.integer("Maximum product price; overrides searchParam."),
  price_min: s.integer("Minimum product price; overrides searchParam."),
  search_param: s.string("Additional search URL parameters; explicit price and sorting fields take precedence."),
  url: s.string("Full search URL with its location and language parameters; can replace separate search fields.", {
    format: "uri",
  }),
  additional_specifications: s.looseObject(
    "Additional product URL parameters returned by Google Shopping Products; keys are preserved.",
  ),
  get_shops_on_google: s.boolean("Include shops supporting Buy on Google; doubles the task price when enabled."),
  pvf: s.string("Google Shopping product variant filter from the product URL."),
  device: s.stringEnum("Device type for search results.", ["desktop", "mobile", "tablet"]),
  os: s.stringEnum("Device operating system compatible with the selected device.", [
    "windows",
    "macos",
    "android",
    "ios",
  ]),
  get_website_url: s.boolean("Resolve direct Baidu result URLs; multiplies the task price by ten when enabled."),
  stop_crawl_on_match: s.array(
    "Stop crawling after a matching target, including its result; up to ten rules.",
    s.object(
      "One domain or wildcard matching rule.",
      {
        match_type: s.stringEnum("Target matching mode.", ["domain", "with_subdomains", "wildcard"]),
        match_value: s.string("Domain without protocol, or wildcard to match.", { minLength: 1 }),
      },
      { optional: [] },
    ),
    { minItems: 1, maxItems: 10 },
  ),
  employment_type: s.array(
    "Employment types to include.",
    s.stringEnum("Employment type; partime uses the upstream spelling.", [
      "fulltime",
      "partime",
      "contractor",
      "intern",
    ]),
  ),
  location_radius: s.string("Google Jobs search radius in kilometres, greater than zero and at most 300."),
  image_url: s.string("Public URL of the image to search for; downloaded by the upstream provider.", { format: "uri" }),
  browser_screen_height: s.integer("Browser screen height in pixels; requires calculateRectangles.", { minimum: 1 }),
  browser_screen_width: s.integer("Browser screen width in pixels; requires calculateRectangles.", {
    minimum: 1,
  }),
  browser_screen_resolution_ratio: s.integer("Browser screen resolution ratio; requires calculateRectangles.", {
    minimum: 1,
  }),
  calculate_rectangles: s.boolean("Include pixel positions of search results; doubles the task price when enabled."),
};

type Field = keyof typeof fields;

interface TaskFamily {
  name: string;
  path: string;
  label: string;
  fields: Field[];
  required: Field[];
  alternatives?: Field[][];
  depth?: number;
  maxPages?: number;
  sorts?: string[];
  collections?: string[];
  directUrl?: boolean;
}

const location: Field[] = ["location_code", "location_name"];
const language: Field[] = ["language_code", "language_name"];
const targeting: Field[] = [...location, ...language];
const geoTargeting: Field[] = [...targeting, "location_coordinate"];
const geoLocation: Field[] = [...location, "location_coordinate"];
const productIds: Field[] = ["gid", "product_id", "data_docid"];
const organic: Field[] = ["keyword", "depth", "device", "os", "max_crawl_pages", "stop_crawl_on_match"];

type AppStore = "apple" | "google";

const appStoreCollections: Record<AppStore, string[]> = {
  apple: ["top_free_ios", "top_paid_ios", "top_grossing_ios", "new_ios", "new_free_ios", "new_paid_ios"],
  google: [
    "featured",
    "topselling_paid",
    "topselling_free",
    "topselling_new_free",
    "topselling_new_paid",
    "topgrossing",
    "movers_shakers",
  ],
};

function createAppStoreTasks(store: AppStore): TaskFamily[] {
  const isApple = store === "apple";
  const label = isApple ? "App Store" : "Google Play";
  const listFields: Field[] = ["app_collection", "app_category", "depth", ...targeting];
  const reviewFields: Field[] = ["app_id", "depth", "sort_by", ...targeting];
  if (!isApple) {
    listFields.push("age_rating");
    reviewFields.push("rating");
  }
  return [
    {
      name: `${store}_app_info`,
      path: `app_data/${store}/app_info`,
      label: `${label} app details`,
      fields: ["app_id", ...targeting],
      required: ["app_id"],
      alternatives: [location, language],
    },
    {
      name: `${store}_app_list`,
      path: `app_data/${store}/app_list`,
      label: `${label} charts`,
      fields: listFields,
      required: ["app_collection"],
      alternatives: [location, language],
      depth: isApple ? 100 : 200,
      collections: appStoreCollections[store],
    },
    {
      name: `${store}_app_reviews`,
      path: `app_data/${store}/app_reviews`,
      label: `${label} app reviews`,
      fields: reviewFields,
      required: ["app_id"],
      alternatives: [location, language],
      depth: isApple ? 500 : 100000,
      sorts: isApple ? ["most_recent", "most_helpful"] : ["newest", "most_relevant"],
    },
    {
      name: `${store}_app_searches`,
      path: `app_data/${store}/app_searches`,
      label: `${label} app search`,
      fields: ["keyword", "depth", ...targeting],
      required: ["keyword"],
      alternatives: isApple ? [location, language] : [location],
      depth: isApple ? 700 : 200,
    },
  ];
}

const appStores: AppStore[] = ["apple", "google"];

const dataForSeoTaskFamilies: TaskFamily[] = [
  ...appStores.flatMap(createAppStoreTasks),
  {
    name: "google_extended_reviews",
    path: "business_data/google/extended_reviews",
    label: "extended Google business reviews",
    fields: ["cid", "place_id", "keyword", "depth", ...geoTargeting],
    required: [],
    alternatives: [["cid", "place_id", "keyword"], geoLocation, language],
    depth: 1000,
  },
  {
    name: "google_business_updates",
    path: "business_data/google/my_business_updates",
    label: "Google business updates",
    fields: ["keyword", "depth", ...geoTargeting],
    required: ["keyword"],
    alternatives: [geoLocation, language],
    depth: 4490,
  },
  {
    name: "google_business_reviews",
    path: "business_data/google/reviews",
    label: "Google business reviews",
    fields: ["cid", "place_id", "keyword", "depth", "sort_by", ...geoTargeting],
    required: [],
    alternatives: [["cid", "place_id", "keyword"], geoLocation, language],
    depth: 4490,
    sorts: ["newest", "highest_rating", "lowest_rating", "relevant"],
  },
  {
    name: "tripadvisor_reviews",
    path: "business_data/tripadvisor/reviews",
    label: "Tripadvisor reviews",
    fields: [
      "keyword",
      "url_path",
      "depth",
      "months",
      "ratings",
      "sort_by",
      "translate_reviews",
      "visit_type",
      ...targeting,
    ],
    required: [],
    alternatives: [
      ["keyword", "url_path"],
      [...location, "url_path"],
    ],
    depth: 4490,
    sorts: ["most_recent", "detailed_reviews"],
  },
  {
    name: "tripadvisor_search",
    path: "business_data/tripadvisor/search",
    label: "Tripadvisor business search",
    fields: ["keyword", "depth", ...location],
    required: ["keyword"],
    alternatives: [location],
    depth: 210,
  },
  {
    name: "trustpilot_reviews",
    path: "business_data/trustpilot/reviews",
    label: "Trustpilot reviews",
    fields: ["domain", "depth", "sort_by"],
    required: ["domain"],
    depth: 200,
    sorts: ["recency", "relevance"],
  },
  {
    name: "trustpilot_search",
    path: "business_data/trustpilot/search",
    label: "Trustpilot business search",
    fields: ["keyword", "depth"],
    required: ["keyword"],
    depth: 140,
  },
  {
    name: "google_shopping_product_info",
    path: "merchant/google/product_info",
    label: "Google Shopping product details",
    fields: [...productIds, ...geoTargeting, "se_domain"],
    required: [],
    alternatives: [productIds, geoLocation, language],
  },
  {
    name: "google_shopping_products",
    path: "merchant/google/products",
    label: "Google Shopping product search",
    fields: [
      "keyword",
      "depth",
      ...geoTargeting,
      "max_crawl_pages",
      "price_max",
      "price_min",
      "se_domain",
      "search_param",
      "sort_by",
      "url",
    ],
    required: ["keyword"],
    alternatives: [geoLocation, language],
    depth: 200,
    maxPages: 7,
    sorts: ["review_score", "price_low_to_high", "price_high_to_low"],
    directUrl: true,
  },
  {
    name: "google_shopping_reviews",
    path: "merchant/google/reviews",
    label: "Google Shopping product reviews",
    fields: [...productIds, "depth", ...geoTargeting, "se_domain"],
    required: ["gid"],
    alternatives: [geoLocation, language],
    depth: 8000,
  },
  {
    name: "google_shopping_sellers",
    path: "merchant/google/sellers",
    label: "Google Shopping sellers",
    fields: [
      ...productIds,
      "additional_specifications",
      "depth",
      "get_shops_on_google",
      "pvf",
      ...geoTargeting,
      "se_domain",
    ],
    required: [],
    alternatives: [productIds, geoLocation, language],
    depth: 200,
  },
  {
    name: "baidu_organic",
    path: "serp/baidu/organic",
    label: "Baidu organic search",
    fields: [...organic, ...geoTargeting, "get_website_url"],
    required: ["keyword"],
    alternatives: [geoLocation, language],
    depth: 700,
    maxPages: 100,
  },
  {
    name: "google_jobs",
    path: "serp/google/jobs",
    label: "Google Jobs search",
    fields: ["keyword", "depth", "employment_type", "location_radius", ...targeting],
    required: ["keyword"],
    alternatives: [location, language],
    depth: 200,
  },
  {
    name: "google_search_by_image",
    path: "serp/google/search_by_image",
    label: "Google reverse image search",
    fields: [
      "image_url",
      ...geoTargeting,
      "browser_screen_height",
      "browser_screen_width",
      "browser_screen_resolution_ratio",
      "calculate_rectangles",
      "max_crawl_pages",
      "se_domain",
      "search_param",
    ],
    required: ["image_url"],
    alternatives: [geoLocation, language],
    maxPages: 100,
  },
  {
    name: "naver_organic",
    path: "serp/naver/organic",
    label: "Naver organic search",
    fields: [...organic, "se_domain", "search_param", "url"],
    required: ["keyword"],
    depth: 700,
    maxPages: 100,
    directUrl: true,
  },
  {
    name: "seznam_organic",
    path: "serp/seznam/organic",
    label: "Seznam organic search",
    fields: [...organic, ...targeting, "calculate_rectangles", "se_domain", "search_param", "url"],
    required: ["keyword"],
    alternatives: [location, language],
    depth: 500,
    maxPages: 10,
    directUrl: true,
  },
];

function inputName(field: string) {
  const [first, ...parts] = field.split("_");
  return first + parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function taskFieldSchema(family: TaskFamily, field: Field): JsonSchema {
  const schema: JsonSchema = { ...fields[field] };
  if (field === "depth" && family.depth !== undefined) schema.maximum = family.depth;
  if (field === "max_crawl_pages" && family.maxPages !== undefined) schema.maximum = family.maxPages;
  if (field === "sort_by" && family.sorts) schema.enum = family.sorts;
  if (field === "app_collection" && family.collections) schema.enum = family.collections;
  if (field === "device" && family.name !== "baidu_organic") schema.enum = ["desktop", "mobile"];
  if (field === "location_coordinate" && ["baidu_organic", "google_search_by_image"].includes(family.name)) {
    schema.description =
      "Location as latitude,longitude,radius; radius is from 199.9 to 199999 in the upstream coordinate format. Baidu uses the nearest supported city.";
  }
  if (family.name === "tripadvisor_reviews" && language.includes(field)) {
    schema.description = `${String(schema.description)} Specifying a language costs one extra request.`;
  }
  if (family.name === "google_extended_reviews" && ["keyword", "cid", "place_id"].includes(field)) {
    const multiplier = field === "keyword" ? "three" : "two";
    schema.description = `${String(schema.description)} Extended reviews cost ${multiplier} times the standard Google Reviews rate with this identifier.`;
  }
  if (family.name === "google_shopping_products" && field === "depth") {
    schema.description =
      "Maximum product results: 120 normally, or 200 with the udm=28 search parameter. Deeper retrieval increases the charge.";
  }
  return schema;
}

function taskInput(family: TaskFamily) {
  const properties: Record<string, JsonSchema> = {};
  const inputFields: Field[] = [...family.fields, "priority", "tag"];
  for (const field of inputFields) {
    properties[inputName(field)] = taskFieldSchema(family, field);
  }
  const constraints = {
    required: family.required.map(inputName),
    allOf: family.alternatives?.map((group) => ({
      anyOf: group.map((field) => ({ required: [inputName(field)] })),
    })),
  };
  const schema = s.object(`Submit one ${family.label} task. Poll its task ID for the structured result.`, properties, {
    required: [],
  });
  if (family.directUrl) {
    return { ...schema, anyOf: [{ required: ["url"] }, constraints] };
  }
  return { ...schema, ...constraints };
}

const taskId = s.string("Task ID returned by the matching submission action; keep the same connection.", {
  minLength: 1,
});

const taskOutput = s.object(
  "The DataForSEO task state and complete response.",
  {
    taskId,
    status: s.stringEnum("Normalized task state.", ["running", "completed", "failed"]),
    output: s.unknown("The upstream task result, including new fields; null while pending or on failure."),
    raw: s.looseObject("Complete DataForSEO response, including task status codes, messages and cost."),
  },
  { optional: [] },
);

export const dataForSeoTaskActions: ActionDefinition[] = dataForSeoTaskFamilies.flatMap((family) => [
  defineProviderAction("aisa", {
    name: `submit_dataforseo_${family.name}`,
    operationType: "write",
    requiredScopes: [],
    description: `Start a DataForSEO ${family.label} task and poll its task ID for results. Higher depth or priority may increase the charge.`,
    inputSchema: taskInput(family),
    outputSchema: taskOutput,
    asyncLifecycle: {
      startActionId: "aisa." + `submit_dataforseo_${family.name}`,
      statusActionId: `aisa.get_dataforseo_${family.name}`,
    },
  }),
  defineProviderAction("aisa", {
    name: `get_dataforseo_${family.name}`,
    operationType: "read",
    requiredScopes: [],
    description: `Read the state and structured results of a DataForSEO ${family.label} task. Failed tasks retain their upstream error details in raw.`,
    inputSchema: s.object(
      "Identify a task returned by the matching submission action.",
      {
        taskId,
      },
      { optional: [] },
    ),
    outputSchema: taskOutput,
  }),
]);

export const dataForSeoTaskRoutes: Record<string, AisaActionRoute> = {};

for (const family of dataForSeoTaskFamilies) {
  const path = `/apis/v1/dataforseo/${family.path}`;
  dataForSeoTaskRoutes[`submit_dataforseo_${family.name}`] = {
    method: "POST",
    path: `${path}/task_post`,
    query: {},
    bodyArray: true,
    body: Object.fromEntries([...family.fields, "priority", "tag"].map((field) => [inputName(field), field])),
    dataForSeoTask: "submit",
  };
  const resultFormat = family.path.startsWith("business_data/") ? "" : "advanced/";
  dataForSeoTaskRoutes[`get_dataforseo_${family.name}`] = {
    method: "GET",
    path: `${path}/task_get/${resultFormat}{id}`,
    query: {},
    pathParams: { id: "taskId" },
    dataForSeoTask: "get",
  };
}
