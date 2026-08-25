import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wachete";

const alertSchema: JsonSchema = s.object(
  "A Wachete alert condition.",
  {
    type: s.nonEmptyString("The Wachete alert type, such as Error or NotEq."),
    value: s.string("The optional comparison value for the alert."),
  },
  { optional: ["value"] },
);

const notificationEndpointSchema: JsonSchema = s.object("A Wachete notification destination.", {
  type: s.nonEmptyString("The destination type, such as Webhook or Email."),
  value: s.nonEmptyString("The destination address or URL."),
});

const monitorSchema: JsonSchema = s.looseObject("A Wachete monitor definition.", {
  id: s.nullableString("The monitor ID."),
  name: s.nullableString("The monitor name."),
  method: s.nullableString("The HTTP method used to check the monitored URL."),
  url: s.nullableString("The monitored URL."),
  xPath: s.nullableString("The XPath expression selecting monitored content."),
  excludeXPath: s.nullableString("The XPath expression excluding content."),
  regex: s.nullableString("The regular expression selecting monitored content."),
  alerts: s.nullable(s.array("The configured alert conditions.", s.looseObject("An alert."))),
  recurrenceInSeconds: s.nullableInteger("The check interval in seconds."),
  folderId: s.nullableString("The containing folder ID."),
  data: s.nullable(s.looseObject("The latest monitoring result.")),
  notificationEndpoints: s.nullable(
    s.array("The configured notification destinations.", s.looseObject("A destination.")),
  ),
  dynamicContent: s.boolean("Whether JavaScript-rendered content is enabled."),
  scrollPage: s.boolean("Whether Wachete scrolls the page while checking it."),
  ignoreInvalidPages: s.boolean("Whether invalid crawler pages are ignored."),
  collectRawHtml: s.boolean("Whether raw HTML is collected."),
  jobType: s.nullableString("The Wachete monitor job type."),
  note: s.nullableString("The monitor note."),
});

const folderSchema: JsonSchema = s.looseObject("A Wachete folder.", {
  id: s.nullableString("The folder ID."),
  name: s.nullableString("The folder name."),
  parentId: s.nullableString("The parent folder ID."),
  count: s.integer("The number of monitors in the folder."),
  failedCount: s.integer("The number of failed monitors in the folder."),
  pausedCount: s.integer("The number of paused monitors in the folder."),
});

const historyItemSchema: JsonSchema = s.looseObject("A Wachete monitor history item.", {
  lastCheckTimestamp: s.dateTime("The time of the check."),
  valueChangedTimestamp: s.nullable(s.dateTime("The time the monitored value changed.")),
  raw: s.nullableString("The captured monitored value."),
  error: s.nullableString("The check error, when present."),
  diff: s.nullable(
    s.array(
      "The changes from the previous value.",
      s.looseObject("A diff element.", {
        operation: s.integer("The Wachete diff operation code."),
        text: s.nullableString("The changed text."),
      }),
    ),
  ),
});

const notificationSchema: JsonSchema = s.looseObject("A Wachete notification.", {
  id: s.nullableString("The notification ID."),
  type: s.union([s.string("The alert type name."), s.integer("The alert type code.")], {
    description: "The Wachete alert type.",
  }),
  current: s.nullableString("The current monitored value."),
  comparand: s.nullableString("The comparison value."),
  html: s.nullableString("The optional HTML notification body."),
  error: s.nullableString("The notification error, when present."),
  timestamp: s.dateTime("The notification timestamp."),
  serverTime: s.dateTime("The Wachete server timestamp."),
  taskId: s.nullableString("The related monitor ID."),
  taskName: s.nullableString("The related monitor name."),
  url: s.nullableString("The monitored URL."),
});

const monitorIdInputSchema: JsonSchema = s.actionInput(
  {
    id: s.uuid("The monitor ID."),
  },
  ["id"],
  "A Wachete monitor identifier.",
);

export const wacheteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_or_update_monitor",
    description:
      "Create a Wachete SinglePage monitor, or replace an existing monitor with a SinglePage definition when id is provided.",
    inputSchema: s.actionInput(
      {
        id: s.uuid("The existing monitor ID when updating."),
        name: s.nonEmptyString("The monitor name."),
        url: s.url("The public URL that Wachete should monitor."),
        xPath: s.string("The XPath expression selecting monitored content."),
        excludeXPath: s.string("The XPath expression excluding content."),
        regex: s.string("The regular expression selecting monitored content."),
        alerts: s.array("The alert conditions for the monitor.", alertSchema, { minItems: 1 }),
        recurrenceInSeconds: s.positiveInteger("The check interval in seconds."),
        folderId: s.uuid("The folder that should contain the monitor."),
        notificationEndpoints: s.array("The notification destinations for the monitor.", notificationEndpointSchema, {
          minItems: 1,
        }),
        dynamicContent: s.boolean("Whether Wachete should render JavaScript content."),
        scrollPage: s.boolean("Whether Wachete should scroll the page while checking it."),
        ignoreInvalidPages: s.boolean("Whether invalid crawler pages should be ignored."),
        collectRawHtml: s.boolean("Whether Wachete should collect raw HTML."),
        jobType: s.literal("SinglePage", { description: "The supported Wachete monitor job type." }),
        note: s.string("A note attached to the monitor."),
      },
      ["name", "url"],
      "The SinglePage monitor definition to create or update.",
    ),
    outputSchema: s.actionOutput(
      {
        monitor: monitorSchema,
      },
      "The created or updated monitor.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_monitor",
    description: "Retrieve a Wachete monitor definition by ID.",
    inputSchema: monitorIdInputSchema,
    outputSchema: s.actionOutput(
      {
        monitor: monitorSchema,
      },
      "The requested monitor.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_monitor",
    description: "Delete a Wachete monitor by ID.",
    inputSchema: monitorIdInputSchema,
    outputSchema: s.actionOutput(
      {
        deleted: s.literal(true, { description: "Whether the monitor was deleted." }),
        id: s.uuid("The deleted monitor ID."),
      },
      "The delete confirmation.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_folder_content",
    description: "List monitors, subfolders, and the folder path for a Wachete folder or the root folder.",
    inputSchema: s.actionInput(
      {
        parentId: s.uuid("The folder ID. Omit it to list the root folder."),
        continuationToken: s.nonEmptyString("The continuation token returned by a previous request."),
      },
      [],
      "Folder listing and pagination options.",
    ),
    outputSchema: s.actionOutput(
      {
        subfolders: s.array("The child folders.", folderSchema),
        monitors: s.array("The monitors in the folder.", monitorSchema),
        path: s.array("The folder ancestry path.", folderSchema),
        continuationToken: s.nullableString("The continuation token for the next page, or null when complete."),
      },
      "The folder content and pagination state.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_monitor_history",
    description: "Retrieve paginated check history for a Wachete monitor.",
    inputSchema: s.actionInput(
      {
        id: s.uuid("The monitor ID."),
        from: s.dateTime("The inclusive start of the time interval."),
        to: s.dateTime("The inclusive end of the time interval."),
        count: s.positiveInteger("The maximum number of history items to return."),
        returnDiff: s.boolean("Whether to include the diff from the previous value."),
        continuationToken: s.nonEmptyString("The continuation token returned by a previous request."),
      },
      ["id"],
      "Monitor history filters and pagination options.",
    ),
    outputSchema: s.actionOutput(
      {
        history: s.array("The monitor history items.", historyItemSchema),
        continuationToken: s.nullableString("The continuation token for the next page, or null when complete."),
      },
      "The monitor history and pagination state.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_notifications",
    description: "List Wachete notifications from newest to oldest.",
    inputSchema: s.actionInput(
      {
        taskId: s.uuid("The monitor ID used to filter notifications."),
        from: s.dateTime("The inclusive start of the time interval."),
        to: s.dateTime("The inclusive end of the time interval."),
        count: s.positiveInteger("The maximum number of notifications to return."),
        continuationToken: s.nonEmptyString("The continuation token returned by a previous request."),
        html: s.boolean("Whether to include HTML-formatted notification content."),
      },
      [],
      "Notification filters and pagination options.",
    ),
    outputSchema: s.actionOutput(
      {
        notifications: s.array("The matching notifications.", notificationSchema),
        continuationToken: s.nullableString("The continuation token for the next page, or null when complete."),
      },
      "The notifications and pagination state.",
    ),
  }),
];
