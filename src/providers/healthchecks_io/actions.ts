import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "healthchecks_io";

const checkIdSchema = s.nonEmptyString("The Healthchecks.io check UUID or unique key used in the Management API path.");
const checkUuidSchema = s.nonEmptyString("The Healthchecks.io check UUID used in the API path.");
const channelSelectorSchema = s.string(
  "A comma-separated list of channel UUIDs or names, * for all channels, or an empty string to unassign all channels.",
);
const tagsSchema = s.nonEmptyString("A space-delimited list of tags assigned to the check.");
const unixTimestampSchema = s.nonNegativeInteger("A UNIX timestamp in seconds.");

const checkSchema = s.looseObject("A check resource returned by Healthchecks.io.", {
  uuid: s.string("The check UUID."),
  name: s.string("The check name."),
  slug: s.string("The custom check slug."),
  tags: s.string("The space-delimited tag list."),
  desc: s.string("The check description."),
  status: s.string("The current check status."),
  timeout: s.integer("The simple check timeout in seconds."),
  grace: s.integer("The grace period in seconds."),
  schedule: s.string("The cron or systemd OnCalendar expression when present."),
  tz: s.string("The timezone used with the schedule field."),
  manual_resume: s.boolean("Whether the check requires manual resume after failure."),
  methods: s.string("The allowed HTTP methods for ping requests."),
  ping_url: s.url("The ping URL for this check."),
  update_url: s.url("The Management API update URL for this check."),
  pause_url: s.url("The Management API pause URL for this check."),
  resume_url: s.url("The Management API resume URL for this check."),
  channels: s.string("The channel assignment string returned by Healthchecks.io."),
});

const pingSchema = s.looseObject("A ping record returned by Healthchecks.io.", {
  n: s.integer("The ping sequence number."),
  type: s.string("The ping type such as start, success, or failure."),
  date: s.string("The timestamp string for the ping."),
  scheme: s.string("The request scheme used by the ping."),
  remote_addr: s.string("The remote address that sent the ping."),
  method: s.string("The HTTP method used by the ping."),
  ua: s.string("The user agent reported by the ping."),
  body: s.string("The stored request body preview when returned in the list response."),
});

const flipSchema = s.looseObject("A status flip record returned by Healthchecks.io.", {
  timestamp: s.nonNegativeInteger("The UNIX timestamp when the flip happened."),
  up: s.boolean("Whether the check transitioned to up at this timestamp."),
});

const channelSchema = s.looseObject("A notification channel returned by Healthchecks.io.", {
  id: s.string("The channel UUID."),
  name: s.string("The channel name."),
  kind: s.string("The channel kind."),
  enabled: s.boolean("Whether the channel is enabled."),
});

const badgeSchema = s.looseObject("Badge URLs for a Healthchecks.io tag.", {
  svg: s.url("The two-state SVG badge URL."),
  svg3: s.url("The three-state SVG badge URL."),
  json: s.url("The two-state JSON badge URL."),
  json3: s.url("The three-state JSON badge URL."),
  shields: s.url("The two-state shields.io badge URL."),
  shields3: s.url("The three-state shields.io badge URL."),
});

const checkMutationFields = {
  name: s.nonEmptyString("The human-readable check name."),
  slug: s.nonEmptyString("The custom check slug."),
  tags: tagsSchema,
  desc: s.string("The check description."),
  timeout: s.positiveInteger("The simple check timeout in seconds."),
  grace: s.nonNegativeInteger("The grace period in seconds."),
  schedule: s.nonEmptyString("A cron or systemd OnCalendar expression defining the check schedule."),
  tz: s.nonEmptyString("The timezone used with the schedule field, such as Europe/Riga."),
  manual_resume: s.boolean("Whether the check should stay down until manually resumed."),
  methods: s.nonEmptyString("The allowed HTTP methods for ping requests, such as POST."),
  channels: channelSelectorSchema,
  start_kw: s.string("Comma-separated keywords that mark inbound email or HTTP pings as starts."),
  success_kw: s.string("Comma-separated keywords that mark inbound email or HTTP pings as successes."),
  failure_kw: s.string("Comma-separated keywords that mark inbound email or HTTP pings as failures."),
  filter_subject: s.boolean("Whether inbound email subject lines should be keyword-filtered."),
  filter_body: s.boolean("Whether inbound email bodies should be keyword-filtered."),
  filter_http_body: s.boolean("Whether HTTP ping bodies should be keyword-filtered."),
  filter_default_fail: s.boolean(
    "Whether unmatched pings should be treated as failures when keyword filtering is enabled.",
  ),
};

const mutationFieldNames = Object.keys(checkMutationFields);

const createCheckInputSchema = {
  ...s.actionInput(checkMutationFields, [], "The input payload for creating a Healthchecks.io check."),
  anyOf: [{ required: ["timeout"] }, { required: ["schedule"] }],
};

const updateCheckInputSchema = {
  ...s.actionInput(
    {
      uuid: checkUuidSchema,
      ...checkMutationFields,
    },
    ["uuid"],
    "The input payload for updating a Healthchecks.io check.",
  ),
  anyOf: mutationFieldNames.map((key) => ({ required: [key] })),
};

export const healthchecksIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_checks",
    description: "List Healthchecks.io checks in the current project.",
    inputSchema: s.actionInput(
      { slug: s.nonEmptyString("Only return checks with this slug.") },
      [],
      "The input payload for listing Healthchecks.io checks.",
    ),
    outputSchema: s.actionOutput(
      { checks: s.array("The checks returned by Healthchecks.io.", checkSchema) },
      "The response returned when listing Healthchecks.io checks.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_check",
    description: "Get a Healthchecks.io check by UUID or unique key.",
    inputSchema: s.actionInput(
      { check_id: checkIdSchema },
      ["check_id"],
      "The input payload for getting a Healthchecks.io check.",
    ),
    outputSchema: s.actionOutput({ check: checkSchema }, "The response returned when getting a check."),
  }),
  defineProviderAction(service, {
    name: "create_check",
    description: "Create a Healthchecks.io simple or cron check.",
    inputSchema: createCheckInputSchema,
    outputSchema: s.actionOutput({ check: checkSchema }, "The response returned when creating a check."),
  }),
  defineProviderAction(service, {
    name: "update_check",
    description: "Update a Healthchecks.io check by UUID.",
    inputSchema: updateCheckInputSchema,
    outputSchema: s.actionOutput({ check: checkSchema }, "The response returned when updating a check."),
  }),
  defineProviderAction(service, {
    name: "pause_check",
    description: "Pause monitoring for a Healthchecks.io check by UUID.",
    inputSchema: uuidInput("The input payload for pausing a Healthchecks.io check."),
    outputSchema: s.actionOutput({ check: checkSchema }, "The response returned when pausing a check."),
  }),
  defineProviderAction(service, {
    name: "resume_check",
    description: "Resume monitoring for a Healthchecks.io check by UUID.",
    inputSchema: uuidInput("The input payload for resuming a Healthchecks.io check."),
    outputSchema: s.actionOutput({ check: checkSchema }, "The response returned when resuming a check."),
  }),
  defineProviderAction(service, {
    name: "delete_check",
    description: "Delete a Healthchecks.io check by UUID.",
    inputSchema: uuidInput("The input payload for deleting a Healthchecks.io check."),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the check deletion request succeeded."),
        check: s.nullable(checkSchema),
      },
      "The response returned when deleting a check.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_pings",
    description: "List recent Healthchecks.io pings for a check by UUID.",
    inputSchema: uuidInput("The input payload for listing Healthchecks.io pings."),
    outputSchema: s.actionOutput(
      { pings: s.array("The ping records returned by Healthchecks.io.", pingSchema) },
      "The response returned when listing pings.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_flips",
    description: "List Healthchecks.io status flips for a check by UUID or unique key.",
    inputSchema: s.actionInput(
      {
        check_id: checkIdSchema,
        seconds: s.positiveInteger("Only return flips in the latest number of seconds."),
        start: unixTimestampSchema,
        end: unixTimestampSchema,
      },
      ["check_id"],
      "The input payload for listing Healthchecks.io status flips.",
    ),
    outputSchema: s.actionOutput(
      { flips: s.array("The status flip records returned by Healthchecks.io.", flipSchema) },
      "The response returned when listing status flips.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_channels",
    description: "List notification integrations in the current Healthchecks.io project.",
    inputSchema: s.actionInput({}, [], "The input payload for listing Healthchecks.io channels."),
    outputSchema: s.actionOutput(
      { channels: s.array("The channels returned by Healthchecks.io.", channelSchema) },
      "The response returned when listing channels.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_badges",
    description: "List badge metadata in the current Healthchecks.io project.",
    inputSchema: s.actionInput({}, [], "The input payload for listing Healthchecks.io badges."),
    outputSchema: s.actionOutput(
      {
        badges: s.record("The badge URL map returned by Healthchecks.io, keyed by tag.", badgeSchema),
      },
      "The response returned when listing badges.",
    ),
  }),
];

function uuidInput(description: string): JsonSchema {
  return s.actionInput({ uuid: checkUuidSchema }, ["uuid"], description);
}
