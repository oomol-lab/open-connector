import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "concord";
const organizationId = s.positiveInteger("The numeric Concord organization ID.");
const looseResource = (description: string) => s.unknownObject(description);
const agreementStatuses = [
  "DRAFT",
  "VALIDATION",
  "NEGOTIATION",
  "SIGNING",
  "UNKNOWN_CONTRACT",
  "FUTURE_CONTRACT",
  "CURRENT_CONTRACT",
  "COMPLETED_CONTRACT",
  "COMPLETED_CANCEL_CONTRACT",
  "COMPLETED_CONTRACT_RENEWABLE",
  "BROKEN",
  "TRASHED",
  "NEGO_INVITE",
  "TEMPLATE",
  "TEMPLATE_AUTO",
];

export const concordActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get profile and current-organization information for the Concord API key owner.",
    inputSchema: s.actionInput({}, [], "No parameters are required to get the current Concord user."),
    outputSchema: s.actionOutput(
      { user: looseResource("The current user returned by Concord.") },
      "The current Concord user profile.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List the Concord organizations available to the API key owner.",
    inputSchema: s.actionInput({}, [], "No parameters are required to list Concord organizations."),
    outputSchema: s.actionOutput(
      {
        organizations: s.array("The available Concord organizations.", looseResource("One Concord organization.")),
      },
      "The Concord organizations available to the current user.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    operationType: "read",
    description: "Get one Concord organization by its numeric ID.",
    inputSchema: s.actionInput({ organizationId }, ["organizationId"], "A Concord organization selector."),
    outputSchema: s.actionOutput(
      { organization: looseResource("The organization returned by Concord.") },
      "The requested Concord organization.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_agreements",
    operationType: "read",
    description: "List and search agreements accessible to the current user in a Concord organization.",
    inputSchema: s.actionInput(
      {
        organizationId,
        statuses: s.array(
          "The agreement stages to include.",
          s.stringEnum("One documented Concord agreement stage.", agreementStatuses),
          { minItems: 1 },
        ),
        page: s.nonNegativeInteger("The zero-based result page to retrieve."),
        numberOfItemsByPage: s.positiveInteger("The maximum number of agreements per page."),
        search: s.nonEmptyString("Text to match against agreement titles and descriptions."),
        isInboxed: s.boolean("Whether to return only agreements displayed in the inbox."),
        isBookmarked: s.boolean("Whether to return only bookmarked agreements."),
        sortByColumn: s.nonEmptyString("The Concord column name used to sort agreements."),
        sortByAsc: s.boolean("Whether to sort agreements in ascending order."),
        tagIds: s.array("The numeric tag IDs used to filter agreements.", s.positiveInteger("One Concord tag ID.")),
      },
      ["organizationId", "statuses"],
      "Filters and pagination for listing Concord agreements.",
    ),
    outputSchema: s.actionOutput(
      {
        items: s.array("The agreements on this page.", looseResource("One Concord agreement.")),
        numberOfItems: s.number("The number of items in this response."),
        numberOfItemsByPage: s.number("The maximum number of items on one page."),
        page: s.number("The current page number."),
        total: s.integer("The total matching documents and invitations."),
        totalInvitations: s.integer("The total matching invitations."),
        result: s.string("The optional Concord result status."),
      },
      "A page of Concord agreements.",
      ["items", "numberOfItems", "numberOfItemsByPage", "page", "total", "totalInvitations"],
    ),
  }),
  defineProviderAction(service, {
    name: "list_folders",
    operationType: "read",
    description: "List the folder tree shared with the current user in a Concord organization.",
    inputSchema: s.actionInput({ organizationId }, ["organizationId"], "A Concord organization selector."),
    outputSchema: s.actionOutput(
      { folder: looseResource("The root folder tree returned by Concord.") },
      "The shared Concord folder tree.",
    ),
  }),
];
