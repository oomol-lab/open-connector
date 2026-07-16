import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export const tailscaleDeviceReadScope = "devices:core:read";

export interface TailscaleQueryParameter {
  inputName: string;
  parameterName: string;
  repeated?: boolean;
  /** Sent when the caller omits the input, to override a Tailscale server-side default. */
  defaultValue?: string;
}

export interface TailscaleOperationDefinition {
  name: string;
  description: string;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: string;
  pathParameters?: readonly string[];
  queryParameters?: readonly TailscaleQueryParameter[];
  bodyFields?: readonly string[];
  bodyInputName?: string;
  bodyFormat?: "json" | "text";
  contentType?: string;
  responseFormat?: "json" | "text";
  requiredScopes: readonly string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

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

const objectOutput = (description: string): JsonSchema => s.record(true, { description });
const emptyInput = (description: string): JsonSchema => s.actionInput({}, [], description);
const idInput = (name: string, description: string): JsonSchema =>
  s.actionInput({ [name]: s.nonEmptyString(description) }, [name], "Tailscale action input.");
const logTypeInput = s.actionInput(
  {
    logType: s.stringEnum(["configuration", "network"], {
      description: "The Tailscale log type.",
    }),
  },
  ["logType"],
  "Tailscale log streaming status input.",
);

export const tailscaleOperations: readonly TailscaleOperationDefinition[] = [
  {
    name: "list_devices",
    description: "List all devices in the configured Tailscale tailnet.",
    method: "GET",
    path: "/tailnet/-/devices",
    requiredScopes: [tailscaleDeviceReadScope],
    inputSchema: emptyInput("Tailscale list devices input."),
    outputSchema: s.object(
      { devices: s.array(device, { description: "Devices in the connected tailnet." }) },
      { required: ["devices"], description: "The devices returned by Tailscale." },
    ),
  },
  {
    name: "get_device",
    description: "Get one Tailscale device by its preferred node ID or legacy device ID.",
    method: "GET",
    path: "/device/{deviceId}",
    pathParameters: ["deviceId"],
    requiredScopes: [tailscaleDeviceReadScope],
    inputSchema: idInput("deviceId", "The preferred nodeId or legacy id of the device."),
    outputSchema: device,
  },
  {
    name: "list_device_routes",
    description: "List the subnet routes advertised and enabled for a Tailscale device.",
    method: "GET",
    path: "/device/{deviceId}/routes",
    pathParameters: ["deviceId"],
    requiredScopes: ["devices:routes:read"],
    inputSchema: idInput("deviceId", "The preferred nodeId or legacy id of the device."),
    outputSchema: objectOutput("Advertised and enabled routes for the device."),
  },
  {
    name: "get_device_posture_attributes",
    description: "Get the posture attributes currently reported for a Tailscale device.",
    method: "GET",
    path: "/device/{deviceId}/attributes",
    pathParameters: ["deviceId"],
    requiredScopes: ["devices:posture_attributes:read"],
    inputSchema: idInput("deviceId", "The preferred nodeId or legacy id of the device."),
    outputSchema: objectOutput("Posture attributes and expirations for the device."),
  },
  {
    name: "list_configuration_audit_logs",
    description: "List configuration audit logs for an RFC 3339 time window, with optional filters.",
    method: "GET",
    path: "/tailnet/-/logging/configuration",
    queryParameters: [
      { inputName: "start", parameterName: "start" },
      { inputName: "end", parameterName: "end" },
      { inputName: "actors", parameterName: "actor", repeated: true },
      { inputName: "targets", parameterName: "target", repeated: true },
      { inputName: "events", parameterName: "event", repeated: true },
    ],
    requiredScopes: ["logs:configuration:read"],
    inputSchema: s.actionInput(
      {
        start: s.nonEmptyString("The start of the log window in RFC 3339 format."),
        end: s.nonEmptyString("The end of the log window in RFC 3339 format."),
        actors: stringList("Actor IDs or wildcard actor searches."),
        targets: stringList("Target filters."),
        events: stringList("Audit event type filters."),
      },
      ["start", "end"],
      "Tailscale configuration audit log input.",
    ),
    outputSchema: objectOutput("Configuration audit log entries and tailnet metadata."),
  },
  {
    name: "get_log_streaming_status",
    description: "Get the current publishing status for configuration or network log streaming.",
    method: "GET",
    path: "/tailnet/-/logging/{logType}/stream/status",
    pathParameters: ["logType"],
    requiredScopes: ["log_streaming:read"],
    inputSchema: logTypeInput,
    outputSchema: objectOutput("Log streaming activity, throughput, and failure statistics."),
  },
  {
    name: "list_dns_nameservers",
    description: "List the global DNS nameservers configured for the tailnet.",
    method: "GET",
    path: "/tailnet/-/dns/nameservers",
    requiredScopes: ["dns:read"],
    inputSchema: emptyInput("Tailscale list DNS nameservers input."),
    outputSchema: objectOutput("The configured global DNS nameservers."),
  },
  {
    name: "get_dns_preferences",
    description: "Get the tailnet DNS preferences, including MagicDNS state.",
    method: "GET",
    path: "/tailnet/-/dns/preferences",
    requiredScopes: ["dns:read"],
    inputSchema: emptyInput("Tailscale get DNS preferences input."),
    outputSchema: objectOutput("The tailnet DNS preferences."),
  },
  {
    name: "list_dns_search_paths",
    description: "List the DNS search paths configured for the tailnet.",
    method: "GET",
    path: "/tailnet/-/dns/searchpaths",
    requiredScopes: ["dns:read"],
    inputSchema: emptyInput("Tailscale list DNS search paths input."),
    outputSchema: objectOutput("The configured DNS search paths."),
  },
  {
    name: "get_split_dns",
    description: "Get the split DNS nameserver mapping for the tailnet.",
    method: "GET",
    path: "/tailnet/-/dns/split-dns",
    requiredScopes: ["dns:read"],
    inputSchema: emptyInput("Tailscale get split DNS input."),
    outputSchema: objectOutput("The split DNS domain-to-nameserver mapping."),
  },
  {
    name: "get_dns_configuration",
    description: "Get the complete DNS configuration for the tailnet.",
    method: "GET",
    path: "/tailnet/-/dns/configuration",
    requiredScopes: ["dns:read"],
    inputSchema: emptyInput("Tailscale get DNS configuration input."),
    outputSchema: objectOutput("The complete tailnet DNS configuration."),
  },
  {
    name: "list_users",
    description: "List tailnet users with optional user-type and role filters.",
    method: "GET",
    path: "/tailnet/-/users",
    queryParameters: [
      { inputName: "type", parameterName: "type", defaultValue: "all" },
      { inputName: "role", parameterName: "role" },
    ],
    requiredScopes: ["users:read"],
    inputSchema: s.actionInput(
      {
        type: s.stringEnum(["member", "shared", "all"], {
          description: "User type filter. Defaults to all users, including users shared into the tailnet.",
        }),
        role: s.stringEnum(
          ["owner", "member", "admin", "it-admin", "network-admin", "billing-admin", "auditor", "all"],
          {
            description: "User role filter.",
          },
        ),
      },
      [],
      "Tailscale list users input.",
    ),
    outputSchema: objectOutput("The users in the connected tailnet."),
  },
  {
    name: "get_user",
    description: "Get a Tailscale user by user ID.",
    method: "GET",
    path: "/users/{userId}",
    pathParameters: ["userId"],
    requiredScopes: ["users:read"],
    inputSchema: idInput("userId", "The Tailscale user ID."),
    outputSchema: objectOutput("The requested Tailscale user."),
  },
  {
    name: "get_contacts",
    description: "Get the account, support, and security contacts for the tailnet.",
    method: "GET",
    path: "/tailnet/-/contacts",
    requiredScopes: ["account_settings:read"],
    inputSchema: emptyInput("Tailscale get contacts input."),
    outputSchema: objectOutput("The account, support, and security contacts."),
  },
  {
    name: "get_tailnet_settings",
    description: "Get the tailnet feature, logging, networking, and policy settings visible to the OAuth client.",
    method: "GET",
    path: "/tailnet/-/settings",
    requiredScopes: ["feature_settings:read", "logs:network:read", "networking_settings:read", "policy_file:read"],
    inputSchema: emptyInput("Tailscale get tailnet settings input."),
    outputSchema: objectOutput("The visible tailnet settings."),
  },
  {
    name: "list_services",
    description: "List the Services configured in the tailnet.",
    method: "GET",
    path: "/tailnet/-/services",
    requiredScopes: ["services:read"],
    inputSchema: emptyInput("Tailscale list Services input."),
    outputSchema: objectOutput("The Services configured in the tailnet."),
  },
  {
    name: "get_service",
    description: "Get a Tailscale Service by name.",
    method: "GET",
    path: "/tailnet/-/services/{serviceName}",
    pathParameters: ["serviceName"],
    requiredScopes: ["services:read"],
    inputSchema: idInput("serviceName", "The Tailscale Service name."),
    outputSchema: objectOutput("The requested Tailscale Service."),
  },
  {
    name: "get_log_streaming_configuration",
    description: "Get the potentially sensitive destination configuration for a Tailscale log stream.",
    method: "GET",
    path: "/tailnet/-/logging/{logType}/stream",
    pathParameters: ["logType"],
    requiredScopes: ["log_streaming:read"],
    inputSchema: logTypeInput,
    outputSchema: objectOutput("The log streaming destination and credential configuration."),
  },
  {
    name: "list_keys",
    description: "List trust credentials and keys visible to the OAuth client.",
    method: "GET",
    path: "/tailnet/-/keys",
    queryParameters: [{ inputName: "all", parameterName: "all" }],
    requiredScopes: ["api_access_tokens:read", "auth_keys:read", "oauth_keys:read", "federated_keys:read"],
    inputSchema: s.actionInput(
      { all: s.boolean("Whether to include expired and revoked keys.") },
      [],
      "Tailscale list keys input.",
    ),
    outputSchema: objectOutput("The visible Tailscale trust credentials and keys."),
  },
  {
    name: "get_key",
    description: "Get metadata for a Tailscale trust credential or key.",
    method: "GET",
    path: "/tailnet/-/keys/{keyId}",
    pathParameters: ["keyId"],
    requiredScopes: ["api_access_tokens:read", "auth_keys:read", "oauth_keys:read", "federated_keys:read"],
    inputSchema: idInput("keyId", "The Tailscale key ID."),
    outputSchema: objectOutput("The requested key metadata."),
  },
  {
    name: "get_policy_file",
    description: "Get the current Tailscale policy file as JSON, optionally with validation details.",
    method: "GET",
    path: "/tailnet/-/acl",
    queryParameters: [{ inputName: "details", parameterName: "details" }],
    requiredScopes: ["policy_file:read"],
    inputSchema: s.actionInput(
      { details: s.boolean("Whether to include the encoded policy, warnings, and errors.") },
      [],
      "Tailscale get policy file input.",
    ),
    outputSchema: objectOutput("The current Tailscale policy file or detailed validation result."),
  },
  {
    name: "list_webhooks",
    description: "List webhook endpoints configured for the tailnet.",
    method: "GET",
    path: "/tailnet/-/webhooks",
    requiredScopes: ["webhooks:read"],
    inputSchema: emptyInput("Tailscale list webhooks input."),
    outputSchema: objectOutput("The webhook endpoints configured for the tailnet."),
  },
  {
    name: "get_webhook",
    description: "Get a Tailscale webhook endpoint by ID.",
    method: "GET",
    path: "/webhooks/{endpointId}",
    pathParameters: ["endpointId"],
    requiredScopes: ["webhooks:read"],
    inputSchema: idInput("endpointId", "The Tailscale webhook endpoint ID."),
    outputSchema: objectOutput("The requested webhook endpoint."),
  },
  {
    name: "list_oauth_apps",
    description: "List OAuth applications configured for the tailnet.",
    method: "GET",
    path: "/tailnet/-/oauth-apps",
    requiredScopes: ["oauth_apps:read"],
    inputSchema: emptyInput("Tailscale list OAuth apps input."),
    outputSchema: objectOutput("The OAuth applications configured for the tailnet."),
  },
  {
    name: "get_oauth_app",
    description: "Get a Tailscale OAuth application by app ID.",
    method: "GET",
    path: "/tailnet/-/oauth-apps/{appId}",
    pathParameters: ["appId"],
    requiredScopes: ["oauth_apps:read"],
    inputSchema: idInput("appId", "The Tailscale OAuth app ID."),
    outputSchema: objectOutput("The requested OAuth application."),
  },
  {
    name: "list_device_invites",
    description: "List all share invites for a Tailscale device.",
    method: "GET",
    path: "/device/{deviceId}/device-invites",
    pathParameters: ["deviceId"],
    requiredScopes: ["device_invites:read"],
    inputSchema: idInput("deviceId", "The preferred nodeId or legacy id of the device."),
    outputSchema: s.array(objectOutput("A device share invite."), {
      description: "The device share invites returned by Tailscale.",
    }),
  },
  {
    name: "get_device_invite",
    description: "Get one Tailscale device share invite.",
    method: "GET",
    path: "/device-invites/{deviceInviteId}",
    pathParameters: ["deviceInviteId"],
    requiredScopes: ["device_invites:read"],
    inputSchema: idInput("deviceInviteId", "The Tailscale device invite ID."),
    outputSchema: objectOutput("The requested device share invite."),
  },
  {
    name: "list_network_flow_logs",
    description: "List network flow logs for an RFC 3339 time window.",
    method: "GET",
    path: "/tailnet/-/logging/network",
    queryParameters: [
      { inputName: "start", parameterName: "start" },
      { inputName: "end", parameterName: "end" },
    ],
    requiredScopes: ["logs:network:read"],
    inputSchema: s.actionInput(
      {
        start: s.nonEmptyString("The start of the log window in RFC 3339 format."),
        end: s.nonEmptyString("The end of the log window in RFC 3339 format."),
      },
      ["start", "end"],
      "Tailscale network flow log input.",
    ),
    outputSchema: objectOutput("Network flow log entries and tailnet metadata."),
  },
  {
    name: "preview_policy_rule_matches",
    description: "Preview which rules in a proposed policy match a user or IP address and port without saving it.",
    method: "POST",
    path: "/tailnet/-/acl/preview",
    queryParameters: [
      { inputName: "type", parameterName: "type" },
      { inputName: "previewFor", parameterName: "previewFor" },
    ],
    bodyInputName: "policy",
    requiredScopes: ["policy_file:read"],
    inputSchema: s.actionInput(
      {
        type: s.stringEnum(["user", "ipport"], { description: "The resource type to preview." }),
        previewFor: s.nonEmptyString("A user email or an IP address and port, depending on type."),
        policy: objectOutput("The proposed JSON policy document to evaluate."),
      },
      ["type", "previewFor", "policy"],
      "Tailscale policy rule preview input.",
    ),
    outputSchema: s.object(
      {
        matches: s.array(
          s.looseObject(
            {
              users: stringList("Source entities affected by the rule."),
              ports: stringList("Destinations that can be accessed."),
              lineNumber: s.integer("The rule's location in the policy file."),
            },
            { description: "A matching policy rule." },
          ),
          { description: "The proposed policy rules matching the requested resource." },
        ),
        type: s.string("Echoes the resource type provided in the request."),
        previewFor: s.string("Echoes the previewed user or IP address and port provided in the request."),
      },
      { required: ["matches"], description: "The proposed policy rules matching the requested resource." },
    ),
  },
  {
    name: "validate_policy_file",
    description: "Validate a proposed policy file or run ACL tests without changing the tailnet policy.",
    method: "POST",
    path: "/tailnet/-/acl/validate",
    bodyInputName: "validation",
    requiredScopes: ["policy_file:read"],
    inputSchema: s.actionInput(
      { validation: s.unknown("A JSON policy document, its JSON string representation, or an array of ACL tests.") },
      ["validation"],
      "Tailscale policy validation input.",
    ),
    outputSchema: objectOutput("Policy parsing errors, warnings, or ACL test results."),
  },
  {
    name: "list_posture_integrations",
    description: "List the device posture integrations configured for the tailnet.",
    method: "GET",
    path: "/tailnet/-/posture/integrations",
    requiredScopes: ["feature_settings:read"],
    inputSchema: emptyInput("Tailscale list posture integrations input."),
    outputSchema: objectOutput("The configured device posture integrations."),
  },
  {
    name: "get_posture_integration",
    description: "Get one device posture integration by ID.",
    method: "GET",
    path: "/posture/integrations/{integrationId}",
    pathParameters: ["integrationId"],
    requiredScopes: ["feature_settings:read"],
    inputSchema: idInput("integrationId", "The Tailscale posture integration ID."),
    outputSchema: objectOutput("The requested device posture integration."),
  },
];
