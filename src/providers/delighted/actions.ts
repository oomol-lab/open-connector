import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "delighted";

const timestamp = s.nonNegativeInteger("Unix timestamp in seconds.");
const perPage = s.integer("Number of results to return per page. The default is 20. The maximum is 100.", {
  minimum: 1,
  maximum: 100,
});
const page = s.integer("The page number to return. The default is 1.", { minimum: 1 });
const email = s.email("Email address of the person.");
const phoneNumber = s.string({
  description: "Phone number in E.164 format. The value must start with a plus sign followed by digits.",
  pattern: "^\\+[0-9]+$",
  minLength: 2,
  maxLength: 16,
});
const personId = s.nonEmptyString("Unique identifier of the person.");
const properties = s.record(s.unknown("A custom property value."), {
  description: "Custom properties associated with the person.",
});

const person = s.looseObject(
  {
    id: s.string("Unique identifier of the person."),
    email,
    name: s.nullableString("Display name of the person."),
    created_at: timestamp,
    phone_number: phoneNumber,
    last_sent_at: timestamp,
    last_responded_at: timestamp,
    next_survey_scheduled_at: s.nullable(timestamp),
    survey_scheduled_at: s.nullable(timestamp),
    properties,
  },
  { description: "Delighted person." },
);

const unsubscribe = s.looseObject(
  {
    person_id: s.string("Identifier of the unsubscribed person."),
    email,
    name: s.nullableString("Display name of the unsubscribed person."),
    unsubscribed_at: timestamp,
  },
  { description: "Delighted unsubscribe record." },
);

const bounce = s.looseObject(
  {
    person_id: s.string("Identifier of the bounced person."),
    email,
    name: s.nullableString("Display name of the bounced person."),
    bounced_at: timestamp,
  },
  { description: "Delighted bounce record." },
);

const surveyResponse = s.looseObject("Delighted survey response.");
const metrics = s.looseObject(
  {
    nps: s.integer("Net Promoter Score for the selected time range."),
    promoter_count: s.integer("Number of promoter responses in the selected time range."),
    promoter_percent: s.integer("Percentage of promoter responses in the selected time range."),
    passive_count: s.integer("Number of passive responses in the selected time range."),
    passive_percent: s.integer("Percentage of passive responses in the selected time range."),
    detractor_count: s.integer("Number of detractor responses in the selected time range."),
    detractor_percent: s.integer("Percentage of detractor responses in the selected time range."),
    response_count: s.integer("Total number of responses in the selected time range."),
  },
  { description: "Metrics payload returned by Delighted." },
);

const pageWindow = {
  per_page: perPage,
  page,
  since: timestamp,
  until: timestamp,
};

export const delightedActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_or_update_person",
    description: "Create or update a Delighted person and optionally schedule a survey request.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for creating or updating a Delighted person.",
      {
        email,
        phone_number: phoneNumber,
        channel: s.stringEnum("Survey channel used to send the request. The default is email.", ["email", "sms"]),
        name: s.nonEmptyString("Name of the person."),
        delay: s.nonNegativeInteger("Amount of seconds to wait before sending the survey request."),
        properties,
        send: s.boolean("Set to false to create or update the person without sending a survey."),
        last_sent_at: timestamp,
        email_update: s.email("New email address used to update an existing person."),
        phone_number_update: phoneNumber,
      },
      {
        optional: [
          "email",
          "phone_number",
          "channel",
          "name",
          "delay",
          "properties",
          "send",
          "last_sent_at",
          "email_update",
          "phone_number_update",
        ],
      },
    ),
    outputSchema: s.object("Created or updated Delighted person.", {
      person,
    }),
  }),
  defineProviderAction(service, {
    name: "list_people",
    description: "List people in the connected Delighted account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for listing Delighted people.",
      {
        per_page: perPage,
        since: timestamp,
        until: timestamp,
        email,
        phone_number: phoneNumber,
        page_info: s.nonEmptyString("Opaque pagination cursor returned in the Link header of a previous response."),
      },
      { optional: ["per_page", "since", "until", "email", "phone_number", "page_info"] },
    ),
    outputSchema: s.object("Paginated list of Delighted people.", {
      people: s.array("People returned by Delighted.", person),
      next_page_info: s.nullableString(
        "Opaque page_info cursor for the next page, or null when there is no next page.",
      ),
      next_page_url: s.nullableString(
        "Absolute URL for the next page returned in the Link header, or null when absent.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_unsubscribed_people",
    description: "List unsubscribed people in the connected Delighted account.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for listing unsubscribed Delighted people.", pageWindow, {
      optional: ["per_page", "page", "since", "until"],
    }),
    outputSchema: s.object("Paginated list of Delighted unsubscribe records.", {
      unsubscribes: s.array("Unsubscribe records returned by Delighted.", unsubscribe),
      next_page: s.nullableInteger("Next page number when another page is likely available, or null otherwise."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_bounced_people",
    description: "List bounced people in the connected Delighted account.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for listing bounced Delighted people.", pageWindow, {
      optional: ["per_page", "page", "since", "until"],
    }),
    outputSchema: s.object("Paginated list of Delighted bounce records.", {
      bounces: s.array("Bounce records returned by Delighted.", bounce),
      next_page: s.nullableInteger("Next page number when another page is likely available, or null otherwise."),
    }),
  }),
  defineProviderAction(service, {
    name: "unsubscribe_person",
    description: "Add a person to the Delighted unsubscribe list.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for adding a person to the Delighted unsubscribe list.", {
      person_email: email,
    }),
    outputSchema: s.object("Boolean confirmation returned by Delighted mutation endpoints.", {
      ok: s.boolean("Whether Delighted accepted the request."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_person",
    description: "Delete a Delighted person and all related survey history.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for deleting a Delighted person by id, email, or phone number.",
      { id: personId, email, phone_number: phoneNumber },
      { optional: ["id", "email", "phone_number"] },
    ),
    outputSchema: s.object("Boolean confirmation returned by Delighted mutation endpoints.", {
      ok: s.boolean("Whether Delighted accepted the request."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_survey_responses",
    description: "List survey responses collected in the connected Delighted account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for listing Delighted survey responses.",
      {
        ...pageWindow,
        updated_since: timestamp,
        updated_until: timestamp,
        trend: s.nonEmptyString("Trend identifier restricting responses to a specific trend."),
        person_id: personId,
        person_email: email,
        order: s.stringEnum("Sort order for responses based on creation time or updated_at.", [
          "asc",
          "desc",
          "asc:updated_at",
          "desc:updated_at",
        ]),
        expand: s.array(
          "Objects to expand in the survey response payload. The default is notes.",
          s.stringEnum("Expanded response relation.", ["person", "notes"]),
        ),
      },
      {
        optional: [
          "per_page",
          "page",
          "since",
          "until",
          "updated_since",
          "updated_until",
          "trend",
          "person_id",
          "person_email",
          "order",
          "expand",
        ],
      },
    ),
    outputSchema: s.object("Paginated list of Delighted survey responses.", {
      responses: s.array("Survey responses returned by Delighted.", surveyResponse),
      next_page: s.nullableInteger("Next page number when another page is likely available, or null otherwise."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_metrics",
    description: "Retrieve Net Promoter Score and related metrics from Delighted.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for retrieving Delighted metrics.",
      {
        since: timestamp,
        until: timestamp,
        trend: s.nonEmptyString("Trend identifier restricting metrics to a specific trend."),
        groups: s.array(
          "Metric groups to return. The default is core.",
          s.stringEnum("Metric group identifier.", ["core", "email", "kiosk", "link", "sms", "web"]),
        ),
      },
      { optional: ["since", "until", "trend", "groups"] },
    ),
    outputSchema: s.object("Delighted metrics response.", {
      metrics,
    }),
  }),
];
