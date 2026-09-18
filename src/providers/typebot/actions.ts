import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "typebot";
const accessRightSchema = s.stringEnum("The access right granted to the current Typebot user.", [
  "read",
  "write",
  "guest",
]);
const planSchema = s.stringEnum("The billing plan assigned to the Typebot workspace.", [
  "FREE",
  "STARTER",
  "PRO",
  "LIFETIME",
  "OFFERED",
  "CUSTOM",
  "UNLIMITED",
  "ENTERPRISE",
]);
const workspaceSummarySchema = s.looseRequiredObject("A Typebot workspace summary.", {
  id: s.string("The Typebot workspace identifier."),
  name: s.string("The Typebot workspace name."),
  icon: s.nullableString("The workspace icon URL when one is configured."),
  plan: planSchema,
});
const workspaceDetailSchema = s.looseRequiredObject("Detailed Typebot workspace information.", {
  id: s.string("The Typebot workspace identifier."),
  name: s.string("The Typebot workspace name."),
  icon: s.nullableString("The workspace icon URL when one is configured."),
  plan: planSchema,
  createdAt: s.string("The workspace creation timestamp."),
  updatedAt: s.string("The workspace last update timestamp."),
  isSuspended: s.boolean("Whether the workspace is suspended."),
  isPastDue: s.boolean("Whether the workspace has an overdue subscription payment."),
});
const typebotSummarySchema = s.looseRequiredObject(
  "A Typebot bot summary.",
  {
    id: s.string("The Typebot bot identifier."),
    name: s.string("The Typebot bot name."),
    icon: s.nullableString("The bot icon URL when one is configured."),
    spaceId: s.nullableString("The space identifier containing the bot when present."),
    createdAt: s.string("The bot creation timestamp."),
    accessRight: accessRightSchema,
    publishedTypebotId: s.string("The published bot identifier when the bot has been published."),
  },
  { optional: ["publishedTypebotId"] },
);
const typebotDetailSchema = s.looseRequiredObject(
  "The Typebot definition, including its graph and configuration fields.",
  {
    id: s.string("The Typebot bot identifier."),
    name: s.string("The Typebot bot name."),
    version: s.string("The Typebot schema version."),
    workspaceId: s.string("The workspace identifier that owns the bot."),
    createdAt: s.string("The bot creation timestamp."),
    updatedAt: s.string("The bot last update timestamp."),
    groups: s.array(
      "The bot graph groups returned by Typebot.",
      s.looseObject("One bot graph group returned by Typebot."),
    ),
    edges: s.array(
      "The bot graph edges returned by Typebot.",
      s.looseObject("One bot graph edge returned by Typebot."),
    ),
    variables: s.array(
      "The bot variables returned by Typebot.",
      s.looseObject("One bot variable returned by Typebot."),
    ),
  },
);
const resultVariableSchema = s.looseRequiredObject(
  "One variable captured in a Typebot result.",
  {
    id: s.string("The result variable identifier."),
    name: s.string("The result variable name."),
    value: s.unknown("The string or string-array value captured for this variable."),
    isSessionVariable: s.boolean("Whether the variable belongs to the chat session rather than the saved result."),
  },
  { optional: ["isSessionVariable"] },
);
const resultAnswerSchema = s.looseRequiredObject(
  "One answer captured in a Typebot result.",
  {
    blockId: s.string("The identifier of the input block that captured the answer."),
    content: s.string("The answer text content."),
    attachedFileUrls: s.stringArray("The uploaded file URLs attached to the answer.", {
      itemDescription: "One attached file URL.",
    }),
  },
  { optional: ["attachedFileUrls"] },
);
const resultSchema = s.looseRequiredObject("One Typebot conversation result.", {
  id: s.string("The Typebot result identifier."),
  createdAt: s.string("The result creation timestamp."),
  typebotId: s.string("The bot identifier that produced the result."),
  variables: s.array("The variables captured in the result.", resultVariableSchema),
  answers: s.array("The answers captured in the result.", resultAnswerSchema),
  isCompleted: s.boolean("Whether the conversation reached completion."),
  hasStarted: s.nullableBoolean("Whether the conversation has started."),
  isArchived: s.nullableBoolean("Whether the result is archived."),
  lastChatSessionId: s.nullableString("The most recent chat session identifier when available."),
});
const id = (description: string) => s.nonWhitespaceString(description);

export const typebotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    operationType: "read",
    description: "List the Typebot workspaces accessible to the configured API token.",
    inputSchema: s.object("An empty Typebot action input.", {}),
    outputSchema: s.looseRequiredObject("The accessible Typebot workspaces.", {
      workspaces: s.array("The workspaces accessible to the token.", workspaceSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    operationType: "read",
    description: "Retrieve detailed information for one Typebot workspace.",
    inputSchema: s.requiredObject("The Typebot workspace to retrieve.", {
      workspaceId: id("The Typebot workspace identifier."),
    }),
    outputSchema: s.looseRequiredObject("The Typebot workspace result.", {
      workspace: workspaceDetailSchema,
      currentUserMode: accessRightSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_typebots",
    operationType: "read",
    description: "List Typebot bots in a workspace, optionally restricted to one folder.",
    inputSchema: s.object(
      "Filters for listing Typebot bots.",
      {
        workspaceId: id("The Typebot workspace identifier."),
        folderId: id("Only return bots in this Typebot folder."),
      },
      { required: ["workspaceId"] },
    ),
    outputSchema: s.looseRequiredObject("The Typebot bots in the workspace.", {
      typebots: s.array("The bots accessible in the workspace.", typebotSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_typebot",
    operationType: "read",
    description: "Retrieve one Typebot definition and its graph configuration.",
    inputSchema: s.object(
      "The Typebot bot to retrieve.",
      {
        typebotId: id("The Typebot bot identifier."),
        migrateToLatestVersion: s.boolean(
          "Whether Typebot should migrate the returned definition to the latest schema.",
        ),
      },
      { required: ["typebotId"] },
    ),
    outputSchema: s.looseRequiredObject("The Typebot definition result.", {
      typebot: s.nullable(typebotDetailSchema),
      currentUserMode: accessRightSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_results",
    operationType: "read",
    description: "List collected results for one Typebot bot with cursor and time filtering.",
    inputSchema: s.object(
      "Filters for listing Typebot results.",
      {
        typebotId: id("The Typebot bot identifier."),
        limit: s.integer("The maximum number of results to return, from 1 through 500.", { minimum: 1, maximum: 500 }),
        cursor: s.number("The numeric cursor returned by a previous result page."),
        timeFilter: s.stringEnum("The predefined time range used to filter results.", [
          "today",
          "last7Days",
          "last30Days",
          "monthToDate",
          "lastMonth",
          "yearToDate",
          "allTime",
        ]),
        timeZone: id("The IANA time zone used to interpret the selected time range."),
      },
      { required: ["typebotId"] },
    ),
    outputSchema: s.looseRequiredObject(
      "A page of Typebot results.",
      {
        results: s.array("The Typebot results in this page.", resultSchema),
        nextCursor: s.nullableNumber("The cursor for the next result page when another page exists."),
      },
      { optional: ["nextCursor"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_result",
    operationType: "read",
    description: "Retrieve one collected Typebot result by bot and result identifier.",
    inputSchema: s.requiredObject("The Typebot result to retrieve.", {
      typebotId: id("The Typebot bot identifier."),
      resultId: id("The Typebot result identifier."),
    }),
    outputSchema: s.looseRequiredObject("The Typebot result response.", { result: resultSchema }),
  }),
];
