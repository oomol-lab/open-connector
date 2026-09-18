import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "countly";

const appIdSchema = s.nonEmptyString("The Countly application ID.");
const periodSchema = s.string(
  "The Countly period, such as month, 30days, 7days, yesterday, hour, or a JSON array of start and end timestamps.",
);
const userSchema = s.looseObject("The Countly user associated with the API key.", {
  _id: s.string("The Countly user ID."),
  username: s.string("The Countly user name."),
  full_name: s.string("The Countly user's full name."),
  email: s.string("The Countly user's email address."),
});
const appSchema = s.looseObject("A Countly application object.", {
  _id: appIdSchema,
  name: s.string("The application name."),
  type: s.string("The application type."),
  timezone: s.string("The application's configured timezone."),
});
const sessionPointSchema = s.looseObject("A Countly session analytics data point.", {
  _id: s.string("The date or time bucket identifier."),
  u: s.number("The total unique users in the bucket."),
  t: s.number("The total sessions in the bucket."),
  n: s.number("The new users in the bucket."),
  d: s.number("The total session duration in seconds."),
  e: s.number("The total write API requests in the bucket."),
});
const eventPointSchema = s.looseObject("A Countly event analytics data point.", {
  _id: s.string("The date, time, or segmentation bucket identifier."),
  c: s.number("The total event count in the bucket."),
  s: s.number("The total event sum in the bucket."),
  dur: s.number("The total event duration in the bucket."),
});

export const countlyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the Countly user associated with the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the current Countly user.", {}),
    outputSchema: s.object("The current Countly user response.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    operationType: "read",
    description: "List Countly applications owned by the connected user.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Countly applications.", {}),
    outputSchema: s.object("The Countly application list response.", {
      adminOf: s.record("Applications administered by the connected user, keyed by app ID.", appSchema),
      userOf: s.record("Applications accessible to the connected user, keyed by app ID.", appSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_app_details",
    operationType: "read",
    description: "Retrieve Countly application metadata and its user access lists.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one Countly application.", {
      appId: appIdSchema,
    }),
    outputSchema: s.object("The Countly application details response.", {
      details: s.looseObject("Application metadata and user access lists returned by Countly.", {
        app: s.looseObject("Countly application metadata."),
        global_admin: s.array(
          "Global administrators returned by Countly.",
          s.looseObject("A Countly global administrator."),
        ),
        admin: s.array(
          "Application administrators returned by Countly.",
          s.looseObject("A Countly application administrator."),
        ),
        user: s.array("Application users returned by Countly.", s.looseObject("A Countly application user.")),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_dashboard_analytics",
    operationType: "read",
    description: "Retrieve Countly dashboard analytics for an application.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving Countly dashboard analytics.", {
      appId: appIdSchema,
    }),
    outputSchema: s.object("The Countly dashboard analytics response.", {
      analytics: s.looseObject("Dashboard analytics returned by Countly."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_session_analytics",
    operationType: "read",
    description: "Retrieve session analytics data points for a Countly application and period.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving Countly session analytics.",
      { appId: appIdSchema, period: periodSchema },
      { optional: ["period"] },
    ),
    outputSchema: s.object("The Countly session analytics response.", {
      sessions: s.array("Session analytics data points returned by Countly.", sessionPointSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_event_analytics",
    operationType: "read",
    description: "Retrieve event analytics for one or more Countly event keys.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving Countly event analytics.",
      {
        appId: appIdSchema,
        event: s.nonEmptyString("A single Countly event key to query."),
        events: s.array("Multiple Countly event keys to query.", s.nonEmptyString("A Countly event key.")),
        segmentation: s.nonEmptyString("The event segmentation key to break results down by."),
        period: periodSchema,
      },
      { optional: ["event", "events", "segmentation", "period"] },
    ),
    outputSchema: s.object("The Countly event analytics response.", {
      events: s.array("Event analytics data points returned by Countly.", eventPointSchema),
    }),
  }),
];
