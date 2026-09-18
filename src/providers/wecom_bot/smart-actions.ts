import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wecom_bot";

function utf8TextSchema(description: string, maxBytes: number, minLength = 1) {
  return s.string(`${description} The runtime enforces the ${maxBytes}-byte UTF-8 limit.`, { minLength });
}

const dateTimeTextSchema = s.string("A date and time in `YYYY-MM-DD HH:mm:ss` format.", {
  minLength: 1,
});
const minuteDateTimeTextSchema = s.string("A date and time in `YYYY-MM-DD HH:mm` format.", {
  minLength: 1,
});
const idSchema = (description: string) => s.string(description, { minLength: 1 });
const userIdSchema = idSchema("A WeCom user ID returned by a contact lookup.");
const userIdsSchema = (description: string, maxItems?: number) =>
  s.array(description, userIdSchema, { minItems: 1, maxItems });
const looseValueSchema = s.unknown("A provider-defined JSON value.");
const looseObjectSchema = (description: string) => s.looseObject(description);
const looseArraySchema = (description: string) =>
  s.array(description, looseObjectSchema("One provider-defined object."));
const acknowledgementSchema = s.looseObject("The WeCom operation result.", {
  errcode: s.integer("The WeCom business response code. `0` means success."),
  errmsg: s.string("The WeCom business response message."),
});

function documentInput(
  description: string,
  properties: Record<string, JsonSchema> = {},
  optional: readonly string[] = [],
): JsonSchema {
  const required = Object.keys(properties).filter((key) => !optional.includes(key));
  return {
    type: "object",
    description,
    properties: {
      docId: idSchema("The WeCom document ID. Use either `docId` or `url`."),
      url: s.url("The WeCom document URL. Use either `url` or `docId`."),
      ...properties,
    },
    required,
    additionalProperties: false,
    anyOf: [{ required: ["docId"] }, { required: ["url"] }],
  };
}

function smartAction(
  name: string,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema = acknowledgementSchema,
) {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

const emptyInputSchema = s.object("This action does not require input fields.", {});
const categorySchema = s.stringEnum("The official WeCom MCP business category.", [
  "contact",
  "doc",
  "meeting",
  "msg",
  "schedule",
  "todo",
]);
const toolSummarySchema = s.looseObject("One dynamically discovered WeCom MCP tool.", {
  name: s.string("The tool name."),
  description: s.string("The tool description."),
  inputSchema: looseObjectSchema("The current input JSON Schema returned by WeCom."),
});
const contactUserSchema = s.looseObject("One visible WeCom member.", {
  userid: s.string("The member user ID."),
  name: s.string("The member name."),
  alias: s.string("The optional member alias."),
});
const createTodoFollowerSchema = s.object(
  "One todo follower.",
  {
    userId: userIdSchema,
    status: s.integer("The follower status: `0` rejected, `1` accepted, or `2` completed.", {
      minimum: 0,
      maximum: 2,
    }),
  },
  { optional: ["status"] },
);
const updateTodoFollowerSchema = s.object("One replacement todo follower.", {
  userId: userIdSchema,
});
const reminderTypeSchema: JsonSchema = {
  type: "integer",
  enum: [0, 1, 3, 5, 6, 7, 8, 9],
  description: "A reminder type: `0`, `1`, `3`, `5`, `6`, `7`, `8`, or `9`.",
};
const remindersSchema = s.object(
  "Schedule reminder settings.",
  {
    isRemind: s.integer("Whether reminders are enabled: `0` or `1`.", {
      minimum: 0,
      maximum: 1,
    }),
    remindBeforeEventSeconds: {
      type: "integer",
      enum: [0, 300, 900, 3600, 86_400],
      description: "Seconds before the event for the reminder.",
    },
    remindTimeDiffs: s.array("Additional reminder offsets in seconds.", {
      type: "integer",
      enum: [-604_800, -172_800, -86_400, -3600, -900, -300, 0, 32_400],
      description: "One official WeCom reminder offset.",
    }),
    timezone: s.integer("The timezone offset from UTC, from `-12` to `12`.", {
      minimum: -12,
      maximum: 12,
    }),
  },
  { optional: ["isRemind", "remindBeforeEventSeconds", "remindTimeDiffs", "timezone"] },
);
const scheduleFields = {
  startTime: dateTimeTextSchema,
  endTime: dateTimeTextSchema,
  summary: s.string("The schedule title, up to 128 characters.", { maxLength: 128 }),
  description: s.string("The schedule description, up to 1000 characters.", { maxLength: 1000 }),
  location: s.string("The schedule location, up to 128 characters.", { maxLength: 128 }),
  isWholeDay: s.integer("Whether this is an all-day schedule: `0` or `1`.", {
    minimum: 0,
    maximum: 1,
  }),
  attendeeUserIds: userIdsSchema("The WeCom user IDs to invite."),
  reminders: remindersSchema,
};
const cellSchema = s.looseObject("One online-sheet cell value and optional format.", {
  cellValue: looseObjectSchema("The cell value, such as text, link, or formula."),
  cellFormat: looseObjectSchema("The optional provider-defined cell format."),
  dataType: s.stringEnum("The cell data type expected by WeCom.", ["TEXT", "NUMBER", "LINK", "FORMUAL"]),
});
const smartSheetFieldSchema = s.looseRequiredObject("One smart-sheet field definition.", {
  fieldTitle: s.string("The field title.", { minLength: 1 }),
  fieldType: s.string("The official WeCom smart-sheet field type.", { minLength: 1 }),
});
const smartSheetRecordSchema = s.looseRequiredObject("One smart-sheet record.", {
  values: s.record(
    "Cell values keyed by field title. Attachment items may use `fileUrl` and optional `name`; image items may use `imageUrl`.",
    looseValueSchema,
  ),
});
const createTodoInputSchema = s.object(
  "Input for creating a WeCom todo.",
  {
    content: s.string("The todo content.", { minLength: 1 }),
    followers: s.array("The todo followers.", createTodoFollowerSchema, { minItems: 1 }),
    endTime: dateTimeTextSchema,
    reminderTypes: s.array("The reminder types relative to the deadline.", reminderTypeSchema),
  },
  { optional: ["endTime", "reminderTypes"] },
);

export const wecomSmartBotActions: readonly ProviderActionDefinition[] = [
  smartAction(
    "list_tools",
    "read",
    "List the current WeCom MCP tools and input schemas available to this bot.",
    s.object(
      "Input for listing dynamically available WeCom tools.",
      { category: categorySchema },
      { optional: ["category"] },
    ),
    s.object("The dynamically available WeCom tools.", {
      categories: s.array(
        "Tool groups by business category.",
        s.object("One business category and its tools.", {
          category: categorySchema,
          tools: s.array("The tools available in this category.", toolSummarySchema),
        }),
      ),
    }),
  ),
  smartAction(
    "call_tool",
    "destructive",
    "Call a dynamically discovered WeCom MCP tool that does not have a curated action yet.",
    s.object("Input for a dynamic WeCom MCP tool call.", {
      category: categorySchema,
      toolName: s.string("The exact tool name returned by `list_tools`.", { minLength: 1 }),
      arguments: s.looseObject("The arguments validated against the tool's current input schema."),
    }),
    looseObjectSchema("The parsed JSON result returned by the selected WeCom tool."),
  ),
  smartAction(
    "get_userlist",
    "read",
    "List WeCom members visible to the API-mode smart bot.",
    emptyInputSchema,
    s.looseObject("The visible WeCom member list.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      userlist: s.array("The visible members.", contactUserSchema),
    }),
  ),
  smartAction(
    "get_msg_chat_list",
    "read",
    "List chats that had messages during a time range.",
    s.object(
      "Input for listing WeCom chats.",
      {
        beginTime: dateTimeTextSchema,
        endTime: dateTimeTextSchema,
        cursor: s.string("The pagination cursor returned by the previous page."),
      },
      { optional: ["cursor"] },
    ),
    s.looseObject("The WeCom chat list page.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      chats: looseArraySchema("The chats in this page."),
      has_more: s.boolean("Whether another page is available."),
      next_cursor: s.string("The cursor for the next page."),
    }),
  ),
  smartAction(
    "get_message",
    "read",
    "Read recent messages from one WeCom direct chat or group chat.",
    s.object(
      "Input for reading WeCom messages.",
      {
        chatType: s.integer("The chat type: `1` for direct chat or `2` for group chat.", {
          minimum: 1,
          maximum: 2,
        }),
        chatId: idSchema("The member user ID for a direct chat or chat ID for a group chat."),
        beginTime: dateTimeTextSchema,
        endTime: dateTimeTextSchema,
        cursor: s.string("The pagination cursor returned by the previous page."),
      },
      { optional: ["cursor"] },
    ),
    s.looseObject("The WeCom message page.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      messages: looseArraySchema("The messages in this page."),
      next_cursor: s.string("The cursor for the next page."),
    }),
  ),
  smartAction(
    "download_message_media",
    "read",
    "Download WeCom message media into the local transit file store.",
    s.object("Input for downloading WeCom message media.", {
      mediaId: s.string("The media ID returned by `get_message`.", {
        minLength: 1,
        maxLength: 256,
      }),
    }),
    s.object("The downloaded message media.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      file: s.object("The locally stored transit file and WeCom media metadata.", {
        fileId: s.string("The local transit file identifier."),
        downloadUrl: s.url("The local transit file download URL."),
        sizeBytes: s.integer("The decoded media size in bytes."),
        name: s.string("The media file name."),
        mimeType: s.string("The media MIME type."),
        mediaId: s.string("The original WeCom media ID."),
        mediaType: s.string("The WeCom media type."),
      }),
    }),
  ),
  smartAction(
    "send_message",
    "write",
    "Send a text message to a WeCom direct chat or group chat.",
    s.object("Input for sending a WeCom text message.", {
      chatType: s.integer("The chat type: `1` for direct chat or `2` for group chat.", {
        minimum: 1,
        maximum: 2,
      }),
      chatId: idSchema("The member user ID for a direct chat or chat ID for a group chat."),
      content: utf8TextSchema("The text content, up to 2048 UTF-8 bytes.", 2048),
    }),
  ),
  smartAction(
    "search_todo_userid",
    "read",
    "Search WeCom users by name or alias for todo assignment.",
    s.object("Input for searching todo users.", {
      keyword: s.string("The member name or alias to search for.", { minLength: 1 }),
    }),
    looseObjectSchema("The matching WeCom todo users."),
  ),
  smartAction(
    "create_todo",
    "write",
    "Create a WeCom todo with followers, deadline, and reminders.",
    createTodoInputSchema,
    s.looseObject("The created WeCom todo.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      todo_id: s.string("The created todo ID."),
    }),
  ),
  smartAction(
    "update_todo",
    "write",
    "Update a WeCom todo's content, followers, status, deadline, or reminders.",
    s.object(
      "Input for updating a WeCom todo.",
      {
        todoId: idSchema("The todo ID."),
        content: s.string("The replacement todo content."),
        followers: s.array("The full replacement follower list.", updateTodoFollowerSchema, {
          minItems: 1,
        }),
        todoStatus: s.integer("The todo status: `0` completed or `1` in progress.", {
          minimum: 0,
          maximum: 1,
        }),
        endTime: dateTimeTextSchema,
        reminderTypes: s.array("The replacement reminder types.", reminderTypeSchema),
      },
      { optional: ["content", "followers", "todoStatus", "endTime", "reminderTypes"] },
    ),
  ),
  smartAction(
    "change_todo_user_status",
    "destructive",
    "Change one follower's status on a WeCom todo.",
    s.object("Input for changing a todo follower status.", {
      todoId: idSchema("The todo ID."),
      userId: userIdSchema,
      userStatus: s.integer("The follower status: `0` rejected, `1` accepted, or `2` completed.", {
        minimum: 0,
        maximum: 2,
      }),
    }),
  ),
  smartAction(
    "get_todo_list",
    "read",
    "List WeCom todos for one follower with optional time and status filters.",
    s.object(
      "Input for listing WeCom todos.",
      {
        userId: userIdSchema,
        createBeginTime: dateTimeTextSchema,
        createEndTime: dateTimeTextSchema,
        remindBeginTime: dateTimeTextSchema,
        remindEndTime: dateTimeTextSchema,
        deadlineBeginTime: dateTimeTextSchema,
        deadlineEndTime: dateTimeTextSchema,
        todoStatus: s.integer("The todo status: `0` completed or `1` in progress.", {
          minimum: 0,
          maximum: 1,
        }),
        limit: s.integer("The page size, up to 20.", { minimum: 1, maximum: 20 }),
        cursor: s.string("The pagination cursor."),
      },
      {
        optional: [
          "createBeginTime",
          "createEndTime",
          "remindBeginTime",
          "remindEndTime",
          "deadlineBeginTime",
          "deadlineEndTime",
          "todoStatus",
          "limit",
          "cursor",
        ],
      },
    ),
    looseObjectSchema("The WeCom todo list page."),
  ),
  smartAction(
    "get_todo_detail",
    "read",
    "Get details for up to 20 WeCom todos.",
    s.object("Input for reading WeCom todo details.", {
      todoIds: s.array("The todo IDs to read.", idSchema("One todo ID."), {
        minItems: 1,
        maxItems: 20,
      }),
    }),
    s.looseObject("The WeCom todo details.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      data_list: looseArraySchema("The todo detail records."),
    }),
  ),
  smartAction(
    "delete_todo",
    "destructive",
    "Delete a WeCom todo.",
    s.object("Input for deleting a WeCom todo.", { todoId: idSchema("The todo ID.") }),
  ),
  smartAction(
    "create_meeting",
    "write",
    "Create a scheduled WeCom meeting.",
    s.object(
      "Input for creating a WeCom meeting.",
      {
        title: s.string("The meeting title.", { minLength: 1 }),
        startTime: minuteDateTimeTextSchema,
        durationSeconds: s.integer("The meeting duration in seconds.", { minimum: 1 }),
        description: s.string("The optional meeting description."),
        location: s.string("The optional meeting location."),
        inviteeUserIds: userIdsSchema("The WeCom members to invite."),
        settings: looseObjectSchema("Official WeCom meeting settings."),
      },
      { optional: ["description", "location", "inviteeUserIds", "settings"] },
    ),
    s.looseObject("The created WeCom meeting.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      meetingid: s.string("The meeting ID."),
      meeting_code: s.string("The meeting code."),
      meeting_link: s.string("The meeting join link."),
      excess_users: s.array("Invitees without valid meeting accounts.", s.string("One user ID.")),
    }),
  ),
  smartAction(
    "list_user_meetings",
    "read",
    "List WeCom meetings in a time range.",
    s.object(
      "Input for listing WeCom meetings.",
      {
        beginTime: minuteDateTimeTextSchema,
        endTime: minuteDateTimeTextSchema,
        cursor: s.string("The pagination cursor."),
        limit: s.integer("The page size, up to 100.", { minimum: 1, maximum: 100 }),
      },
      { optional: ["beginTime", "endTime", "cursor", "limit"] },
    ),
    s.looseObject("The WeCom meeting list page.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      meetingid_list: s.array("The meeting IDs.", s.string("One meeting ID.")),
      next_cursor: s.string("The cursor for the next page."),
    }),
  ),
  smartAction(
    "get_meeting_info",
    "read",
    "Get complete details for a WeCom meeting.",
    s.object(
      "Input for reading a WeCom meeting.",
      {
        meetingId: idSchema("The meeting ID."),
        meetingCode: s.string("The optional meeting code."),
        subMeetingId: s.string("The optional recurring sub-meeting ID."),
      },
      { optional: ["meetingCode", "subMeetingId"] },
    ),
    looseObjectSchema("The complete WeCom meeting details."),
  ),
  smartAction(
    "cancel_meeting",
    "destructive",
    "Cancel a scheduled WeCom meeting.",
    s.object("Input for canceling a WeCom meeting.", {
      meetingId: idSchema("The meeting ID."),
    }),
  ),
  smartAction(
    "set_invite_meeting_members",
    "write",
    "Replace the full invitee list for a WeCom meeting.",
    s.object("Input for replacing meeting invitees.", {
      meetingId: idSchema("The meeting ID."),
      inviteeUserIds: userIdsSchema("The complete replacement invitee list."),
    }),
  ),
  smartAction(
    "get_schedule_list_by_range",
    "read",
    "List WeCom schedule IDs within a time range.",
    s.object("Input for listing WeCom schedules.", {
      startTime: dateTimeTextSchema,
      endTime: dateTimeTextSchema,
    }),
    s.looseObject("The WeCom schedule ID list.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      schedule_id_list: s.array("The schedule IDs.", s.string("One schedule ID.")),
    }),
  ),
  smartAction(
    "get_schedule_detail",
    "read",
    "Get details for up to 50 WeCom schedules.",
    s.object("Input for reading WeCom schedule details.", {
      scheduleIds: s.array("The schedule IDs to read.", idSchema("One schedule ID."), {
        minItems: 1,
        maxItems: 50,
      }),
    }),
    s.looseObject("The WeCom schedule details.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      schedule: looseArraySchema("The schedule detail records."),
    }),
  ),
  smartAction(
    "create_schedule",
    "write",
    "Create a WeCom schedule with attendees and reminders.",
    s.object("Input for creating a WeCom schedule.", scheduleFields, {
      optional: ["summary", "description", "location", "isWholeDay", "attendeeUserIds", "reminders"],
    }),
    s.looseObject("The created WeCom schedule.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      schedule_id: s.string("The created schedule ID."),
    }),
  ),
  smartAction(
    "update_schedule",
    "write",
    "Update selected fields on a WeCom schedule.",
    s.object(
      "Input for updating a WeCom schedule.",
      {
        scheduleId: idSchema("The schedule ID."),
        ...scheduleFields,
      },
      {
        optional: [
          "startTime",
          "endTime",
          "summary",
          "description",
          "location",
          "isWholeDay",
          "attendeeUserIds",
          "reminders",
        ],
      },
    ),
  ),
  smartAction(
    "cancel_schedule",
    "destructive",
    "Cancel a WeCom schedule.",
    s.object("Input for canceling a WeCom schedule.", {
      scheduleId: idSchema("The schedule ID."),
    }),
  ),
  smartAction(
    "add_schedule_attendees",
    "write",
    "Add attendees to a WeCom schedule.",
    s.object("Input for adding schedule attendees.", {
      scheduleId: idSchema("The schedule ID."),
      userIds: userIdsSchema("The WeCom user IDs to add."),
    }),
  ),
  smartAction(
    "del_schedule_attendees",
    "write",
    "Remove attendees from a WeCom schedule.",
    s.object("Input for removing schedule attendees.", {
      scheduleId: idSchema("The schedule ID."),
      userIds: userIdsSchema("The WeCom user IDs to remove."),
    }),
  ),
  smartAction(
    "check_availability",
    "read",
    "Read busy time slots for up to 10 WeCom members.",
    s.object("Input for checking WeCom availability.", {
      userIds: userIdsSchema("The WeCom user IDs to check.", 10),
      startTime: dateTimeTextSchema,
      endTime: dateTimeTextSchema,
    }),
    s.looseObject("The member busy-time results.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      user_busy_list: looseArraySchema("The busy slots grouped by member."),
    }),
  ),
  smartAction(
    "create_doc",
    "write",
    "Create an empty WeCom document, online sheet, or smart sheet.",
    s.object("Input for creating a WeCom document.", {
      documentType: s.stringEnum("The document type to create.", ["document", "sheet", "smart_sheet"]),
      name: s.string("The document name, up to 255 characters.", {
        minLength: 1,
        maxLength: 255,
      }),
    }),
    s.looseObject("The created WeCom document.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      docid: s.string("The created document ID."),
      url: s.string("The created document URL."),
    }),
  ),
  smartAction(
    "get_doc_content",
    "read",
    "Read complete WeCom document content as Markdown with polling handled internally.",
    documentInput("Input for reading complete WeCom document content."),
    s.object("The completed WeCom document export.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      content: s.string("The complete Markdown content."),
      poll_count: s.integer("The number of upstream requests used to finish the export."),
    }),
  ),
  smartAction(
    "edit_doc_content",
    "write",
    "Replace all content in a WeCom document with Markdown.",
    documentInput("Input for replacing WeCom document content.", {
      content: s.string("The replacement Markdown content."),
    }),
  ),
  smartAction(
    "sheet_get_info",
    "read",
    "Get online-sheet metadata and sub-sheet IDs.",
    documentInput("Input for reading WeCom online-sheet metadata."),
    looseObjectSchema("The online-sheet metadata and sub-sheet list."),
  ),
  smartAction(
    "sheet_update_range_data",
    "write",
    "Write cells and formats into a specified online-sheet range.",
    s.object("Input for updating an online-sheet range.", {
      docId: idSchema("The online-sheet document ID."),
      sheetId: idSchema("The target sub-sheet ID."),
      startRow: s.integer("The zero-based starting row index.", { minimum: 0 }),
      startColumn: s.integer("The zero-based starting column index.", { minimum: 0 }),
      rows: s.array(
        "The rows to write.",
        s.object("One row of cells.", {
          values: s.array("The cells in this row.", cellSchema, { minItems: 1 }),
        }),
        { minItems: 1 },
      ),
    }),
  ),
  smartAction(
    "sheet_append_data",
    "write",
    "Append one row to the end of a WeCom online sheet.",
    s.object("Input for appending an online-sheet row.", {
      docId: idSchema("The online-sheet document ID."),
      sheetId: idSchema("The target sub-sheet ID."),
      values: s.array("The cells to append in column order.", cellSchema, { minItems: 1 }),
    }),
  ),
  smartAction(
    "sheet_add_sub",
    "write",
    "Add a sub-sheet to a WeCom online sheet.",
    s.object(
      "Input for adding an online sub-sheet.",
      {
        docId: idSchema("The online-sheet document ID."),
        title: s.string("The sub-sheet title.", { minLength: 1 }),
        rowCount: s.integer("The initial row count.", { minimum: 1 }),
        columnCount: s.integer("The initial column count.", { minimum: 1 }),
        index: s.integer("The insertion position; `0` appends and `1` inserts first.", {
          minimum: 0,
        }),
      },
      { optional: ["rowCount", "columnCount", "index"] },
    ),
  ),
  smartAction(
    "sheet_delete_sub",
    "destructive",
    "Permanently delete a sub-sheet from a WeCom online sheet.",
    s.object("Input for deleting an online sub-sheet.", {
      docId: idSchema("The online-sheet document ID."),
      sheetId: idSchema("The sub-sheet ID to delete."),
    }),
  ),
  smartAction(
    "smartsheet_get_sheet",
    "read",
    "List sub-sheets in a WeCom smart sheet.",
    documentInput("Input for listing smart-sheet sub-sheets."),
    looseObjectSchema("The smart-sheet sub-sheet list."),
  ),
  smartAction(
    "smartsheet_add_sheet",
    "write",
    "Add a sub-sheet to a WeCom smart sheet.",
    documentInput("Input for adding a smart-sheet sub-sheet.", {
      title: s.string("The new sub-sheet title.", { minLength: 1 }),
    }),
  ),
  smartAction(
    "smartsheet_update_sheet",
    "write",
    "Rename a WeCom smart-sheet sub-sheet.",
    documentInput("Input for renaming a smart-sheet sub-sheet.", {
      sheetId: idSchema("The sub-sheet ID."),
      title: s.string("The new sub-sheet title.", { minLength: 1 }),
    }),
  ),
  smartAction(
    "smartsheet_delete_sheet",
    "destructive",
    "Permanently delete a WeCom smart-sheet sub-sheet.",
    documentInput("Input for deleting a smart-sheet sub-sheet.", {
      sheetId: idSchema("The sub-sheet ID to delete."),
    }),
  ),
  smartAction(
    "smartsheet_get_fields",
    "read",
    "List fields in a WeCom smart-sheet sub-sheet.",
    documentInput("Input for listing smart-sheet fields.", {
      sheetId: idSchema("The sub-sheet ID."),
    }),
    looseObjectSchema("The smart-sheet field list."),
  ),
  smartAction(
    "smartsheet_add_fields",
    "write",
    "Add fields to a WeCom smart-sheet sub-sheet.",
    documentInput("Input for adding smart-sheet fields.", {
      sheetId: idSchema("The sub-sheet ID."),
      fields: s.array("The fields to add.", smartSheetFieldSchema, { minItems: 1 }),
    }),
  ),
  smartAction(
    "smartsheet_update_fields",
    "write",
    "Rename fields in a WeCom smart-sheet sub-sheet without changing their types.",
    documentInput("Input for updating smart-sheet fields.", {
      sheetId: idSchema("The sub-sheet ID."),
      fields: s.array(
        "The fields to update.",
        s.looseRequiredObject("One field rename.", {
          fieldId: idSchema("The field ID."),
          fieldTitle: s.string("The new field title.", { minLength: 1 }),
          fieldType: s.string("The field's current official type.", { minLength: 1 }),
        }),
        { minItems: 1 },
      ),
    }),
  ),
  smartAction(
    "smartsheet_delete_fields",
    "destructive",
    "Permanently delete fields from a WeCom smart-sheet sub-sheet.",
    documentInput("Input for deleting smart-sheet fields.", {
      sheetId: idSchema("The sub-sheet ID."),
      fieldIds: s.array("The field IDs to delete.", idSchema("One field ID."), {
        minItems: 1,
      }),
    }),
  ),
  smartAction(
    "smartsheet_get_records",
    "read",
    "Read a page of records from a WeCom smart-sheet sub-sheet.",
    documentInput(
      "Input for reading smart-sheet records.",
      {
        sheetId: idSchema("The sub-sheet ID."),
        cursor: s.string("The pagination cursor."),
        limit: s.integer("The page size, up to 1000. Use `0` for the upstream default.", {
          minimum: 0,
          maximum: 1000,
        }),
      },
      ["cursor", "limit"],
    ),
    s.looseObject("The smart-sheet record page.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      total: s.integer("The total matching record count."),
      has_more: s.boolean("Whether another page is available."),
      next_cursor: s.string("The cursor for the next page."),
      records: looseArraySchema("The smart-sheet records."),
    }),
  ),
  smartAction(
    "smartsheet_add_records",
    "write",
    "Add records to a WeCom smart sheet, uploading `fileUrl` attachments before the write.",
    documentInput("Input for adding smart-sheet records.", {
      sheetId: idSchema("The sub-sheet ID."),
      records: s.array("The records to add.", smartSheetRecordSchema, { minItems: 1 }),
    }),
  ),
  smartAction(
    "smartsheet_update_records",
    "write",
    "Update WeCom smart-sheet records, uploading `fileUrl` attachments before the write.",
    documentInput(
      "Input for updating smart-sheet records.",
      {
        sheetId: idSchema("The sub-sheet ID."),
        keyType: s.stringEnum("Whether record values are keyed by field title or field ID.", [
          "field_title",
          "field_id",
        ]),
        records: s.array(
          "The records to update.",
          s.looseRequiredObject("One smart-sheet record update.", {
            recordId: idSchema("The record ID."),
            values: s.record(
              "Replacement cell values. Attachment items may use `fileUrl` and optional `name`; image items may use `imageUrl`.",
              looseValueSchema,
            ),
          }),
          { minItems: 1 },
        ),
      },
      ["keyType"],
    ),
  ),
  smartAction(
    "smartsheet_delete_records",
    "destructive",
    "Permanently delete records from a WeCom smart-sheet sub-sheet.",
    documentInput("Input for deleting smart-sheet records.", {
      sheetId: idSchema("The sub-sheet ID."),
      recordIds: s.array("The record IDs to delete.", idSchema("One record ID."), {
        minItems: 1,
        maxItems: 500,
      }),
    }),
  ),
  smartAction(
    "smartpage_create",
    "write",
    "Create a WeCom smart page from inline text or Markdown pages.",
    s.object(
      "Input for creating a WeCom smart page.",
      {
        title: s.string("The optional smart-page title."),
        pages: s.array(
          "The inline pages to create.",
          s.object(
            "One smart-page child page.",
            {
              pageTitle: s.string("The optional child-page title."),
              contentType: s.stringEnum("The page content type.", ["markdown", "text"]),
              content: utf8TextSchema("The optional inline page content, up to 10 MB.", 10 * 1024 * 1024, 0),
            },
            { optional: ["pageTitle", "contentType", "content"] },
          ),
          { minItems: 1 },
        ),
      },
      { optional: ["title"] },
    ),
    s.looseObject("The created WeCom smart page.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      docid: s.string("The created smart-page document ID."),
      url: s.string("The created smart-page URL."),
    }),
  ),
  smartAction(
    "smartpage_export",
    "write",
    "Export complete WeCom smart-page content as Markdown with polling handled internally.",
    documentInput("Input for exporting a WeCom smart page."),
    s.object("The completed smart-page export.", {
      errcode: s.integer("The WeCom response code."),
      errmsg: s.string("The WeCom response message."),
      content: s.string("The exported Markdown content."),
      poll_count: s.integer("The number of result-poll requests used to finish the export."),
    }),
  ),
];
