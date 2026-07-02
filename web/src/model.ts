export type AuthDefinition =
  | { type: "no_auth" }
  | {
      type: "api_key";
      label?: string;
      placeholder?: string;
      description?: string;
      extraFields?: CredentialField[];
    }
  | { type: "custom_credential"; fields: CredentialField[] }
  | {
      type: "oauth2";
      scopes: string[];
      clientConfigFields?: CredentialField[];
    };

export interface CredentialField {
  key: string;
  label: string;
  inputType: "text" | "password" | "textarea" | "json";
  required: boolean;
  secret: boolean;
  placeholder?: string;
  description?: string;
}

export type JsonSchema = Record<string, unknown>;

export interface ActionDefinition {
  id: string;
  service: string;
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  execution: {
    locallyExecutable: boolean;
    catalogOnly: boolean;
    requiredAuthTypes: string[];
    noAuthRunnable: boolean;
    needsCredential: boolean;
  };
}

export interface ProviderDefinition {
  service: string;
  displayName: string;
  categories: string[];
  authTypes: string[];
  auth: AuthDefinition[];
  homepageUrl?: string;
  actions: ActionDefinition[];
}

export interface ConnectionRecord {
  service: string;
  authType: string;
  metadata: Record<string, unknown>;
}

export interface OAuthConfig {
  service: string;
  clientId: string;
  extra: Record<string, string>;
}

export interface RuntimeTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface RuntimeTokenCreation {
  token: string;
  record: RuntimeTokenSummary;
}

export interface RunLog {
  id: string;
  actionId: string;
  caller: "http" | "mcp" | "web";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  inputSummary?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunLogPage {
  items: RunLog[];
  nextCursor?: string;
}

export interface ExecutionResult {
  ok: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface RuntimeActionResponse {
  success: boolean;
  message?: string;
  data?: unknown;
  errorCode?: string;
}

export interface AppData {
  providers: ProviderDefinition[];
  connections: ConnectionRecord[];
  oauthConfigs: OAuthConfig[];
  runtimeTokens: RuntimeTokenSummary[];
  runs: RunLog[];
  runsNextCursor?: string;
}

export interface OverviewSummary {
  providerCount: number;
  actionCount: number;
  connectedCount: number;
  activeTokenCount: number;
  failedRuns: RunLog[];
}

export const emptyData: AppData = {
  providers: [],
  connections: [],
  oauthConfigs: [],
  runtimeTokens: [],
  runs: [],
};

export function createOverviewSummary(data: AppData): OverviewSummary {
  const actions = data.providers.flatMap((provider) => provider.actions);
  return {
    providerCount: data.providers.length,
    actionCount: actions.length,
    connectedCount: data.connections.length,
    activeTokenCount: data.runtimeTokens.filter((token) => !token.revokedAt).length,
    failedRuns: data.runs.filter((run) => !run.ok).slice(0, 5),
  };
}

export function credentialFieldsFor(auth: AuthDefinition): CredentialField[] {
  if (auth.type === "api_key") {
    return [
      {
        key: "apiKey",
        label: auth.label ?? "API key",
        inputType: "password",
        required: true,
        secret: true,
        placeholder: auth.placeholder,
        description: auth.description,
      },
      ...(auth.extraFields ?? []),
    ];
  }
  if (auth.type === "custom_credential") return auth.fields;
  return [];
}

export function filterProviders(providers: ProviderDefinition[], query: string): ProviderDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return providers;
  return providers.filter((provider) =>
    [provider.displayName, provider.service, provider.categories.join(" "), provider.authTypes.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export function sortProviders(
  providers: ProviderDefinition[],
  connectionsByService: Map<string, ConnectionRecord>,
): ProviderDefinition[] {
  return [...providers].sort((left, right) => {
    const leftConnected = connectionsByService.has(left.service);
    const rightConnected = connectionsByService.has(right.service);
    if (leftConnected !== rightConnected) {
      return leftConnected ? -1 : 1;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

export function firstProviderByConnectionStatus(
  providers: ProviderDefinition[],
  connections: ConnectionRecord[],
): ProviderDefinition | undefined {
  return sortProviders(providers, new Map(connections.map((connection) => [connection.service, connection])))[0];
}

export function filterActions(actions: ActionDefinition[], query: string, service: string | null): ActionDefinition[] {
  const normalized = query.trim().toLowerCase();
  return actions.filter((action) => {
    if (service && action.service !== service) return false;
    if (!normalized) return true;
    return [action.id, action.name, action.description, action.requiredScopes.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

export function exampleInput(schema: JsonSchema): string {
  const properties = readProperties(schema);
  const required = readRequired(schema);
  const value: Record<string, unknown> = {};
  for (const key of required) {
    value[key] = exampleValue(properties[key]);
  }
  return JSON.stringify(value, null, 2);
}

export function parameterSummaries(
  schema: JsonSchema,
): Array<{ name: string; required: boolean; type: string; description: string }> {
  const required = new Set(readRequired(schema));
  return Object.entries(readProperties(schema)).map(([name, property]) => ({
    name,
    required: required.has(name),
    type: describeSchemaType(property),
    description: typeof property.description === "string" ? property.description : "",
  }));
}

export function buildActionExamples(action: ActionDefinition): { curl: string; typescript: string } {
  const body = { input: JSON.parse(exampleInput(action.inputSchema)) as unknown };
  const bodyText = JSON.stringify(body, null, 2);
  return {
    curl: [
      `curl -s http://localhost:3000/v1/actions/${action.id} \\`,
      "  -H 'content-type: application/json' \\",
      `  -d '${JSON.stringify(body)}'`,
    ].join("\n"),
    typescript: [
      `const response = await fetch("http://localhost:3000/v1/actions/${action.id}", {`,
      `  method: "POST",`,
      `  headers: { "content-type": "application/json" },`,
      `  body: JSON.stringify(${bodyText}),`,
      `});`,
      `const result = await response.json();`,
    ].join("\n"),
  };
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function formatDuration(run: RunLog): string {
  const ms =
    typeof run.durationMs === "number"
      ? run.durationMs
      : Math.max(0, new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime());
  return `${ms} ms`;
}

export function compactJson(value: unknown): string {
  if (value == null) {
    return "";
  }

  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function readProperties(schema: JsonSchema): Record<string, JsonSchema> {
  return schema.properties && typeof schema.properties === "object"
    ? (schema.properties as Record<string, JsonSchema>)
    : {};
}

function readRequired(schema: JsonSchema): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
}

function describeSchemaType(schema: JsonSchema | undefined): string {
  if (!schema) return "unknown";
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (Array.isArray(schema.anyOf))
    return schema.anyOf.map((value) => describeSchemaType(value as JsonSchema)).join(" | ");
  return typeof schema.type === "string" ? schema.type : "unknown";
}

function exampleValue(schema: JsonSchema | undefined): unknown {
  if (!schema) return "";
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.type === "integer" || schema.type === "number") return 1;
  if (schema.type === "boolean") return false;
  if (schema.type === "array") return [];
  if (schema.type === "object") return {};
  return "";
}
