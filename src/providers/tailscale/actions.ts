import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tailscale";

export type TailscaleActionName = "list_devices" | "get_device";

export const tailscaleDeviceReadScope = "devices:core:read";

const stringList = (description: string): JsonSchema => s.array(s.string("A Tailscale string value."), { description });

const device = s.looseObject(
  {
    id: s.string("The legacy numeric device identifier."),
    nodeId: s.string("The preferred stable device identifier."),
    user: s.string("The user who registered the device."),
    name: s.string("The device MagicDNS name."),
    hostname: s.string("The device hostname shown in the admin console."),
    addresses: stringList("Tailscale IPv4 and IPv6 addresses assigned to the device."),
    clientVersion: s.string("The installed Tailscale client version."),
    os: s.string("The operating system reported by the device."),
    created: s.string("When the device joined the tailnet."),
    connectedToControl: s.boolean("Whether the device recently connected to the Tailscale control server."),
    lastSeen: s.string("When the device last connected to the Tailscale control server."),
    expires: s.string("When the device key expires."),
    authorized: s.boolean("Whether the device is authorized to join the tailnet."),
    isExternal: s.boolean("Whether the device is shared into the tailnet."),
    isEphemeral: s.boolean("Whether the device is ephemeral."),
    updateAvailable: s.boolean("Whether a newer Tailscale client is available."),
    keyExpiryDisabled: s.boolean("Whether key expiry is disabled for the device."),
    blocksIncomingConnections: s.boolean("Whether the device blocks incoming Tailscale connections."),
    enabledRoutes: stringList("Subnet routes enabled for the device."),
    advertisedRoutes: stringList("Subnet routes advertised by the device."),
    tags: stringList("ACL tags assigned to the device."),
    sshEnabled: s.boolean("Whether Tailscale SSH is enabled for the device."),
  },
  { description: "A Tailscale device returned by the official API." },
);

function action(input: {
  name: TailscaleActionName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    requiredScopes: [tailscaleDeviceReadScope],
    providerPermissions: [tailscaleDeviceReadScope],
  });
}

export const tailscaleActions: ActionDefinition[] = [
  action({
    name: "list_devices",
    description: "List all devices in the configured Tailscale tailnet.",
    inputSchema: s.actionInput({}, [], "Tailscale list devices input."),
    outputSchema: s.object(
      {
        devices: s.array(device, { description: "Devices in the connected tailnet." }),
      },
      { required: ["devices"], description: "The devices returned by Tailscale." },
    ),
  }),
  action({
    name: "get_device",
    description: "Get one Tailscale device by its preferred node ID or legacy device ID.",
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
      },
      ["deviceId"],
      "Tailscale get device input.",
    ),
    outputSchema: device,
  }),
];
