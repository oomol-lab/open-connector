import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "certifier";

const paginationSchema = s.object(
  {
    next: s.nullableString("Cursor for the next page, or null when there is none."),
    prev: s.nullableString("Cursor for the previous page, or null when there is none."),
  },
  { required: ["next", "prev"], description: "Cursor pagination metadata returned by Certifier." },
);

const groupSchema = s.looseObject(
  {
    id: s.nonEmptyString("The unique identifier of the group."),
    name: s.nonEmptyString("The group name."),
    createdAt: s.string("Timestamp when the group was created."),
    updatedAt: s.string("Timestamp when the group was last updated."),
  },
  { description: "A Certifier group." },
);
const designSchema = s.looseObject(
  {
    id: s.nonEmptyString("The unique identifier of the design."),
    name: s.nonEmptyString("The design name."),
    type: s.string("The design type returned by Certifier."),
  },
  { description: "A Certifier design." },
);
const credentialSchema = s.looseObject("A Certifier credential.");
const interactionSchema = s.looseObject("A Certifier credential interaction event.");
const listInputSchema = s.object(
  {
    limit: s.positiveInteger("Maximum number of records to return."),
    cursor: s.nonEmptyString("Cursor from a previous response."),
  },
  { optional: ["limit", "cursor"], description: "Input for a paginated Certifier list." },
);

export const certifierActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List Certifier groups with cursor pagination.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.object({
      groups: s.array(groupSchema, { description: "Groups returned by Certifier." }),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_designs",
    operationType: "read",
    description: "List Certifier certificate and badge designs with cursor pagination.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.object({
      designs: s.array(designSchema, { description: "Designs returned by Certifier." }),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_credentials",
    operationType: "read",
    description: "List Certifier credentials with cursor pagination.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.object({
      credentials: s.array(credentialSchema, { description: "Credentials returned by Certifier." }),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_credentials",
    operationType: "read",
    description: "Search Certifier credentials with structured filter, sorting, and cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        filter: s.looseObject("Structured Certifier search filter object."),
        sort: s.object(
          {
            property: s.stringEnum(["id", "createdAt", "updatedAt", "issueDate", "expiryDate"], {
              description: "Credential field used to sort the search result.",
            }),
            order: s.stringEnum(["asc", "desc"], { description: "Sort order for the search result." }),
          },
          { optional: ["order"], description: "Sort configuration for credential search." },
        ),
        limit: s.positiveInteger("Maximum number of credentials to return."),
        cursor: s.nonEmptyString("Cursor from a previous search response."),
      },
      { required: ["filter"], description: "Input for searching Certifier credentials." },
    ),
    outputSchema: s.object({
      credentials: s.array(credentialSchema, { description: "Credentials matching the search filter." }),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_credential_interactions",
    operationType: "read",
    description:
      "List Certifier credential interaction events with optional credential filtering and cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        credentialId: s.nonEmptyString("Credential ID used to filter interaction events."),
        limit: s.positiveInteger("Maximum number of interaction events to return."),
        cursor: s.nonEmptyString("Cursor from a previous response."),
      },
      { optional: ["credentialId", "limit", "cursor"], description: "Input for listing interactions." },
    ),
    outputSchema: s.object({
      interactions: s.array(interactionSchema, { description: "Credential interaction events returned by Certifier." }),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_issue_send_credential",
    operationType: "write",
    description: "Create, issue, and send one Certifier credential in a single request.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        groupId: s.nonEmptyString("Group ID the credential should belong to."),
        recipient: s.object(
          {
            name: s.nonEmptyString("Recipient full name."),
            email: s.email("Recipient email address."),
          },
          { required: ["name", "email"], description: "Recipient details." },
        ),
        issueDate: s.date("Issue date in YYYY-MM-DD format."),
        expiryDate: s.date("Expiry date in YYYY-MM-DD format."),
        customAttributes: s.record(
          "Custom attributes forwarded to Certifier as key-value text pairs.",
          s.string("Custom attribute text value."),
        ),
      },
      { required: ["groupId", "recipient"], description: "Input for creating, issuing, and sending one credential." },
    ),
    outputSchema: s.object({
      credential: credentialSchema,
    }),
  }),
];
