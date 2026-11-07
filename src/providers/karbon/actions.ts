import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const listInput = s.object(
  "Karbon client list query. Use nextPageUrl alone to continue a previous query.",
  {
    filter: s.string(
      "OData filter expression. Supported properties depend on the entity; client groups support FullName.",
    ),
    orderBy: s.string(
      "OData sort expression, such as FullName desc. Contacts and organizations also support LastModifiedDateTime.",
    ),
    top: s.integer("Maximum records per page, from 1 to 100.", { minimum: 1, maximum: 100 }),
    skip: s.integer("Number of records to skip.", { minimum: 0 }),
    nextPageUrl: s.string("The nextPageUrl returned by the same list action. Supply without other query fields.", {
      format: "uri",
    }),
  },
  { optional: ["filter", "orderBy", "top", "skip", "nextPageUrl"] },
);

const listOutput = s.object(
  "A page of Karbon client records.",
  {
    items: s.array("Client records in this page.", s.looseObject("Client summary with upstream fields preserved.")),
    count: s.integer("Total matching records when provided by Karbon."),
    nextPageUrl: s.string("URL for the next page when more records are available."),
  },
  { optional: ["count", "nextPageUrl"] },
);

function detailInput(expansions: string) {
  return s.object(
    "Karbon client detail query.",
    {
      key: s.string("The Karbon-generated entity key from the corresponding list action.", {
        minLength: 1,
      }),
      expand: s.string(`Comma-separated related fields to include: ${expansions}.`, {
        minLength: 1,
      }),
    },
    { optional: ["expand"] },
  );
}

export const karbonActions: ProviderActionDefinition[] = [
  defineProviderAction("karbon", {
    name: "list_contacts",
    operationType: "read",
    description:
      "Search and paginate Karbon contacts by name, email, phone, contact type or external key using OData filters. Hidden and private clients require additional API access.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput,
  }),
  defineProviderAction("karbon", {
    name: "get_contact",
    operationType: "read",
    description:
      "Read a Karbon contact by key, optionally including business cards, client team, client access and service types.",
    requiredScopes: [],
    inputSchema: detailInput("BusinessCards, ClientTeam, ClientAccess, ServiceTypes"),
    outputSchema: s.requiredObject("Karbon contact details.", {
      contact: s.looseObject("Contact and requested related fields, preserving upstream properties."),
    }),
  }),
  defineProviderAction("karbon", {
    name: "list_organizations",
    operationType: "read",
    description:
      "Search and paginate Karbon organizations using OData filters and ordering. Hidden and private clients require additional API access.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput,
  }),
  defineProviderAction("karbon", {
    name: "get_organization",
    operationType: "read",
    description:
      "Read a Karbon organization by key, optionally including business cards, client team, contacts and service types.",
    requiredScopes: [],
    inputSchema: detailInput("BusinessCards, ClientTeam, Contacts, ServiceTypes"),
    outputSchema: s.requiredObject("Karbon organization details.", {
      organization: s.looseObject("Organization and requested related fields, preserving upstream properties."),
    }),
  }),
  defineProviderAction("karbon", {
    name: "list_client_groups",
    operationType: "read",
    description: "Search and paginate Karbon client groups by FullName using OData filters and ordering.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput,
  }),
  defineProviderAction("karbon", {
    name: "get_client_group",
    operationType: "read",
    description: "Read a Karbon client group by key, optionally including its business card and client team.",
    requiredScopes: [],
    inputSchema: detailInput("BusinessCard, ClientTeam"),
    outputSchema: s.requiredObject("Karbon client group details.", {
      clientGroup: s.looseObject("Client group and requested related fields, preserving upstream properties."),
    }),
  }),
  defineProviderAction("karbon", {
    name: "get_tenant_settings",
    operationType: "read",
    description:
      "Read Karbon tenant configuration, including contact types, work types, work statuses and service types.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Tenant settings query.", {}),
    outputSchema: s.requiredObject("Karbon tenant configuration.", {
      settings: s.looseObject("Tenant settings with upstream configuration fields preserved."),
    }),
  }),
];
