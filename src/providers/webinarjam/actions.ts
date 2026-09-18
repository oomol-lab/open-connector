import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "webinarjam";

const webinarIdSchema = s.positiveInteger("The WebinarJam webinar_id value.");
const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });
const optionalTimestamp = s.nonNegativeInteger("Unix timestamp filter accepted by WebinarJam for this list request.");
const customFieldOptionIdSchema = s.anyOf("One selected WebinarJam custom field option ID.", [
  s.string("A selected custom field option ID."),
  s.number("A numeric selected custom field option ID."),
]);
const customFieldValueSchema = s.anyOf("One custom registration field value.", [
  s.string("A string custom field value."),
  s.number("A numeric custom field value."),
  s.boolean("A boolean custom field value."),
  s.array("Selected dropdown option IDs for a custom field.", customFieldOptionIdSchema, {
    minItems: 1,
  }),
]);

const webinarSchema = s.looseObject("A WebinarJam webinar object returned by the API.", {
  webinar_id: s.integer("The WebinarJam webinar identifier."),
  name: s.string("The webinar name returned by WebinarJam."),
  title: s.string("The webinar title returned by WebinarJam."),
  description: s.string("The webinar description returned by WebinarJam."),
  schedules: s.array("The schedules returned for this webinar.", s.unknown("One schedule item.")),
});

const registrantSchema = s.looseObject("A WebinarJam registrant or attendee object.", {
  first_name: s.string("The registrant first name."),
  last_name: s.string("The registrant last name."),
  email: s.string("The registrant email address."),
  phone: s.string("The registrant phone number."),
  schedule: s.unknown("The webinar schedule value returned by WebinarJam."),
});

export const webinarjamActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_webinars",
    operationType: "read",
    description: "List WebinarJam webinars published in the authenticated account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing WebinarJam webinars.", {}),
    outputSchema: s.object("The response returned when listing WebinarJam webinars.", {
      webinars: s.array("Webinars returned by WebinarJam.", webinarSchema),
      raw: s.looseObject("The raw WebinarJam list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_webinar",
    operationType: "read",
    description: "Get details for one WebinarJam webinar.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting a WebinarJam webinar.", {
      webinarId: webinarIdSchema,
    }),
    outputSchema: s.object("The response returned when getting a WebinarJam webinar.", {
      webinar: webinarSchema,
      raw: s.looseObject("The raw WebinarJam webinar response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_registrants",
    operationType: "read",
    description: "List WebinarJam registrants or attendees for a webinar.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing WebinarJam registrants and attendees.",
      {
        webinarId: webinarIdSchema,
        scheduleId: s.positiveInteger("Only return users for this WebinarJam schedule_id value."),
        page: s.positiveInteger("The result page to return."),
        attendedLive: s.integer("Live attendance filter accepted by WebinarJam.", {
          minimum: 0,
          maximum: 4,
        }),
        attendedReplay: s.integer("Replay attendance filter accepted by WebinarJam.", {
          minimum: 0,
          maximum: 4,
        }),
        purchased: s.integer("Purchase status filter accepted by WebinarJam.", {
          minimum: 0,
          maximum: 2,
        }),
        attendedLiveTimestamp: optionalTimestamp,
        attendedReplayTimestamp: optionalTimestamp,
        dateRange: s.integer("Date range filter accepted by WebinarJam.", {
          minimum: 0,
          maximum: 8,
        }),
        search: nonEmptyString("Search text used to filter registrants."),
      },
      {
        optional: [
          "scheduleId",
          "page",
          "attendedLive",
          "attendedReplay",
          "purchased",
          "attendedLiveTimestamp",
          "attendedReplayTimestamp",
          "dateRange",
          "search",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing WebinarJam registrants.", {
      registrants: s.array("Registrants or attendees returned by WebinarJam.", registrantSchema),
      raw: s.looseObject("The raw WebinarJam registrants response."),
    }),
  }),
  defineProviderAction(service, {
    name: "register_user",
    operationType: "write",
    description: "Register one user for a WebinarJam webinar.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for registering a WebinarJam user.",
      {
        webinarId: webinarIdSchema,
        firstName: nonEmptyString("The user's first name."),
        email: s.email("The user's email address."),
        schedule: s.positiveInteger("The WebinarJam schedule integer value to register the user for."),
        lastName: nonEmptyString("The user's last name."),
        country: nonEmptyString("The user's country."),
        state: nonEmptyString("The user's state or region."),
        timezoneId: s.positiveInteger("The WebinarJam timezone_id integer value."),
        ipAddress: nonEmptyString("The user's IP address."),
        phoneCountryCode: nonEmptyString("The user's phone country code."),
        phone: nonEmptyString("The user's phone number."),
        twilioConsent: s.boolean("Whether the user consented to SMS through Twilio."),
        customFields: s.record(
          "Additional WebinarJam custom registration fields keyed by field name or label.",
          customFieldValueSchema,
        ),
      },
      {
        optional: [
          "lastName",
          "country",
          "state",
          "timezoneId",
          "ipAddress",
          "phoneCountryCode",
          "phone",
          "twilioConsent",
          "customFields",
        ],
      },
    ),
    outputSchema: s.object("The response returned when registering a WebinarJam user.", {
      registration: s.looseObject("The registered user object returned by WebinarJam."),
      raw: s.looseObject("The raw WebinarJam registration response."),
    }),
  }),
];
