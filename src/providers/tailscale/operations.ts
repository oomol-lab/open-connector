import type { JsonSchema } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { s } from "../../core/json-schema.ts";

export const tailscaleDeviceReadScope = "devices:core:read";

/**
 * Narrows an operation's scopes to the minimum one call needs.
 *
 * Tailscale mints every access token by downscoping the credential, and asking for a scope the
 * OAuth client was never granted fails the whole request — the token endpoint answers
 * `{"message":"OAuth client cannot grant scopes \"auth_keys\""}`, verified against the live API.
 * Narrowing to a subset of the grant is what succeeds. So a token request must name only what this
 * call actually needs: asking for the union of an endpoint's documented scopes locks out every
 * correctly least-privileged credential, and the key scopes are separately grantable, so an
 * auth-keys-only client is routine rather than hypothetical.
 *
 * `granted` is the scope set recorded when the connection was created. Prefer deciding from `input`
 * alone; read `granted` only where the input cannot identify the scope (`delete_key` knows a key id
 * but not its type) or where a scope is optional for the endpoint rather than required.
 */
export type TailscaleScopeResolver = (
  input: Record<string, unknown>,
  granted: ReadonlySet<string>,
) => readonly string[];

/** Tailscale's catch-all scopes: complete tailnet access, and read-only tailnet access. */
const tailscaleAllScope = "all";
const tailscaleAllReadScope = "all:read";

const readScopeSuffix = ":read";

/**
 * The scope string to request so `scope` is authorized, or undefined when the credential lacks it.
 *
 * Three Tailscale grants cover a scope without naming it. `all` stands in for every scope,
 * `all:read` for every `:read` scope, and a write scope carries its own read form — the docs list a
 * write scope's endpoints as "Endpoints from `<scope>:read`" plus the mutations, and a grant records
 * only the write form. Where just the write form is held it is the write form that gets requested:
 * Tailscale documents narrowing from `all` but not from a write scope to its read form, and guessing
 * wrong fails the token request and the whole action with it.
 */
const grantableScope = (granted: ReadonlySet<string>, scope: string): string | undefined => {
  if (granted.has(scope) || granted.has(tailscaleAllScope)) {
    return scope;
  }
  if (!scope.endsWith(readScopeSuffix)) {
    return undefined;
  }
  if (granted.has(tailscaleAllReadScope)) {
    return scope;
  }
  const writeForm = scope.slice(0, -readScopeSuffix.length);
  return granted.has(writeForm) ? writeForm : undefined;
};

/**
 * Requests only the alternatives the credential holds, for endpoints whose scopes each unlock a
 * different slice of one resource rather than combining into a single requirement.
 *
 * Returning nothing is deliberate: the executor then omits `scope` entirely, which mints a token
 * carrying every scope the client holds. That is the same fallback credential validation uses, and
 * it keeps the action working when the recorded grant is unknown instead of failing closed.
 */
const heldAlternatives =
  (...alternatives: readonly string[]): TailscaleScopeResolver =>
  (_input, granted) =>
    alternatives.map((scope) => grantableScope(granted, scope)).filter((scope) => scope !== undefined);

/**
 * The scope authorizing each `keyType` accepted by `POST /tailnet/{tailnet}/keys`.
 *
 * A Map rather than an object literal so a `keyType` naming an inherited property — `constructor`,
 * `toString` — misses instead of resolving to something that is not a scope at all.
 */
const keyTypeScopes = new Map<string, string>([
  ["auth", "auth_keys"],
  ["client", "oauth_keys"],
  ["federated", "federated_keys"],
]);

/** Tailnet settings that a scope other than `feature_settings` governs. */
const governedTailnetSettings: readonly { scope: string; fields: readonly string[] }[] = [
  { scope: "logs:network", fields: ["networkFlowLoggingOn"] },
  // Tailscale documents this as `httpsCertificates` but the request body field is `httpsEnabled`.
  { scope: "networking_settings", fields: ["httpsEnabled", "httpsCertificates"] },
  { scope: "policy_file", fields: ["aclsExternallyManagedOn", "aclsExternalLink"] },
];

/** Official endpoints that cannot be called with Tailscale OAuth client access tokens. */
export const tailscaleUnsupportedOAuthClientOperations = [
  {
    operationId: "createDeviceInvites",
    reason: "Device invite creation is scoped to a user-owned access key.",
  },
  {
    operationId: "listUserInvites",
    reason: "User invite workflows do not expose an OAuth client scope.",
  },
  {
    operationId: "createUserInvites",
    reason: "User invite creation requires an inviting user and a user-owned access key.",
  },
  {
    operationId: "getUserInvite",
    reason: "User invite workflows do not expose an OAuth client scope.",
  },
  {
    operationId: "deleteUserInvite",
    reason: "User invite deletion requires a user-owned access key.",
  },
  {
    operationId: "resendUserInvite",
    reason: "User invite resend requires an inviting user and a user-owned access key.",
  },
  {
    operationId: "resendDeviceInvite",
    reason: "Device invite resend is scoped to a user-owned access key.",
  },
  {
    operationId: "acceptDeviceInvite",
    reason: "Device invite acceptance is scoped to a user and cannot use an OAuth client token.",
  },
] as const;

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
  /** Request headers sent from the named inputs, keyed by input name. */
  headerFields?: Readonly<Record<string, string>>;
  /**
   * Returns the response body under `bodyField` with response headers beside it.
   *
   * Only for headers carrying data the body omits. Keeping the body under its own field lets it go
   * straight back to Tailscale unaltered.
   */
  responseEnvelope?: {
    bodyField: string;
    /** Response headers to read, keyed by the output field that holds each one. */
    headers: Readonly<Record<string, string>>;
  };
  /**
   * Every scope this operation can require, for operator-facing permissions.
   *
   * This is the union an operation may need across all inputs, not what one call requests. Set
   * `resolveScopes` whenever that union is wider than a single call needs.
   */
  requiredScopes: readonly string[];
  /** Narrows `requiredScopes` to the scopes this call needs. Defaults to requesting all of them. */
  resolveScopes?: TailscaleScopeResolver;
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
    // Each scope reveals a different subset of settings, so read whichever ones the credential holds.
    resolveScopes: heldAlternatives(
      "feature_settings:read",
      "logs:network:read",
      "networking_settings:read",
      "policy_file:read",
    ),
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
    name: "set_device_routes",
    description: "Replace the enabled subnet routes for a Tailscale device.",
    method: "POST",
    path: "/device/{deviceId}/routes",
    pathParameters: ["deviceId"],
    bodyFields: ["routes"],
    requiredScopes: ["devices:routes"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        routes: stringList("The complete list of subnet routes to enable."),
      },
      ["deviceId", "routes"],
      "Tailscale set device routes input.",
    ),
    outputSchema: objectOutput("The advertised and enabled routes after the update."),
  },
  {
    name: "set_device_authorized",
    description: "Authorize or deauthorize a Tailscale device.",
    method: "POST",
    path: "/device/{deviceId}/authorized",
    pathParameters: ["deviceId"],
    bodyFields: ["authorized"],
    requiredScopes: ["devices:core"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        authorized: s.boolean("Whether the device should be authorized."),
      },
      ["deviceId", "authorized"],
      "Tailscale set device authorization input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale device authorization response.")),
  },
  {
    name: "set_device_name",
    description: "Set a Tailscale device name, or reset it from the OS hostname with an empty name.",
    method: "POST",
    path: "/device/{deviceId}/name",
    pathParameters: ["deviceId"],
    bodyFields: ["name"],
    requiredScopes: ["devices:core"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        name: s.string("The new device name, or an empty string to reset it."),
      },
      ["deviceId", "name"],
      "Tailscale set device name input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale set device name response.")),
  },
  {
    name: "set_device_tags",
    description: "Replace all ACL tags assigned to a Tailscale device.",
    method: "POST",
    path: "/device/{deviceId}/tags",
    pathParameters: ["deviceId"],
    bodyFields: ["tags"],
    requiredScopes: ["devices:core"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        tags: stringList("The complete replacement list of ACL tags."),
      },
      ["deviceId", "tags"],
      "Tailscale set device tags input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale set device tags response.")),
  },
  {
    name: "set_device_ip",
    description: "Set the Tailscale IPv4 address for a device.",
    method: "POST",
    path: "/device/{deviceId}/ip",
    pathParameters: ["deviceId"],
    bodyFields: ["ipv4"],
    requiredScopes: ["devices:core"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        ipv4: s.nonEmptyString("The new Tailscale IPv4 address."),
      },
      ["deviceId", "ipv4"],
      "Tailscale set device IP input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale set device IP response.")),
  },
  {
    name: "set_device_posture_attribute",
    description: "Set one custom posture attribute on a Tailscale device.",
    method: "POST",
    path: "/device/{deviceId}/attributes/{attributeKey}",
    pathParameters: ["deviceId", "attributeKey"],
    bodyFields: ["value", "expiry", "comment"],
    requiredScopes: ["devices:posture_attributes"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        attributeKey: s.nonEmptyString("A custom posture attribute key in the custom: namespace."),
        value: s.oneOf([s.string({}), s.number({}), s.boolean({})], {
          description: "The attribute value. Tailscale accepts only a string, number, or boolean.",
        }),
        expiry: s.string("Optional RFC 3339 expiry time."),
        comment: s.string("Optional audit-log comment."),
      },
      ["deviceId", "attributeKey", "value"],
      "Tailscale set device posture attribute input.",
    ),
    outputSchema: objectOutput("The device's custom posture attributes after the update."),
  },
  {
    name: "set_dns_nameservers",
    description: "Replace the global DNS nameservers configured for the tailnet.",
    method: "POST",
    path: "/tailnet/-/dns/nameservers",
    bodyFields: ["dns"],
    requiredScopes: ["dns"],
    inputSchema: s.actionInput(
      { dns: stringList("The complete replacement list of DNS nameserver addresses.") },
      ["dns"],
      "Tailscale set DNS nameservers input.",
    ),
    outputSchema: objectOutput("The updated global DNS nameservers."),
  },
  {
    name: "set_dns_preferences",
    description: "Enable or disable MagicDNS for the tailnet.",
    method: "POST",
    path: "/tailnet/-/dns/preferences",
    bodyFields: ["magicDNS"],
    requiredScopes: ["dns"],
    inputSchema: s.actionInput(
      { magicDNS: s.boolean("Whether MagicDNS should be enabled.") },
      ["magicDNS"],
      "Tailscale set DNS preferences input.",
    ),
    outputSchema: objectOutput("The updated tailnet DNS preferences."),
  },
  {
    name: "set_dns_search_paths",
    description: "Replace the DNS search paths configured for the tailnet.",
    method: "POST",
    path: "/tailnet/-/dns/searchpaths",
    bodyFields: ["searchPaths"],
    requiredScopes: ["dns"],
    inputSchema: s.actionInput(
      { searchPaths: stringList("The complete replacement list of DNS search domains.") },
      ["searchPaths"],
      "Tailscale set DNS search paths input.",
    ),
    outputSchema: objectOutput("The updated DNS search paths."),
  },
  {
    name: "update_split_dns",
    description: "Merge domain-to-resolver entries into the tailnet split DNS configuration.",
    method: "PATCH",
    path: "/tailnet/-/dns/split-dns",
    bodyInputName: "splitDns",
    requiredScopes: ["dns"],
    inputSchema: s.actionInput(
      { splitDns: objectOutput("Domain names mapped to resolver address lists.") },
      ["splitDns"],
      "Tailscale update split DNS input.",
    ),
    outputSchema: objectOutput("The updated split DNS mapping."),
  },
  {
    name: "set_split_dns",
    description: "Replace the entire tailnet split DNS configuration.",
    method: "PUT",
    path: "/tailnet/-/dns/split-dns",
    bodyInputName: "splitDns",
    requiredScopes: ["dns"],
    inputSchema: s.actionInput(
      { splitDns: objectOutput("The complete domain-to-resolver mapping.") },
      ["splitDns"],
      "Tailscale set split DNS input.",
    ),
    outputSchema: objectOutput("The replacement split DNS mapping."),
  },
  {
    name: "set_dns_configuration",
    description:
      "Replace the entire tailnet DNS configuration, including nameservers, split DNS, search paths, and preferences.",
    method: "POST",
    path: "/tailnet/-/dns/configuration",
    bodyInputName: "configuration",
    requiredScopes: ["dns"],
    inputSchema: s.actionInput(
      {
        configuration: objectOutput(
          "The complete replacement DNS configuration. This replaces rather than merges: any section left out is cleared, so send the full configuration.",
        ),
      },
      ["configuration"],
      "Tailscale set DNS configuration input.",
    ),
    outputSchema: objectOutput("The replacement complete DNS configuration."),
  },
  {
    name: "update_tailnet_settings",
    description: "Update reversible feature, logging, networking, or policy-link settings for the tailnet.",
    method: "PATCH",
    path: "/tailnet/-/settings",
    bodyInputName: "settings",
    requiredScopes: ["feature_settings", "logs:network", "networking_settings", "policy_file"],
    // Each scope governs a different subset of settings, so request only the ones this call writes.
    resolveScopes: (input) => {
      const fields = Object.keys(optionalRecord(input.settings) ?? {});
      const scopes = governedTailnetSettings
        .filter((setting) => setting.fields.some((field) => fields.includes(field)))
        .map((setting) => setting.scope);
      const governed = new Set(governedTailnetSettings.flatMap((setting) => setting.fields));
      // `feature_settings` covers every setting the scopes above do not govern.
      if (scopes.length === 0 || fields.some((field) => !governed.has(field))) {
        scopes.unshift("feature_settings");
      }
      return scopes;
    },
    inputSchema: s.actionInput(
      { settings: objectOutput("The tailnet settings fields to update.") },
      ["settings"],
      "Tailscale update tailnet settings input.",
    ),
    outputSchema: objectOutput("The updated tailnet settings."),
  },
  {
    name: "update_service",
    description: "Create or replace a named Tailscale Service definition.",
    method: "PUT",
    path: "/tailnet/-/services/{serviceName}",
    pathParameters: ["serviceName"],
    bodyInputName: "service",
    requiredScopes: ["services"],
    inputSchema: s.actionInput(
      {
        serviceName: s.nonEmptyString("The Tailscale Service name."),
        service: objectOutput("The Service addresses, ports, tags, and comment."),
      },
      ["serviceName", "service"],
      "Tailscale update Service input.",
    ),
    outputSchema: objectOutput("The updated Tailscale Service."),
  },
  {
    name: "list_service_hosts",
    description: "List devices currently hosting a named Tailscale Service.",
    method: "GET",
    path: "/tailnet/-/services/{serviceName}/devices",
    pathParameters: ["serviceName"],
    requiredScopes: ["services", "devices:core"],
    inputSchema: idInput("serviceName", "The Tailscale Service name."),
    outputSchema: objectOutput("The devices hosting the Service."),
  },
  {
    name: "get_service_device_approval",
    description: "Get whether a Service is approved on a specific device.",
    method: "GET",
    path: "/tailnet/-/services/{serviceName}/device/{deviceId}/approved",
    pathParameters: ["serviceName", "deviceId"],
    requiredScopes: ["services", "devices:core"],
    inputSchema: s.actionInput(
      {
        serviceName: s.nonEmptyString("The Tailscale Service name."),
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
      },
      ["serviceName", "deviceId"],
      "Tailscale get Service device approval input.",
    ),
    outputSchema: objectOutput("The Service approval state on the device."),
  },
  {
    name: "update_service_device_approval",
    description: "Approve or revoke approval for a Service on a device.",
    method: "POST",
    path: "/tailnet/-/services/{serviceName}/device/{deviceId}/approved",
    pathParameters: ["serviceName", "deviceId"],
    bodyFields: ["approved"],
    requiredScopes: ["services", "devices:core"],
    inputSchema: s.actionInput(
      {
        serviceName: s.nonEmptyString("The Tailscale Service name."),
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        approved: s.boolean("Whether the Service should be approved on the device."),
      },
      ["serviceName", "deviceId", "approved"],
      "Tailscale update Service device approval input.",
    ),
    outputSchema: objectOutput("The updated Service approval state."),
  },
  {
    name: "batch_update_device_posture_attributes",
    description: "Set or remove custom posture attributes across multiple Tailscale devices.",
    method: "PATCH",
    path: "/tailnet/-/device-attributes",
    // Tailscale ignores a body without `nodes` and still answers 200, so the wrapper is sent as a
    // named field rather than left to the caller to reproduce.
    bodyFields: ["nodes", "comment"],
    requiredScopes: ["devices:posture_attributes"],
    inputSchema: s.actionInput(
      {
        nodes: objectOutput(
          "Device IDs mapped to custom: attribute keys and their {value, expiry} updates. JSON Merge Patch semantics: a null attribute deletes it.",
        ),
        comment: s.string("Optional audit-log comment."),
      },
      ["nodes"],
      "Tailscale batch posture attribute update input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale batch posture attribute update response.")),
  },
  {
    name: "delete_device",
    description: "Permanently delete a device from its Tailscale tailnet.",
    method: "DELETE",
    path: "/device/{deviceId}",
    pathParameters: ["deviceId"],
    requiredScopes: ["devices:core"],
    inputSchema: idInput("deviceId", "The preferred nodeId or legacy id of the device to delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete device response.")),
  },
  {
    name: "expire_device_key",
    description: "Immediately expire a device key and require the device to authenticate again.",
    method: "POST",
    path: "/device/{deviceId}/expire",
    pathParameters: ["deviceId"],
    requiredScopes: ["devices:core"],
    inputSchema: idInput("deviceId", "The preferred nodeId or legacy id of the device."),
    outputSchema: s.nullable(s.unknown("Tailscale expire device key response.")),
  },
  {
    name: "set_device_key_expiry",
    description: "Enable or disable key expiry for a Tailscale device.",
    method: "POST",
    path: "/device/{deviceId}/key",
    pathParameters: ["deviceId"],
    bodyFields: ["keyExpiryDisabled"],
    requiredScopes: ["devices:core"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        keyExpiryDisabled: s.boolean("Whether device key expiry should be disabled."),
      },
      ["deviceId", "keyExpiryDisabled"],
      "Tailscale set device key expiry input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale set device key expiry response.")),
  },
  {
    name: "delete_device_posture_attribute",
    description: "Permanently remove one custom posture attribute from a Tailscale device.",
    method: "DELETE",
    path: "/device/{deviceId}/attributes/{attributeKey}",
    pathParameters: ["deviceId", "attributeKey"],
    requiredScopes: ["devices:posture_attributes"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The preferred nodeId or legacy id of the device."),
        attributeKey: s.nonEmptyString("The custom posture attribute key to delete."),
      },
      ["deviceId", "attributeKey"],
      "Tailscale delete device posture attribute input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale delete posture attribute response.")),
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
    name: "set_log_streaming_configuration",
    description: "Create or replace a Tailscale log streaming destination configuration.",
    method: "PUT",
    path: "/tailnet/-/logging/{logType}/stream",
    pathParameters: ["logType"],
    bodyInputName: "configuration",
    requiredScopes: ["log_streaming", "device_invites", "policy_file"],
    // `device_invites` and `policy_file` are required only for private endpoints, which the request
    // body does not distinguish, so add them when held and let Tailscale reject a genuine shortfall.
    resolveScopes: (input, granted) => [
      "log_streaming",
      ...heldAlternatives("device_invites", "policy_file")(input, granted),
    ],
    inputSchema: s.actionInput(
      {
        logType: s.stringEnum(["configuration", "network"], { description: "The Tailscale log type." }),
        configuration: objectOutput("The complete destination configuration, including any required credentials."),
      },
      ["logType", "configuration"],
      "Tailscale set log streaming configuration input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale set log streaming configuration response.")),
  },
  {
    name: "disable_log_streaming",
    description: "Disable and remove the destination configuration for a Tailscale log stream.",
    method: "DELETE",
    path: "/tailnet/-/logging/{logType}/stream",
    pathParameters: ["logType"],
    requiredScopes: ["log_streaming"],
    inputSchema: logTypeInput,
    outputSchema: s.nullable(s.unknown("Tailscale disable log streaming response.")),
  },
  {
    name: "get_aws_external_id",
    description: "Create or retrieve the AWS external ID used by Tailscale log streaming.",
    method: "POST",
    path: "/tailnet/-/aws-external-id",
    bodyFields: ["reusable"],
    requiredScopes: ["log_streaming"],
    inputSchema: s.actionInput(
      {
        reusable: s.boolean(
          "Whether later reusable calls may receive this same external ID, until it is linked with an AWS account.",
        ),
      },
      [],
      "Tailscale get AWS external ID input.",
    ),
    outputSchema: objectOutput("The AWS external ID assigned to the tailnet."),
  },
  {
    name: "validate_aws_external_id",
    description: "Validate an AWS IAM role trust policy against a Tailscale external ID.",
    method: "POST",
    path: "/tailnet/-/aws-external-id/{externalId}/validate-aws-trust-policy",
    pathParameters: ["externalId"],
    bodyFields: ["roleArn"],
    requiredScopes: ["log_streaming"],
    inputSchema: s.actionInput(
      {
        externalId: s.nonEmptyString("The Tailscale AWS external ID."),
        roleArn: s.nonEmptyString("The AWS IAM role ARN to validate."),
      },
      ["externalId", "roleArn"],
      "Tailscale validate AWS external ID input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale AWS trust policy validation response.")),
  },
  {
    name: "list_keys",
    description: "List trust credentials and keys visible to the OAuth client.",
    method: "GET",
    path: "/tailnet/-/keys",
    queryParameters: [{ inputName: "all", parameterName: "all" }],
    requiredScopes: ["api_access_tokens:read", "auth_keys:read", "oauth_keys:read", "federated_keys:read"],
    // Each scope reveals one key family, so list whichever families the credential can see.
    resolveScopes: heldAlternatives(
      "api_access_tokens:read",
      "auth_keys:read",
      "oauth_keys:read",
      "federated_keys:read",
    ),
    inputSchema: s.actionInput(
      { all: s.boolean("Whether to include expired and revoked keys.") },
      [],
      "Tailscale list keys input.",
    ),
    outputSchema: objectOutput("The visible Tailscale trust credentials and keys."),
  },
  {
    name: "create_key",
    description: "Create an auth key, OAuth client credential, or federated trust credential and return its secret.",
    method: "POST",
    path: "/tailnet/-/keys",
    bodyInputName: "key",
    requiredScopes: ["auth_keys", "oauth_keys", "federated_keys"],
    // Each scope creates one `keyType`; requesting all three locks out the common auth-keys-only client.
    resolveScopes: (input, granted) => {
      // Tailscale defaults an omitted keyType to "auth".
      const keyType = optionalString(optionalRecord(input.key)?.keyType) ?? "auth";
      const scope = keyTypeScopes.get(keyType);
      return scope ? [scope] : heldAlternatives(...keyTypeScopes.values())(input, granted);
    },
    inputSchema: s.actionInput(
      { key: objectOutput("The key type, capabilities, expiry, scopes, tags, and identity configuration.") },
      ["key"],
      "Tailscale create key input.",
    ),
    outputSchema: objectOutput("The created key metadata and one-time secret material."),
  },
  {
    name: "get_key",
    description: "Get metadata for a Tailscale trust credential or key.",
    method: "GET",
    path: "/tailnet/-/keys/{keyId}",
    pathParameters: ["keyId"],
    requiredScopes: ["api_access_tokens:read", "auth_keys:read", "oauth_keys:read", "federated_keys:read"],
    // A key id does not reveal its family, so read with whichever families the credential can see.
    resolveScopes: heldAlternatives(
      "api_access_tokens:read",
      "auth_keys:read",
      "oauth_keys:read",
      "federated_keys:read",
    ),
    inputSchema: idInput("keyId", "The Tailscale key ID."),
    outputSchema: objectOutput("The requested key metadata."),
  },
  {
    name: "delete_key",
    description: "Permanently revoke and delete a Tailscale trust credential or key.",
    method: "DELETE",
    path: "/tailnet/-/keys/{keyId}",
    pathParameters: ["keyId"],
    requiredScopes: ["api_access_tokens", "auth_keys", "oauth_keys", "federated_keys"],
    // A key id does not reveal its type, so request whichever key families the credential holds.
    resolveScopes: heldAlternatives("api_access_tokens", "auth_keys", "oauth_keys", "federated_keys"),
    inputSchema: idInput("keyId", "The Tailscale key ID to revoke and delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete key response.")),
  },
  {
    name: "update_key",
    description: "Replace the mutable configuration of an OAuth or federated Tailscale trust credential.",
    method: "PUT",
    path: "/tailnet/-/keys/{keyId}",
    pathParameters: ["keyId"],
    bodyInputName: "key",
    requiredScopes: ["oauth_keys", "federated_keys"],
    // Each scope updates a different credential kind, and a key id does not say which.
    resolveScopes: heldAlternatives("oauth_keys", "federated_keys"),
    inputSchema: s.actionInput(
      {
        keyId: s.nonEmptyString("The Tailscale key ID."),
        key: objectOutput("The replacement key description, scopes, tags, and identity configuration."),
      },
      ["keyId", "key"],
      "Tailscale update key input.",
    ),
    outputSchema: objectOutput("The updated key metadata."),
  },
  {
    name: "get_policy_file",
    description: "Get the current Tailscale policy file as JSON, optionally with validation details.",
    method: "GET",
    path: "/tailnet/-/acl",
    queryParameters: [{ inputName: "details", parameterName: "details" }],
    // Tailscale returns the policy version only as an ETag header, and set_policy_file needs it to
    // avoid overwriting a concurrent edit, so it is surfaced next to the policy itself.
    responseEnvelope: { bodyField: "policy", headers: { etag: "etag" } },
    requiredScopes: ["policy_file:read"],
    inputSchema: s.actionInput(
      { details: s.boolean("Whether to include the encoded policy, warnings, and errors.") },
      [],
      "Tailscale get policy file input.",
    ),
    outputSchema: s.object(
      {
        policy: objectOutput("The current Tailscale policy file or detailed validation result."),
        etag: s.nullableString("The policy version to pass as set_policy_file's ifMatch input."),
      },
      { required: ["policy"], description: "The current Tailscale policy file and its version." },
    ),
  },
  {
    name: "set_policy_file",
    description: "Replace the Tailscale policy file after its embedded tests pass.",
    method: "POST",
    path: "/tailnet/-/acl",
    bodyInputName: "policy",
    headerFields: { ifMatch: "If-Match" },
    requiredScopes: ["policy_file"],
    inputSchema: s.actionInput(
      {
        policy: objectOutput("The complete replacement Tailscale policy document."),
        ifMatch: s.nonEmptyString(
          "The etag returned by get_policy_file. Rejects the write with HTTP 412 if the policy changed since that read, instead of overwriting the change. Omit to overwrite unconditionally.",
        ),
      },
      ["policy"],
      "Tailscale set policy file input.",
    ),
    outputSchema: objectOutput("The accepted replacement policy file."),
  },
  {
    name: "update_user_role",
    description: "Change a Tailscale user's administrative role.",
    method: "POST",
    path: "/users/{userId}/role",
    pathParameters: ["userId"],
    bodyFields: ["role"],
    requiredScopes: ["users"],
    inputSchema: s.actionInput(
      {
        userId: s.nonEmptyString("The Tailscale user ID."),
        role: s.nonEmptyString("The new Tailscale user role."),
      },
      ["userId", "role"],
      "Tailscale update user role input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale update user role response.")),
  },
  {
    name: "approve_user",
    description: "Approve a pending Tailscale user for the tailnet.",
    method: "POST",
    path: "/users/{userId}/approve",
    pathParameters: ["userId"],
    requiredScopes: ["users"],
    inputSchema: idInput("userId", "The pending Tailscale user ID."),
    outputSchema: s.nullable(s.unknown("Tailscale approve user response.")),
  },
  {
    name: "suspend_user",
    description: "Suspend a Tailscale user and their access to the tailnet.",
    method: "POST",
    path: "/users/{userId}/suspend",
    pathParameters: ["userId"],
    requiredScopes: ["users"],
    inputSchema: idInput("userId", "The Tailscale user ID to suspend."),
    outputSchema: s.nullable(s.unknown("Tailscale suspend user response.")),
  },
  {
    name: "restore_user",
    description: "Restore a suspended Tailscale user.",
    method: "POST",
    path: "/users/{userId}/restore",
    pathParameters: ["userId"],
    requiredScopes: ["users"],
    inputSchema: idInput("userId", "The suspended Tailscale user ID to restore."),
    outputSchema: s.nullable(s.unknown("Tailscale restore user response.")),
  },
  {
    name: "delete_user",
    description: "Permanently delete a Tailscale user from the tailnet.",
    method: "POST",
    path: "/users/{userId}/delete",
    pathParameters: ["userId"],
    requiredScopes: ["users"],
    inputSchema: idInput("userId", "The Tailscale user ID to permanently delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete user response.")),
  },
  {
    name: "update_contact",
    description: "Change the account, support, or security contact email for the tailnet.",
    method: "PATCH",
    path: "/tailnet/-/contacts/{contactType}",
    pathParameters: ["contactType"],
    bodyFields: ["email"],
    requiredScopes: ["account_settings"],
    inputSchema: s.actionInput(
      {
        contactType: s.stringEnum(["account", "support", "security"], {
          description: "The contact category to update.",
        }),
        email: s.nonEmptyString("The replacement contact email address."),
      },
      ["contactType", "email"],
      "Tailscale update contact input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale update contact response.")),
  },
  {
    name: "resend_contact_verification_email",
    description: "Resend the verification email for a tailnet contact.",
    method: "POST",
    path: "/tailnet/-/contacts/{contactType}/resend-verification-email",
    pathParameters: ["contactType"],
    requiredScopes: ["account_settings"],
    inputSchema: s.actionInput(
      {
        contactType: s.stringEnum(["account", "support", "security"], {
          description: "The contact category whose verification should be resent.",
        }),
      },
      ["contactType"],
      "Tailscale resend contact verification input.",
    ),
    outputSchema: s.nullable(s.unknown("Tailscale resend contact verification response.")),
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
    name: "create_webhook",
    description: "Create a webhook endpoint and return its signing secret.",
    method: "POST",
    path: "/tailnet/-/webhooks",
    bodyInputName: "webhook",
    requiredScopes: ["webhooks"],
    inputSchema: s.actionInput(
      { webhook: objectOutput("The endpoint URL, provider type, and event subscriptions.") },
      ["webhook"],
      "Tailscale create webhook input.",
    ),
    outputSchema: objectOutput("The created webhook and one-time signing secret."),
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
    name: "update_webhook",
    description: "Replace the subscribed events for a Tailscale webhook endpoint.",
    method: "PATCH",
    path: "/webhooks/{endpointId}",
    pathParameters: ["endpointId"],
    bodyInputName: "webhook",
    requiredScopes: ["webhooks"],
    inputSchema: s.actionInput(
      {
        endpointId: s.nonEmptyString("The Tailscale webhook endpoint ID."),
        webhook: objectOutput("The webhook fields to update."),
      },
      ["endpointId", "webhook"],
      "Tailscale update webhook input.",
    ),
    outputSchema: objectOutput("The updated webhook endpoint."),
  },
  {
    name: "delete_webhook",
    description: "Permanently delete a Tailscale webhook endpoint.",
    method: "DELETE",
    path: "/webhooks/{endpointId}",
    pathParameters: ["endpointId"],
    requiredScopes: ["webhooks"],
    inputSchema: idInput("endpointId", "The webhook endpoint ID to delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete webhook response.")),
  },
  {
    name: "test_webhook",
    description: "Send a test event to a Tailscale webhook endpoint.",
    method: "POST",
    path: "/webhooks/{endpointId}/test",
    pathParameters: ["endpointId"],
    requiredScopes: ["webhooks"],
    inputSchema: idInput("endpointId", "The webhook endpoint ID to test."),
    outputSchema: s.nullable(s.unknown("Tailscale test webhook response.")),
  },
  {
    name: "rotate_webhook_secret",
    description: "Rotate a webhook signing secret and return the new secret once.",
    method: "POST",
    path: "/webhooks/{endpointId}/rotate",
    pathParameters: ["endpointId"],
    requiredScopes: ["webhooks"],
    inputSchema: idInput("endpointId", "The webhook endpoint ID whose secret should be rotated."),
    outputSchema: objectOutput("The rotated one-time webhook signing secret."),
  },
  {
    name: "delete_service",
    description: "Permanently delete a named Tailscale Service.",
    method: "DELETE",
    path: "/tailnet/-/services/{serviceName}",
    pathParameters: ["serviceName"],
    requiredScopes: ["services"],
    inputSchema: idInput("serviceName", "The Tailscale Service name to delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete Service response.")),
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
    name: "create_oauth_app",
    description: "Create a Tailscale OAuth application and return its client secret.",
    method: "POST",
    path: "/tailnet/-/oauth-apps",
    bodyInputName: "app",
    requiredScopes: ["oauth_apps", "devices:posture_attributes"],
    // `devices:posture_attributes` is required only when the app declares allowed node attributes.
    resolveScopes: (input) =>
      "allowedNodeAttributes" in (optionalRecord(input.app) ?? {})
        ? ["oauth_apps", "devices:posture_attributes"]
        : ["oauth_apps"],
    inputSchema: s.actionInput(
      { app: objectOutput("The OAuth app name, redirect URIs, scopes, and allowed node attributes.") },
      ["app"],
      "Tailscale create OAuth app input.",
    ),
    outputSchema: objectOutput("The created OAuth app and one-time client secret."),
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
    name: "update_oauth_app",
    description: "Replace the configuration of a Tailscale OAuth application.",
    method: "PUT",
    path: "/tailnet/-/oauth-apps/{appId}",
    pathParameters: ["appId"],
    bodyInputName: "app",
    requiredScopes: ["oauth_apps", "devices:posture_attributes"],
    // Tailscale documents only `oauth_apps` here, unlike the create endpoint. Send the posture scope
    // when the app declares node attributes and the credential holds it, so a documented-only
    // `oauth_apps` client still works either way.
    resolveScopes: (input, granted) =>
      "allowedNodeAttributes" in (optionalRecord(input.app) ?? {})
        ? ["oauth_apps", ...heldAlternatives("devices:posture_attributes")(input, granted)]
        : ["oauth_apps"],
    inputSchema: s.actionInput(
      {
        appId: s.nonEmptyString("The Tailscale OAuth app ID."),
        app: objectOutput("The replacement OAuth app configuration."),
      },
      ["appId", "app"],
      "Tailscale update OAuth app input.",
    ),
    outputSchema: objectOutput("The updated OAuth application."),
  },
  {
    name: "delete_oauth_app",
    description: "Permanently delete a Tailscale OAuth application and revoke its access.",
    method: "DELETE",
    path: "/tailnet/-/oauth-apps/{appId}",
    pathParameters: ["appId"],
    requiredScopes: ["oauth_apps"],
    inputSchema: idInput("appId", "The Tailscale OAuth app ID to delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete OAuth app response.")),
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
    name: "delete_device_invite",
    description: "Delete a Tailscale device share invite.",
    method: "DELETE",
    path: "/device-invites/{deviceInviteId}",
    pathParameters: ["deviceInviteId"],
    requiredScopes: ["device_invites"],
    inputSchema: idInput("deviceInviteId", "The Tailscale device invite ID to delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete device invite response.")),
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
    name: "create_posture_integration",
    description: "Create a device posture integration using its external provider credentials.",
    method: "POST",
    path: "/tailnet/-/posture/integrations",
    bodyInputName: "integration",
    requiredScopes: ["feature_settings"],
    inputSchema: s.actionInput(
      { integration: objectOutput("The posture provider, tenant configuration, and client credentials.") },
      ["integration"],
      "Tailscale create posture integration input.",
    ),
    outputSchema: objectOutput("The created device posture integration."),
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
  {
    name: "update_posture_integration",
    description: "Update a device posture integration and optionally replace its client secret.",
    method: "PATCH",
    path: "/posture/integrations/{integrationId}",
    pathParameters: ["integrationId"],
    bodyInputName: "integration",
    requiredScopes: ["feature_settings"],
    inputSchema: s.actionInput(
      {
        integrationId: s.nonEmptyString("The Tailscale posture integration ID."),
        integration: objectOutput("The posture integration fields to update."),
      },
      ["integrationId", "integration"],
      "Tailscale update posture integration input.",
    ),
    outputSchema: objectOutput("The updated device posture integration."),
  },
  {
    name: "delete_posture_integration",
    description: "Delete a device posture integration.",
    method: "DELETE",
    path: "/posture/integrations/{integrationId}",
    pathParameters: ["integrationId"],
    requiredScopes: ["feature_settings"],
    inputSchema: idInput("integrationId", "The Tailscale posture integration ID to delete."),
    outputSchema: s.nullable(s.unknown("Tailscale delete posture integration response.")),
  },
];
