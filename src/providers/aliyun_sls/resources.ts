import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export interface AliyunSlsResourceScopeEntry {
  endpoint: string;
  project: string;
  logstores?: string[];
}

export type AliyunSlsResourceScope = AliyunSlsResourceScopeEntry[];

export interface AliyunSlsCredential {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  securityToken?: string;
  resourceScope?: AliyunSlsResourceScope;
}

export interface AliyunSlsProjectTarget {
  endpoint: string;
  project: string;
  scopeEntry?: AliyunSlsResourceScopeEntry;
}

export interface AliyunSlsLogstoreTarget extends AliyunSlsProjectTarget {
  logstore: string;
}

const resourceScopeKeys = new Set(["endpoint", "project", "logstores"]);
const aliyunSlsEndpointPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.log\.aliyuncs\.com$/;

/** Parse and validate all user-configured SLS credential values. */
export function parseAliyunSlsCredential(values: Record<string, string>): AliyunSlsCredential {
  const accessKeyId = requiredString(values.accessKeyId, "accessKeyId", badRequest);
  const accessKeySecret = requiredString(values.accessKeySecret, "accessKeySecret", badRequest);
  const endpoint = normalizeAliyunSlsEndpoint(requiredString(values.endpoint, "endpoint", badRequest));
  const securityToken = optionalString(values.securityToken);
  const resourceScope = parseAliyunSlsResourceScope(values.resourceScope, endpoint);
  const credential: AliyunSlsCredential = {
    accessKeyId,
    accessKeySecret,
    endpoint,
  };
  if (securityToken) credential.securityToken = securityToken;
  if (resourceScope) credential.resourceScope = resourceScope;
  return credential;
}

/** Normalize an official regional SLS endpoint to a public HTTPS host without path state. */
export function normalizeAliyunSlsEndpoint(value: string, fieldName = "endpoint"): string {
  const raw = requiredString(value, fieldName, badRequest);
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  const url = assertPublicHttpUrl(candidate, {
    fieldName,
    createError: badRequest,
  });
  if (url.protocol !== "https:") {
    throw badRequest(`${fieldName} must use https`);
  }
  if (url.username || url.password) {
    throw badRequest(`${fieldName} must not include credentials`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw badRequest(`${fieldName} must not include a path, query, or hash`);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.port || !aliyunSlsEndpointPattern.test(hostname)) {
    throw badRequest(`${fieldName} must be an official Alibaba Cloud SLS endpoint under log.aliyuncs.com`);
  }
  return hostname;
}

/** Parse the optional connector-local SLS resource allowlist. */
export function parseAliyunSlsResourceScope(
  value: unknown,
  defaultEndpoint: string,
): AliyunSlsResourceScope | undefined {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return undefined;
  }

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw badRequest("resourceScope must be valid JSON");
    }
  }
  if (!Array.isArray(parsed)) {
    throw badRequest("resourceScope must be a JSON array");
  }
  if (parsed.length === 0) {
    throw badRequest("resourceScope must not be an empty array");
  }

  const entries: AliyunSlsResourceScope = [];
  const projects = new Set<string>();
  for (const [index, item] of parsed.entries()) {
    const record = optionalRecord(item);
    if (!record) {
      throw badRequest(`resourceScope[${index}] must be an object`);
    }
    const unknownKey = Object.keys(record).find((key) => !resourceScopeKeys.has(key));
    if (unknownKey) {
      throw badRequest(`resourceScope[${index}] contains unsupported field ${unknownKey}`);
    }

    const project = normalizeAliyunSlsProjectName(record.project, `resourceScope[${index}].project`);
    const endpoint =
      "endpoint" in record
        ? normalizeAliyunSlsEndpoint(
            requiredString(record.endpoint, `resourceScope[${index}].endpoint`, badRequest),
            `resourceScope[${index}].endpoint`,
          )
        : defaultEndpoint;
    const projectKey = `${endpoint}\u0000${project}`;
    if (projects.has(projectKey)) {
      throw badRequest(`resourceScope contains duplicate Project ${project} for endpoint ${endpoint}`);
    }
    projects.add(projectKey);

    const logstores = parseScopedLogstores(record, index);
    const entry: AliyunSlsResourceScopeEntry = { endpoint, project };
    if (logstores) entry.logstores = logstores;
    entries.push(entry);
  }
  return entries;
}

export function normalizeAliyunSlsEndpointList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw badRequest("endpoints must contain between 1 and 50 regional endpoints");
  }
  const endpoints: string[] = [];
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      throw badRequest(`endpoints[${index}] must be a string`);
    }
    const endpoint = normalizeAliyunSlsEndpoint(item, `endpoints[${index}]`);
    if (seen.has(endpoint)) {
      throw badRequest(`endpoints contains duplicate endpoint ${endpoint}`);
    }
    seen.add(endpoint);
    endpoints.push(endpoint);
  }
  return endpoints;
}

export function assertAliyunSlsEndpointAllowed(
  scope: AliyunSlsResourceScope | undefined,
  endpoint: string,
): AliyunSlsResourceScopeEntry[] | undefined {
  if (!scope) {
    return undefined;
  }
  const entries = scope.filter((entry) => entry.endpoint === endpoint);
  if (entries.length === 0) {
    throw forbidden(`endpoint ${endpoint} is outside the configured resourceScope allowlist`);
  }
  return entries;
}

export function resolveAliyunSlsProjectTarget(
  credential: AliyunSlsCredential,
  endpointInput: unknown,
  projectInput: unknown,
): AliyunSlsProjectTarget {
  const endpointValue = optionalString(endpointInput);
  const endpoint = endpointValue ? normalizeAliyunSlsEndpoint(endpointValue) : credential.endpoint;
  const entries = assertAliyunSlsEndpointAllowed(credential.resourceScope, endpoint);
  const explicitProject = optionalString(projectInput);

  if (explicitProject) {
    const project = normalizeAliyunSlsProjectName(explicitProject, "project");
    const scopeEntry = entries?.find((entry) => entry.project === project);
    if (entries && !scopeEntry) {
      throw forbidden(`Project ${project} on endpoint ${endpoint} is outside the configured resourceScope allowlist`);
    }
    return scopeEntry ? { endpoint, project, scopeEntry } : { endpoint, project };
  }

  if (!entries) {
    throw badRequest("project is required when resourceScope does not identify exactly one candidate Project");
  }
  if (entries.length !== 1) {
    throw badRequest(`project is required because endpoint ${endpoint} has multiple candidate Projects`);
  }
  return {
    endpoint,
    project: entries[0]!.project,
    scopeEntry: entries[0],
  };
}

export function resolveAliyunSlsLogstoreTarget(
  credential: AliyunSlsCredential,
  endpointInput: unknown,
  projectInput: unknown,
  logstoreInput: unknown,
): AliyunSlsLogstoreTarget {
  const target = resolveAliyunSlsProjectTarget(credential, endpointInput, projectInput);
  const explicitLogstore = optionalString(logstoreInput);
  const allowedLogstores = target.scopeEntry?.logstores;

  if (explicitLogstore) {
    if (allowedLogstores && !allowedLogstores.includes(explicitLogstore)) {
      throw forbidden(
        `Logstore ${explicitLogstore} in Project ${target.project} is outside the configured resourceScope allowlist`,
      );
    }
    return { ...target, logstore: explicitLogstore };
  }

  if (!allowedLogstores || allowedLogstores.length !== 1) {
    throw badRequest(
      `logstore is required when Project ${target.project} does not have exactly one candidate Logstore`,
    );
  }
  return { ...target, logstore: allowedLogstores[0]! };
}

export function filterAliyunSlsProjects(
  projects: Array<Record<string, unknown>>,
  scopeEntries: AliyunSlsResourceScopeEntry[] | undefined,
): Array<Record<string, unknown>> {
  if (!scopeEntries) {
    return projects;
  }
  const allowed = new Set(scopeEntries.map((entry) => entry.project));
  return projects.filter((project) => {
    const projectName = optionalString(project.projectName);
    return projectName ? allowed.has(projectName) : false;
  });
}

export function filterAliyunSlsLogstores(
  logstores: string[],
  scopeEntry: AliyunSlsResourceScopeEntry | undefined,
): string[] {
  if (!scopeEntry?.logstores) {
    return logstores;
  }
  const allowed = new Set(scopeEntry.logstores);
  return logstores.filter((logstore) => allowed.has(logstore));
}

function parseScopedLogstores(record: Record<string, unknown>, index: number): string[] | undefined {
  if (!("logstores" in record)) {
    return undefined;
  }
  if (!Array.isArray(record.logstores) || record.logstores.length === 0) {
    throw badRequest(`resourceScope[${index}].logstores must be a non-empty array`);
  }

  const logstores: string[] = [];
  const seen = new Set<string>();
  for (const [logstoreIndex, item] of record.logstores.entries()) {
    const logstore = requiredString(item, `resourceScope[${index}].logstores[${logstoreIndex}]`, badRequest);
    if (seen.has(logstore)) {
      throw badRequest(`resourceScope[${index}].logstores contains duplicate Logstore ${logstore}`);
    }
    seen.add(logstore);
    logstores.push(logstore);
  }
  return logstores;
}

export function normalizeAliyunSlsProjectName(value: unknown, fieldName: string): string {
  const project = requiredString(value, fieldName, badRequest);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(project)) {
    throw badRequest(`${fieldName} must be a valid 3 to 63 character Simple Log Service Project name`);
  }
  return project;
}

function badRequest(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function forbidden(message: string): ProviderRequestError {
  return new ProviderRequestError(403, message);
}
