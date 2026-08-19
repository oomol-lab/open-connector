import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dns_filter";

const resourceIdField = s.nonEmptyString("The DNSFilter resource ID.");
const pageNumberField = s.positiveInteger("The page number to request.");
const pageSizeField = s.positiveInteger("The number of records to request per page.");
const organizationIdField = s.positiveInteger("The DNSFilter organization ID.");
const categoryIdsField = s.array(
  "The DNSFilter application category IDs used to filter applications.",
  s.positiveInteger("One DNSFilter application category ID."),
  { minItems: 1 },
);
const linksSchema = s.looseObject("Pagination links returned by DNSFilter.", {
  self: s.nullable(s.string("The current page URL returned by DNSFilter.")),
  first: s.nullable(s.string("The first page URL returned by DNSFilter.")),
  prev: s.nullable(s.string("The previous page URL returned by DNSFilter.")),
  next: s.nullable(s.string("The next page URL returned by DNSFilter.")),
  last: s.nullable(s.string("The last page URL returned by DNSFilter.")),
});
const resourceSchema = s.looseObject("A JSON:API resource returned by DNSFilter.", {
  id: s.string("The DNSFilter resource ID."),
  type: s.string("The DNSFilter resource type."),
  uuid: s.string("The DNSFilter resource UUID when provided."),
  attributes: s.looseObject("The DNSFilter resource attributes."),
  relationships: s.looseObject("The DNSFilter resource relationships."),
});
const listOutputSchema = (description: string, itemDescription: string) =>
  s.object(
    description,
    {
      items: s.array(itemDescription, resourceSchema),
      links: linksSchema,
    },
    { optional: ["links"] },
  );

const emptyInputSchema = s.object("No input is required for this DNSFilter action.", {});

const paginatedInputSchema = s.object(
  "Pagination options for DNSFilter list endpoints.",
  {
    page_number: pageNumberField,
    page_size: pageSizeField,
  },
  { optional: ["page_number", "page_size"] },
);

const getResourceInputSchema = s.object("Input for retrieving one DNSFilter resource.", {
  id: resourceIdField,
});

const listApplicationsInputSchema = s.object(
  "Input for listing DNSFilter applications.",
  {
    category_ids: categoryIdsField,
    page_number: pageNumberField,
    page_size: pageSizeField,
  },
  { optional: ["category_ids", "page_number", "page_size"] },
);

const listPoliciesInputSchema = s.object(
  "Input for listing DNSFilter policies.",
  {
    include_global_policies: s.boolean("Whether to include global policies in the response."),
    organization_id: organizationIdField,
    page_number: pageNumberField,
    page_size: pageSizeField,
  },
  { optional: ["include_global_policies", "organization_id", "page_number", "page_size"] },
);

const listNetworksInputSchema = s.object(
  "Input for listing DNSFilter networks.",
  {
    basic_info: s.boolean("Whether to return only basic DNSFilter network information."),
    count_network_ips: s.boolean("Whether to include IP address counts for each network."),
    force_truncate_ips: s.boolean("Whether to omit network IP address details."),
    protected: s.boolean("Whether to include only networks with an assigned policy."),
    search: s.nonEmptyString("Search text matched against network names, hostnames, or IP addresses."),
    unprotected: s.boolean("Whether to include only networks without an assigned policy."),
    page_number: pageNumberField,
    page_size: pageSizeField,
  },
  {
    optional: [
      "basic_info",
      "count_network_ips",
      "force_truncate_ips",
      "protected",
      "search",
      "unprotected",
      "page_number",
      "page_size",
    ],
  },
);

const listIpAddressesInputSchema = s.object(
  "Input for listing DNSFilter IP addresses.",
  {
    search: s.nonEmptyString("Search text matched against DNSFilter IP address records."),
    page_number: pageNumberField,
    page_size: pageSizeField,
  },
  { optional: ["search", "page_number", "page_size"] },
);

const currentUserOutputSchema = s.object("The authenticated DNSFilter user.", {
  user: resourceSchema,
});

const resourceOutputSchema = (description: string) =>
  s.object(description, {
    item: resourceSchema,
  });

const myIpOutputSchema = s.object("The public IP address observed by DNSFilter.", {
  ip: s.string("The caller public IP address returned by DNSFilter."),
});

export const dnsFilterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the DNSFilter user associated with the API key.",
    inputSchema: emptyInputSchema,
    outputSchema: currentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List DNSFilter domain categories with optional pagination.",
    inputSchema: paginatedInputSchema,
    outputSchema: listOutputSchema(
      "The DNSFilter categories response.",
      "DNSFilter categories returned by the request.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_category",
    description: "Get one DNSFilter domain category by ID.",
    inputSchema: getResourceInputSchema,
    outputSchema: resourceOutputSchema("The DNSFilter category response."),
  }),
  defineProviderAction(service, {
    name: "list_application_categories",
    description: "List DNSFilter application categories with optional pagination.",
    inputSchema: paginatedInputSchema,
    outputSchema: listOutputSchema(
      "The DNSFilter application categories response.",
      "DNSFilter application categories returned by the request.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_applications",
    description: "List DNSFilter applications with optional category filtering and pagination.",
    inputSchema: listApplicationsInputSchema,
    outputSchema: listOutputSchema(
      "The DNSFilter applications response.",
      "DNSFilter applications returned by the request.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_policies",
    description: "List DNSFilter policies with optional organization and global-policy filters.",
    inputSchema: listPoliciesInputSchema,
    outputSchema: listOutputSchema("The DNSFilter policies response.", "DNSFilter policies returned by the request."),
  }),
  defineProviderAction(service, {
    name: "list_networks",
    description: "List DNSFilter networks with optional search and policy assignment filters.",
    inputSchema: listNetworksInputSchema,
    outputSchema: s.object(
      "The DNSFilter networks response.",
      {
        items: s.array("DNSFilter networks returned by the request.", resourceSchema),
        included: s.array("Included DNSFilter resources returned by the request.", resourceSchema),
        links: linksSchema,
      },
      { optional: ["included", "links"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_ip_addresses",
    description: "List DNSFilter IP address records with optional search and pagination.",
    inputSchema: listIpAddressesInputSchema,
    outputSchema: listOutputSchema(
      "The DNSFilter IP addresses response.",
      "DNSFilter IP addresses returned by the request.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_my_ip",
    description: "Get the public IP address observed by DNSFilter for the current request.",
    inputSchema: emptyInputSchema,
    outputSchema: myIpOutputSchema,
  }),
];
