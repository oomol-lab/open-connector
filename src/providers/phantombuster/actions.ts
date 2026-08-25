import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "phantombuster";
const id = s.nonEmptyString("The Phantombuster record ID.");
const rawObject = s.looseObject("Raw JSON result returned by Phantombuster for the request.");
const argument = s.anyOf("Agent launch argument as a JSON string or plain object.", [
  s.string("Agent launch argument encoded as a JSON string."),
  s.looseObject("Agent launch argument as a JSON object."),
]);
const organization = s.looseObject("The current Phantombuster organization, with upstream fields preserved.", {
  id,
  name: s.string("Name of the Phantombuster organization."),
  planSlug: s.string("Current plan slug for the organization."),
  timezone: s.string("Timezone configured for the organization."),
});
const agent = s.looseObject("A Phantombuster agent, with upstream fields preserved.", {
  id,
  name: s.nullableString("Name of the agent."),
  createdAt: s.number("A Phantombuster v2 timestamp in milliseconds."),
  scriptOrgName: s.nullableString("Organization name owning the agent script."),
  scriptId: s.nullableString("Script ID used by the agent."),
  script: s.nullableString("Script filename used by the agent."),
  branch: s.nullableString("Script branch used by the agent."),
  environment: s.nullableString("Script branch environment used by the agent."),
  argument: s.nullableString("Default argument stored on the agent."),
});
const container = s.looseObject("A Phantombuster container, with upstream fields preserved.", {
  id,
  status: s.string("Current container status."),
  createdAt: s.number("A Phantombuster v2 timestamp in milliseconds."),
  launchType: s.string("How the container was launched."),
  endType: s.string("How the container ended."),
  endedAt: s.number("Timestamp when the container ended."),
});

export const phantombusterActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_organization",
    description: "Get the current Phantombuster organization for the connected API key.",
    inputSchema: s.object("Input parameters for getting the current organization.", {}),
    outputSchema: s.object("The current Phantombuster organization.", { organization }),
  }),
  defineProviderAction(service, {
    name: "list_agents",
    description: "List all Phantombuster agents in the current organization.",
    inputSchema: s.object("Input parameters for listing Phantombuster agents.", {}),
    outputSchema: s.object("All Phantombuster agents in the current organization.", {
      agents: s.array("Agents returned by Phantombuster.", agent),
    }),
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Get a Phantombuster agent by ID.",
    inputSchema: s.object("Input parameters for getting a Phantombuster agent.", { id }),
    outputSchema: s.object("The requested Phantombuster agent.", { agent }),
  }),
  defineProviderAction(service, {
    name: "launch_agent",
    description: "Add a Phantombuster agent to the launch queue.",
    inputSchema: s.object(
      "Input parameters for launching a Phantombuster agent.",
      {
        id,
        argument,
        arguments: argument,
        bonusArgument: argument,
        saveArgument: s.boolean("Whether to save argument as the agent default launch options."),
        saveArguments: s.boolean("Whether to save argument as the agent default launch options."),
        manualLaunch: s.boolean("Whether the launch should be considered manually triggered."),
        maxInstanceCount: s.integer("Only launch if already running instances are below this value.", { minimum: 1 }),
        internalMetadata: s.record(
          "Key-value metadata attached to the launched container.",
          s.unknown("A metadata value."),
        ),
        userCustomMetadata: s.record(
          "Key-value user metadata attached to the launched container.",
          s.unknown("A metadata value."),
        ),
        persistedVolumeKey: s.nullable(
          s.string("Key identifying the persisted volume to attach to the container.", { maxLength: 256 }),
        ),
      },
      {
        optional: [
          "argument",
          "arguments",
          "bonusArgument",
          "saveArgument",
          "saveArguments",
          "manualLaunch",
          "maxInstanceCount",
          "internalMetadata",
          "userCustomMetadata",
          "persistedVolumeKey",
        ],
      },
    ),
    outputSchema: s.object("The Phantombuster launch result.", { launch: rawObject }),
  }),
  defineProviderAction(service, {
    name: "stop_agent",
    description: "Stop a Phantombuster agent.",
    inputSchema: s.object(
      "Input parameters for stopping a Phantombuster agent.",
      {
        id,
        softAbort: s.boolean("Whether to try a soft abort."),
        cascadeToAllSlaves: s.boolean("Whether to recursively stop slave agents."),
        dontLaunchSoon: s.boolean("Whether to disable the next scheduled launch-soon run."),
        switchToManualLaunch: s.boolean("Whether to switch the agent to manual launch."),
      },
      { optional: ["softAbort", "cascadeToAllSlaves", "dontLaunchSoon", "switchToManualLaunch"] },
    ),
    outputSchema: s.object("The Phantombuster stop result.", { stop: rawObject }),
  }),
  defineProviderAction(service, {
    name: "list_containers",
    description: "List containers associated with a Phantombuster agent.",
    inputSchema: s.object("Input parameters for listing Phantombuster containers.", {
      agentId: id,
    }),
    outputSchema: s.object(
      "Containers associated with the requested agent.",
      {
        containers: s.array("Containers returned by Phantombuster.", container),
        maxLimitReached: s.boolean("Whether Phantombuster reached the response size limit."),
      },
      { optional: ["maxLimitReached"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_container",
    description: "Get a Phantombuster container by ID.",
    inputSchema: s.object("Input parameters for getting a Phantombuster container.", { id }),
    outputSchema: s.object("The requested Phantombuster container.", { container }),
  }),
];
