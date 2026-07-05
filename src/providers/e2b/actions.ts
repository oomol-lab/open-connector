import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "e2b";

const sandboxIdSchema = s.string({
  description: "The E2B sandbox identifier.",
  minLength: 1,
  pattern: "\\S",
});
const templateIdSchema = s.string({
  description: "The E2B template identifier used to create the sandbox.",
  minLength: 1,
  pattern: "\\S",
});
const metadataSchema = s.record("String metadata attached to the sandbox.", s.string("One sandbox metadata value."));
const envVarsSchema = s.record(
  "Environment variables passed to the sandbox.",
  s.string("One sandbox environment variable value."),
);
const sandboxStateSchema = s.stringEnum("The E2B sandbox lifecycle state.", ["running", "paused"]);
const volumeMountSchema = s.object("An E2B sandbox volume mount.", {
  name: s.string("The volume name."),
  path: s.string("The volume mount path inside the sandbox."),
});
const autoResumeSchema = s.object("Auto-resume configuration for paused sandboxes.", {
  enabled: s.boolean("Whether auto-resume is enabled for paused sandboxes."),
});
const networkSchema = s.looseObject("The E2B sandbox network configuration object.", {
  allowPublicTraffic: s.boolean("Whether sandbox URLs are publicly accessible."),
  allowOut: s.array(
    "Allowed outbound destinations for sandbox egress traffic.",
    s.string("One allowed destination such as a CIDR block, IP address, or domain."),
  ),
  denyOut: s.array(
    "Denied outbound CIDR blocks or IP addresses for sandbox egress traffic.",
    s.string("One denied CIDR block or IP address."),
  ),
  egressProxy: s.nullable(s.looseObject("The egress proxy configuration returned or accepted by E2B.")),
  maskRequestHost: s.string("The host mask used for sandbox requests."),
  rules: s.looseObject("Per-domain outbound request transform rules."),
});
const sandboxSummarySchema = s.looseObject("An E2B sandbox returned by the sandbox list endpoint.", {
  templateID: s.string("Identifier of the template from which the sandbox was created."),
  alias: s.string("Alias of the template when returned by E2B."),
  sandboxID: s.string("Identifier of the sandbox."),
  clientID: s.string("Deprecated E2B client identifier."),
  startedAt: s.dateTime("Time when the sandbox was started."),
  endAt: s.dateTime("Time when the sandbox will expire."),
  cpuCount: s.integer("CPU cores allocated to the sandbox."),
  memoryMB: s.integer("Memory allocated to the sandbox in MiB."),
  diskSizeMB: s.integer("Disk size allocated to the sandbox in MiB."),
  metadata: metadataSchema,
  state: sandboxStateSchema,
  envdVersion: s.string("Version of envd running in the sandbox."),
  volumeMounts: s.array("Volume mounts attached to the sandbox.", volumeMountSchema),
});
const sandboxDetailSchema = s.looseObject("Detailed E2B sandbox information.", {
  templateID: s.string("Identifier of the template from which the sandbox was created."),
  alias: s.string("Alias of the template when returned by E2B."),
  sandboxID: s.string("Identifier of the sandbox."),
  clientID: s.string("Deprecated E2B client identifier."),
  startedAt: s.dateTime("Time when the sandbox was started."),
  endAt: s.dateTime("Time when the sandbox will expire."),
  envdVersion: s.string("Version of envd running in the sandbox."),
  envdAccessToken: s.nullable(s.string("Access token for envd requests when the sandbox is secure.")),
  trafficAccessToken: s.nullable(
    s.string("Token required for accessing the sandbox through the E2B proxy when returned."),
  ),
  domain: s.nullable(s.string("Deprecated E2B sandbox domain field.")),
  allowInternetAccess: s.nullable(
    s.boolean("Whether internet access was explicitly enabled or disabled for the sandbox."),
  ),
  cpuCount: s.integer("CPU cores allocated to the sandbox."),
  memoryMB: s.integer("Memory allocated to the sandbox in MiB."),
  diskSizeMB: s.integer("Disk size allocated to the sandbox in MiB."),
  metadata: metadataSchema,
  state: sandboxStateSchema,
  network: networkSchema,
  lifecycle: s.looseObject("Sandbox lifecycle configuration returned by E2B."),
  volumeMounts: s.array("Volume mounts attached to the sandbox.", volumeMountSchema),
});
const createdSandboxSchema = s.looseObject("The E2B sandbox created by the API.", {
  templateID: s.string("Identifier of the template from which the sandbox was created."),
  sandboxID: s.string("Identifier of the sandbox."),
  alias: s.string("Alias of the template when returned by E2B."),
  clientID: s.string("Deprecated E2B client identifier."),
  envdVersion: s.string("Version of envd running in the sandbox."),
  envdAccessToken: s.nullable(s.string("Access token for envd requests when the sandbox is secure.")),
  trafficAccessToken: s.nullable(
    s.string("Token required for accessing the sandbox through the E2B proxy when returned."),
  ),
  domain: s.nullable(s.string("Deprecated E2B sandbox domain field.")),
});
const createSandboxInputSchema = s.object(
  "The input payload for creating an E2B sandbox.",
  {
    templateID: templateIdSchema,
    timeout: s.integer("Time to live for the sandbox in seconds.", { minimum: 0 }),
    autoPause: s.boolean("Whether E2B should automatically pause the sandbox after timeout."),
    autoPauseMemory: s.boolean(
      "Whether auto-pause should preserve the sandbox memory snapshot when autoPause is true.",
    ),
    autoResume: autoResumeSchema,
    secure: s.boolean("Whether E2B should secure all system communication with the sandbox."),
    allow_internet_access: s.boolean("Whether the sandbox can access the internet."),
    network: networkSchema,
    metadata: metadataSchema,
    envVars: envVarsSchema,
    mcp: s.nullable(s.looseObject("MCP configuration for the sandbox.")),
    volumeMounts: s.array("Volume mounts to attach to the sandbox.", volumeMountSchema),
  },
  {
    optional: [
      "timeout",
      "autoPause",
      "autoPauseMemory",
      "autoResume",
      "secure",
      "allow_internet_access",
      "network",
      "metadata",
      "envVars",
      "mcp",
      "volumeMounts",
    ],
  },
);
const listSandboxesInputSchema = s.object(
  "The input payload for listing E2B sandboxes.",
  {
    metadata: s.string({
      description:
        'Metadata query used to filter sandboxes, such as "user=abc&app=prod". Keys and values must already be URL encoded.',
      minLength: 1,
    }),
    state: s.array("Sandbox states used to filter the list.", sandboxStateSchema, {
      minItems: 1,
    }),
    nextToken: s.string({ description: "Cursor returned by E2B for the next page.", minLength: 1 }),
    limit: s.integer("Maximum number of sandboxes to return per page.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  { optional: ["metadata", "state", "nextToken", "limit"] },
);
const sandboxIdInputSchema = s.object("The input payload for selecting an E2B sandbox.", {
  sandboxID: sandboxIdSchema,
});

export type E2bActionName = "create_sandbox" | "list_sandboxes" | "get_sandbox" | "delete_sandbox";

export const e2bActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_sandbox",
    description: "Create an E2B sandbox from a template.",
    inputSchema: createSandboxInputSchema,
    outputSchema: s.object("The response returned when creating an E2B sandbox.", {
      sandbox: createdSandboxSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_sandboxes",
    description: "List E2B sandboxes visible to the current API key.",
    inputSchema: listSandboxesInputSchema,
    outputSchema: s.object("The response returned when listing E2B sandboxes.", {
      sandboxes: s.array("The sandboxes returned by E2B.", sandboxSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sandbox",
    description: "Get one E2B sandbox by sandbox identifier.",
    inputSchema: sandboxIdInputSchema,
    outputSchema: s.object("The response returned when retrieving an E2B sandbox.", {
      sandbox: sandboxDetailSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_sandbox",
    description: "Kill an E2B sandbox by sandbox identifier.",
    inputSchema: sandboxIdInputSchema,
    outputSchema: s.object("The response returned after deleting an E2B sandbox.", {
      sandboxID: sandboxIdSchema,
      success: s.boolean("Whether the sandbox delete request completed successfully."),
    }),
  }),
];
