import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
interface TendataEndpoint {
  method: "GET" | "POST";
  path: string;
  trade: boolean;
}
export const tendataEndpoints: Record<string, TendataEndpoint> = {
  count_trades: { method: "POST", path: "/trade/row-count", trade: true },
  list_trades: { method: "POST", path: "/trade", trade: true },
  count_specific_trades: { method: "POST", path: "/trade/row-count/specific", trade: true },
  list_specific_trades: { method: "POST", path: "/trade/specific", trade: true },
  get_importer_stats: { method: "POST", path: "/trade/importers-stat", trade: true },
  get_exporter_stats: { method: "POST", path: "/trade/exporters-stat", trade: true },
  list_importer_names: { method: "POST", path: "/trade/importers-name", trade: true },
  list_exporter_names: { method: "POST", path: "/trade/exporters-name", trade: true },
  list_importers: { method: "POST", path: "/trade/importers", trade: true },
  list_exporters: { method: "POST", path: "/trade/exporters", trade: true },
  analyze_origins: { method: "POST", path: "/trade/country-of-origin-code", trade: true },
  analyze_destinations: { method: "POST", path: "/trade/country-of-destination-code", trade: true },
  analyze_trade_trends: { method: "POST", path: "/trade/volume-of-trade", trade: true },
  analyze_hs_codes: { method: "POST", path: "/trade/hs-code", trade: true },
  list_companies: { method: "GET", path: "/company/list", trade: false },
  get_company: { method: "GET", path: "/company", trade: false },
  list_contacts: { method: "GET", path: "/contact", trade: false },
  get_contact_social_links: { method: "GET", path: "/contact/{mailsouId}/social", trade: false },
  get_account: { method: "GET", path: "/account", trade: false },
  list_charge_records: { method: "POST", path: "/billing/charges/query", trade: false },
};
const conditionFields = [
  "productDesc",
  "hsCode",
  "productTag",
  "importer",
  "exporter",
  "countryOfOriginCode",
  "countryOfDestinationCode",
  "portOfDeparture",
  "portOfArrival",
  "transportType",
  "quantityUnit",
] as const;
const rangeFields = ["weight", "quantity", "sumOfUSD", "weightUnitPriceUSD", "quantityUnitPriceUSD"] as const;
const conditionGroups = s.array(
  "Alternative condition groups joined by OR. Conditions within each group use AND. Each group needs a CONTAINS condition; omit operator for CONTAINS. At most 25 conditions across all groups. Do not combine with regular text or range filters; global origin and destination filters remain usable.",
  s.object(
    "A group of conditions joined by AND.",
    {
      conditions: s.array(
        "Text or code conditions joined by AND.",
        s.object(
          "A text or code condition.",
          {
            field: s.stringEnum(
              "The field to match; availability depends on the selected data source.",
              conditionFields,
            ),
            operator: s.stringEnum("Include or exclude matching records. Defaults to CONTAINS.", [
              "CONTAINS",
              "NOT_CONTAINS",
            ]),
            values: s.array(
              "Matching values joined by OR; country fields use three-letter codes.",
              s.nonEmptyString("A nonempty matching value."),
              { minItems: 1 },
            ),
            matchMode: s.stringEnum(
              "Keyword matching mode. EXACT for importer or exporter produces no matches for that group.",
              ["", "FUZZY_SINGLE", "EXACT"],
            ),
          },
          {
            optional: ["operator", "matchMode"],
          },
        ),
        { minItems: 1, maxItems: 10 },
      ),
      rangeConditions: s.array(
        "Numeric ranges joined by AND with this group's conditions.",
        s.requiredObject("An inclusive numeric range.", {
          field: s.stringEnum("The numeric field to constrain.", rangeFields),
          min: s.number("Inclusive lower bound; must not exceed max."),
          max: s.number("Inclusive upper bound; must not be below min."),
        }),
      ),
    },
    {
      optional: ["rangeConditions"],
    },
  ),
  { minItems: 1, maxItems: 5 },
);
function range(description: string) {
  return s.array(
    description,
    s.union(
      [
        s.nonEmptyString("A numeric bound, serialized as a string for Tendata."),
        s.number("A numeric bound, serialized as a string for Tendata."),
      ],
      { description: "A numeric bound supplied as text or a number." },
    ),
    { minItems: 2, maxItems: 2 },
  );
}
const tradeFilters = {
  importer: s.string(
    "Importer names, at least two characters each. Separate multiple names with semicolons; batches of at most 20 are recommended.",
    { minLength: 2 },
  ),
  exporter: s.string(
    "Exporter names, at least two characters each. Separate multiple names with semicolons; batches of at most 20 are recommended.",
    { minLength: 2 },
  ),
  containProducer: s.boolean("Include producers when matching companies; omitted means false."),
  productDesc: s.nonEmptyString(
    "Product description keywords separated by semicolons; batches of at most 20 are recommended.",
  ),
  hsCode: s.string(
    "HS codes or prefixes of at least two digits, separated by semicolons; batches of at most 20 are recommended.",
    { minLength: 2 },
  ),
  countryOfOriginCode: s.nonEmptyString(
    "Origin country three-letter codes separated by semicolons, such as CHN;USA. Applies globally when conditionGroups is used.",
  ),
  countryOfDestinationCode: s.nonEmptyString(
    "Destination country three-letter codes separated by semicolons, such as USA;CHN. Applies globally when conditionGroups is used.",
  ),
  portOfDeparture: s.nonEmptyString("Departure port names in English, separated by semicolons."),
  portOfArrival: s.nonEmptyString("Arrival port names in English, separated by semicolons."),
  transportType: s.nonEmptyString("Transport mode codes from the data source, separated by semicolons."),
  weight: range("Weight range in kilograms as [minimum, maximum]; both bounds are required."),
  quantity: range("Quantity range as [minimum, maximum]; both bounds are required."),
  quantityUnit: s.nonEmptyString("Quantity unit codes from Tendata's unit table, separated by semicolons."),
  sumOfUSD: range("Total value in USD as [minimum, maximum]; both bounds are required."),
  weightUnitPriceUSD: range("USD price per kilogram as [minimum, maximum]; both bounds are required."),
  quantityUnitPriceUSD: range("USD price per quantity unit as [minimum, maximum]; both bounds are required."),
  filterBlankFields: s.array(
    "Exclude records with blank company names in the selected fields.",
    s.stringEnum("Company field to filter.", ["importer", "exporter"]),
  ),
  filterLogisticFields: s.array(
    "Exclude logistics companies in the selected fields.",
    s.stringEnum("Company field to filter.", ["importer", "exporter"]),
  ),
  searchMode: s.stringEnum("Product-description fuzzy matching. Empty or omitted disables FUZZY_SINGLE.", [
    "",
    "FUZZY_SINGLE",
  ]),
  conditionGroups,
};
interface TradeInputOptions {
  paginated?: boolean;
  specific?: boolean;
  excludeDatabases?: boolean;
  sort?: boolean;
  period?: boolean;
}
function tradeInput(options: TradeInputOptions = {}) {
  const properties: Record<string, JsonSchema> = {
    catalog: s.stringEnum(
      "Trade direction. The all option combines imports and exports without deduplication.",
      options.specific ? ["imports", "exports"] : ["imports", "exports", "all"],
    ),
    startDate: s.date(
      "Start date in YYYY-MM-DD. Date difference is limited to 365 days for all, or 1,096 days for one direction.",
    ),
    endDate: s.date("End date in YYYY-MM-DD, on or after startDate."),
    ...tradeFilters,
  };
  const required = ["catalog", "startDate", "endDate"];
  if (options.paginated) {
    properties.pageNo = s.integer("One-based page number. pageNo multiplied by pageSize must not exceed 10,000.", {
      minimum: 1,
      maximum: 1000,
      default: 1,
    });
    properties.pageSize = s.integer("Records per page. pageNo multiplied by pageSize must not exceed 10,000.", {
      minimum: 1,
      maximum: 10000,
      default: 10,
    });
  }
  if (options.specific) {
    properties.country = s.nonEmptyString(
      "Authorized data source codes separated by commas, such as america,argentina. These are not ISO country codes; mirror sources ending in _mir are unsupported.",
    );
    required.push("country");
  } else {
    properties.optimizationModel = s.boolean("Use Tendata's optimized data source selection.");
  }
  if (options.excludeDatabases) {
    properties.excludeDatabases = s.array(
      "Data source codes to exclude from the query.",
      s.nonEmptyString("A data source code."),
    );
  }
  if (options.sort) {
    properties.sortField = s.stringEnum("Metric used to sort company summaries.", ["weight", "sumOfUSD", "tradeCount"]);
    properties.sortOrder = s.stringEnum("Ascending or descending order.", ["ASC", "DESC"]);
  }
  if (options.period) {
    properties.periodUnit = s.stringEnum("Time period used to group trade activity.", ["months", "quarters", "years"]);
  }
  return s.requireAnyProperty(
    s.object(
      "Trade query parameters. Supply hsCode, productDesc, importer, exporter, or conditionGroups. Each call returns only one page when paginated.",
      properties,
      {
        optional: [],
        required,
      },
    ),
    ["hsCode", "productDesc", "importer", "exporter", "conditionGroups"],
  );
}
function envelope(data: JsonSchema) {
  return s.object(
    "Tendata response envelope, retaining upstream fields and request trace information.",
    {
      data,
      success: s.boolean("Whether Tendata accepted the business request."),
      code: {
        description: "Upstream business code; documented responses may use text, numbers, or null.",
        type: ["string", "number", "null"],
      },
      msg: s.nullable(s.string("Upstream response message.")),
      traceId: s.nullable(s.string("Request trace identifier for support and charge reconciliation.")),
    },
    {
      additionalProperties: true,
      required: ["data", "success"],
    },
  );
}
function page(item: JsonSchema, extra: Record<string, JsonSchema> = {}) {
  return s.object(
    "One page of matching records.",
    {
      page: s.integer("Current one-based page number."),
      size: s.integer("Page size."),
      total: s.number("Total matching records reported by Tendata."),
      content: s.array("Records returned on this page.", item),
      ...extra,
    },
    {
      additionalProperties: true,
      required: ["page", "size", "total", "content"],
    },
  );
}
const tradeRecord = s.looseObject("A trade record. Fields depend on the data source and can be absent or null.", {
  id: s.nullable(s.string("Trade record identifier.")),
  date: s.nullable(s.string("Trade date; records are ordered by descending date.")),
  catalog: s.nullable(s.string("Trade direction for this record.")),
  importer: s.nullable(s.string("Importer name.")),
  exporter: s.nullable(s.string("Exporter name.")),
  producer: s.nullable(s.string("Producer name.")),
  countryOfOrigin: s.nullable(s.string("Origin country name.")),
  countryOfOriginCode: s.nullable(s.string("Origin country three-letter code.")),
  countryOfDestination: s.nullable(s.string("Destination country name.")),
  countryOfDestinationCode: s.nullable(s.string("Destination country three-letter code.")),
  portOfDeparture: s.nullable(s.string("Departure port.")),
  portOfArrival: s.nullable(s.string("Arrival port.")),
  transportType: s.nullable(s.string("Transport mode.")),
  quantityUnit: s.nullable(s.string("Quantity unit.")),
  declarationNo: s.nullable(s.string("Customs declaration number.")),
  billNo: s.nullable(s.string("Bill of lading number.")),
  database: s.nullable(s.string("Data source code.")),
  importerOriginal: s.nullable(s.string("Importer name in its original script.")),
  exporterOriginal: s.nullable(s.string("Exporter name in its original script.")),
  qtyUnit2: s.nullable(s.string("Secondary quantity unit, available for Chinese data sources.")),
  placeOfDestinationCn: s.nullable(s.string("Importer location, available for Chinese data sources.")),
  placeOfOriginCn: s.nullable(s.string("Exporter location, available for Chinese data sources.")),
  customsRegime: s.nullable(s.string("Customs regime, available for Chinese data sources.")),
  quantity: s.nullable(s.number("Quantity.")),
  quantityUnitPriceUsd: s.nullable(s.number("USD price per quantity unit.")),
  weight: s.nullable(s.number("Weight in kilograms.")),
  weightUnitPriceUsd: s.nullable(s.number("USD price per kilogram.")),
  sumOfUsd: s.nullable(s.number("Total value in USD.")),
  qty2: s.nullable(s.number("Secondary quantity, available for Chinese data sources.")),
  qtyUnitPrice2: s.nullable(s.number("Secondary quantity unit price, available for Chinese data sources.")),
  goodsDesc: s.nullable(
    s.array("Product descriptions; the final entry can be shipping marks.", s.string("A returned text value.")),
  ),
  hsCode: s.nullable(s.array("HS codes.", s.string("A returned text value."))),
  productTag: s.nullable(s.array("Product tags.", s.string("A returned text value."))),
});
const tradePage = page(tradeRecord, {
  stats: s.nullable(s.looseObject("Reserved statistics field; currently null.")),
});
const tradeCount = s.object(
  "Count of matching trade records.",
  { total: s.number("Total matching trade records.") },
  {
    additionalProperties: true,
    required: ["total"],
  },
);
const summaryMetrics = {
  weight: s.nullable(s.number("Total weight in kilograms.")),
  quantity: s.nullable(s.number("Total quantity.")),
  sumOfUSD: s.nullable(s.number("Total value in USD.")),
  weightAvgPrice: s.nullable(s.number("Average USD price per kilogram.")),
  quantityAvgPrice: s.nullable(s.number("Average USD price per quantity unit.")),
  tradeCount: s.nullable(s.number("Number of trades.")),
};
const companyStats = s.looseObject("Aggregate company counts, trade volume, and prices.", {
  companyCount: s.nullable(s.number("Number of matching companies.")),
  ...summaryMetrics,
});
const companyNamePage = page(
  s.looseObject("A matching company name.", { name: s.nullable(s.string("Company name.")) }),
);
const companySummaryPage = page(
  s.looseObject("A company with aggregated trade metrics.", {
    name: s.nullable(s.string("Company name.")),
    country: s.nullable(s.string("Company country.")),
    ...summaryMetrics,
  }),
);
const countrySummaryPage = page(
  s.looseObject("Trade metrics grouped by country.", {
    countryCode: s.nullable(s.string("Country or region code.")),
    ...summaryMetrics,
    amountSharePct: s.nullable(s.number("Share of the total trade amount as returned by Tendata.")),
  }),
);
const trendPage = page(
  s.looseObject("Trade metrics for one time period.", {
    date: s.nullable(s.string("Time period identifier, such as 2025-01.")),
    ...summaryMetrics,
  }),
);
const hsCodePage = page(
  s.looseObject("Trade metrics grouped by HS code.", {
    hsCode: s.nullable(s.string("HS code.")),
    hsDescriptionCn: s.nullable(s.string("Chinese HS code description.")),
    hsDescriptionEn: s.nullable(s.string("English HS code description.")),
    ...summaryMetrics,
    amountSharePct: s.nullable(s.number("Share of the total trade amount as returned by Tendata.")),
  }),
);
const companyRecord = s.looseObject(
  "Company profile. A null id indicates that no company profile was found; other fields can still contain supplemental information.",
  {
    id: s.nullable(s.string("Company identifier; null means no profile match.")),
    name: s.nullable(s.string("Company name.")),
    localName: s.nullable(s.string("Company name in the local language.")),
    overview: s.nullable(s.string("Company overview.")),
    website: s.nullable(s.string("Company website.")),
    country: s.nullable(s.string("Company country.")),
    lei: s.nullable(s.string("Legal entity identifier.")),
    taxNo: s.nullable(s.string("Tax number.")),
    europeanVatNo: s.nullable(s.string("European VAT number.")),
    status: s.nullable(s.string("Operating status.")),
    incorporationDate: s.nullable(s.string("Incorporation date.")),
    logistic: s.nullable(s.string("Logistics company indicator.")),
    businessDesc: s.nullable(s.string("Business description.")),
    industry: s.nullable(s.string("Industry.")),
    industryDesc: s.nullable(s.string("Industry description.")),
    businessAddress: s.nullable(s.string("Business address.")),
    registerAddress: s.nullable(s.string("Registered address.")),
    businessLine: s.nullable(s.string("Primary business line.")),
    legalRepresentative: s.nullable(s.string("Legal representative.")),
    registeredCapital: s.nullable(s.string("Registered capital.")),
    paidUpCapital: s.nullable(s.string("Paid-up capital.")),
    countryCode3: s.nullable(s.string("Company country three-letter code; verify it matches the intended country.")),
    companyCodes: s.nullable(s.array("Company registration codes.", s.string("A company code."))),
    contactMethods: s.nullable(
      s.array(
        "Company contact methods.",
        s.looseObject("A company contact method.", {
          type: s.nullable(s.string("Contact method type, such as TEL or MAIL.")),
          value: s.nullable(s.string("Contact method value.")),
        }),
      ),
    ),
    tradeStats: s.nullable(
      s.array(
        "Company trade statistics.",
        s.looseObject("Trade statistics for one company role.", {
          type: s.nullable(s.string("Company role: importer or exporter.")),
          totalQtyUnitPriceAvg: s.nullable(s.number("Average USD quantity unit price.")),
          totalWeightSum: s.nullable(s.number("Total weight in kilograms.")),
          totalQuantitySum: s.nullable(s.number("Total quantity.")),
          totalWeightUnitPriceAvg: s.nullable(s.number("Average USD price per kilogram.")),
          totalTradesSum: s.nullable(s.number("Total number of trades.")),
          totalSumOfMoneySum: s.nullable(s.number("Total value in USD.")),
        }),
      ),
    ),
  },
);
const contactRecord = s.looseObject(
  "A matching contact. Verify companyName before using the contact; name searches can match other companies.",
  {
    id: s.nullable(s.string("Contact identifier.")),
    mailsouId: s.nullable(s.string("Contact identifier used to retrieve social links.")),
    name: s.nullable(s.string("Contact name.")),
    email: s.nullable(s.string("Contact email address.")),
    position: s.nullable(s.string("Job position.")),
    positionTag: s.nullable(s.string("Position category.")),
    location: s.nullable(s.string("Contact location.")),
    companyName: s.nullable(s.string("Matched company name.")),
    industry: s.nullable(s.string("Industry.")),
    status: s.nullable(s.string("Email-to-employee match confidence, or an empty string when unavailable.")),
    socials: s.nullable(
      s.array(
        "Available social platforms; URLs are null until social links are queried.",
        s.looseObject("A social platform.", {
          type: s.nullable(s.string("Social platform name.")),
          url: s.nullable(s.string("Social URL; this endpoint normally returns null.")),
        }),
      ),
    ),
    personalEmail: s.nullable(
      s.array(
        "Personal email addresses.",
        s.looseObject("A personal email address and verification status.", {
          email: s.nullable(s.string("Personal email address.")),
          emailVerify: s.nullable(s.string("Email verification status.")),
        }),
      ),
    ),
  },
);
const chargePage = s.object(
  "One cursor-based page of monthly charge records.",
  {
    billingMonth: s.string("Requested billing month in YYYY-MM format."),
    hasMore: s.boolean("Whether another page is available."),
    nextCursor: s.nullable(s.string("Complete cursor to pass unchanged to the next call, or null on the final page.")),
    list: s.array(
      "Charge records returned on this page.",
      s.looseObject("A recorded charge. Free requests and calls with no charged results do not appear here.", {
        recordedAt: s.string("Charge recording time as a UTC ISO-8601 timestamp."),
        interfacePath: s.nullable(s.string("API path; null for unresolved historical interfaces.")),
        interfaceName: s.nullable(s.string("Display name of the API; not a filter value.")),
        interfaceResolved: s.boolean("Whether the historical interface could be resolved."),
        deductPoints: s.integer("Points deducted by this request."),
        billingQuantity: s.nullable(
          s.integer("Quantity used for billing; not a guaranteed count of returned results."),
        ),
        requestTraceId: s.nullable(s.string("Original request trace identifier; may be absent in historical records.")),
      }),
    ),
  },
  {
    additionalProperties: true,
    required: ["billingMonth", "hasMore", "nextCursor", "list"],
  },
);
function action(name: string, description: string, inputSchema: JsonSchema, data: JsonSchema) {
  return defineProviderAction("tendata", {
    name,
    description,
    operationType: "read",
    requiredScopes: [],
    inputSchema,
    outputSchema: envelope(data),
  });
}
export const tendataActions: ActionDefinition[] = [
  action(
    "count_trades",
    "Count matching trade records before fetching paid details. This endpoint does not deduct points but consumes request quota.",
    tradeInput(),
    tradeCount,
  ),
  action(
    "list_trades",
    "Retrieve one page of trade records matching regular filters or advanced condition groups. Returned records may deduct account points.",
    tradeInput({ paginated: true, excludeDatabases: true }),
    tradePage,
  ),
  action(
    "count_specific_trades",
    "Count matching trade records in specified authorized data sources without deducting points.",
    tradeInput({ specific: true }),
    tradeCount,
  ),
  action(
    "list_specific_trades",
    "Retrieve one page of trade records from specified authorized data sources. Use data source codes, not country codes.",
    tradeInput({ paginated: true, specific: true, excludeDatabases: true }),
    tradePage,
  ),
  action(
    "get_importer_stats",
    "Summarize importer counts, trade volume, values, and average prices for a trade query.",
    tradeInput(),
    companyStats,
  ),
  action(
    "get_exporter_stats",
    "Summarize exporter counts, trade volume, values, and average prices for a trade query.",
    tradeInput(),
    companyStats,
  ),
  action(
    "list_importer_names",
    "List one page of importer names matching a trade query.",
    tradeInput({ paginated: true }),
    companyNamePage,
  ),
  action(
    "list_exporter_names",
    "List one page of exporter names matching a trade query.",
    tradeInput({ paginated: true }),
    companyNamePage,
  ),
  action(
    "list_importers",
    "List one page of importers with trade volume and price metrics, optionally sorted by a metric.",
    tradeInput({ paginated: true, sort: true }),
    companySummaryPage,
  ),
  action(
    "list_exporters",
    "List one page of exporters with trade volume and price metrics, optionally sorted by a metric.",
    tradeInput({ paginated: true, sort: true }),
    companySummaryPage,
  ),
  action(
    "analyze_origins",
    "Analyze matching trade volume, prices, and amount shares by country of origin.",
    tradeInput({ paginated: true }),
    countrySummaryPage,
  ),
  action(
    "analyze_destinations",
    "Analyze matching trade volume, prices, and amount shares by destination country.",
    tradeInput({ paginated: true }),
    countrySummaryPage,
  ),
  action(
    "analyze_trade_trends",
    "Analyze matching trade activity by month, quarter, or year.",
    tradeInput({ paginated: true, period: true }),
    trendPage,
  ),
  action(
    "analyze_hs_codes",
    "Analyze matching trade volume, prices, and amount shares by HS code.",
    tradeInput({ paginated: true }),
    hsCodePage,
  ),
  action(
    "list_companies",
    "Search one page of company names and country codes to identify the company to query. This endpoint does not deduct points.",
    s.object(
      "Company directory query.",
      {
        name: s.nonEmptyString("Company name keywords."),
        countryCodes: s.nonEmptyString("Three-letter country codes separated by commas, such as USA,TUR,ECU."),
        pageNo: s.integer("One-based page number.", { minimum: 1, default: 1 }),
        pageSize: s.integer("Companies per page, at most 20.", {
          minimum: 1,
          maximum: 20,
          default: 20,
        }),
      },
      {
        optional: [],
        required: ["name"],
      },
    ),
    page(
      s.looseObject("A company directory match.", {
        id: s.nullable(s.string("Company identifier.")),
        name: s.nullable(s.string("Company name.")),
        country: s.nullable(s.string("Company country three-letter code.")),
      }),
    ),
  ),
  action(
    "get_company",
    "Retrieve a company profile, contact methods, and trade statistics. Supply countryCode3 when known to disambiguate names.",
    s.object(
      "Company profile query.",
      {
        name: s.nonEmptyString("Company name."),
        companyId: s.nonEmptyString("Company identifier, when available from company search."),
        countryCode3: s.string("Company country three-letter code; recommended to avoid cross-country matches.", {
          minLength: 3,
          maxLength: 3,
        }),
      },
      {
        optional: ["companyId", "countryCode3"],
      },
    ),
    companyRecord,
  ),
  action(
    "list_contacts",
    "Search one page of contacts associated with a company name. Results are capped at 200 per query; verify each returned companyName.",
    s.object(
      "Contact query.",
      {
        companyName: s.nonEmptyString("Company name to search."),
        country: s.string("Country three-letter code from Tendata's country table.", { minLength: 3, maxLength: 3 }),
        positionTag: s.nonEmptyString(
          "Position tags separated by commas: EXECUTIVE, SALE, PURCHASING, TECHNOLGY, FINANCE, PRODUCER, SHAREHOLDER, MANAGEMENT, or UNSPECIFIED. Multiple tags use OR; semicolons are not separators.",
        ),
        pageNo: s.integer("One-based page number.", { minimum: 1, default: 1 }),
        pageSize: s.integer("Contacts per page.", { minimum: 1, default: 10 }),
      },
      {
        optional: [],
        required: ["companyName"],
      },
    ),
    s.object(
      "One page of matching contacts.",
      {
        total: s.number("Matching count, capped at 200; a value of 200 is not the company's full contact count."),
        pageNo: s.integer("Current one-based page number."),
        pageSize: s.integer("Page size."),
        list: s.array("Contacts returned on this page.", contactRecord),
      },
      {
        additionalProperties: true,
        required: ["total", "pageNo", "pageSize", "list"],
      },
    ),
  ),
  action(
    "get_contact_social_links",
    "Retrieve social profile links using the mailsouId returned by contact search. This endpoint does not deduct points.",
    s.requiredObject("Contact social link query.", {
      mailsouId: s.nonEmptyString("The mailsouId from a contact record, not its id field."),
    }),
    s.array(
      "Social profile links returned for the contact.",
      s.looseObject("A social profile link.", {
        type: s.nullable(s.string("Social platform name.")),
        value: s.nullable(s.string("Social profile URL; may be empty when unavailable.")),
      }),
    ),
  ),
  action(
    "get_account",
    "Retrieve account points balance and expiry. This endpoint does not report remaining daily request quota.",
    s.requiredObject("No input parameters.", {}),
    s.object(
      "Account balance and validity.",
      {
        balance: s.number("Remaining account points."),
        expiresIn: s.string("Account expiry date and time as returned by Tendata, not a duration."),
      },
      {
        additionalProperties: true,
        required: ["balance", "expiresIn"],
      },
    ),
  ),
  action(
    "list_charge_records",
    "Query one page of monthly charge records for reconciliation. Charges normally appear within five minutes; this query does not deduct points.",
    s.object(
      "Monthly charge query.",
      {
        month: s.string("Natural month in YYYY-MM format.", {
          pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$",
        }),
        interfacePath: s.nonEmptyString("Optional API path filter, such as /v2/trade."),
        limit: s.integer("Maximum records to return, from 1 to 500.", {
          minimum: 1,
          maximum: 500,
          default: 100,
        }),
        cursor: s.nullable(
          s.nonEmptyString("Complete nextCursor from the previous response. Omit or use null for the first page."),
        ),
      },
      {
        optional: [],
        required: ["month"],
      },
    ),
    chargePage,
  ),
];
