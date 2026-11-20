import type { DefillamaDefinition } from "./actions.ts";

import { s } from "../../core/json-schema.ts";
import {
  chainsSchema,
  linkedProtocolsSchema,
  githubSchema,
  childProtocolsSchema,
  protocolEntrySchema,
  timeSeriesResponseSchema,
  unstructuredChartResponseSchema,
  allChainsSchema,
  totalDataChartSchema,
  totalDataChartBreakdownSchema,
  dataTypeSchema,
  chartBreakdownValuesSchema,
  metricSchema,
  categorySchema,
} from "./shared-schemas.ts";
export const dimensionsDefinitions: DefillamaDefinition[] = [
  {
    name: "get_overview_derivatives",
    description:
      "Lists all derivatives along summaries of their volumes filtering by chain.  Requires an API plan key.",
    route: {
      path: "/api/overview/derivatives",
      parameters: [
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
      ],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_derivatives.",
      {
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
      },
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        totalDataChart: s.array(
          "Total data chart with timestamps and volumes",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [s.integer("Timestamp"), s.number("Volume value")],
          }),
        ),
        totalDataChartBreakdown: s.array(
          "Total data chart breakdown by protocol",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [
              s.integer("Timestamp"),
              s.object("Protocol breakdown", {}, { required: [], additionalProperties: true }),
            ],
          }),
        ),
        breakdown24h: s.nullable(s.object("24 hour breakdown", {}, { required: [], additionalProperties: true })),
        breakdown30d: s.nullable(s.object("30 day breakdown", {}, { required: [], additionalProperties: true })),
        chain: s.nullable(s.string("Chain filter")),
        allChains: s.array("All available chains", s.string("Result entry returned by DeFiLlama.")),
        total24h: s.number("Total 24 hour volume"),
        total48hto24h: s.number("Total 48h to 24h volume"),
        total7d: s.number("Total 7 day volume"),
        total14dto7d: s.number("Total 14d to 7d volume"),
        total60dto30d: s.number("Total 60d to 30d volume"),
        total30d: s.number("Total 30 day volume"),
        total1y: s.number("Total 1 year volume"),
        change_1d: s.number("1 day change percentage"),
        change_7d: s.number("7 day change percentage"),
        change_1m: s.number("1 month change percentage"),
        change_7dover7d: s.number("7d over 7d change percentage"),
        change_30dover30d: s.number("30d over 30d change percentage"),
        total7DaysAgo: s.number("Total volume 7 days ago"),
        total30DaysAgo: s.number("Total volume 30 days ago"),
        totalAllTime: s.number("Total all time volume"),
        protocols: s.array(
          "List of protocols",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              total24h: s.number("Protocol 24 hour volume"),
              total48hto24h: s.number("Protocol 48h to 24h volume"),
              total7d: s.number("Protocol 7 day volume"),
              total14dto7d: s.number("Protocol 14d to 7d volume"),
              total60dto30d: s.number("Protocol 60d to 30d volume"),
              total30d: s.number("Protocol 30 day volume"),
              total1y: s.number("Protocol 1 year volume"),
              totalAllTime: s.number("Protocol all time volume"),
              average1y: s.number("Protocol average 1 year volume"),
              change_1d: s.number("Protocol 1 day change percentage"),
              change_7d: s.number("Protocol 7 day change percentage"),
              change_1m: s.number("Protocol 1 month change percentage"),
              change_7dover7d: s.number("Protocol 7d over 7d change percentage"),
              change_30dover30d: s.number("Protocol 30d over 30d change percentage"),
              breakdown24h: s.object("Protocol 24 hour breakdown", {}, { required: [], additionalProperties: true }),
              breakdown30d: s.object("Protocol 30 day breakdown", {}, { required: [], additionalProperties: true }),
              total7DaysAgo: s.number("Protocol volume 7 days ago"),
              total30DaysAgo: s.number("Protocol volume 30 days ago"),
              defillamaId: s.string("DefiLlama protocol ID"),
              name: s.string("Protocol name"),
              displayName: s.string("Protocol display name"),
              module: s.string("Protocol module"),
              category: s.string("Protocol category"),
              logo: s.string("Protocol logo URL"),
              chains: s.array("Protocol chains", s.string("Result entry returned by DeFiLlama.")),
              protocolType: s.string("Protocol type"),
              methodologyURL: s.string("Methodology URL"),
              methodology: s.object("Methodology details", {}, { required: [], additionalProperties: true }),
              latestFetchIsOk: s.boolean("Latest fetch status"),
              parentProtocol: s.string("Parent protocol"),
              slug: s.string("Protocol slug"),
              linkedProtocols: linkedProtocolsSchema,
              id: s.string("Protocol ID"),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_summary_derivatives_by_protocol",
    description: "Volume Details about a specific perp protocol.  Requires an API plan key.",
    route: {
      path: "/api/summary/derivatives/{protocol}",
      parameters: [
        { name: "protocol", in: "path" },
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
      ],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_summary_derivatives_by_protocol.",
      {
        protocol: s.string("protocol slug", { minLength: 1 }),
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
      },
      { required: ["protocol"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        id: s.string("Protocol ID"),
        name: s.string("Protocol name"),
        url: s.string("Protocol URL"),
        referralUrl: s.string("Referral URL"),
        description: s.string("Protocol description"),
        logo: s.string("Protocol logo URL"),
        gecko_id: s.string("CoinGecko ID"),
        cmcId: s.string("CoinMarketCap ID"),
        chains: s.array("Supported chains", s.string("Result entry returned by DeFiLlama.")),
        twitter: s.string("Twitter handle"),
        github: githubSchema,
        symbol: s.string("Token symbol"),
        address: s.string("Protocol address"),
        childProtocols: childProtocolsSchema,
        linkedProtocols: linkedProtocolsSchema,
        defillamaId: s.string("DefiLlama protocol ID"),
        disabled: s.nullable(s.boolean("Whether protocol is disabled")),
        displayName: s.string("Display name"),
        module: s.nullable(s.string("Module name")),
        category: s.nullable(s.string("Protocol category")),
        methodologyURL: s.nullable(s.string("Methodology URL")),
        methodology: s.nullable(s.object("Methodology details", {}, { required: [], additionalProperties: true })),
        forkedFrom: s.nullable(s.string("Forked from protocol")),
        audits: s.nullable(s.array("Audit information", {})),
        audit_links: s.nullable(s.array("Audit links", {})),
        versionKey: s.nullable(s.string("Version key")),
        governanceID: s.nullable(s.string("Governance ID")),
        treasury: s.nullable(s.string("Treasury address")),
        parentProtocol: s.nullable(s.string("Parent protocol")),
        previousNames: s.nullable(s.array("Previous names", {})),
        latestFetchIsOk: s.boolean("Latest fetch status"),
        slug: s.string("Protocol slug"),
        protocolType: s.string("Protocol type"),
        total24h: s.number("24 hour volume"),
        total48hto24h: s.number("48h to 24h volume"),
        total7d: s.number("7 day volume"),
        totalAllTime: s.number("All time volume"),
        totalDataChart: s.array(
          "Total data chart with timestamps and volumes",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [s.integer("Timestamp"), s.number("Volume value")],
          }),
        ),
        totalDataChartBreakdown: s.array(
          "Total data chart breakdown by chain and protocol",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [
              s.integer("Timestamp"),
              s.object("Chain and protocol breakdown", {}, { required: [], additionalProperties: true }),
            ],
          }),
        ),
        change_1d: s.number("1 day change percentage"),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_overview_dexs",
    description:
      "List all dexs along with summaries of their volumes and dataType history data.  Available with no_auth or api_key.",
    route: {
      path: "/api/overview/dexs",
      parameters: [
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/overview/dexs" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_dexs.",
      {
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
      },
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        protocols: s.array(
          "protocols returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              name: s.string("name returned by DeFiLlama."),
              displayName: s.string("displayName returned by DeFiLlama."),
              total24h: s.number("total24h returned by DeFiLlama."),
              total7d: s.number("total7d returned by DeFiLlama."),
              change_1d: s.number("change_1d returned by DeFiLlama."),
              change_7d: s.number("change_7d returned by DeFiLlama."),
              chains: chainsSchema,
            },
            { required: [], additionalProperties: true },
          ),
        ),
        totalDataChart: s.array(
          "totalDataChart returned by DeFiLlama.",
          s.array("Result entry returned by DeFiLlama.", {
            oneOf: [s.number("Result entry returned by DeFiLlama."), protocolEntrySchema],
            description: "Result entry returned by DeFiLlama.",
          }),
        ),
        allChains: allChainsSchema,
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_overview_dexs_by_chain",
    description:
      "List all dexs along with summaries of their volumes and dataType history data filtering by chain.  Available with no_auth or api_key.",
    route: {
      path: "/api/overview/dexs/{chain}",
      parameters: [
        { name: "chain", in: "path" },
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/overview/dexs/{chain}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_dexs_by_chain.",
      {
        chain: s.string(
          "chain name, list of all supported chains can be found under allChains attribute in /overview/dexs response",
          { minLength: 1 },
        ),
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
      },
      { required: ["chain"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        protocols: s.array(
          "protocols returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              name: s.string("name returned by DeFiLlama."),
              total24h: s.number("total24h returned by DeFiLlama."),
              change_1d: s.number("change_1d returned by DeFiLlama."),
            },
            { required: [], additionalProperties: true },
          ),
        ),
        totalDataChart: totalDataChartSchema,
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_summary_dexs_by_protocol",
    description: "Get summary of dex volume with historical data.  Available with no_auth or api_key.",
    route: {
      path: "/api/summary/dexs/{protocol}",
      parameters: [
        { name: "protocol", in: "path" },
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/summary/dexs/{protocol}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_summary_dexs_by_protocol.",
      {
        protocol: s.string("protocol slug", { minLength: 1 }),
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
      },
      { required: ["protocol"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        name: s.string("name returned by DeFiLlama."),
        total24h: s.number("total24h returned by DeFiLlama."),
        totalAllTime: s.number("totalAllTime returned by DeFiLlama."),
        totalDataChart: totalDataChartSchema,
        totalDataChartBreakdown: totalDataChartBreakdownSchema,
        chains: chainsSchema,
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_overview_options",
    description:
      "List all options dexs along with summaries of their volumes and dataType history data.  Available with no_auth or api_key.",
    route: {
      path: "/api/overview/options",
      parameters: [
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
        { name: "dataType", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/overview/options" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_options.",
      {
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
        dataType: dataTypeSchema,
      },
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        protocols: s.array(
          "protocols returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              name: s.string("name returned by DeFiLlama."),
              total24h: s.number("total24h returned by DeFiLlama."),
              change_1d: s.number("change_1d returned by DeFiLlama."),
            },
            { required: [], additionalProperties: true },
          ),
        ),
        totalDataChart: totalDataChartSchema,
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_overview_options_by_chain",
    description:
      "List all options dexs along with summaries of their volumes and dataType history data filtering by chain.  Available with no_auth or api_key.",
    route: {
      path: "/api/overview/options/{chain}",
      parameters: [
        { name: "chain", in: "path" },
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
        { name: "dataType", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/overview/options/{chain}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_options_by_chain.",
      {
        chain: s.string(
          "chain name, list of all supported chains can be found under allChains attribute in /overview/options response",
          { minLength: 1 },
        ),
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
        dataType: dataTypeSchema,
      },
      { required: ["chain"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        totalDataChart: s.array(
          "Historical chart data with timestamps and total volumes",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [s.integer("Unix timestamp"), s.number("Total volume value")],
          }),
        ),
        totalDataChartBreakdown: s.array(
          "Historical chart data broken down by protocol",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [
              s.integer("Unix timestamp"),
              s.object(
                "Protocol breakdown with volume values",
                {},
                { required: [], additionalProperties: s.number("Value for this key.") },
              ),
            ],
          }),
        ),
        breakdown24h: s.nullable(s.object("24-hour breakdown data", {}, { required: [], additionalProperties: true })),
        breakdown30d: s.nullable(s.object("30-day breakdown data", {}, { required: [], additionalProperties: true })),
        chain: s.string("Chain name"),
        allChains: s.array("List of all supported chains", s.string("Result entry returned by DeFiLlama.")),
        total24h: s.number("Total 24-hour volume"),
        total48hto24h: s.number("Total 48-hour to 24-hour volume"),
        total7d: s.number("Total 7-day volume"),
        total14dto7d: s.number("Total 14-day to 7-day volume"),
        total60dto30d: s.number("Total 60-day to 30-day volume"),
        total30d: s.number("Total 30-day volume"),
        total1y: s.number("Total 1-year volume"),
        change_1d: s.number("1-day change percentage"),
        change_7d: s.number("7-day change percentage"),
        change_1m: s.number("1-month change percentage"),
        change_7dover7d: s.number("7-day over 7-day change percentage"),
        change_30dover30d: s.number("30-day over 30-day change percentage"),
        total7DaysAgo: s.number("Total volume 7 days ago"),
        total30DaysAgo: s.number("Total volume 30 days ago"),
        totalAllTime: s.number("Total all-time volume"),
        protocols: s.array(
          "List of protocols with their volume data",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              total24h: s.number("24-hour volume"),
              total48hto24h: s.number("48-hour to 24-hour volume"),
              total7d: s.number("7-day volume"),
              total14dto7d: s.number("14-day to 7-day volume"),
              total60dto30d: s.number("60-day to 30-day volume"),
              total30d: s.number("30-day volume"),
              total1y: s.number("1-year volume"),
              totalAllTime: s.number("All-time volume"),
              total7DaysAgo: s.number("Volume 7 days ago"),
              total30DaysAgo: s.number("Volume 30 days ago"),
              average1y: s.number("Average 1-year volume"),
              change_1d: s.number("1-day change percentage"),
              change_7d: s.number("7-day change percentage"),
              change_1m: s.number("1-month change percentage"),
              change_7dover7d: s.number("7-day over 7-day change percentage"),
              change_30dover30d: s.number("30-day over 30-day change percentage"),
              defillamaId: s.string("DefiLlama protocol ID"),
              name: s.string("Protocol name"),
              displayName: s.string("Protocol display name"),
              module: s.string("Protocol module name"),
              category: s.string("Protocol category"),
              logo: s.string("Protocol logo URL"),
              chains: s.array("Supported chains", s.string("Result entry returned by DeFiLlama.")),
              protocolType: s.string("Protocol type"),
              methodologyURL: s.string("Methodology documentation URL"),
              methodology: s.object(
                "Protocol methodology details",
                {},
                { required: [], additionalProperties: s.string("Value for this key.") },
              ),
              latestFetchIsOk: s.boolean("Whether the latest data fetch was successful"),
              parentProtocol: s.string("Parent protocol identifier"),
              slug: s.string("Protocol slug"),
              linkedProtocols: s.array("Linked protocol names", s.string("Result entry returned by DeFiLlama.")),
              id: s.string("Protocol ID"),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_summary_options_by_protocol",
    description: "Get summary of options dex volume with historical data.  Available with no_auth or api_key.",
    route: {
      path: "/api/summary/options/{protocol}",
      parameters: [
        { name: "protocol", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/summary/options/{protocol}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_summary_options_by_protocol.",
      { protocol: s.string("protocol slug", { minLength: 1 }), dataType: dataTypeSchema },
      { required: ["protocol"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        id: s.string("Protocol ID"),
        name: s.string("Protocol name"),
        url: s.string("Protocol website URL"),
        description: s.string("Protocol description"),
        logo: s.string("Protocol logo URL"),
        gecko_id: s.string("CoinGecko ID"),
        cmcId: s.string("CoinMarketCap ID"),
        chains: s.array("Supported chains", s.string("Result entry returned by DeFiLlama.")),
        twitter: s.string("Twitter handle"),
        governanceID: s.array("Governance identifiers", s.string("Result entry returned by DeFiLlama.")),
        github: githubSchema,
        treasury: s.string("Treasury information"),
        symbol: s.string("Token symbol"),
        address: s.string("Token contract address"),
        childProtocols: childProtocolsSchema,
        linkedProtocols: s.array("Linked protocol names", s.string("Result entry returned by DeFiLlama.")),
        defillamaId: s.string("DefiLlama protocol ID"),
        disabled: s.nullable(s.object("Disabled status", {}, { required: [], additionalProperties: true })),
        displayName: s.string("Protocol display name"),
        module: s.nullable(s.object("Protocol module", {}, { required: [], additionalProperties: true })),
        category: s.nullable(s.object("Protocol category", {}, { required: [], additionalProperties: true })),
        methodologyURL: s.nullable(
          s.object("Methodology documentation URL", {}, { required: [], additionalProperties: true }),
        ),
        methodology: s.nullable(
          s.object("Protocol methodology details", {}, { required: [], additionalProperties: true }),
        ),
        forkedFrom: s.nullable(s.object("Forked from protocol", {}, { required: [], additionalProperties: true })),
        audits: s.nullable(s.object("Audit information", {}, { required: [], additionalProperties: true })),
        audit_links: s.nullable(s.object("Audit links", {}, { required: [], additionalProperties: true })),
        versionKey: s.nullable(s.object("Version key", {}, { required: [], additionalProperties: true })),
        parentProtocol: s.nullable(s.object("Parent protocol", {}, { required: [], additionalProperties: true })),
        previousNames: s.nullable(
          s.object("Previous protocol names", {}, { required: [], additionalProperties: true }),
        ),
        latestFetchIsOk: s.boolean("Whether the latest data fetch was successful"),
        slug: s.string("Protocol slug"),
        protocolType: s.string("Protocol type"),
        total24h: s.number("24-hour volume"),
        total48hto24h: s.number("48-hour to 24-hour volume"),
        total7d: s.number("7-day volume"),
        totalAllTime: s.number("All-time volume"),
        totalDataChart: s.array(
          "Historical chart data with timestamps and volumes",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [s.integer("Unix timestamp"), s.number("Volume value")],
          }),
        ),
        totalDataChartBreakdown: s.array(
          "Historical chart data broken down by chain and protocol",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [
              s.integer("Unix timestamp"),
              s.object(
                "Chain and protocol breakdown with volume values",
                {},
                { required: [], additionalProperties: chartBreakdownValuesSchema },
              ),
            ],
          }),
        ),
        change_1d: s.number("1-day change percentage"),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_overview_open_interest",
    description:
      "List all open interest dex exchanges along with summaries of their open interest.  Available with no_auth or api_key.",
    route: {
      path: "/api/overview/open-interest",
      parameters: [
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/overview/open-interest" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_open_interest.",
      {
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
      },
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        protocols: s.array(
          "protocols returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              name: s.string("name returned by DeFiLlama."),
              displayName: s.string("displayName returned by DeFiLlama."),
              total24h: s.number("total24h returned by DeFiLlama."),
              total7d: s.number("total7d returned by DeFiLlama."),
              change_1d: s.number("change_1d returned by DeFiLlama."),
              change_7d: s.number("change_7d returned by DeFiLlama."),
              chains: chainsSchema,
            },
            { required: [], additionalProperties: true },
          ),
        ),
        totalDataChart: s.array(
          "totalDataChart returned by DeFiLlama.",
          s.array("Result entry returned by DeFiLlama.", {
            oneOf: [s.number("Result entry returned by DeFiLlama."), protocolEntrySchema],
            description: "Result entry returned by DeFiLlama.",
          }),
        ),
        allChains: allChainsSchema,
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_overview_fees",
    description:
      "List all protocols along with summaries of their fees and revenue and dataType history data.  Available with no_auth or api_key.",
    route: {
      path: "/api/overview/fees",
      parameters: [
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
        { name: "dataType", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/overview/fees" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_fees.",
      {
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
        dataType: s.withEnum(s.string("Desired data type, dailyFees by default."), [
          "dailyFees",
          "dailyRevenue",
          "dailyHoldersRevenue",
        ]),
      },
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        protocols: s.array(
          "protocols returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              name: s.string("name returned by DeFiLlama."),
              total24h: s.number("total24h returned by DeFiLlama."),
              revenue24h: s.number("revenue24h returned by DeFiLlama."),
              change_1d: s.number("change_1d returned by DeFiLlama."),
              chains: chainsSchema,
            },
            { required: [], additionalProperties: true },
          ),
        ),
        totalDataChart: totalDataChartSchema,
        totalDataChartBreakdown: totalDataChartBreakdownSchema,
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_overview_fees_by_chain",
    description:
      "List all protocols along with summaries of their fees and revenue and dataType history data by chain.  Available with no_auth or api_key.",
    route: {
      path: "/api/overview/fees/{chain}",
      parameters: [
        { name: "chain", in: "path" },
        { name: "excludeTotalDataChart", in: "query" },
        { name: "excludeTotalDataChartBreakdown", in: "query" },
        { name: "dataType", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/overview/fees/{chain}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_overview_fees_by_chain.",
      {
        chain: s.string(
          "chain name, list of all supported chains can be found under allChains attribute in /overview/fees response",
          { minLength: 1 },
        ),
        excludeTotalDataChart: {
          ...s.boolean("true to exclude aggregated chart from response"),
          default: false,
        },
        excludeTotalDataChartBreakdown: {
          ...s.boolean("true to exclude broken down chart from response"),
          default: false,
        },
        dataType: s.withEnum(s.string("Desired data type, dailyFees by default."), [
          "dailyFees",
          "dailyRevenue",
          "dailyHoldersRevenue",
        ]),
      },
      { required: ["chain"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        protocols: s.array(
          "protocols returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              name: s.string("name returned by DeFiLlama."),
              total24h: s.number("total24h returned by DeFiLlama."),
              revenue24h: s.number("revenue24h returned by DeFiLlama."),
              change_1d: s.number("change_1d returned by DeFiLlama."),
              chains: chainsSchema,
            },
            { required: [], additionalProperties: true },
          ),
        ),
        totalDataChart: totalDataChartSchema,
        totalDataChartBreakdown: totalDataChartBreakdownSchema,
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_summary_fees_by_protocol",
    description: "Get summary of protocol fees and revenue with historical data.  Available with no_auth or api_key.",
    route: {
      path: "/api/summary/fees/{protocol}",
      parameters: [
        { name: "protocol", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: { baseUrl: "https://api.llama.fi", path: "/summary/fees/{protocol}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_summary_fees_by_protocol.",
      {
        protocol: s.string("protocol slug", { minLength: 1 }),
        dataType: s.withEnum(s.string("Desired data type, dailyFees by default."), [
          "dailyFees",
          "dailyRevenue",
          "dailyHoldersRevenue",
        ]),
      },
      { required: ["protocol"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        id: s.string("Protocol ID"),
        name: s.string("Protocol name"),
        url: s.string("Protocol URL"),
        referralUrl: s.string("Referral URL"),
        description: s.string("Protocol description"),
        logo: s.string("Protocol logo URL"),
        gecko_id: s.string("CoinGecko ID"),
        cmcId: s.string("CoinMarketCap ID"),
        chains: s.array("Supported chains", s.string("Result entry returned by DeFiLlama.")),
        twitter: s.string("Twitter handle"),
        github: githubSchema,
        symbol: s.string("Token symbol"),
        address: s.string("Protocol address"),
        childProtocols: childProtocolsSchema,
        linkedProtocols: linkedProtocolsSchema,
        defillamaId: s.string("DefiLlama protocol ID"),
        disabled: s.nullable(s.boolean("Whether protocol is disabled")),
        displayName: s.string("Display name"),
        module: s.nullable(s.string("Module name")),
        category: s.nullable(s.string("Protocol category")),
        methodologyURL: s.nullable(s.string("Methodology URL")),
        methodology: s.nullable(s.object("Methodology details", {}, { required: [], additionalProperties: true })),
        forkedFrom: s.nullable(s.string("Forked from protocol")),
        audits: s.nullable(s.array("Audit information", {})),
        audit_links: s.nullable(s.array("Audit links", {})),
        versionKey: s.nullable(s.string("Version key")),
        governanceID: s.nullable(s.string("Governance ID")),
        treasury: s.nullable(s.string("Treasury address")),
        parentProtocol: s.nullable(s.string("Parent protocol")),
        previousNames: s.nullable(s.array("Previous names", {})),
        latestFetchIsOk: s.boolean("Latest fetch status"),
        slug: s.string("Protocol slug"),
        protocolType: s.string("Protocol type"),
        total24h: s.number("24 hour fees"),
        total48hto24h: s.number("48h to 24h fees"),
        total7d: s.number("7 day fees"),
        totalAllTime: s.number("All time fees"),
        change_1d: s.number("1 day change percentage"),
        totalDataChart: s.array(
          "Total data chart with timestamps and fees",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [s.integer("Timestamp"), s.number("Fee value")],
          }),
        ),
        totalDataChartBreakdown: s.array(
          "Total data chart breakdown by chain and protocol",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [
              s.integer("Timestamp"),
              s.object("Chain and protocol breakdown", {}, { required: [], additionalProperties: true }),
            ],
          }),
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_v2_metrics_by_metric",
    description:
      "Get dimension data overview. Returns aggregate metrics for the specified dimension including totals and percentage changes across different time periods. Requires an API plan key.",
    route: {
      path: "/api/v2/metrics/{metric}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_v2_metrics_by_metric.",
      {
        metric: metricSchema,
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity\n- **active-users**: dailyActiveUsers (default), dailyTransactionCount, dailyGasUsed",
        ),
      },
      { required: ["metric"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        allChains: allChainsSchema,
        total24h: s.number("total24h returned by DeFiLlama."),
        total48hto24h: s.number("total48hto24h returned by DeFiLlama."),
        total7d: s.number("total7d returned by DeFiLlama."),
        total14dto7d: s.number("total14dto7d returned by DeFiLlama."),
        total60dto30d: s.number("total60dto30d returned by DeFiLlama."),
        total30d: s.number("total30d returned by DeFiLlama."),
        total1y: s.number("total1y returned by DeFiLlama."),
        change_1d: s.number("change_1d returned by DeFiLlama."),
        change_7d: s.number("change_7d returned by DeFiLlama."),
        change_1m: s.number("change_1m returned by DeFiLlama."),
        change_7dover7d: s.number("change_7dover7d returned by DeFiLlama."),
        change_30dover30d: s.number("change_30dover30d returned by DeFiLlama."),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_v2_chart_by_metric",
    description:
      "Get historical timeseries chart data. Returns an array of [timestamp, value] pairs representing the total metric value over time. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric.",
      {
        metric: metricSchema,
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity\n- **active-users**: dailyActiveUsers (default), dailyTransactionCount, dailyGasUsed",
        ),
      },
      { required: ["metric"], additionalProperties: false },
    ),
    outputSchema: timeSeriesResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_chain_breakdown",
    description:
      "Get historical timeseries chart data breakdown by chain. Returns an array of [timestamp, {chain: value}] pairs showing the metric broken down by chain over time. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/chain-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_chain_breakdown.",
      {
        metric: metricSchema,
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity\n- **active-users**: dailyActiveUsers (default), dailyTransactionCount, dailyGasUsed",
        ),
      },
      { required: ["metric"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_protocol_breakdown",
    description:
      "Get historical timeseries chart data breakdown by protocol. Returns an array of [timestamp, {protocol: value}] pairs showing the metric broken down by protocol over time. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/protocol-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_protocol_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_metrics_by_metric_chain_by_chain",
    description:
      "Get chain dimension data overview. Returns aggregate metrics for the specified dimension filtered by a specific chain. Requires an API plan key.",
    route: {
      path: "/api/v2/metrics/{metric}/chain/{chain}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "chain", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_v2_metrics_by_metric_chain_by_chain.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        chain: s.string("chain name", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "chain"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        allChains: allChainsSchema,
        total24h: s.number("total24h returned by DeFiLlama."),
        total48hto24h: s.number("total48hto24h returned by DeFiLlama."),
        total7d: s.number("total7d returned by DeFiLlama."),
        total14dto7d: s.number("total14dto7d returned by DeFiLlama."),
        total60dto30d: s.number("total60dto30d returned by DeFiLlama."),
        total30d: s.number("total30d returned by DeFiLlama."),
        total1y: s.number("total1y returned by DeFiLlama."),
        change_1d: s.number("change_1d returned by DeFiLlama."),
        change_7d: s.number("change_7d returned by DeFiLlama."),
        change_1m: s.number("change_1m returned by DeFiLlama."),
        change_7dover7d: s.number("change_7dover7d returned by DeFiLlama."),
        change_30dover30d: s.number("change_30dover30d returned by DeFiLlama."),
        chain: s.string("chain returned by DeFiLlama."),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_v2_chart_by_metric_chain_by_chain",
    description:
      "Get chain historical timeseries chart data. Returns an array of [timestamp, value] pairs for the metric filtered by a specific chain. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/chain/{chain}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "chain", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_chain_by_chain.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        chain: s.string("chain name", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "chain"], additionalProperties: false },
    ),
    outputSchema: timeSeriesResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_chain_by_chain_protocol_breakdown",
    description:
      "Get chain timeseries chart data breakdown by protocol. Returns an array of [timestamp, {protocol: value}] pairs showing the metric on a specific chain broken down by protocol. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/chain/{chain}/protocol-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "chain", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_chain_by_chain_protocol_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        chain: s.string("chain name", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "chain"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_metrics_by_metric_protocol_by_protocol",
    description:
      "Get protocol dimension data overview. Returns protocol metadata along with aggregate metrics for the specified dimension. Requires an API plan key.",
    route: {
      path: "/api/v2/metrics/{metric}/protocol/{protocol}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "protocol", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_v2_metrics_by_metric_protocol_by_protocol.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        protocol: s.string("protocol slug (slugified protocol name)", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "protocol"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        id: s.string("id returned by DeFiLlama."),
        name: s.string("name returned by DeFiLlama."),
        url: s.string("url returned by DeFiLlama."),
        description: s.string("description returned by DeFiLlama."),
        logo: s.string("logo returned by DeFiLlama."),
        chains: chainsSchema,
        gecko_id: s.nullable(s.string("gecko_id returned by DeFiLlama.")),
        cmcId: s.nullable(s.string("cmcId returned by DeFiLlama.")),
        symbol: s.nullable(s.string("symbol returned by DeFiLlama.")),
        twitter: s.nullable(s.string("twitter returned by DeFiLlama.")),
        github: s.nullable(s.array("github returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama."))),
        treasury: s.nullable(s.string("treasury returned by DeFiLlama.")),
        governanceID: s.nullable(
          s.array("governanceID returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama.")),
        ),
        wrongLiquidity: s.nullable(s.boolean("wrongLiquidity returned by DeFiLlama.")),
        stablecoins: s.nullable(
          s.array("stablecoins returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama.")),
        ),
        total24h: s.number("total24h returned by DeFiLlama."),
        total48hto24h: s.number("total48hto24h returned by DeFiLlama."),
        total7d: s.number("total7d returned by DeFiLlama."),
        total30d: s.number("total30d returned by DeFiLlama."),
        total1y: s.number("total1y returned by DeFiLlama."),
        change_1d: s.number("change_1d returned by DeFiLlama."),
        change_7d: s.number("change_7d returned by DeFiLlama."),
        change_1m: s.number("change_1m returned by DeFiLlama."),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_v2_chart_by_metric_protocol_by_protocol",
    description:
      "Get protocol historical timeseries chart data. Returns an array of [timestamp, value] pairs for the metric of a specific protocol. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/protocol/{protocol}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "protocol", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_protocol_by_protocol.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        protocol: s.string("protocol slug (slugified protocol name)", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "protocol"], additionalProperties: false },
    ),
    outputSchema: timeSeriesResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_protocol_by_protocol_chain_breakdown",
    description:
      "Get protocol timeseries chart data breakdown by chain. Returns an array of [timestamp, {chain: value}] pairs showing the metric for a specific protocol broken down by chain. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/protocol/{protocol}/chain-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "protocol", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_protocol_by_protocol_chain_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        protocol: s.string("protocol slug (slugified protocol name)", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "protocol"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_protocol_by_protocol_version_breakdown",
    description:
      "Get protocol timeseries chart data breakdown by version. Returns an array of [timestamp, {version: value}] pairs showing the metric for a specific protocol broken down by version (e.g. Aave V2, Aave V3). Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/protocol/{protocol}/version-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "protocol", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_protocol_by_protocol_version_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        protocol: s.string("protocol slug (slugified protocol name)", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "protocol"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_protocol_by_protocol_label_breakdown",
    description:
      "Get protocol timeseries chart data breakdown by label. Returns an array of [timestamp, {label: value}] pairs showing the metric for a specific protocol broken down by label (e.g. Borrow Interest, Flash Loans). Currently only supported for metric=fees. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/protocol/{protocol}/label-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "protocol", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_protocol_by_protocol_label_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        protocol: s.string("protocol slug (slugified protocol name)", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "protocol"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_metrics_by_metric_category_by_category",
    description:
      "Get category dimension data overview. Returns aggregate metrics for the specified dimension filtered by a specific category. Requires an API plan key.",
    route: {
      path: "/api/v2/metrics/{metric}/category/{category}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "category", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_v2_metrics_by_metric_category_by_category.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        category: categorySchema,
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "category"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        allChains: allChainsSchema,
        total24h: s.number("total24h returned by DeFiLlama."),
        total48hto24h: s.number("total48hto24h returned by DeFiLlama."),
        total7d: s.number("total7d returned by DeFiLlama."),
        total14dto7d: s.number("total14dto7d returned by DeFiLlama."),
        total60dto30d: s.number("total60dto30d returned by DeFiLlama."),
        total30d: s.number("total30d returned by DeFiLlama."),
        total1y: s.number("total1y returned by DeFiLlama."),
        change_1d: s.number("change_1d returned by DeFiLlama."),
        change_7d: s.number("change_7d returned by DeFiLlama."),
        change_1m: s.number("change_1m returned by DeFiLlama."),
        change_7dover7d: s.number("change_7dover7d returned by DeFiLlama."),
        change_30dover30d: s.number("change_30dover30d returned by DeFiLlama."),
        category: s.string("category returned by DeFiLlama."),
        allCategories: s.array("allCategories returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama.")),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_v2_chart_by_metric_category_by_category",
    description:
      "Get category historical timeseries chart data. Returns an array of [timestamp, value] pairs for the metric filtered by a specific category. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/category/{category}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "category", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_category_by_category.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        category: categorySchema,
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "category"], additionalProperties: false },
    ),
    outputSchema: timeSeriesResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_category_by_category_chain_breakdown",
    description:
      "Get category timeseries chart data breakdown by chain. Returns an array of [timestamp, {chain: value}] pairs showing the metric for a specific category broken down by chain. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/category/{category}/chain-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "category", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_category_by_category_chain_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        category: categorySchema,
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "category"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_category_by_category_protocol_breakdown",
    description:
      "Get category timeseries chart data breakdown by protocol. Returns an array of [timestamp, {protocol: value}] pairs showing the metric for a specific category broken down by protocol. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/category/{category}/protocol-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "category", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_category_by_category_protocol_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        category: categorySchema,
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "category"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_metrics_by_metric_category_by_category_chain_by_chain",
    description:
      "Get category chain dimension data overview. Returns aggregate metrics for the specified dimension filtered by both category and chain. Requires an API plan key.",
    route: {
      path: "/api/v2/metrics/{metric}/category/{category}/chain/{chain}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "category", in: "path" },
        { name: "chain", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_v2_metrics_by_metric_category_by_category_chain_by_chain.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        category: categorySchema,
        chain: s.string("chain name", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "category", "chain"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        allChains: allChainsSchema,
        total24h: s.number("total24h returned by DeFiLlama."),
        total48hto24h: s.number("total48hto24h returned by DeFiLlama."),
        total7d: s.number("total7d returned by DeFiLlama."),
        total14dto7d: s.number("total14dto7d returned by DeFiLlama."),
        total60dto30d: s.number("total60dto30d returned by DeFiLlama."),
        total30d: s.number("total30d returned by DeFiLlama."),
        total1y: s.number("total1y returned by DeFiLlama."),
        change_1d: s.number("change_1d returned by DeFiLlama."),
        change_7d: s.number("change_7d returned by DeFiLlama."),
        change_1m: s.number("change_1m returned by DeFiLlama."),
        change_7dover7d: s.number("change_7dover7d returned by DeFiLlama."),
        change_30dover30d: s.number("change_30dover30d returned by DeFiLlama."),
        category: s.string("category returned by DeFiLlama."),
        allCategories: s.array("allCategories returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama.")),
        chain: s.string("chain returned by DeFiLlama."),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_v2_chart_by_metric_category_by_category_chain_by_chain",
    description:
      "Get category chain historical timeseries chart data. Returns an array of [timestamp, value] pairs for the metric filtered by both category and chain. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/category/{category}/chain/{chain}",
      parameters: [
        { name: "metric", in: "path" },
        { name: "category", in: "path" },
        { name: "chain", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_category_by_category_chain_by_chain.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        category: categorySchema,
        chain: s.string("chain name", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "category", "chain"], additionalProperties: false },
    ),
    outputSchema: timeSeriesResponseSchema,
  },
  {
    name: "get_v2_chart_by_metric_category_by_category_chain_by_chain_protocol_breakdown",
    description:
      "Get category chain timeseries chart data breakdown by protocol. Returns an array of [timestamp, {protocol: value}] pairs showing the metric filtered by both category and chain, broken down by protocol. Requires an API plan key.",
    route: {
      path: "/api/v2/chart/{metric}/category/{category}/chain/{chain}/protocol-breakdown",
      parameters: [
        { name: "metric", in: "path" },
        { name: "category", in: "path" },
        { name: "chain", in: "path" },
        { name: "dataType", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_v2_chart_by_metric_category_by_category_chain_by_chain_protocol_breakdown.",
      {
        metric: s.withEnum(s.string("The dimension metric type", { minLength: 1 }), [
          "fees",
          "liquidations",
          "dexs",
          "derivatives",
          "options",
          "aggregators",
          "bridge-aggregators",
          "open-interest",
          "normalized-volume",
        ]),
        category: categorySchema,
        chain: s.string("chain name", { minLength: 1 }),
        dataType: s.string(
          "Metric-specific data type to return. Supported values per metric:\n- **fees**: dailyFees (default), dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue\n- **liquidations**: dailyLiquidationsVolume (default), dailyCollateralLiquidated\n- **dexs**: dailyVolume (default), dailyNotionalVolume\n- **derivatives**: dailyVolume (default), dailyNotionalVolume\n- **options**: dailyNotionalVolume (default), dailyPremiumVolume\n- **aggregators**: dailyVolume (default)\n- **bridge-aggregators**: dailyBridgeVolume (default)\n- **open-interest**: openInterestAtEnd (default), shortOpenInterestAtEnd, longOpenInterestAtEnd\n- **normalized-volume**: dailyNormalizedVolume (default), dailyActiveLiquidity",
        ),
      },
      { required: ["metric", "category", "chain"], additionalProperties: false },
    ),
    outputSchema: unstructuredChartResponseSchema,
  },
  {
    name: "get_v2_metrics_financial_statement_protocol_by_protocol",
    description:
      "Get protocol income statement report. Returns protocol metadata, methodology details, and aggregated financial statement data (yearly, quarterly, monthly). Each period contains line items such as Gross Protocol Revenue, Cost Of Revenue, Gross Profit, Token Holder Net Income, Incentives, and Earnings, with values and optional label breakdowns.\n\nWhen querying a parent protocol (e.g. `aave`), the response includes a `childProtocols` array with per-version methodology. When querying a child protocol (e.g. `aave-v3`), methodology and breakdownMethodology are at the top level. Requires an API plan key. Beta API; upstream fields may change.",
    route: {
      path: "/api/v2/metrics/financial-statement/protocol/{protocol}",
      parameters: [{ name: "protocol", in: "path" }],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_v2_metrics_financial_statement_protocol_by_protocol.",
      { protocol: s.string("protocol slug (e.g. aave-v3, hyperliquid)", { minLength: 1 }) },
      { required: ["protocol"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        id: s.string("Protocol ID. Parent protocols use 'parent#slug' format."),
        name: s.string("name returned by DeFiLlama."),
        address: s.nullable(s.string("address returned by DeFiLlama.")),
        symbol: s.nullable(s.string("symbol returned by DeFiLlama.")),
        url: s.string("url returned by DeFiLlama."),
        description: s.string("description returned by DeFiLlama."),
        chain: s.nullable(s.string("Primary chain (present for child protocols)")),
        logo: s.string("logo returned by DeFiLlama."),
        audits: s.nullable(s.string("audits returned by DeFiLlama.")),
        audit_links: s.nullable(
          s.array("audit_links returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama.")),
        ),
        category: s.nullable(s.string("Protocol category (present for child protocols)")),
        chains: chainsSchema,
        oraclesBreakdown: s.nullable(
          s.array(
            "Oracles used by the protocol",
            s.object(
              "Result entry returned by DeFiLlama.",
              {
                name: s.string("name returned by DeFiLlama."),
                type: s.string("type returned by DeFiLlama."),
                proof: s.array("proof returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama.")),
              },
              { required: [], additionalProperties: true },
            ),
          ),
        ),
        module: s.nullable(s.string("module returned by DeFiLlama.")),
        twitter: s.nullable(s.string("twitter returned by DeFiLlama.")),
        github: s.nullable(s.array("github returned by DeFiLlama.", s.string("Result entry returned by DeFiLlama."))),
        listedAt: s.nullable(s.integer("Unix timestamp when protocol was listed")),
        parentProtocol: s.nullable(s.string("Parent protocol ID (present for child protocols)")),
        dimensions: s.nullable(
          s.object(
            "Available dimension adapters for this protocol",
            {},
            {
              required: [],
              additionalProperties: {
                oneOf: [
                  { type: "string", example: "aave-v3" },
                  {
                    type: "object",
                    properties: { adapter: { type: "string" }, genuineSpikes: { type: "array" } },
                  },
                ],
              },
            },
          ),
        ),
        methodology: s.nullable(
          s.object(
            "Maps line item names to descriptions. Present at top level for child protocols, inside childProtocols for parent protocols.",
            {},
            { required: [], additionalProperties: { type: "string" } },
          ),
        ),
        breakdownMethodology: s.nullable(
          s.object(
            "Maps line item names to objects mapping label names to descriptions. Present at top level for child protocols, inside childProtocols for parent protocols.",
            {},
            {
              required: [],
              additionalProperties: { type: "object", additionalProperties: { type: "string" } },
            },
          ),
        ),
        methodologyURL: s.nullable(s.string("methodologyURL returned by DeFiLlama.")),
        tvlCodePath: s.nullable(s.string("tvlCodePath returned by DeFiLlama.")),
        hallmarks: s.nullable(
          s.array(
            "Notable events as [timestamp, description] pairs",
            s.array("Result entry returned by DeFiLlama.", {
              description: "Result entry returned by DeFiLlama.",
            }),
          ),
        ),
        linkedProtocols: s.array(
          "linkedProtocols returned by DeFiLlama.",
          s.string("Result entry returned by DeFiLlama."),
        ),
        childProtocols: s.nullable(
          s.array(
            "Child protocol versions with their methodology details. Only present for parent protocols.",
            s.object(
              "Result entry returned by DeFiLlama.",
              {
                name: s.string("name returned by DeFiLlama."),
                defillamaId: s.string("defillamaId returned by DeFiLlama."),
                displayName: s.string("displayName returned by DeFiLlama."),
                methodologyURL: s.nullable(s.string("methodologyURL returned by DeFiLlama.")),
                methodology: s.object(
                  "methodology returned by DeFiLlama.",
                  {},
                  { required: [], additionalProperties: s.string("Value for this key.") },
                ),
                breakdownMethodology: s.object(
                  "breakdownMethodology returned by DeFiLlama.",
                  {},
                  {
                    required: [],
                    additionalProperties: s.object(
                      "Value for this key.",
                      {},
                      { required: [], additionalProperties: s.string("Value for this key.") },
                    ),
                  },
                ),
              },
              { required: [], additionalProperties: true },
            ),
          ),
        ),
        hasLabelBreakdown: s.boolean("hasLabelBreakdown returned by DeFiLlama."),
        defillamaId: s.string("defillamaId returned by DeFiLlama."),
        displayName: s.string("displayName returned by DeFiLlama."),
        slug: s.string("slug returned by DeFiLlama."),
        protocolType: s.string("protocolType returned by DeFiLlama."),
        aggregates: s.object(
          "Financial data aggregated by time period",
          {
            yearly: s.object(
              "Keyed by year (e.g. '2024'). Each value is an object of line items.",
              {},
              {
                required: [],
                additionalProperties: s.object(
                  "Financial line items for a time period. Common line items include Gross Protocol Revenue, Cost Of Revenue, Gross Profit, Token Holder Net Income, Incentives, and Earnings. Each line item has a value and optional by-label breakdown.",
                  {},
                  {
                    required: [],
                    additionalProperties: s.object(
                      "Value for this key.",
                      {
                        "value": s.number("Total USD value for this line item in the period"),
                        "by-label": s.nullable(
                          s.object(
                            "Breakdown by label (e.g. Borrow Interest, Liquidation Fees, Flash Loans). Not present for all line items.",
                            {},
                            { required: [], additionalProperties: { type: "number" } },
                          ),
                        ),
                      },
                      { required: [], additionalProperties: true },
                    ),
                  },
                ),
              },
            ),
            quarterly: s.object(
              "Keyed by quarter (e.g. '2024-Q1'). Each value is an object of line items.",
              {},
              {
                required: [],
                additionalProperties: s.object(
                  "Financial line items for a time period.",
                  {},
                  {
                    required: [],
                    additionalProperties: s.object(
                      "Value for this key.",
                      {
                        "value": s.number("Total USD value for this line item in the period"),
                        "by-label": s.nullable(
                          s.object(
                            "Breakdown by label. Not present for all line items.",
                            {},
                            { required: [], additionalProperties: { type: "number" } },
                          ),
                        ),
                      },
                      { required: [], additionalProperties: true },
                    ),
                  },
                ),
              },
            ),
            monthly: s.object(
              "Keyed by month (e.g. '2024-01'). Each value is an object of line items.",
              {},
              {
                required: [],
                additionalProperties: s.object(
                  "Financial line items for a time period.",
                  {},
                  {
                    required: [],
                    additionalProperties: s.object(
                      "Value for this key.",
                      {
                        "value": s.number("Total USD value for this line item in the period"),
                        "by-label": s.nullable(
                          s.object(
                            "Breakdown by label. Not present for all line items.",
                            {},
                            { required: [], additionalProperties: { type: "number" } },
                          ),
                        ),
                      },
                      { required: [], additionalProperties: true },
                    ),
                  },
                ),
              },
            ),
          },
          { required: [], additionalProperties: true },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
];
