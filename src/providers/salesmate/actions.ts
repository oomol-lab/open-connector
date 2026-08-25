import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "salesmate";

const trimmedString = (description: string, options: { maxLength?: number } = {}) =>
  s.string(description, { minLength: 1, maxLength: options.maxLength });
const positiveId = (description: string) => s.positiveInteger(description);
const currency = (description: string) => s.string(description, { minLength: 3, maxLength: 3 });
const rawPayloadSchema = s.looseObject("The raw Salesmate response payload.");
const emptyInputSchema = s.object("No input is required for this Salesmate action.", {});

const companyFields = {
  name: trimmedString("Name of the company. Salesmate documents a maximum length of 255.", { maxLength: 255 }),
  owner: positiveId("Salesmate user ID that owns this company."),
  website: trimmedString("Website URL of the company.", { maxLength: 255 }),
  phone: trimmedString("Primary phone number of the company.", { maxLength: 255 }),
  otherPhone: trimmedString("Secondary phone number of the company.", { maxLength: 255 }),
  skypeId: trimmedString("Skype ID of the company.", { maxLength: 255 }),
  facebookHandle: trimmedString("Facebook profile or handle for the company.", { maxLength: 100 }),
  linkedInHandle: trimmedString("LinkedIn profile link for the company.", { maxLength: 100 }),
  twitterHandle: trimmedString("Twitter profile or handle for the company.", { maxLength: 100 }),
  googlePlusHandle: trimmedString("Google Plus profile or handle for the company.", { maxLength: 100 }),
  currency: currency("Three-letter ISO currency code for the company, in uppercase."),
  billingAddressLine1: trimmedString("Line one of the billing address.", { maxLength: 50 }),
  billingAddressLine2: trimmedString("Line two of the billing address.", { maxLength: 50 }),
  billingCity: trimmedString("Billing city name.", { maxLength: 50 }),
  billingZipCode: trimmedString("Billing ZIP or postal code.", { maxLength: 20 }),
  billingState: trimmedString("Billing state name.", { maxLength: 30 }),
  billingCountry: trimmedString("Billing country name.", { maxLength: 20 }),
  description: trimmedString("Description attached to the company.", { maxLength: 2000 }),
  tags: trimmedString("Comma-separated tags associated with the company.", { maxLength: 5000 }),
};

const productFields = {
  name: trimmedString("Name of the product."),
  sku: trimmedString("Unique SKU or code of the product."),
  currency: currency("Three-letter ISO currency code for the product, in uppercase."),
  unitPrice: s.number("Sale price of the product."),
  description: trimmedString("Description attached to the product.", { maxLength: 2000 }),
  isActive: s.boolean("Whether the product is active for sales."),
  tags: trimmedString("Comma-separated tags associated with the product.", { maxLength: 5000 }),
  owner: positiveId("Salesmate user ID that owns this product."),
  costPerUnit: s.number("Cost per unit for the product."),
  directCost: s.number("Direct cost of the product."),
};

export const salesmateActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_company",
    description: "Create a company record in Salesmate CRM.",
    inputSchema: s.object(
      "Fields for creating a Salesmate company.",
      {
        ...companyFields,
        customFields: s.looseObject("Additional Salesmate company custom fields keyed by field API name."),
      },
      {
        optional: [
          "owner",
          "website",
          "phone",
          "otherPhone",
          "skypeId",
          "facebookHandle",
          "linkedInHandle",
          "twitterHandle",
          "googlePlusHandle",
          "currency",
          "billingAddressLine1",
          "billingAddressLine2",
          "billingCity",
          "billingZipCode",
          "billingState",
          "billingCountry",
          "description",
          "tags",
          "customFields",
        ],
      },
    ),
    outputSchema: s.object("The Salesmate company creation response.", {
      company: rawPayloadSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Get a Salesmate company record by company ID.",
    inputSchema: s.object("Input for retrieving a Salesmate company.", {
      companyId: positiveId("Unique identifier of the Salesmate company to retrieve."),
    }),
    outputSchema: s.object("The Salesmate company lookup response.", {
      company: rawPayloadSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_product",
    description: "Create a product in Salesmate.",
    inputSchema: s.object("Fields for creating a Salesmate product.", productFields, {
      optional: ["sku", "description", "isActive", "tags", "owner", "costPerUnit", "directCost"],
    }),
    outputSchema: s.object("The Salesmate product creation response.", {
      product: rawPayloadSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_product",
    description: "Delete a Salesmate product by product ID.",
    inputSchema: s.object("Input for deleting a Salesmate product.", {
      productId: positiveId("Unique identifier of the Salesmate product to delete."),
    }),
    outputSchema: s.object("The Salesmate product deletion response.", {
      success: s.boolean("Whether Salesmate accepted the product deletion request."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_modules",
    description: "List Salesmate internal module identifiers.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Salesmate module list response.", {
      modules: s.array("The Salesmate module records.", rawPayloadSchema),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_active_users",
    description: "List active Salesmate users.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Salesmate active users response.", {
      users: s.array("The active Salesmate user records.", rawPayloadSchema),
      raw: rawPayloadSchema,
    }),
  }),
];
