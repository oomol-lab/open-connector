import type { CredentialValidationResult } from "../../core/types.ts";
import type { KeyObject } from "node:crypto";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { oracleInstanceActions, oracleInstanceAgentMaxWaitSeconds } from "./actions.ts";
import { parseOracleApiPrivateKey, signOracleApiRequest } from "./request-signer.ts";

const requestTimeoutMs = 30_000;
const commandWaitMs = oracleInstanceAgentMaxWaitSeconds * 1_000;
const defaultRealm = "oc1";

/**
 * Non-terminal `InstanceAgentCommandExecution.lifecycleState` values. Every other state
 * (SUCCEEDED, FAILED, TIMED_OUT, CANCELED, or one OCI adds later) ends the polling loop.
 */
const oracleInstanceAgentPendingStates = new Set(["ACCEPTED", "IN_PROGRESS"]);

export const oracleRealmDomains = {
  oc1: "oraclecloud.com",
  oc2: "oraclegovcloud.com",
  oc3: "oraclegovcloud.com",
  oc4: "oraclegovcloud.uk",
  oc8: "oraclecloud8.com",
  oc9: "oraclecloud9.com",
  oc10: "oraclecloud10.com",
  oc14: "oraclecloud14.com",
  oc15: "oraclecloud15.com",
  oc19: "oraclecloud.eu",
  oc20: "oraclecloud20.com",
  oc21: "oraclecloud21.com",
  oc23: "oraclecloud23.com",
  oc24: "oraclecloud24.com",
  oc26: "oraclecloud26.com",
  oc29: "oraclecloud29.com",
  oc35: "oraclecloud35.com",
  oc42: "oraclecloud42.com",
  oc51: "oraclecloud51.com",
  oc52: "oraclecloud52.com",
} as const;

type OracleRealm = keyof typeof oracleRealmDomains;
type OracleService = "core" | "identity" | "monitoring" | "instanceAgent";
type RequestPhase = "validate" | "execute";
type OracleMethod = "GET" | "POST" | "PUT" | "DELETE";
type OracleCloudActionHandler = (input: Record<string, unknown>, context: OracleCloudContext) => Promise<unknown>;

interface OracleRequestInput {
  context: OracleCloudContext;
  path: string;
  phase: RequestPhase;
  service?: OracleService;
  method?: OracleMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

interface OracleResponse {
  payload: unknown;
  status: number;
  nextPage: string | null;
  opcRequestId: string | null;
  etag: string | null;
  workRequestId: string | null;
}

export interface OracleCloudContext {
  tenancyId: string;
  userId: string;
  fingerprint: string;
  privateKey: KeyObject;
  region: string;
  realm: OracleRealm;
  defaultCompartmentId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const oracleCloudActionHandlers: Record<string, OracleCloudActionHandler> = {
  list_instances: (input, context) =>
    listResources(input, context, "instances", "/instances", {
      compartmentId: compartment(input, context),
      lifecycleState: optionalString(input.lifecycleState),
      limit: readLimit(input.limit),
      page: optionalString(input.page),
    }),
  get_instance: (input, context) => getEntity(context, "instance", "/instances", input.instanceId, ["instance"]),
  launch_instance: launchInstance,
  terminate_instance: (input, context) => deleteEntity(context, "/instances", input.instanceId, ["instance"]),
  update_instance: updateInstance,
  list_images: (input, context) =>
    listResources(input, context, "images", "/images", {
      compartmentId: compartment(input, context),
      operatingSystem: optionalString(input.operatingSystem),
      limit: readLimit(input.limit),
      page: optionalString(input.page),
    }),
  get_image: (input, context) => getEntity(context, "image", "/images", input.imageId, ["image"]),
  instance_action: instanceAction,
  list_vnic_attachments: (input, context) =>
    listResources(input, context, "vnicAttachments", "/vnicAttachments", {
      compartmentId: compartment(input, context),
      instanceId: optionalOcid(input.instanceId, "instanceId", ["instance"]),
      limit: readLimit(input.limit),
      page: optionalString(input.page),
    }),
  get_vnic_attachment: (input, context) =>
    getEntity(context, "vnicAttachment", "/vnicAttachments", input.vnicAttachmentId, ["vnicattachment"]),

  list_vcns: (input, context) => listResources(input, context, "vcns", "/vcns", listQuery(input, context)),
  get_vcn: (input, context) => getEntity(context, "vcn", "/vcns", input.vcnId, ["vcn"]),
  delete_vcn: (input, context) => deleteEntity(context, "/vcns", input.vcnId, ["vcn"]),
  create_vcn: (input, context) =>
    createEntity(context, "vcn", "/vcns", {
      compartmentId: compartment(input, context),
      cidrBlock: requiredString(input.cidrBlock, "cidrBlock", inputError),
      displayName: requiredString(input.displayName, "displayName", inputError),
    }),
  list_subnets: (input, context) =>
    listResources(input, context, "subnets", "/subnets", {
      ...listQuery(input, context),
      vcnId: optionalOcid(input.vcnId, "vcnId", ["vcn"]),
    }),
  get_subnet: (input, context) => getEntity(context, "subnet", "/subnets", input.subnetId, ["subnet"]),
  create_subnet: (input, context) =>
    createEntity(context, "subnet", "/subnets", {
      compartmentId: compartment(input, context),
      vcnId: requireOcid(input.vcnId, "vcnId", ["vcn"]),
      cidrBlock: requiredString(input.cidrBlock, "cidrBlock", inputError),
      displayName: requiredString(input.displayName, "displayName", inputError),
    }),
  list_security_lists: (input, context) =>
    listResources(input, context, "securityLists", "/securityLists", {
      ...listQuery(input, context),
      vcnId: optionalOcid(input.vcnId, "vcnId", ["vcn"]),
    }),
  get_security_list: (input, context) =>
    getEntity(context, "securityList", "/securityLists", input.securityListId, ["securitylist"]),
  list_network_security_groups: (input, context) =>
    listResources(input, context, "networkSecurityGroups", "/networkSecurityGroups", {
      ...listQuery(input, context),
      vcnId: optionalOcid(input.vcnId, "vcnId", ["vcn"]),
      vlanId: optionalOcid(input.vlanId, "vlanId", ["vlan"]),
    }),
  get_network_security_group: (input, context) =>
    getEntity(context, "networkSecurityGroup", "/networkSecurityGroups", input.networkSecurityGroupId, [
      "networksecuritygroup",
    ]),
  get_vnic: (input, context) => getEntity(context, "vnic", "/vnics", input.vnicId, ["vnic"]),

  list_alarms: (input, context) =>
    listResources(input, context, "alarms", "/alarms", listQuery(input, context), "monitoring"),
  list_metric_definitions: listMetricDefinitions,
  get_metrics_data: getMetricsData,

  list_compartments: listCompartments,
  get_tenancy: (input, context) =>
    getEntity(context, "tenancy", "/tenancies", input.tenancyId, ["tenancy"], "identity"),
  list_availability_domains: (input, context) =>
    listResources(
      input,
      context,
      "availabilityDomains",
      "/availabilityDomains",
      { compartmentId: compartment(input, context) },
      "identity",
    ),
  get_current_tenancy: (_input, context) =>
    getEntity(context, "tenancy", "/tenancies", context.tenancyId, ["tenancy"], "identity"),
  get_current_user: (_input, context) => getEntity(context, "user", "/users", context.userId, ["user"], "identity"),
  get_compartment_by_name: getCompartmentByName,
  list_subscribed_regions: (input, context) =>
    listResources(
      input,
      context,
      "regions",
      `/tenancies/${encodeURIComponent(optionalOcid(input.tenancyId, "tenancyId", ["tenancy"]) ?? context.tenancyId)}/regionSubscriptions`,
      {},
      "identity",
    ),

  run_instance_agent_command: runInstanceAgentCommand,
  list_instance_agent_command_executions: (input, context) =>
    listResources(
      input,
      context,
      "commandExecutions",
      "/instanceAgentCommandExecutions",
      {
        compartmentId: compartment(input, context),
        instanceId: requireOcid(input.instanceId, "instanceId", ["instance"]),
        limit: readLimit(input.limit),
        page: optionalString(input.page),
      },
      "instanceAgent",
    ),
};

export function createOracleCloudContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): OracleCloudContext {
  return {
    tenancyId: requireOcid(values.tenancyId, "tenancyId", ["tenancy"], credentialError),
    userId: requireOcid(values.userId, "userId", ["user"], credentialError),
    fingerprint: requireFingerprint(values.fingerprint),
    privateKey: parseOracleApiPrivateKey(
      requiredString(values.privateKey, "privateKey", credentialError),
      optionalString(values.privateKeyPassphrase),
    ),
    region: requireRegion(values.region),
    realm: requireRealm(values.realm),
    defaultCompartmentId: requireOcid(
      values.defaultCompartmentId,
      "defaultCompartmentId",
      ["compartment", "tenancy"],
      credentialError,
    ),
    fetcher,
    signal,
  };
}

export async function validateOracleCloudCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createOracleCloudContext(values, fetcher, signal);
  try {
    await requestOracle({
      context,
      path: "/instances",
      phase: "validate",
      query: { compartmentId: context.defaultCompartmentId, limit: 1 },
    });
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.status !== 403) throw error;
  }
  return {
    profile: { accountId: context.userId, displayName: `OCI ${context.region}` },
    grantedScopes: [],
    metadata: {
      tenancyId: context.tenancyId,
      region: context.region,
      realm: context.realm,
      defaultCompartmentId: context.defaultCompartmentId,
      apiBaseUrl: buildOracleApiBaseUrl(context.region, context.realm, "core"),
      validationEndpoint: "/20160918/instances",
    },
  };
}

export function buildOracleApiBaseUrl(region: string, realm: OracleRealm, service: OracleService = "core"): string {
  const domain = oracleRealmDomains[realm];
  if (service === "monitoring") return `https://telemetry.${region}.${domain}/20180401`;
  if (service === "identity") return `https://identity.${region}.oci.${domain}/20160918`;
  const version = service === "instanceAgent" ? "20180530" : "20160918";
  return `https://iaas.${region}.${domain}/${version}`;
}

async function launchInstance(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const body = compactObject({
    compartmentId: compartment(input, context),
    displayName: requiredString(input.displayName, "displayName", inputError),
    availabilityDomain: requiredString(input.availabilityDomain, "availabilityDomain", inputError),
    shape: optionalString(input.shape) ?? "VM.Standard.E5.Flex",
    sourceDetails: {
      sourceType: "image",
      imageId: requireOcid(input.imageId, "imageId", ["image"]),
    },
    createVnicDetails: { subnetId: requireOcid(input.subnetId, "subnetId", ["subnet"]) },
    shapeConfig: compactObject({
      ocpus: optionalIntegerLike(input.ocpus, "ocpus", inputError),
      memoryInGBs: optionalNumber(input.memoryInGBs),
    }),
  });
  return createEntity(context, "instance", "/instances", body);
}

async function updateInstance(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const shapeConfig = compactObject({
    ocpus: optionalIntegerLike(input.ocpus, "ocpus", inputError),
    memoryInGBs: optionalNumber(input.memoryInGBs),
  });
  if (Object.keys(shapeConfig).length === 0) throw inputError("ocpus or memoryInGBs is required");
  const id = requireOcid(input.instanceId, "instanceId", ["instance"]);
  const response = await requestOracle({
    context,
    path: `/instances/${encodeURIComponent(id)}`,
    phase: "execute",
    method: "PUT",
    body: { shapeConfig },
  });
  return entityResult("instance", response);
}

async function instanceAction(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const id = requireOcid(input.instanceId, "instanceId", ["instance"]);
  const action = requiredString(input.action, "action", inputError);
  if (!oracleInstanceActions.includes(action)) {
    throw inputError(`action must be one of ${oracleInstanceActions.join(", ")}`);
  }
  const response = await requestOracle({
    context,
    path: `/instances/${encodeURIComponent(id)}`,
    phase: "execute",
    method: "POST",
    query: { action },
    body: {},
  });
  return entityResult("instance", response);
}

async function listMetricDefinitions(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const groupBy = Array.isArray(input.groupBy)
    ? input.groupBy.map((value) => requiredString(value, "groupBy", inputError))
    : undefined;
  const response = await requestOracle({
    context,
    service: "monitoring",
    path: "/metrics/actions/listMetrics",
    phase: "execute",
    method: "POST",
    query: compactObject({
      compartmentId: compartment(input, context),
      compartmentIdInSubtree: optionalBoolean(input.compartmentIdInSubtree),
      limit: readLimit(input.limit),
      page: optionalString(input.page),
    }),
    body: compactObject({
      groupBy,
      name: optionalString(input.metricName),
      namespace: optionalString(input.namespace),
      resourceGroup: optionalString(input.resourceGroup),
    }),
  });
  return listResult("metrics", response);
}

async function getMetricsData(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const endTime = optionalString(input.endTime) ?? new Date().toISOString();
  const startTime = optionalString(input.startTime) ?? new Date(Date.now() - 3 * 60 * 60 * 1_000).toISOString();
  const response = await requestOracle({
    context,
    service: "monitoring",
    path: "/metrics/actions/summarizeMetricsData",
    phase: "execute",
    method: "POST",
    query: compactObject({
      compartmentId: compartment(input, context),
      compartmentIdInSubtree: optionalBoolean(input.compartmentIdInSubtree),
    }),
    body: compactObject({
      query: requiredString(input.query, "query", inputError),
      namespace: requiredString(input.namespace, "namespace", inputError),
      startTime,
      endTime,
      resourceGroup: optionalString(input.resourceGroup),
      resolution: optionalString(input.resolution) ?? "1m",
    }),
  });
  return listResult("metricData", response);
}

async function listCompartments(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const parentId = compartment(input, context);
  const response = await requestOracle({
    context,
    service: "identity",
    path: "/compartments",
    phase: "execute",
    query: compactObject({
      compartmentId: parentId,
      compartmentIdInSubtree: optionalBoolean(input.compartmentIdInSubtree) ?? false,
      accessLevel: optionalString(input.accessLevel) ?? "ANY",
      limit: readLimit(input.limit),
      page: optionalString(input.page),
    }),
  });
  const result = listResult("compartments", response);
  const includeRoot =
    optionalBoolean(input.includeRoot) !== false &&
    optionalString(input.page) === undefined &&
    parentId === context.tenancyId;
  if (includeRoot) {
    const root = await readRootCompartment(context);
    if (root) (result.compartments as Array<unknown>).push(root);
  }
  return result;
}

/**
 * Read the tenancy root compartment. It is supplementary data appended to a listing that already
 * succeeded, so a tenancy the caller cannot inspect omits the root instead of failing the action.
 */
async function readRootCompartment(context: OracleCloudContext): Promise<Record<string, unknown> | null> {
  try {
    const root = await requestOracle({
      context,
      service: "identity",
      path: `/compartments/${encodeURIComponent(context.tenancyId)}`,
      phase: "execute",
    });
    return requiredRecord(root.payload, "OCI root compartment", responseError);
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status < 500) return null;
    throw error;
  }
}

async function getCompartmentByName(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const name = requiredString(input.name, "name", inputError);
  const response = await requestOracle({
    context,
    service: "identity",
    path: "/compartments",
    phase: "execute",
    query: {
      compartmentId: requireOcid(input.parentCompartmentId, "parentCompartmentId", ["compartment", "tenancy"]),
      name,
      accessLevel: "ACCESSIBLE",
      lifecycleState: "ACTIVE",
    },
  });
  const compartments = requireArray(response.payload);
  const found = compartments.find((item) => optionalString(optionalRecord(item)?.name) === name) ?? null;
  return { compartment: found, opcRequestId: response.opcRequestId };
}

async function runInstanceAgentCommand(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Promise<Record<string, unknown>> {
  const instanceId = requireOcid(input.instanceId, "instanceId", ["instance"]);
  const executionTimeoutInSeconds = readCommandTimeout(input.executionTimeoutInSeconds);
  const createResponse = await requestOracle({
    context,
    service: "instanceAgent",
    path: "/instanceAgentCommands",
    phase: "execute",
    method: "POST",
    body: {
      compartmentId: compartment(input, context),
      displayName: requiredString(input.displayName, "displayName", inputError),
      target: { instanceId },
      content: {
        source: { sourceType: "TEXT", text: requiredString(input.script, "script", inputError) },
        output: { outputType: "TEXT" },
      },
      executionTimeOutInSeconds: executionTimeoutInSeconds,
    },
  });
  const command = requiredRecord(createResponse.payload, "OCI instance agent command", responseError);
  const commandId = requireOcid(command.id, "command.id", ["instanceagentcommand"], responseError);
  const deadline = Date.now() + commandWaitMs;
  while (Date.now() < deadline) {
    const execution = await requestOracle({
      context,
      service: "instanceAgent",
      path: `/instanceAgentCommands/${encodeURIComponent(commandId)}/status`,
      phase: "execute",
      query: { instanceId },
    });
    const lifecycleState = optionalString(optionalRecord(execution.payload)?.lifecycleState);
    if (lifecycleState !== undefined && !oracleInstanceAgentPendingStates.has(lifecycleState)) {
      return entityResult("commandExecution", execution);
    }
    await waitForPoll(context.signal);
  }
  throw new ProviderRequestError(504, "OCI instance agent command timed out");
}

async function waitForPoll(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new ProviderRequestError(504, "OCI request was aborted"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 5_000);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function listQuery(
  input: Record<string, unknown>,
  context: OracleCloudContext,
): Record<string, string | number | undefined> {
  return {
    compartmentId: compartment(input, context),
    limit: readLimit(input.limit),
    page: optionalString(input.page),
  };
}

async function listResources(
  _input: Record<string, unknown>,
  context: OracleCloudContext,
  resultName: string,
  path: string,
  query: OracleRequestInput["query"],
  service: OracleService = "core",
): Promise<Record<string, unknown>> {
  const response = await requestOracle({ context, service, path, phase: "execute", query });
  return listResult(resultName, response);
}

async function getEntity(
  context: OracleCloudContext,
  resultName: string,
  path: string,
  idValue: unknown,
  resourceTypes: string[],
  service: OracleService = "core",
): Promise<Record<string, unknown>> {
  const id = requireOcid(idValue, `${resultName}Id`, resourceTypes);
  const response = await requestOracle({
    context,
    service,
    path: `${path}/${encodeURIComponent(id)}`,
    phase: "execute",
  });
  return entityResult(resultName, response);
}

async function createEntity(
  context: OracleCloudContext,
  resultName: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await requestOracle({ context, path, phase: "execute", method: "POST", body });
  return entityResult(resultName, response);
}

async function deleteEntity(
  context: OracleCloudContext,
  path: string,
  idValue: unknown,
  resourceTypes: string[],
): Promise<Record<string, unknown>> {
  const id = requireOcid(idValue, "resourceId", resourceTypes);
  const response = await requestOracle({
    context,
    path: `${path}/${encodeURIComponent(id)}`,
    phase: "execute",
    method: "DELETE",
  });
  return { status: response.status, opcRequestId: response.opcRequestId };
}

function listResult(resultName: string, response: OracleResponse): Record<string, unknown> {
  return {
    [resultName]: requireArray(response.payload),
    nextPage: response.nextPage,
    opcRequestId: response.opcRequestId,
  };
}

function entityResult(resultName: string, response: OracleResponse): Record<string, unknown> {
  return {
    [resultName]: requiredRecord(response.payload, `OCI ${resultName}`, responseError),
    opcRequestId: response.opcRequestId,
  };
}

export async function requestOracle(input: OracleRequestInput): Promise<OracleResponse> {
  const service = input.service ?? "core";
  const baseUrl = buildOracleApiBaseUrl(input.context.region, input.context.realm, service);
  const url = new URL(`${baseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const method = input.method ?? "GET";
  const body = input.body === undefined ? undefined : JSON.stringify(input.body);
  const headers = signOracleApiRequest(input.context, { method, url, body });
  headers.set("user-agent", providerUserAgent);
  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);

  let response: Response;
  let text: string;
  try {
    response = await input.context.fetcher(url, { method, headers, body, signal: timeout.signal });
    text = await response.text();
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) throw new ProviderRequestError(504, "OCI request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OCI request failed: ${error.message}` : "OCI request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = parsePayload(text, response.ok);
  if (!response.ok) throw createApiError(response, payload, input.phase);
  return {
    payload,
    status: response.status,
    nextPage: response.headers.get("opc-next-page"),
    opcRequestId: response.headers.get("opc-request-id"),
    etag: response.headers.get("etag"),
    workRequestId: response.headers.get("opc-work-request-id"),
  };
}

function parsePayload(text: string, successful: boolean): unknown {
  if (!text) return successful ? null : {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (successful) throw new ProviderRequestError(502, "OCI returned invalid JSON");
    return { message: text };
  }
}

function createApiError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const code = optionalString(record?.code);
  const message = optionalString(record?.message) ?? response.statusText ?? `HTTP ${response.status}`;
  const detail = code ? `${code}: ${message}` : message;
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, `OCI authorization failed: ${detail}`);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, `OCI authorization failed: ${detail}`);
  }
  if ([400, 404, 409, 412, 429].includes(response.status)) {
    return new ProviderRequestError(response.status, `OCI request failed: ${detail}`, payload);
  }
  return new ProviderRequestError(
    response.status >= 500 ? 502 : response.status || 500,
    `OCI request failed: ${detail}`,
  );
}

function requireArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw responseError("OCI list response must be an array");
  return value.map((item) => requiredRecord(item, "OCI list item", responseError));
}

function compartment(input: Record<string, unknown>, context: OracleCloudContext): string {
  return input.compartmentId == null || input.compartmentId === ""
    ? context.defaultCompartmentId
    : requireOcid(input.compartmentId, "compartmentId", ["compartment", "tenancy"]);
}

function requireOcid(
  value: unknown,
  fieldName: string,
  resourceTypes: readonly string[],
  errorFactory: (message: string) => ProviderRequestError = inputError,
): string {
  const resolved = requiredString(value, fieldName, errorFactory);
  if (!resourceTypes.some((type) => resolved.startsWith(`ocid1.${type}.`))) {
    throw errorFactory(`${fieldName} must be an OCI ${resourceTypes.join(" or ")} OCID`);
  }
  return resolved;
}

function optionalOcid(value: unknown, fieldName: string, resourceTypes: readonly string[]): string | undefined {
  const resolved = optionalString(value);
  return resolved === undefined ? undefined : requireOcid(resolved, fieldName, resourceTypes);
}

function readLimit(value: unknown): number | undefined {
  const resolved = optionalIntegerLike(value, "limit", inputError);
  if (resolved !== undefined && (resolved < 1 || resolved > 1_000))
    throw inputError("limit must be between 1 and 1000");
  return resolved;
}

function readCommandTimeout(value: unknown): number {
  const resolved = optionalIntegerLike(value, "executionTimeoutInSeconds", inputError) ?? 30;
  if (resolved < 1 || resolved > oracleInstanceAgentMaxWaitSeconds) {
    throw inputError(`executionTimeoutInSeconds must be between 1 and ${oracleInstanceAgentMaxWaitSeconds}`);
  }
  return resolved;
}

function requireFingerprint(value: unknown): string {
  const resolved = requiredString(value, "fingerprint", credentialError).toLowerCase();
  if (!/^(?:[0-9a-f]{2}:){15}[0-9a-f]{2}$/u.test(resolved)) {
    throw credentialError("fingerprint must be a colon-separated hexadecimal OCI API key fingerprint");
  }
  return resolved;
}

function requireRegion(value: unknown): string {
  const resolved = requiredString(value, "region", credentialError).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(resolved)) {
    throw credentialError("region must be a valid OCI region identifier such as us-ashburn-1");
  }
  return resolved;
}

function requireRealm(value: unknown): OracleRealm {
  const resolved = optionalString(value)?.toLowerCase() || defaultRealm;
  if (!Object.hasOwn(oracleRealmDomains, resolved)) {
    throw credentialError(`realm must be one of ${Object.keys(oracleRealmDomains).join(", ")}`);
  }
  return resolved as OracleRealm;
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
