import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "callpage";
const noScopes: string[] = [];
const callsViewScopes = ["calls.view"];
const widgetsViewScopes = ["widgets.view"];
const widgetsCallScopes = ["widgets.call"];

const integerOrStringSchema = (description: string) =>
  s.anyOf(description, [s.integer(description), s.string(description)]);

const paginationSchema = s.looseRequiredObject(
  "Pagination metadata returned by CallPage list endpoints.",
  {
    offset: integerOrStringSchema("The current CallPage offset value."),
    limit: integerOrStringSchema("The current CallPage limit value."),
    count: integerOrStringSchema("The total number of items matching the query."),
  },
  { optional: ["offset", "limit", "count"] },
);

const callEntrySchema = s.looseRequiredObject(
  "A CallPage call history entry as returned by the API.",
  {
    id: s.integer("The CallPage call history entry identifier."),
    data: s.looseObject("The nested CallPage call payload returned by the API."),
  },
  { optional: ["id", "data"] },
);

const callpageRoleSchema = s.looseRequiredObject(
  "A CallPage user role summary.",
  {
    slug: s.string("The CallPage role slug."),
  },
  { optional: ["slug"] },
);

const callpageCallerIdSchema = s.looseRequiredObject(
  "A CallPage caller ID object.",
  {
    id: s.integer("The CallPage caller ID identifier."),
    activated_at: s.nullableString("The CallPage caller ID activation timestamp."),
    updated_at: s.string("The CallPage caller ID update timestamp."),
  },
  { optional: ["id", "activated_at", "updated_at"] },
);

const callpageUserSchema = s.looseRequiredObject(
  "A CallPage user record.",
  {
    id: s.integer("The CallPage user identifier."),
    name: s.string("The CallPage user name."),
    email: s.string("The CallPage user email address."),
    tel: s.string("The CallPage user phone number."),
    tel_formatted: s.string("The formatted CallPage user phone number."),
    tel_extension: s.nullableString("The CallPage user phone extension."),
    last_online: s.nullableString("The last time the CallPage user was online."),
    parent_id: s.integer("The parent user identifier in CallPage."),
    activated_at: s.string("The CallPage user activation timestamp."),
    role: callpageRoleSchema,
    avatar: s.nullableString("The CallPage user avatar URL."),
    caller_id: callpageCallerIdSchema,
  },
  {
    optional: [
      "name",
      "email",
      "tel",
      "tel_formatted",
      "tel_extension",
      "last_online",
      "parent_id",
      "activated_at",
      "role",
      "avatar",
      "caller_id",
    ],
  },
);

const callpageWidgetSchema = s.looseRequiredObject(
  "A CallPage widget record.",
  {
    id: s.integer("The CallPage widget identifier."),
    description: s.string("The CallPage widget description."),
    url: s.string("The installation URL configured for the CallPage widget."),
    enabled: s.boolean("Whether the CallPage widget is enabled."),
    locale_code: s.string("The locale code configured for the CallPage widget."),
    installation_status: s.integer("The CallPage widget installation status code."),
    installed_at: s.nullableString("The CallPage widget installation timestamp."),
    company_sms_name: s.nullableString("The company SMS sender name for the widget."),
    call_requests_count: s.integer("The number of call requests recorded for the widget."),
    managers: s.array("The widget managers returned by CallPage.", s.looseObject("A CallPage widget manager record.")),
  },
  {
    optional: [
      "description",
      "url",
      "enabled",
      "locale_code",
      "installation_status",
      "installed_at",
      "company_sms_name",
      "call_requests_count",
      "managers",
    ],
  },
);

const positiveIntegerArray = (description: string) =>
  s.array(description, s.positiveInteger("A positive CallPage identifier."), { minItems: 1 });

const listCallsInputSchema = s.object(
  "Input filters for listing CallPage calls.",
  {
    display_hidden: s.boolean("Whether hidden CallPage calls should be included."),
    call_ids: positiveIntegerArray("The CallPage call identifiers to filter by."),
    phone_number: s.string("The phone number to filter by in E.164 format.", { minLength: 1 }),
    user_ids: positiveIntegerArray("The CallPage user identifiers to filter by."),
    statuses: s.array(
      "The CallPage human status slugs to filter by.",
      s.string("A CallPage status slug.", { minLength: 1 }),
      {
        minItems: 1,
      },
    ),
    tag_ids: positiveIntegerArray("The CallPage tag identifiers to filter by."),
    date_from: s.positiveInteger("The inclusive CallPage start timestamp filter."),
    date_to: s.positiveInteger("The inclusive CallPage end timestamp filter."),
    widget_ids: positiveIntegerArray("The CallPage widget identifiers to filter by."),
    limit: s.positiveInteger("The maximum number of CallPage calls to return."),
    offset: s.nonNegativeInteger("The CallPage offset for pagination."),
    url: s.string("The widget installation URL to filter by.", { minLength: 1 }),
    incoming_number_ids: positiveIntegerArray("The incoming CallPage number identifiers to filter by."),
  },
  {
    optional: [
      "display_hidden",
      "call_ids",
      "phone_number",
      "user_ids",
      "statuses",
      "tag_ids",
      "date_from",
      "date_to",
      "widget_ids",
      "limit",
      "offset",
      "url",
      "incoming_number_ids",
    ],
  },
);

const getUserInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for reading a single CallPage user.",
    {
      id: s.positiveInteger("The CallPage user identifier."),
      email: s.email("The CallPage user email address."),
    },
    { optional: ["id", "email"] },
  ),
  oneOf: [
    {
      required: ["id"],
      not: { required: ["email"] },
    },
    {
      required: ["email"],
      not: { required: ["id"] },
    },
  ],
};

const createWidgetCallInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for creating a CallPage widget callback request.",
    {
      widget_id: s.positiveInteger("The CallPage widget identifier."),
      tel: s.string("The phone number to call in E.164 format.", { minLength: 1 }),
      department_id: s.positiveInteger("The CallPage department identifier."),
      manager_id: s.positiveInteger("The CallPage manager identifier."),
    },
    { optional: ["department_id", "manager_id"] },
  ),
  not: {
    required: ["department_id", "manager_id"],
  },
};

export const callpageActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_calls",
    description:
      "List CallPage calls with optional filters such as widget, user, status, phone number, and time range.",
    requiredScopes: callsViewScopes,
    inputSchema: listCallsInputSchema,
    outputSchema: s.object(
      "The CallPage call history list result.",
      {
        calls: s.array("The CallPage calls returned by the history query.", callEntrySchema),
        pagination: s.nullable(paginationSchema),
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Get one CallPage call by identifier.",
    requiredScopes: callsViewScopes,
    inputSchema: s.object("Input parameters for reading a single CallPage call.", {
      call_id: s.positiveInteger("The CallPage call identifier."),
    }),
    outputSchema: s.object("The CallPage single-call result.", {
      call: callEntrySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List CallPage users with pagination.",
    requiredScopes: noScopes,
    inputSchema: s.object(
      "Input parameters for listing CallPage users.",
      {
        offset: s.nonNegativeInteger("The CallPage offset for pagination."),
        limit: s.positiveInteger("The maximum number of CallPage users to return."),
      },
      { optional: ["offset", "limit"] },
    ),
    outputSchema: s.object(
      "The CallPage users list result.",
      {
        users: s.array("The CallPage users returned by the list endpoint.", callpageUserSchema),
        pagination: s.nullable(paginationSchema),
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one CallPage user by identifier or email address.",
    requiredScopes: noScopes,
    inputSchema: getUserInputSchema,
    outputSchema: s.object("The CallPage single-user result.", {
      user: callpageUserSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_widgets",
    description: "List CallPage widgets with pagination.",
    requiredScopes: widgetsViewScopes,
    inputSchema: s.object(
      "Input parameters for listing CallPage widgets.",
      {
        offset: s.nonNegativeInteger("The CallPage offset for pagination."),
        limit: s.positiveInteger("The maximum number of CallPage widgets to return."),
      },
      { optional: ["offset", "limit"] },
    ),
    outputSchema: s.object(
      "The CallPage widgets list result.",
      {
        widgets: s.array("The CallPage widgets returned by the list endpoint.", callpageWidgetSchema),
        pagination: s.nullable(paginationSchema),
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_widget",
    description: "Get one CallPage widget by identifier.",
    requiredScopes: widgetsViewScopes,
    inputSchema: s.object("Input parameters for reading a single CallPage widget.", {
      widget_id: s.positiveInteger("The CallPage widget identifier."),
    }),
    outputSchema: s.object("The CallPage single-widget result.", {
      widget: callpageWidgetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_widget_call",
    description: "Create a CallPage callback request for one widget and phone number.",
    requiredScopes: widgetsCallScopes,
    inputSchema: createWidgetCallInputSchema,
    outputSchema: s.object("The CallPage widget callback creation result.", {
      call_request_id: s.integer("The CallPage callback request identifier."),
    }),
  }),
];
