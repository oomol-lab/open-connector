import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "statuscake";

const checkRateSchema: JsonSchema = {
  type: "integer",
  enum: [0, 30, 60, 300, 900, 1800, 3600, 86400],
  description: "The uptime check interval in seconds accepted by StatusCake.",
};
const testTypeSchema = s.stringEnum("The uptime test type accepted by StatusCake.", [
  "DNS",
  "HEAD",
  "HTTP",
  "PING",
  "SMTP",
  "SSH",
  "TCP",
]);
const customHeaderInputSchema = s.union(
  [
    s.string("A JSON string representing the custom headers sent by StatusCake.", { minLength: 1 }),
    s.record(s.string("A custom header value sent to the monitored server."), {
      description: "A string-to-string object representing custom headers.",
    }),
  ],
  { description: "A JSON string or object representing the custom headers sent by StatusCake." },
);
const statusCodeField = s.union(
  [s.string("An HTTP status code accepted by StatusCake."), s.integer("An HTTP status code accepted by StatusCake.")],
  { description: "An HTTP status code accepted by StatusCake for uptime validation." },
);

const paginationMetadataSchema = s.looseObject("Pagination metadata returned by StatusCake.", {
  page: s.integer("The current page number."),
  per_page: s.integer("The number of items returned per page."),
  page_count: s.integer("The total number of pages."),
  total_count: s.integer("The total number of matching items."),
});
const linksSchema = s.looseObject("Pagination links returned by StatusCake.", {
  self: s.string("The URL of the current page."),
  next: s.string("The URL of the next page, when available."),
});
const uptimeTestSchema = s.looseObject("A StatusCake uptime test returned by the API.", {
  id: s.string("The unique identifier of the uptime test."),
  name: s.string("The human-readable name of the uptime test."),
  test_type: s.string("The uptime test type returned by StatusCake."),
  website_url: s.string("The URL or IP address monitored by the uptime test."),
  check_rate: s.integer("The probe interval in seconds."),
  status: s.string("The current status of the uptime test."),
  uptime: s.number("The uptime percentage reported by StatusCake."),
});
const uptimeHistoryItemSchema = s.looseObject("A historical uptime result returned by StatusCake.", {
  location: s.string("The location code where the uptime check was executed."),
  created_at: s.dateTime("An ISO 8601 timestamp returned by the StatusCake API."),
  performance: s.integer("The response time in milliseconds."),
  status_code: s.integer("The HTTP status code returned by the probe."),
});
const uptimePeriodItemSchema = s.looseObject("A downtime or uptime period returned by StatusCake.", {
  status: s.string("The status recorded for the period."),
  created_at: s.dateTime("An ISO 8601 timestamp returned by the StatusCake API."),
  ended_at: s.dateTime("An ISO 8601 timestamp returned by the StatusCake API."),
  duration: s.integer("The duration of the period in milliseconds."),
});
const uptimeAlertItemSchema = s.looseObject("An uptime alert returned by StatusCake.", {
  id: s.string("The unique identifier of the uptime alert."),
  status: s.string("The uptime status that triggered the alert."),
  status_code: s.integer("The HTTP status code recorded for the alert."),
  triggered_at: s.dateTime("An ISO 8601 timestamp returned by the StatusCake API."),
});
const uptimeLocationSchema = s.looseObject("A StatusCake uptime monitoring location.", {
  region: s.string("The uptime location region slug."),
  region_code: s.string("The uptime location region code."),
  country: s.string("The country name of the uptime location."),
  city: s.string("The city name of the uptime location."),
  ipv4: s.string("The IPv4 address of the uptime location."),
  ipv6: s.string("The IPv6 address of the uptime location."),
});

const createOrUpdateUptimeFields: Record<string, JsonSchema> = {
  host: s.nonEmptyString("The hosting provider name recorded for the uptime test."),
  name: s.nonEmptyString("The human-readable name of the uptime test."),
  port: s.integer("The destination port used for TCP uptime tests.", { minimum: 0 }),
  tags: s.stringArray("Tags assigned to the uptime test.", { minItems: 1 }),
  paused: s.boolean("Whether the uptime test should be paused."),
  dns_ips: s.stringArray("The DNS IP addresses expected from the monitored host.", { minItems: 1 }),
  regions: s.stringArray("The regions used for the uptime test.", { minItems: 1 }),
  timeout: s.integer("The timeout in seconds before StatusCake marks the probe as failed.", {
    minimum: 5,
    maximum: 75,
  }),
  use_jar: s.boolean("Whether the uptime test stores cookies between requests."),
  post_raw: s.nonEmptyString("The raw HTTP request body sent by StatusCake for POST-based uptime tests."),
  post_body: s.nonEmptyString("A JSON string payload sent by StatusCake when the uptime test uses POST."),
  test_type: testTypeSchema,
  check_rate: checkRateSchema,
  dns_server: s.nonEmptyString("The FQDN or IP address of the DNS server used for DNS uptime tests."),
  user_agent: s.nonEmptyString("The custom user agent string sent by StatusCake when probing the target."),
  do_not_find: s.boolean("Whether StatusCake should fail the test when the find_string is present."),
  find_string: s.nonEmptyString("The string that must be present in the response body for the uptime test to pass."),
  website_url: s.nonEmptyString("The URL or IP address of the server monitored by the uptime test."),
  confirmation: s.integer("The number of confirmation servers StatusCake uses before alerting.", {
    minimum: 0,
    maximum: 3,
  }),
  trigger_rate: s.integer("The number of minutes StatusCake waits before sending an alert.", {
    minimum: 0,
    maximum: 60,
  }),
  custom_header: customHeaderInputSchema,
  basic_password: s.nonEmptyString("The basic authentication password used by the uptime test."),
  basic_username: s.nonEmptyString("The basic authentication username used by the uptime test."),
  contact_groups: s.stringArray("The contact group IDs notified by the uptime test.", { minItems: 1 }),
  follow_redirects: s.boolean("Whether StatusCake should follow redirects while probing the target."),
  include_header: s.boolean("Whether response headers should be included when matching the response body."),
  status_codes: s.array("The HTTP status codes considered healthy by the uptime test.", statusCodeField, {
    minItems: 1,
  }),
};

const uptimeTestOutput = (description: string): JsonSchema =>
  s.requiredObject(description, {
    test: uptimeTestSchema,
  });
const targetUptimeInput = s.actionInput(
  {
    test_id: s.nonEmptyString("The unique identifier of the StatusCake uptime test."),
  },
  ["test_id"],
  "The input payload for targeting a single StatusCake uptime test.",
);
const listWindowedInput = s.actionInput(
  {
    test_id: s.nonEmptyString("The unique identifier of the StatusCake uptime test."),
    limit: s.integer("The maximum number of records to return per page.", { minimum: 1, maximum: 100 }),
    before: s.integer("Only return records before this UNIX timestamp.", { minimum: 0 }),
    after: s.integer("Only return records after this UNIX timestamp.", { minimum: 0 }),
  },
  ["test_id"],
  "The input payload for listing a paginated StatusCake test sub-resource.",
);

export const statuscakeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_uptime_tests",
    description: "List uptime tests available in the connected StatusCake account.",
    requiredScopes: [],
    followUpActions: ["statuscake.get_uptime_test"],
    inputSchema: s.actionInput(
      {
        page: s.integer("The page number of results to return.", { minimum: 1 }),
        limit: s.integer("The number of uptime tests to return per page.", { minimum: 1, maximum: 100 }),
        tags: s.nonEmptyString("A comma-separated list of tags used to filter uptime tests."),
        uptime: s.boolean("Whether the response should include uptime data."),
      },
      [],
      "The input payload for listing StatusCake uptime tests.",
    ),
    outputSchema: s.requiredObject("The uptime test list returned by StatusCake.", {
      tests: s.array("The uptime tests returned by StatusCake.", uptimeTestSchema),
      pagination: s.nullable(paginationMetadataSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_uptime_test",
    description: "Get the full configuration and status of a single StatusCake uptime test.",
    requiredScopes: [],
    followUpActions: [
      "statuscake.update_uptime_test",
      "statuscake.delete_uptime_test",
      "statuscake.list_uptime_test_history",
    ],
    inputSchema: targetUptimeInput,
    outputSchema: uptimeTestOutput("The StatusCake uptime test lookup result."),
  }),
  defineProviderAction(service, {
    name: "create_uptime_test",
    description: "Create a new StatusCake uptime test.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      createOrUpdateUptimeFields,
      ["name", "website_url", "test_type", "check_rate"],
      "The input payload for creating a StatusCake uptime test.",
    ),
    outputSchema: uptimeTestOutput("The newly created StatusCake uptime test."),
  }),
  defineProviderAction(service, {
    name: "update_uptime_test",
    description: "Update an existing StatusCake uptime test.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        test_id: s.nonEmptyString("The unique identifier of the StatusCake uptime test."),
        ...createOrUpdateUptimeFields,
      },
      ["test_id"],
      "The input payload for updating a StatusCake uptime test.",
    ),
    outputSchema: uptimeTestOutput("The updated StatusCake uptime test."),
  }),
  defineProviderAction(service, {
    name: "delete_uptime_test",
    description: "Delete a StatusCake uptime test.",
    requiredScopes: [],
    inputSchema: targetUptimeInput,
    outputSchema: s.requiredObject("The deletion acknowledgement returned by the StatusCake provider.", {
      deleted: s.boolean("Whether the uptime test was deleted successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_uptime_test_history",
    description: "List historical probe results for a StatusCake uptime test.",
    requiredScopes: [],
    inputSchema: listWindowedInput,
    outputSchema: s.requiredObject("The uptime history returned by StatusCake.", {
      history: s.array("The historical uptime probe results returned by StatusCake.", uptimeHistoryItemSchema),
      links: s.nullable(linksSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_uptime_test_periods",
    description: "List uptime or downtime periods recorded for a StatusCake uptime test.",
    requiredScopes: [],
    inputSchema: listWindowedInput,
    outputSchema: s.requiredObject("The uptime period list returned by StatusCake.", {
      periods: s.array("The uptime or downtime periods returned by StatusCake.", uptimePeriodItemSchema),
      links: s.nullable(linksSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_uptime_test_alerts",
    description: "List alerts triggered for a StatusCake uptime test.",
    requiredScopes: [],
    inputSchema: listWindowedInput,
    outputSchema: s.requiredObject("The uptime alert list returned by StatusCake.", {
      alerts: s.array("The uptime alerts returned by StatusCake.", uptimeAlertItemSchema),
      links: s.nullable(linksSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_uptime_locations",
    description: "List available monitoring locations for StatusCake uptime tests.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "No input parameters are required for this action."),
    outputSchema: s.requiredObject("The monitoring locations returned by StatusCake.", {
      locations: s.array("The uptime monitoring locations returned by StatusCake.", uptimeLocationSchema),
    }),
  }),
];
