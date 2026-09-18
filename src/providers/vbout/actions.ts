import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vbout";

const emptyInput = s.object("This action does not require any input.", {});
const id = (description: string) => s.integer(description, { minimum: 1 });
const customFields = s.record(
  "Custom VBOUT list fields keyed by their numeric field identifiers.",
  s.string("The value assigned to this custom contact field."),
);
const contactStatus = s.stringEnum("The VBOUT contact subscription status.", ["Active", "Disactive"]);

const rateLimit = s.looseObject("Rate-limit details returned by VBOUT.", {
  limit: s.string("Maximum requests allowed in the current window."),
  requests: s.string("Requests already made in the current window."),
  remaining: s.string("Requests remaining in the current window."),
  reached: s.string("Whether the current request reached the rate limit."),
  reset: s.string("Unix timestamp when the current rate-limit window resets."),
  after: s.string("Seconds to wait before retrying after reaching the limit."),
});

const vboutOutput = (description: string, dataDescription: string) =>
  s.object(
    description,
    {
      status: s.nonEmptyString("VBOUT response status, normally ok for successful requests."),
      data: s.looseObject(dataDescription, {}),
      rateLimit,
    },
    { optional: ["data", "rateLimit"] },
  );

const contactWriteProperties = {
  email: s.email("The contact email address."),
  ipAddress: s.nonEmptyString("The contact IP address recorded by VBOUT."),
  status: contactStatus,
  fields: customFields,
};

export const vboutActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Get the business profile associated with the current VBOUT API key.",
    requiredScopes: [],
    inputSchema: emptyInput,
    outputSchema: vboutOutput("The current VBOUT account response.", "VBOUT business details."),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List email marketing lists available in the connected VBOUT account.",
    requiredScopes: [],
    inputSchema: emptyInput,
    outputSchema: vboutOutput(
      "The VBOUT email list collection response.",
      "The lists collection, including count and list items.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_list",
    operationType: "read",
    description: "Get one VBOUT email marketing list and its configured custom fields.",
    requiredScopes: [],
    inputSchema: s.object("The list lookup input.", {
      listId: id("The numeric VBOUT email list identifier."),
    }),
    outputSchema: vboutOutput("The VBOUT email list response.", "The requested list details."),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List contacts belonging to a specific VBOUT email marketing list.",
    requiredScopes: [],
    inputSchema: s.object("The contact collection input.", {
      listId: id("The numeric VBOUT email list identifier."),
    }),
    outputSchema: vboutOutput(
      "The VBOUT contact collection response.",
      "The contacts collection, including count and contact items.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one VBOUT contact by its numeric contact identifier.",
    requiredScopes: [],
    inputSchema: s.object("The contact lookup input.", {
      contactId: id("The numeric VBOUT contact identifier."),
    }),
    outputSchema: vboutOutput("The VBOUT contact response.", "The requested contact details."),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a contact in a VBOUT email marketing list.",
    requiredScopes: [],
    inputSchema: s.object(
      "The new contact input.",
      {
        listId: id("The numeric VBOUT email list identifier."),
        email: contactWriteProperties.email,
        status: contactWriteProperties.status,
        ipAddress: contactWriteProperties.ipAddress,
        fields: contactWriteProperties.fields,
      },
      { optional: ["email", "ipAddress", "fields"] },
    ),
    outputSchema: vboutOutput("The VBOUT contact creation response.", "Creation result data."),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update standard or custom fields for an existing VBOUT contact.",
    requiredScopes: [],
    inputSchema: s.object(
      "The contact update input.",
      {
        contactId: id("The numeric VBOUT contact identifier."),
        ...contactWriteProperties,
      },
      { optional: ["email", "ipAddress", "status", "fields"] },
    ),
    outputSchema: vboutOutput("The VBOUT contact update response.", "Update result data."),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete a contact from a specific VBOUT email marketing list.",
    requiredScopes: [],
    inputSchema: s.object("The contact deletion input.", {
      contactId: id("The numeric VBOUT contact identifier."),
      listId: id("The numeric VBOUT email list identifier containing the contact."),
    }),
    outputSchema: vboutOutput("The VBOUT contact deletion response.", "Deletion result data."),
  }),
];
