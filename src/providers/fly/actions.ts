import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fly";

export type FlyActionName =
  | "list_apps"
  | "get_app"
  | "list_machines"
  | "create_machine"
  | "get_machine"
  | "start_machine"
  | "stop_machine"
  | "restart_machine"
  | "wait_for_machine";

const unixSignalValues = ["SIGHUP", "SIGINT", "SIGQUIT", "SIGKILL", "SIGUSR1", "SIGUSR2", "SIGTERM"];
const waitStateValues = ["started", "stopped", "suspended", "destroyed", "failed", "settled"];

const requiredString = (description: string) => s.nonEmptyString(description);
const optionalString = (description: string) => s.string(description);

const appOrganizationSchema = s.looseObject("Fly organization information for an app.", {
  internal_numeric_id: s.integer("The internal numeric organization identifier."),
  name: s.string("The organization display name."),
  slug: s.string("The organization slug."),
});

const appSchema = s.looseObject("Fly App details returned by the Machines API.", {
  id: s.string("The app identifier."),
  internal_numeric_id: s.integer("The internal numeric app identifier."),
  machine_count: s.integer("The number of Machines in the app."),
  name: s.string("The app name."),
  network: s.string("The private network name associated with the app."),
  organization: appOrganizationSchema,
  status: s.string("The app status."),
  volume_count: s.integer("The number of volumes in the app."),
});

const checkStatusSchema = s.looseObject("A Machine check status entry.", {
  name: s.string("The check name."),
  output: s.string("The latest check output."),
  status: s.string("The latest check status."),
  updated_at: s.string("When Fly last updated this check status."),
});

const imageRefSchema = s.looseObject("The resolved image reference for a Machine.", {
  digest: s.string("The image digest."),
  labels: s.record("Image labels keyed by label name.", s.string("A label value.")),
  registry: s.string("The image registry."),
  repository: s.string("The image repository."),
  tag: s.string("The image tag."),
});

const machineEventSchema = s.looseObject("A Machine event returned by Fly.", {
  id: s.string("The event identifier."),
  request: s.looseObject("Request details for this event."),
  source: s.string("The event source."),
  status: s.string("The event status."),
  timestamp: s.integer("The event timestamp."),
  type: s.string("The event type."),
});

const machineConfigInputSchema = s.object(
  "The Fly Machine configuration object. Include the documented image field when creating a Machine, and pass additional Fly Machine config fields as needed.",
  {
    image: requiredString("The Docker image to run in the Machine."),
  },
  {
    additionalProperties: true,
  },
);

const machineConfigOutputSchema = s.looseObject("The Fly Machine configuration object returned by the Machines API.");

const machineSchema = s.looseObject("A Fly Machine returned by the Machines API.", {
  checks: s.array("Check statuses for this Machine.", checkStatusSchema),
  config: machineConfigOutputSchema,
  created_at: s.string("When this Machine was created."),
  events: s.array("Events for this Machine.", machineEventSchema),
  host_status: s.string("The Machine host status."),
  id: s.string("The Machine ID."),
  image_ref: imageRefSchema,
  incomplete_config: machineConfigOutputSchema,
  instance_id: s.string("The version-specific Machine instance ID."),
  name: s.string("The Machine name."),
  nonce: s.string("The lease nonce when the Machine is currently leased."),
  private_ip: s.string("The Machine private 6PN IPv6 address."),
  region: s.string("The Fly region where the Machine resides."),
  state: s.string("The current Machine state."),
  updated_at: s.string("When this Machine was last updated."),
});

const actionAckSchema = s.object("Acknowledgement for a successful Fly lifecycle request.", {
  ok: s.literal(true),
});

const listAppsInputSchema = s.object(
  "Input parameters for listing Fly Apps.",
  {
    org_slug: requiredString("The Fly organization slug, or personal, to filter apps."),
    app_role: optionalString("Optional app role filter."),
  },
  { optional: ["app_role"] },
);

const listAppsOutputSchema = s.looseObject("Apps returned by the Fly Machines API.", {
  apps: s.array("Fly Apps matching the request.", appSchema),
  total_apps: s.integer("The total number of apps returned by Fly."),
});

const getAppInputSchema = s.object("Input parameters for retrieving a Fly App.", {
  app_name: requiredString("The Fly App name."),
});

const listMachinesInputSchema = s.object(
  "Input parameters for listing Fly Machines in an app.",
  {
    app_name: requiredString("The Fly App name."),
    include_deleted: s.boolean("Whether to include deleted Machines."),
    region: optionalString("Optional Fly region filter."),
    state: optionalString("Comma-separated Machine states to filter, such as created, started, stopped, or suspended."),
    summary: s.boolean("Whether to omit large Machine details such as config, checks, and events."),
  },
  { optional: ["include_deleted", "region", "state", "summary"] },
);

const createMachineInputSchema = s.object(
  "Input parameters for creating a Fly Machine.",
  {
    app_name: requiredString("The Fly App name."),
    config: machineConfigInputSchema,
    lease_ttl: s.integer("Seconds to acquire a lease on the newly created Machine."),
    lsvd: s.boolean("Whether to enable Log Structured Virtual Disks for this Machine."),
    min_secrets_version: s.integer("Minimum secrets version required for the Machine."),
    name: optionalString("Unique name for this Machine. Fly generates one when omitted."),
    region: optionalString("Target Fly region. Fly chooses a nearby region when omitted."),
    skip_launch: s.boolean("Whether to create the Machine without booting it."),
    skip_secrets: s.boolean("Whether to skip applying app secrets to the Machine."),
    skip_service_registration: s.boolean("Whether to leave the Machine disconnected from request routing."),
  },
  {
    optional: [
      "lease_ttl",
      "lsvd",
      "min_secrets_version",
      "name",
      "region",
      "skip_launch",
      "skip_secrets",
      "skip_service_registration",
    ],
  },
);

const machineByIdInputSchema = s.object("Input parameters for selecting a Fly Machine by app and Machine ID.", {
  app_name: requiredString("The Fly App name."),
  machine_id: requiredString("The Fly Machine ID."),
});

const stopMachineInputSchema = s.object(
  "Input parameters for stopping a Fly Machine.",
  {
    app_name: requiredString("The Fly App name."),
    machine_id: requiredString("The Fly Machine ID."),
    signal: s.stringEnum("Unix signal to send when stopping the Machine.", unixSignalValues),
    timeout: optionalString("Stop timeout as a Go duration string, such as 1s."),
  },
  { optional: ["signal", "timeout"] },
);

const restartMachineInputSchema = s.object(
  "Input parameters for restarting a Fly Machine.",
  {
    app_name: requiredString("The Fly App name."),
    machine_id: requiredString("The Fly Machine ID."),
    signal: s.stringEnum("Unix signal to use for the restart.", unixSignalValues),
    timeout: optionalString("Restart timeout as a Go duration string or number of seconds."),
  },
  { optional: ["signal", "timeout"] },
);

const waitForMachineInputSchema = s.object(
  "Input parameters for waiting until a Fly Machine reaches a state.",
  {
    app_name: requiredString("The Fly App name."),
    machine_id: requiredString("The Fly Machine ID."),
    from_event_id: optionalString("Machine event ID to start waiting after."),
    state: s.stringEnum("Desired Machine state to wait for.", waitStateValues),
    timeout: s.integer("Maximum wait time in seconds. Fly defaults to 60 seconds."),
    version: optionalString("Machine version ID to wait for."),
  },
  { optional: ["from_event_id", "state", "timeout", "version"] },
);

const waitForMachineOutputSchema = s.looseObject("Result returned after waiting for a Fly Machine state.", {
  event_id: s.string("The event ID observed by the wait request."),
  ok: s.boolean("Whether the Machine reached the desired state."),
  state: s.string("The Machine state observed by Fly."),
  version: s.string("The Machine version observed by Fly."),
});

export const flyActions: Array<ProviderActionDefinition<FlyActionName>> = [
  defineProviderAction(service, {
    name: "list_apps",
    description: "List Fly Apps for an organization through the Machines API.",
    inputSchema: listAppsInputSchema,
    outputSchema: listAppsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_app",
    description: "Retrieve details for a Fly App by name.",
    inputSchema: getAppInputSchema,
    outputSchema: appSchema,
  }),
  defineProviderAction(service, {
    name: "list_machines",
    description: "List Fly Machines in an app with optional state, region, and summary filters.",
    inputSchema: listMachinesInputSchema,
    outputSchema: s.array("Machines returned for the requested Fly App.", machineSchema),
  }),
  defineProviderAction(service, {
    name: "create_machine",
    description: "Create a Fly Machine in an app using a JSON Machine configuration.",
    inputSchema: createMachineInputSchema,
    outputSchema: machineSchema,
  }),
  defineProviderAction(service, {
    name: "get_machine",
    description: "Retrieve a Fly Machine by app and Machine ID.",
    inputSchema: machineByIdInputSchema,
    outputSchema: machineSchema,
  }),
  defineProviderAction(service, {
    name: "start_machine",
    description: "Start a Fly Machine.",
    inputSchema: machineByIdInputSchema,
    outputSchema: actionAckSchema,
  }),
  defineProviderAction(service, {
    name: "stop_machine",
    description: "Stop a Fly Machine, optionally with a Unix signal and timeout.",
    inputSchema: stopMachineInputSchema,
    outputSchema: actionAckSchema,
  }),
  defineProviderAction(service, {
    name: "restart_machine",
    description: "Restart a Fly Machine, optionally with a Unix signal and timeout.",
    inputSchema: restartMachineInputSchema,
    outputSchema: actionAckSchema,
  }),
  defineProviderAction(service, {
    name: "wait_for_machine",
    description: "Wait for a Fly Machine to reach a desired state.",
    inputSchema: waitForMachineInputSchema,
    outputSchema: waitForMachineOutputSchema,
  }),
];
