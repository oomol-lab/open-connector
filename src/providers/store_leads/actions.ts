import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "store_leads";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });
const fieldsSchema = nonEmptyString("A comma-separated list of Store Leads response fields to include.");
const pageSizeSchema = s.integer("The number of records to return in one page. Store Leads caps this at 50.", {
  minimum: 1,
  maximum: 50,
});
const domainSchema = s.looseObject("A Store Leads domain object.", {
  name: s.string("The public DNS domain name."),
  platform: s.string("The ecommerce platform detected for the domain."),
  state: s.string("The current Store Leads state for the domain."),
  merchant_name: s.string("The merchant name when Store Leads has one."),
});
const appSchema = s.looseObject("A Store Leads app object.", {
  id: s.string("The Store Leads app identifier."),
  token: s.string("The platform-specific app token."),
  platform: s.string("The ecommerce platform for the app."),
  name: s.string("The app name."),
  installs: s.integer("The number of active stores that have the app installed."),
});
const technologySchema = s.looseObject("A Store Leads technology object.", {
  name: s.string("The technology name."),
  description: s.string("The technology description."),
  vendor_url: s.string("The technology vendor URL."),
  icon_url: s.string("The technology icon URL."),
  installs: s.integer("The number of domains where Store Leads detected the technology."),
});

export const storeLeadsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_domain",
    operationType: "read",
    description: "Retrieve Store Leads details for one ecommerce domain name.",
    inputSchema: s.object(
      {
        domain: nonEmptyString("The public DNS domain or platform domain to retrieve."),
        follow_redirects: s.boolean("Whether Store Leads should automatically follow domain redirects."),
        fields: fieldsSchema,
      },
      { required: ["domain"], description: "Input for retrieving one Store Leads domain." },
    ),
    outputSchema: s.object(
      { domain: domainSchema },
      { required: ["domain"], description: "Store Leads domain response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_domains",
    operationType: "read",
    description: "List Store Leads domains with optional advanced search and cursor pagination.",
    inputSchema: s.object(
      {
        cursor: nonEmptyString("The Store Leads cursor used to retrieve the next page."),
        aq: nonEmptyString("An advanced Store Leads domain search expression."),
        fields: fieldsSchema,
        page_size: pageSizeSchema,
      },
      { description: "Input for listing Store Leads domains." },
    ),
    outputSchema: s.object(
      {
        domains: s.array(domainSchema, { description: "Domains returned by Store Leads." }),
        next_cursor: s.nullableString("The cursor for the next result page."),
      },
      { required: ["domains", "next_cursor"], description: "Store Leads domains list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_app",
    operationType: "read",
    description: "Retrieve Store Leads details for one ecommerce app.",
    inputSchema: s.object(
      {
        app_id: nonEmptyString('The Store Leads app identifier, such as "shopify.marsello".'),
        fields: fieldsSchema,
      },
      { required: ["app_id"], description: "Input for retrieving one Store Leads app." },
    ),
    outputSchema: s.object({ app: appSchema }, { required: ["app"], description: "Store Leads app response." }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    operationType: "read",
    description: "List Store Leads ecommerce apps with optional filters and page pagination.",
    inputSchema: s.object(
      {
        page: s.nonNegativeInteger("The zero-based page of results to return."),
        page_size: pageSizeSchema,
        sort: nonEmptyString("A Store Leads sort expression."),
        q: nonEmptyString("A text query used to filter apps by name or description."),
        fields: fieldsSchema,
        platform: s.stringEnum("The ecommerce platform used to filter apps.", [
          "custom",
          "shopify",
          "wix",
          "woocommerce",
        ]),
        categories: nonEmptyString("A comma-separated list of app categories."),
      },
      { description: "Input for listing Store Leads apps." },
    ),
    outputSchema: s.object(
      { apps: s.array(appSchema, { description: "Apps returned by Store Leads." }) },
      { required: ["apps"], description: "Store Leads apps list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_technology",
    operationType: "read",
    description: "Retrieve Store Leads details for one detected technology.",
    inputSchema: s.object(
      {
        technology: nonEmptyString("The Store Leads technology name to retrieve."),
        fields: fieldsSchema,
      },
      { required: ["technology"], description: "Input for retrieving one Store Leads technology." },
    ),
    outputSchema: s.object(
      { technology: technologySchema },
      { required: ["technology"], description: "Store Leads technology response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_technologies",
    operationType: "read",
    description: "List Store Leads technologies with optional search and page pagination.",
    inputSchema: s.object(
      {
        page: s.nonNegativeInteger("The zero-based page of results to return."),
        page_size: pageSizeSchema,
        sort: nonEmptyString("A Store Leads sort expression."),
        q: nonEmptyString("A text query used to filter technologies."),
        fields: fieldsSchema,
      },
      { description: "Input for listing Store Leads technologies." },
    ),
    outputSchema: s.object(
      { technologies: s.array(technologySchema, { description: "Technologies returned by Store Leads." }) },
      { required: ["technologies"], description: "Store Leads technologies list response." },
    ),
  }),
];
