import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "devin";

const nonEmpty = (description: string) => s.nonEmptyString(description);
const stringArray = (description: string, itemDescription: string) => s.array(description, nonEmpty(itemDescription));

const raw = s.looseObject("The raw Devin API response object.");
const jsonObject = s.looseObject("A JSON object returned by Devin.");
const devinMode = s.stringEnum("The Devin agent mode to use for the session.", ["normal", "fast", "lite", "ultra"]);
const sessionStatus = s.stringEnum("The current Devin session status.", [
  "new",
  "claimed",
  "running",
  "exit",
  "error",
  "suspended",
  "resuming",
]);
const sessionCategory = s.stringEnum("The Devin-assigned session category.", [
  "bug_fixing",
  "ci_cd_and_devops",
  "code_quality_and_security",
  "code_review",
  "code_review_and_analysis",
  "data_and_automation",
  "documentation_and_content",
  "feature_development",
  "migrations_and_upgrades",
  "other",
  "refactoring_and_optimization",
  "research_and_exploration",
  "security",
  "unit_test_generation",
]);
const sessionOrigin = s.stringEnum("The origin from which the Devin session was created.", [
  "webapp",
  "slack",
  "teams",
  "api",
  "linear",
  "jira",
  "automation",
  "cli",
  "desktop",
  "code_scan",
  "other",
]);

const session = s.looseObject(
  {
    session_id: nonEmpty("The Devin session identifier."),
    org_id: nonEmpty("The Devin organization identifier."),
    status: sessionStatus,
    title: s.nullableString("The Devin session title."),
    url: s.string("The web URL for the Devin session."),
    created_at: s.integer("The Unix timestamp when the session was created."),
    updated_at: s.integer("The Unix timestamp when the session was last updated."),
    origin: s.nullable(sessionOrigin),
    category: s.nullable(sessionCategory),
    structured_output: s.nullable(jsonObject),
    is_archived: s.boolean("Whether the session is archived."),
    acus_consumed: s.number("The ACUs consumed by the session."),
  },
  { description: "A Devin session." },
);

const selfOutput = s.object("The authenticated Devin principal.", {
  principalType: nonEmpty("The authenticated Devin principal type."),
  orgId: s.nullableString("The organization ID associated with the credential when available."),
  id: nonEmpty("The stable principal identifier."),
  name: s.nullableString("The principal display name when available."),
  raw,
});

const sessionOutput = s.object("The response returned with a Devin session.", {
  session,
  raw,
});

export const devinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_self",
    description: "Get identity information for the authenticated Devin API credential.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting the authenticated Devin principal.", {}),
    outputSchema: selfOutput,
  }),
  defineProviderAction(service, {
    name: "create_session",
    description: "Create a new Devin organization session from a prompt.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for creating a Devin session.",
      {
        orgId: nonEmpty("The Devin organization ID, usually prefixed with org-."),
        prompt: nonEmpty("The prompt Devin should execute in the new session."),
        title: nonEmpty("The optional title for the new session."),
        devinId: nonEmpty("Optional caller-supplied Devin session ID for the request query."),
        devinMode,
        repos: stringArray("Repository names Devin should use for the session.", "One repository."),
        attachmentUrls: s.array(
          "URLs for files Devin should attach to the session.",
          s.url("One publicly reachable attachment URL."),
        ),
        tags: stringArray("Tags to attach to the new session.", "One session tag."),
        playbookId: nonEmpty("The playbook ID to use for the session."),
        childPlaybookId: nonEmpty("The child playbook ID to use for the session."),
        knowledgeIds: stringArray("Knowledge entry IDs to attach to the session.", "One knowledge ID."),
        secretIds: stringArray("Secret IDs to attach to the session.", "One secret ID."),
        sessionLinks: stringArray("Links to associate with the session.", "One session link."),
        createAsUserId: nonEmpty("Create the session on behalf of this Devin user ID."),
        maxAcuLimit: s.integer("Maximum ACU usage allowed for the session."),
        bypassApproval: s.boolean("Whether Devin should bypass approvals when allowed."),
        resumable: s.boolean("Whether to preserve VM state after the session stops."),
        platform: nonEmpty("The configured VM platform label to use for the session."),
        structuredOutputRequired: s.boolean("Whether Devin must provide final structured output before finishing."),
        structuredOutputSchema: jsonObject,
      },
      {
        required: ["orgId", "prompt"],
        optional: [
          "title",
          "devinId",
          "devinMode",
          "repos",
          "attachmentUrls",
          "tags",
          "playbookId",
          "childPlaybookId",
          "knowledgeIds",
          "secretIds",
          "sessionLinks",
          "createAsUserId",
          "maxAcuLimit",
          "bypassApproval",
          "resumable",
          "platform",
          "structuredOutputRequired",
          "structuredOutputSchema",
        ],
      },
    ),
    outputSchema: sessionOutput,
  }),
  defineProviderAction(service, {
    name: "list_sessions",
    description: "List Devin organization sessions with optional filters using cursor-based pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Devin sessions.",
      {
        orgId: nonEmpty("The Devin organization ID, usually prefixed with org-."),
        first: s.integer("The maximum number of sessions to return.", { minimum: 1, maximum: 200 }),
        after: nonEmpty("The pagination cursor returned by a previous list_sessions call."),
        devinId: nonEmpty("Filter results to one Devin session ID."),
        sessionIds: stringArray("Filter results by Devin session IDs.", "One Devin session ID."),
        userIds: stringArray("Filter results by Devin user IDs.", "One Devin user ID."),
        serviceUserIds: stringArray("Filter results by Devin service user IDs.", "One Devin service user ID."),
        repoNames: stringArray("Filter results by repository names such as owner/repo.", "One repository name."),
        tags: stringArray("Filter results by session tags.", "One session tag."),
        origins: s.array("Filter results by session origins.", sessionOrigin),
        category: sessionCategory,
        isArchived: s.boolean("Filter results by archived state."),
        createdAfter: s.integer("Only include sessions created after this Unix timestamp."),
        createdBefore: s.integer("Only include sessions created before this Unix timestamp."),
        updatedAfter: s.integer("Only include sessions updated after this Unix timestamp."),
        updatedBefore: s.integer("Only include sessions updated before this Unix timestamp."),
        playbookId: nonEmpty("Filter results by playbook ID."),
        scheduleId: nonEmpty("Filter results by schedule ID."),
      },
      {
        required: ["orgId"],
        optional: [
          "first",
          "after",
          "devinId",
          "sessionIds",
          "userIds",
          "serviceUserIds",
          "repoNames",
          "tags",
          "origins",
          "category",
          "isArchived",
          "createdAfter",
          "createdBefore",
          "updatedAfter",
          "updatedBefore",
          "playbookId",
          "scheduleId",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Devin sessions.", {
      items: s.array("The Devin sessions returned by the API.", session),
      hasNextPage: s.boolean("Whether another page of sessions is available."),
      endCursor: s.nullableString("The cursor for the next page of sessions."),
      total: s.nullableInteger("The total matching session count when Devin returns it."),
      raw,
    }),
  }),
  defineProviderAction(service, {
    name: "get_session",
    description: "Get details for one Devin organization session.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting a Devin session.", {
      orgId: nonEmpty("The Devin organization ID, usually prefixed with org-."),
      devinId: nonEmpty("The Devin session ID, usually prefixed with devin-."),
    }),
    outputSchema: sessionOutput,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a message to an active Devin session and resume it if suspended.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for sending a Devin session message.",
      {
        orgId: nonEmpty("The Devin organization ID, usually prefixed with org-."),
        devinId: nonEmpty("The Devin session ID, usually prefixed with devin-."),
        message: nonEmpty("The message to send to the Devin session."),
        attachmentUrls: s.array(
          "URLs for files Devin should attach to the message.",
          s.url("One publicly reachable attachment URL."),
        ),
        messageAsUserId: nonEmpty("Send the message on behalf of this Devin user ID."),
      },
      { required: ["orgId", "devinId", "message"], optional: ["attachmentUrls", "messageAsUserId"] },
    ),
    outputSchema: sessionOutput,
  }),
  defineProviderAction(service, {
    name: "terminate_session",
    description: "Terminate a Devin session, optionally archiving it for future reference.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for terminating a Devin session.",
      {
        orgId: nonEmpty("The Devin organization ID, usually prefixed with org-."),
        devinId: nonEmpty("The Devin session ID, usually prefixed with devin-."),
        archive: s.boolean("Whether Devin should archive the session after terminating it."),
      },
      { required: ["orgId", "devinId"], optional: ["archive"] },
    ),
    outputSchema: sessionOutput,
  }),
];
