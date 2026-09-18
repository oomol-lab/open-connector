import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pipedream";

const rawObjectSchema = s.looseObject("The raw object returned by Pipedream.");
const pageInfoSchema = s.object("Pagination metadata returned by Pipedream list endpoints.", {
  totalCount: s.nullable(s.number("The total number of matching records when provided.")),
  count: s.nullable(s.number("The number of records in this page when provided.")),
  startCursor: s.nullable(s.string("The first cursor in this page when provided.")),
  endCursor: s.nullable(s.string("The last cursor in this page when provided.")),
  raw: rawObjectSchema,
});
const workspaceSchema = s.object("A normalized Pipedream workspace record.", {
  id: s.string("The Pipedream workspace ID."),
  name: s.nullable(s.string("The workspace display name when provided.")),
  orgname: s.nullable(s.string("The workspace slug when provided.")),
  email: s.nullable(s.string("The workspace email address when provided.")),
  dailyCreditsQuota: s.nullable(s.number("The daily credit quota when provided.")),
  dailyCreditsUsed: s.nullable(s.number("The daily credits used when provided.")),
  raw: rawObjectSchema,
});
const appSchema = s.object("A normalized Pipedream app record.", {
  id: s.string("The Pipedream app ID."),
  nameSlug: s.nullable(s.string("The Pipedream app name slug when provided.")),
  name: s.nullable(s.string("The Pipedream app display name when provided.")),
  authType: s.nullable(s.string("The app authentication type when provided.")),
  description: s.nullable(s.string("The app description when provided.")),
  imageUrl: s.nullable(s.string("The app logo URL when provided.")),
  categories: s.array("The app categories returned by Pipedream.", s.string("An app category.")),
  raw: rawObjectSchema,
});
const workflowSchema = s.object("A normalized Pipedream workflow record.", {
  id: s.string("The Pipedream workflow ID."),
  name: s.nullable(s.string("The workflow name when provided.")),
  active: s.nullable(s.boolean("Whether the workflow is active when provided.")),
  raw: rawObjectSchema,
});
const workflowEmitSchema = s.object("A normalized Pipedream workflow emitted event summary.", {
  id: s.string("The emitted event summary ID."),
  indexedAtMs: s.nullable(s.number("The event indexing timestamp in milliseconds when provided.")),
  event: s.unknown("The event payload returned by Pipedream."),
  metadata: rawObjectSchema,
  raw: rawObjectSchema,
});

export const pipedreamActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the authenticated Pipedream user profile and accessible workspaces.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving the authenticated Pipedream user.", {}),
    outputSchema: s.object("The normalized authenticated Pipedream user.", {
      user: s.object("The authenticated Pipedream user profile.", {
        id: s.string("The Pipedream user ID."),
        username: s.nullable(s.string("The Pipedream username when provided.")),
        email: s.nullable(s.string("The user's email address when provided.")),
        workspaces: s.array("The workspaces available to this user.", workspaceSchema),
        raw: rawObjectSchema,
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    operationType: "read",
    description: "Search or list apps available in the Pipedream integration catalog.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Pipedream apps.",
      {
        q: s.nonEmptyString("A search query for app names or slugs."),
        hasComponents: s.boolean("Whether to return only apps with public triggers or actions."),
        hasActions: s.boolean("Whether to return only apps with public actions."),
        hasTriggers: s.boolean("Whether to return only apps with public triggers."),
        limit: s.integer("The number of apps to return.", { minimum: 1, maximum: 100 }),
        after: s.nonEmptyString("The pagination cursor returned by a previous Pipedream response."),
        before: s.nonEmptyString("The pagination cursor returned by a previous Pipedream response."),
      },
      { optional: ["q", "hasComponents", "hasActions", "hasTriggers", "limit", "after", "before"] },
    ),
    outputSchema: s.object("The normalized Pipedream apps page.", {
      apps: s.array("The Pipedream apps returned for this page.", appSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_app",
    operationType: "read",
    description: "Retrieve metadata for one Pipedream app by app ID or name slug.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving one Pipedream app.", {
      appId: s.nonEmptyString("The Pipedream app ID or name slug to retrieve."),
    }),
    outputSchema: s.object("The normalized Pipedream app response.", { app: appSchema }),
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    operationType: "read",
    description: "Retrieve one Pipedream workflow by workflow ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving one Pipedream workflow.",
      {
        workflowId: s.nonEmptyString("The Pipedream workflow ID to retrieve."),
        orgId: s.nonEmptyString("The Pipedream workspace ID used to scope user API key requests."),
      },
      { optional: ["orgId"] },
    ),
    outputSchema: s.object("The normalized Pipedream workflow response.", { workflow: workflowSchema }),
  }),
  defineProviderAction(service, {
    name: "get_workflow_emits",
    operationType: "read",
    description: "Retrieve recent emitted event summaries for one Pipedream workflow.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving Pipedream workflow emitted events.",
      {
        workflowId: s.nonEmptyString("The Pipedream workflow ID whose events should be listed."),
        expandEvent: s.boolean("Whether to request expanded event payloads from Pipedream."),
        limit: s.integer("The number of emitted events to return.", { minimum: 1, maximum: 100 }),
        after: s.nonEmptyString("The pagination cursor returned by a previous Pipedream response."),
        before: s.nonEmptyString("The pagination cursor returned by a previous Pipedream response."),
      },
      { optional: ["expandEvent", "limit", "after", "before"] },
    ),
    outputSchema: s.object("The normalized Pipedream workflow emitted event page.", {
      emits: s.array("The emitted event summaries returned for this page.", workflowEmitSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    operationType: "read",
    description: "Retrieve one Pipedream workspace and its current usage metadata.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving one Pipedream workspace.", {
      workspaceId: s.nonEmptyString("The Pipedream workspace ID to retrieve."),
    }),
    outputSchema: s.object("The normalized Pipedream workspace response.", { workspace: workspaceSchema }),
  }),
];
