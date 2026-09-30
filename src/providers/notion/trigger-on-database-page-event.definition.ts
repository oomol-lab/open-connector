import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const idPattern: string = "^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$";
const eventSchema: JsonSchema = s.object(
  {
    createdBy: { type: "object" },
    createdTime: s.string(),
    dataSourceId: s.string(),
    databaseId: s.string(),
    event: s.stringEnum(["page_added", "page_updated"]),
    lastEditedBy: { type: "object" },
    lastEditedTime: s.string(),
    pageId: s.string(),
    properties: { type: "object" },
    title: s.string(),
    url: s.string(),
  },
  {
    additionalProperties: false,
    required: [
      "event",
      "pageId",
      "databaseId",
      "dataSourceId",
      "url",
      "title",
      "createdTime",
      "lastEditedTime",
      "createdBy",
      "lastEditedBy",
    ],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "dataSourceId",
      jsonSchema: s.string({
        pattern: "^(?:|[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12})$",
      }),
      nullable: false,
      value: "",
    },
    { handle: "databaseId", jsonSchema: s.string({ pattern: idPattern }), nullable: false },
    {
      handle: "events",
      jsonSchema: s.array(s.stringEnum(["page_added", "page_updated"]), { minItems: 1, uniqueItems: true }),
      nullable: false,
      value: ["page_added"],
    },
    { handle: "includeProperties", jsonSchema: s.boolean(), nullable: false, value: true },
    {
      handle: "maxItemsPerPoll",
      jsonSchema: s.integer({ maximum: 100, minimum: 1 }),
      nullable: false,
      value: 25,
    },
  ],
  definitionVersion: 2,
  description: "Polls a Notion database and triggers when a page is added to it or an existing page is edited.",
  displayName: "Database Page Added or Updated",
  key: "notion.on_database_page_event",
  name: "on_database_page_event",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "notion",
  type: "poll",
};
