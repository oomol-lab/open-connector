import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "veremark";

const guidSchema = (description: string) => s.string(description, { format: "uuid" });

const criterionSchema = s.object("A normalized Veremark background-check criterion.", {
  guid: guidSchema("The criterion identifier."),
  name: s.string("The criterion name."),
  country: s.nullable(s.string("The ISO country code associated with the criterion.")),
  checks: s.array("The checks included in the criterion.", s.looseObject("One check included in the criterion.")),
  raw: s.looseObject("The raw criterion returned by Veremark."),
});

const requestSchema = s.object("A normalized Veremark background-check request.", {
  guid: guidSchema("The background-check request identifier."),
  status: s.nullable(s.string("The current request status.")),
  requestUrl: s.nullable(s.string("The candidate request page URL when available.")),
  externalId: s.nullable(s.string("The caller-defined tracking identifier when available.")),
  candidateGuid: s.nullable(s.string("The candidate identifier when available.")),
  checks: s.array(
    "The individual background checks attached to the request.",
    s.looseObject("One background check returned by Veremark."),
  ),
  raw: s.looseObject("The raw request returned by Veremark."),
});

const listCriteriaAction = defineProviderAction(service, {
  name: "list_criteria",
  operationType: "read",
  description: "List background-check criteria available to the Veremark organization.",
  inputSchema: s.object("The input payload for listing Veremark criteria.", {}),
  outputSchema: s.object("The response returned when listing Veremark criteria.", {
    criteria: s.array("The available Veremark criteria.", criterionSchema),
  }),
});

const listRequestsAction = defineProviderAction(service, {
  name: "list_requests",
  operationType: "read",
  description: "List Veremark background-check requests, optionally filtered by status-change date.",
  inputSchema: s.object(
    "The input payload for listing Veremark requests.",
    {
      statusChangeDateFrom: s.string("Only return requests whose status changed on or after this YYYY-MM-DD date.", {
        format: "date",
      }),
    },
    { optional: ["statusChangeDateFrom"] },
  ),
  outputSchema: s.object("The response returned when listing Veremark requests.", {
    requests: s.array("The matching Veremark requests.", requestSchema),
  }),
});

const getRequestAction = defineProviderAction(service, {
  name: "get_request",
  operationType: "read",
  description: "Get the current status and results of one Veremark background-check request.",
  inputSchema: s.object("The Veremark request to retrieve.", {
    guid: guidSchema("The background-check request identifier."),
  }),
  outputSchema: s.object("The requested Veremark background-check request.", {
    request: requestSchema,
  }),
});

const candidateInputSchema = s.object(
  "The candidate who will complete the background checks.",
  {
    firstName: s.string("The candidate's first name.", { minLength: 1, maxLength: 255 }),
    lastName: s.string("The candidate's last name.", { minLength: 1, maxLength: 255 }),
    email: s.string("The candidate's email address.", { format: "email" }),
    countryCode: s.string("The candidate's ISO 3166-1 alpha-2 country code.", {
      minLength: 2,
      maxLength: 2,
    }),
    phoneNumber: s.string("The candidate's phone number.", { maxLength: 255 }),
  },
  { optional: ["countryCode", "phoneNumber"] },
);

const jobInputSchema = s.object(
  "The job associated with the background-check request.",
  {
    role: s.string("The role for which the candidate is being screened.", {
      minLength: 1,
      maxLength: 255,
    }),
    externalId: s.string("A caller-defined identifier used to track the request."),
    client: s.string("The client name when screening on behalf of another organization."),
    additionalInformation: s.string("Additional information such as a cost code."),
  },
  { optional: ["externalId", "client", "additionalInformation"] },
);

const webhookInputSchema = s.object(
  "The webhook Veremark should call when the request status changes.",
  {
    url: s.url("The webhook URL that Veremark should call."),
    method: s.stringEnum("The HTTP method Veremark should use for webhook delivery.", ["patch", "put", "post", "get"]),
    authenticationType: s.stringEnum("The webhook authentication method.", ["Basic"]),
    credentials: s.string("The optional Basic authentication credentials for the webhook."),
  },
  { optional: ["authenticationType", "credentials"] },
);

const createRequestAction = defineProviderAction(service, {
  name: "create_request",
  operationType: "write",
  description: "Create a Veremark background-check request for a candidate.",
  inputSchema: s.object(
    "The input payload for creating a Veremark background-check request.",
    {
      criteriaGuid: guidSchema("The criterion identifier selected for the candidate."),
      candidate: candidateInputSchema,
      job: jobInputSchema,
      webhook: webhookInputSchema,
      sendInitialCandidateEmail: s.boolean(
        "Whether Veremark should send its initial information-request email to the candidate.",
      ),
      assignedUserGuid: guidSchema("The Veremark organization user to assign to the new request."),
    },
    { optional: ["webhook", "sendInitialCandidateEmail", "assignedUserGuid"] },
  ),
  outputSchema: s.object("The response returned after creating a Veremark request.", {
    request: requestSchema,
  }),
});

export const veremarkActions: readonly ActionDefinition[] = [
  listCriteriaAction,
  listRequestsAction,
  getRequestAction,
  createRequestAction,
];
