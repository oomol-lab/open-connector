import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "drimify";

const nullableStringOrBoolean = (description: string) =>
  s.nullable(s.anyOf(description, [s.string(description), s.boolean(description)]));

const appDataCollectionSchema = s.looseObject("A Drimify app data collection record.", {
  id: s.integer("Unique Drimify data collection record ID."),
  appId: s.nullable(s.integer("Drimify application ID associated with the record.")),
  appRef: s.nullable(s.string("Drimify application internal reference.")),
  idunic: s.nullable(s.string("Unique ID value collected by the app.")),
  gender: s.nullable(s.string("Gender value collected by the app.")),
  username: s.nullable(s.string("Username collected by the app.")),
  firstName: s.nullable(s.string("First name collected by the app.")),
  lastName: s.nullable(s.string("Last name collected by the app.")),
  email: s.nullable(s.string("Email address collected by the app.")),
  dob: s.nullable(s.dateTime("Date of birth collected by the app.")),
  address: s.nullable(s.string("Postal address collected by the app.")),
  cp: s.nullable(s.string("Postcode collected by the app.")),
  town: s.nullable(s.string("Town or city collected by the app.")),
  country: s.nullable(s.string("Country collected by the app.")),
  phoneNumber: s.nullable(s.string("Phone number collected by the app.")),
  companyName: s.nullable(s.string("Company name collected by the app.")),
  website: s.nullable(s.url("Website URL collected by the app.")),
  optinNewsletter: nullableStringOrBoolean("Newsletter opt-in value collected by the app."),
  customText: s.nullable(s.string("Custom text field value collected by the app.")),
  customFormat: s.nullable(s.string("Custom formatted field value collected by the app.")),
  profil: s.nullable(s.string("Profile result returned by quiz, survey, or personality apps.")),
  profilUid: s.nullable(s.string("Profile unique ID returned by quiz, survey, or personality apps.")),
  score: s.nullable(s.integer("Score returned by score-based apps.")),
  prizeUid: s.nullable(s.string("Prize unique ID returned when the user won a prize.")),
  prizeTitle: s.nullable(s.string("Prize title returned when the user won a prize.")),
  prizeRef: s.nullable(s.string("Prize reference returned when the user won a prize.")),
  code: s.nullable(s.string("Prize code won by the user.")),
  date: s.dateTime("Server timestamp for the record."),
  publisherId: s.nullable(s.string("Publisher ID associated with the record.")),
  publisherid: s.nullable(s.string("Publisher ID associated with the record.")),
  sessionId: s.nullable(s.string("User session ID associated with the app play.")),
  ip: s.nullable(s.string("IP address recorded by Drimify.")),
  countryCode: s.nullable(s.string("Country code based on the user IP address.")),
  selectValue: s.nullable(s.string("Custom dropdown field value collected by the app.")),
  selectValue2: s.nullable(s.string("Second custom dropdown field value collected by the app.")),
  customCheckbox: s.nullable(s.string("Custom checkbox field value collected by the app.")),
  timeTaken: s.integer("Time spent by the user in seconds."),
  referral: s.string("Traffic source referral value."),
  dateWithTimezone: s.nullable(s.dateTime("Record timestamp converted to the app timezone.")),
  played: s.boolean("Whether the user played the game mechanic."),
  locale: s.nullable(s.string("Application language used during the user experience.")),
  updatedAt: s.nullable(s.dateTime("Timestamp when the record was updated.")),
  levelsPlayed: s.nullable(s.integer("Total levels completed for supported app types.")),
  connectionCountry: s.string("Country name based on the user IP address."),
  updatedAtTimeStamp: s.nullable(s.integer("Timestamp when the record was updated.")),
  updatedAtTimestamp: s.nullable(s.integer("Timestamp when the record was updated.")),
});

const listInputSchema = s.object(
  "Input parameters for listing Drimify app data collection records.",
  {
    page: s.positiveInteger("Collection page number to retrieve. Defaults to 1."),
    itemsPerPage: s.integer("Number of records to return per page, from 0 to 500. Defaults to 500.", {
      minimum: 0,
      maximum: 500,
    }),
    app: s.nonWhitespaceString("Drimify app identifier used to filter data collection records."),
    sessionId: s.nonWhitespaceString("Drimify user session ID used to filter data collection records."),
    createdSince: s.nonWhitespaceString(
      "Filter records created on or after this application-local datetime in YYYY-MM-DDTHH:MM:SS format. Requires app.",
    ),
  },
  { optional: ["page", "itemsPerPage", "app", "sessionId", "createdSince"] },
);

export const drimifyActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_app_data_collections",
    operationType: "read",
    description:
      "List Drimify app data collection records, optionally filtered by app, session ID, or creation datetime.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.requiredObject("Drimify app data collection list response.", {
      records: s.array("Data collection records returned by Drimify.", appDataCollectionSchema),
      count: s.integer("Number of records returned in this response."),
      page: s.integer("Collection page number used for the request."),
      itemsPerPage: s.integer("Maximum number of records requested per page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_app_data_collection",
    operationType: "read",
    description: "Retrieve a single Drimify app data collection record by ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input parameters for retrieving a Drimify data collection record.", {
      id: s.nonWhitespaceString("Drimify app data collection record ID."),
    }),
    outputSchema: s.requiredObject("Drimify app data collection record response.", {
      record: appDataCollectionSchema,
    }),
  }),
];
