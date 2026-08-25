import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "grafana_cloud";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const rawObjectSchema = s.looseObject("The raw Grafana Cloud API object.");

const pageSizeSchema = s.integer("The number of records to request from Grafana Cloud.", {
  minimum: 1,
});

const regionSchema = s.object("A normalized Grafana Cloud stack region.", {
  id: s.nullable(s.integer("The Grafana Cloud region ID.")),
  slug: s.nullable(s.string("The Grafana Cloud region slug.")),
  name: s.nullable(s.string("The Grafana Cloud region name.")),
  status: s.nullable(s.string("The Grafana Cloud region status.")),
  provider: s.nullable(s.string("The infrastructure provider for the region.")),
  description: s.nullable(s.string("The region description.")),
  raw: rawObjectSchema,
});

const stackSchema = s.object("A normalized Grafana Cloud stack.", {
  id: s.nullable(s.integer("The Grafana Cloud stack ID.")),
  slug: s.nullable(s.string("The Grafana Cloud stack slug.")),
  name: s.nullable(s.string("The Grafana Cloud stack name.")),
  url: s.nullable(s.string("The Grafana Cloud stack URL.")),
  status: s.nullable(s.string("The Grafana Cloud stack status.")),
  orgSlug: s.nullable(s.string("The Grafana Cloud organization slug.")),
  orgName: s.nullable(s.string("The Grafana Cloud organization name.")),
  regionSlug: s.nullable(s.string("The Grafana Cloud region slug for the stack.")),
  planName: s.nullable(s.string("The Grafana Cloud plan name for the stack.")),
  raw: rawObjectSchema,
});

const billedUsageSchema = s.object("A normalized Grafana Cloud billed usage item.", {
  id: s.nullable(s.integer("The Grafana Cloud billed usage item ID.")),
  dimensionId: s.nullable(s.string("The billed usage dimension ID.")),
  dimensionName: s.nullable(s.string("The billed usage dimension name.")),
  unit: s.nullable(s.string("The usage unit.")),
  includedUsage: s.nullable(s.number("The included usage quantity.")),
  totalUsage: s.nullable(s.number("The total usage quantity.")),
  overage: s.nullable(s.number("The overage quantity.")),
  amountDue: s.nullable(s.number("The amount due for this usage item.")),
  raw: rawObjectSchema,
});

export const grafanaCloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_regions",
    description: "List Grafana Cloud stack regions that can host Grafana Cloud stacks.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Grafana Cloud stack regions.", {}),
    outputSchema: s.object("Grafana Cloud stack regions response.", {
      regions: s.array("Regions returned by Grafana Cloud.", regionSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_stacks",
    description: "List Grafana Cloud stacks in the connected organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Grafana Cloud stacks.",
      {
        pageSize: pageSizeSchema,
        pageCursor: nonEmptyString("The Grafana Cloud pagination cursor from a previous response."),
      },
      { optional: ["pageSize", "pageCursor"] },
    ),
    outputSchema: s.object("Grafana Cloud stacks response.", {
      stacks: s.array("Stacks returned by Grafana Cloud.", stackSchema),
      nextPageCursor: s.nullable(
        s.string("The cursor to pass as pageCursor for the next Grafana Cloud stacks request."),
      ),
      nextPage: s.nullable(s.string("The next page URL returned by Grafana Cloud, if present.")),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_stack_connectivity",
    description: "Get private connectivity information for a Grafana Cloud stack.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving Grafana Cloud stack connectivity.", {
      stackSlug: nonEmptyString("The Grafana Cloud stack slug."),
    }),
    outputSchema: s.object("Grafana Cloud stack connectivity response.", {
      connectivity: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_billed_usage",
    description: "Get Grafana Cloud billed usage for the connected organization by month.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving Grafana Cloud billed usage.", {
      month: s.integer("The billing month to retrieve, from 1 to 12.", {
        minimum: 1,
        maximum: 12,
      }),
      year: s.integer("The billing year to retrieve.", {
        minimum: 2000,
      }),
    }),
    outputSchema: s.object("Grafana Cloud billed usage response.", {
      usage: s.array("Billed usage items returned by Grafana Cloud.", billedUsageSchema),
      raw: rawObjectSchema,
    }),
  }),
];
