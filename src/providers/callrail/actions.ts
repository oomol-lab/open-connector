import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "callrail";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const positiveInteger = (description: string, maximum?: number): JsonSchema =>
  s.integer(description, {
    minimum: 1,
    maximum,
  });

const accountIdSchema = nonEmptyString("The CallRail account ID.");
const companyIdSchema = nonEmptyString("The CallRail company ID.");
const callIdSchema = nonEmptyString("The CallRail call ID.");
const formSubmissionIdSchema = nonEmptyString("The CallRail form submission ID.");
const fieldsSchema = s.array(
  "Additional field names to request from CallRail, such as milestones or keywords_spotted.",
  nonEmptyString("One CallRail field name to request."),
  { minItems: 1 },
);

const paginationInputFields: Record<string, JsonSchema> = {
  page: positiveInteger("The page number to return."),
  perPage: positiveInteger("The number of records to return per page.", 250),
};

const paginationOutputFields: Record<string, JsonSchema> = {
  page: s.nullableInteger("The current page number returned by CallRail."),
  perPage: s.nullableInteger("The number of records returned per page."),
  totalPages: s.nullableInteger("The total number of pages when provided by CallRail."),
  totalRecords: s.nullableInteger("The total number of matching records."),
  hasNextPage: s.nullableBoolean("Whether a next page is available when CallRail returns relative pagination."),
  nextPageUrl: s.nullableString("The next page URL returned by CallRail when relative pagination is used."),
};

const rawObjectSchema = s.looseObject("The raw CallRail object.");

const accountSchema = s.object("A CallRail account.", {
  id: s.nullableString("The CallRail account ID."),
  name: s.nullableString("The account name."),
  outboundRecordingEnabled: s.nullableBoolean("Whether outbound recording is enabled for the account."),
  hipaaAccount: s.nullableBoolean("Whether the account is a HIPAA account."),
  raw: rawObjectSchema,
});

const companySchema = s.object("A CallRail company.", {
  id: s.nullableString("The CallRail company ID."),
  name: s.nullableString("The company name."),
  status: s.nullableString("The company status returned by CallRail."),
  timeZone: s.nullableString("The company time zone."),
  createdAt: s.nullableString("The company creation timestamp."),
  disabledAt: s.nullableString("The company disabled timestamp when present."),
  raw: rawObjectSchema,
});

const callSchema = s.object("A CallRail call.", {
  id: s.nullableString("The CallRail call ID."),
  companyId: s.nullableString("The CallRail company ID associated with the call."),
  customerName: s.nullableString("The caller or customer name."),
  customerPhoneNumber: s.nullableString("The caller or customer phone number."),
  trackingPhoneNumber: s.nullableString("The tracking phone number that received the call."),
  businessPhoneNumber: s.nullableString("The destination business phone number."),
  direction: s.nullableString("The call direction returned by CallRail."),
  answered: s.nullableBoolean("Whether the call was answered."),
  duration: s.nullableInteger("The call duration in seconds."),
  startTime: s.nullableString("The call start timestamp."),
  source: s.nullableString("The marketing source attributed to the call."),
  recording: s.nullableString("The CallRail recording URL when available."),
  raw: rawObjectSchema,
});

const formSubmissionSchema = s.object("A CallRail form submission.", {
  id: s.nullableString("The CallRail form submission ID."),
  companyId: s.nullableString("The CallRail company ID associated with the submission."),
  personId: s.nullableString("The CallRail person ID associated with the submission."),
  customerName: s.nullableString("The submitted customer name when available."),
  customerEmail: s.nullableString("The submitted customer email when available."),
  customerPhoneNumber: s.nullableString("The submitted customer phone number when available."),
  formUrl: s.nullableString("The URL of the submitted form."),
  landingPageUrl: s.nullableString("The landing page URL attributed to the submission."),
  submittedAt: s.nullableString("The submission timestamp."),
  source: s.nullableString("The marketing source attributed to the submission."),
  formData: s.looseObject("The submitted form data returned by CallRail."),
  raw: rawObjectSchema,
});

export const callrailActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List CallRail accounts visible to the API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing CallRail accounts.",
      {
        ...paginationInputFields,
        hipaaAccount: s.boolean("Filter accounts by HIPAA account status."),
      },
      { optional: ["page", "perPage", "hipaaAccount"] },
    ),
    outputSchema: s.object("The response returned when listing CallRail accounts.", {
      ...paginationOutputFields,
      accounts: s.array("The CallRail accounts returned by the API.", accountSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List CallRail companies for one account.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing CallRail companies.",
      {
        accountId: accountIdSchema,
        ...paginationInputFields,
      },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: s.object("The response returned when listing CallRail companies.", {
      ...paginationOutputFields,
      companies: s.array("The CallRail companies returned by the API.", companySchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List CallRail calls for one account with optional company, tracker, date, and field filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing CallRail calls.",
      {
        accountId: accountIdSchema,
        companyId: companyIdSchema,
        trackerId: nonEmptyString("Only return calls for this CallRail tracker ID."),
        startDate: s.date("Only return calls on or after this date."),
        endDate: s.date("Only return calls on or before this date."),
        fields: fieldsSchema,
        ...paginationInputFields,
        relativePagination: s.boolean("Whether to request CallRail relative pagination."),
      },
      {
        optional: ["companyId", "trackerId", "startDate", "endDate", "fields", "page", "perPage", "relativePagination"],
      },
    ),
    outputSchema: s.object("The response returned when listing CallRail calls.", {
      ...paginationOutputFields,
      calls: s.array("The CallRail calls returned by the API.", callSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Retrieve one CallRail call by account ID and call ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving one CallRail call.",
      {
        accountId: accountIdSchema,
        callId: callIdSchema,
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: s.object("The response returned when retrieving one CallRail call.", {
      call: callSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_form_submissions",
    description: "List CallRail form submissions for one account with optional company, date, and field filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing CallRail form submissions.",
      {
        accountId: accountIdSchema,
        companyId: companyIdSchema,
        startDate: s.date("Only return submissions on or after this date."),
        endDate: s.date("Only return submissions on or before this date."),
        fields: fieldsSchema,
        ...paginationInputFields,
      },
      { optional: ["companyId", "startDate", "endDate", "fields", "page", "perPage"] },
    ),
    outputSchema: s.object("The response returned when listing CallRail form submissions.", {
      ...paginationOutputFields,
      formSubmissions: s.array("The CallRail form submissions returned by the API.", formSubmissionSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_form_submission",
    description: "Retrieve one CallRail form submission by account ID and form submission ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one CallRail form submission.", {
      accountId: accountIdSchema,
      formSubmissionId: formSubmissionIdSchema,
    }),
    outputSchema: s.object("The response returned when retrieving one CallRail form submission.", {
      formSubmission: formSubmissionSchema,
      raw: rawObjectSchema,
    }),
  }),
];
