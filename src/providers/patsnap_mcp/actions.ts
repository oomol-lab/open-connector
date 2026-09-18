import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { PatsnapServer } from "./servers.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { patsnapDesignActions } from "./design-actions.ts";
import { patsnapLandscapeActions } from "./landscape-actions.ts";
import { patsnapResultSchema as resultSchema } from "./schemas.ts";
import { patsnapServerNames } from "./servers.ts";

// Tool names and parameters come from the official core-patents page. Do not replace the MCP sort field with the REST sort array.
const patsnapCoreActions: ProviderActionDefinition[] = [
  defineProviderAction("patsnap_mcp", {
    name: "transfer_data",
    operationType: "read",
    description:
      "Retrieves Valuation Patent Transfer Data data so users can review the key information and continue with downstream analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "search_patents",
    operationType: "read",
    description:
      "Searches Patent Search By Query based on input criteria and returns matching results for screening, comparison, and follow-up analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        collapse_order_authority: s.optional(
          s.array("Authority priority for collapse order.", s.string("A patent authority code, such as CN or US.")),
        ),
        offset: s.optional(s.integer("Result offset. Default 0.")),
        sort_field: s.optional(s.string("Sort field. Default SCORE.")),
        limit: s.optional(s.integer("Result limit. Default 10.")),
        stemming: s.optional(s.integer("Stemming. 0=off, 1=on.")),
        collapse_order: s.optional(s.string("Collapse order. Default LATEST.")),
        sort_order: s.optional(s.string("Sort order. Default DESC.")),
        query_text: s.string("Query text. Supports keywords, phrases, Boolean expressions, etc."),
        collapse_type: s.optional(s.string("Collapse type. Default ALL.")),
        collapse_by: s.optional(s.string("Collapse by. Default PBD.")),
      }),
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "reexamination_invalidation",
    operationType: "read",
    description:
      "Retrieves Reexamination And Invalidation to assess status changes, patent stability, and potential legal risk.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "pledge_data",
    operationType: "read",
    description:
      "Retrieves Valuation Patent Pledge Data data so users can review the key information and continue with downstream analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "pdf",
    operationType: "read",
    description: "Retrieves detailed Full-text PDF for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "license_data",
    operationType: "read",
    description:
      "Retrieves Valuation Patent License Data data so users can review the key information and continue with downstream analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "legal_data",
    operationType: "read",
    description: "Retrieves detailed Legal Details for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "get_patent_legal_status",
    operationType: "read",
    description: "Retrieves Simple Legal Status to assess status changes, patent stability, and potential legal risk.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "fulltext_image",
    operationType: "read",
    description: "Retrieves detailed Full-text Images for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        offset: s.optional(s.integer("Result offset. Default 0.")),
        patent_number: s.optional(s.string("Patent publication number.")),
        limit: s.optional(s.integer("Result limit. Default 100.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "forward_citation",
    operationType: "read",
    description:
      "Retrieves Valuation Patent Forward Citation data so users can review the key information and continue with downstream analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "family",
    operationType: "read",
    description: "Retrieves Patent Family to review family relationships, jurisdictional coverage, and family breadth.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "description_translated",
    operationType: "read",
    description: "Retrieves detailed Translated Description for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID. Supports multiple IDs separated by commas.")),
        replace_by_related: s.optional(s.integer("Replace by related patent text. 0=no, 1=yes.")),
        patent_number: s.optional(s.string("Patent publication number.")),
        lang: s.string("Target language. e.g.: 'en', 'zh'."),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "description",
    operationType: "read",
    description: "Retrieves detailed Description for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID. Supports multiple IDs separated by commas.")),
        replace_by_related: s.optional(s.integer("Replace by related patent text. 0=no, 1=yes.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "customs_data",
    operationType: "read",
    description: "Retrieves Customs Recordation to assess status changes, patent stability, and potential legal risk.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "claim_translated",
    operationType: "read",
    description: "Retrieves detailed Translated Claims for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID. Supports multiple IDs separated by commas.")),
        replace_by_related: s.optional(s.integer("Replace by related patent text. 0=no, 1=yes.")),
        patent_number: s.optional(s.string("Patent publication number.")),
        lang: s.string("Target language. e.g.: 'en', 'zh'."),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "claims",
    operationType: "read",
    description: "Retrieves detailed Claims for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID. Supports multiple IDs separated by commas.")),
        replace_by_related: s.optional(s.integer("Replace by related patent text. 0=no, 1=yes.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "bibliography",
    operationType: "read",
    description: "Retrieves detailed Bibliography for verification, full-text review, and deeper analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "award_data",
    operationType: "read",
    description: "Retrieves Patent Awards to review honors, awards, and external recognition for a company or patent.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID.")),
        patent_number: s.optional(s.string("Patent publication number.")),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "abstract_translated",
    operationType: "read",
    description:
      "Retrieves Patent Abstract Translated data so users can review the key information and continue with downstream analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID. Supports multiple IDs separated by commas.")),
        replace_by_related: s.optional(s.integer("Replace by related patent text. 0=no, 1=yes.")),
        patent_number: s.optional(s.string("Patent publication number.")),
        lang: s.string("Target language. e.g.: 'en', 'zh'."),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "abstract_image",
    operationType: "read",
    description:
      "Retrieves Valuation Patent Abstract Image data so users can review the key information and continue with downstream analysis.",
    inputSchema: {
      ...s.requiredObject("Patsnap core patent tool arguments.", {
        patent_id: s.optional(s.string("Patent ID. Supports multiple IDs separated by commas.")),
        patent_number: s.optional(
          s.string("Patent publication number. Supports multiple numbers separated by commas."),
        ),
      }),
      anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
    },
    outputSchema: resultSchema,
  }),
];

export const patsnapMcpToolRoutes: Map<string, { server: PatsnapServer; toolName: string }> = new Map<
  string,
  { server: PatsnapServer; toolName: string }
>([
  ...patsnapCoreActions.map(
    (action) => [action.name, { server: "core_patents" as const, toolName: action.name }] as const,
  ),
  ...patsnapLandscapeActions.map(
    (action) =>
      [action.name, { server: "patent_landscape" as const, toolName: action.name.slice("landscape_".length) }] as const,
  ),
  ...patsnapDesignActions.map(
    (action) =>
      [action.name, { server: "design_infringement" as const, toolName: action.name.slice("design_".length) }] as const,
  ),
]);

export const patsnapMcpActions: ProviderActionDefinition[] = [
  ...patsnapCoreActions,
  ...patsnapLandscapeActions,
  ...patsnapDesignActions,
  defineProviderAction("patsnap_mcp", {
    name: "list_tools",
    operationType: "read",
    description: "Discover current tools and live input schemas for one Patsnap MCP service. Defaults to core_patents.",
    inputSchema: s.requiredObject("Select one Patsnap MCP service to inspect.", {
      server: s.optional(s.stringEnum("MCP service to inspect; defaults to core_patents.", patsnapServerNames)),
    }),
    outputSchema: s.object("The current Patsnap MCP tool catalog.", {
      server: s.string("The Patsnap MCP service that provided these tools."),
      tools: s.array(
        "Tools available to this Patsnap account.",
        s.object("A Patsnap MCP tool.", {
          name: s.string("The exact upstream tool name."),
          description: s.optional(s.string("The upstream tool description.")),
          inputSchema: s.looseObject("The live JSON Schema for this tool input."),
          annotations: s.optional(s.looseObject("Upstream MCP behavior hints.")),
          actionName: s.optional(
            s.string("The corresponding Connector action name, when this tool has been integrated."),
          ),
        }),
      ),
    }),
  }),
];
