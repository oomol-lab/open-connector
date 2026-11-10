import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { Buffer } from "node:buffer";
import {
  base64Bytes,
  looseArray,
  optionalBoolean,
  optionalInteger,
  optionalIntegerOrNull,
  optionalRawString,
  optionalScalarString,
  optionalString,
  optionalStringOrNull,
  recordOrEmpty,
} from "../../core/cast.ts";
import { createCustomCaFetch } from "../../core/custom-ca-fetch.ts";
import { readGuardedFetchNetworkPolicy } from "../../core/guarded-fetch.ts";
import {
  assertPublicHttpUrl,
  encodePathSegment,
  isPrivateNetworkAccessAllowed,
  readBoundedResponseBytes,
} from "../../core/request.ts";
import {
  createProviderFetch,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

export interface KubernetesContext {
  token: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type KubernetesActionHandler = (input: Record<string, unknown>, context: KubernetesContext) => Promise<unknown>;

type KubernetesRequestPhase = "validate" | "execute";

interface KubernetesRequest {
  path: string;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  contentType?: string;
  phase?: KubernetesRequestPhase;
}

const defaultListLimit = 100;
const defaultLogBytes = 256 * 1024;
/** The API server treats limitBytes as approximate and may send slightly more, which is cut locally rather than failed. */
const logOverrunAllowanceBytes = 64 * 1024;
const containerStates = ["running", "waiting", "terminated"];
const restartedAtAnnotation = "kubectl.kubernetes.io/restartedAt";
const nodeRoleLabelPrefix = "node-role.kubernetes.io/";
const selfSubjectReviewPath = "/apis/authentication.k8s.io/v1/selfsubjectreviews";
const pemCertificatePattern = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu;

export const kubernetesActionHandlers: ProviderActionHandlers<"kubernetes", KubernetesActionHandler> = {
  async list_namespaces(input, context) {
    const page = await listResources("/api/v1/namespaces", input, context);
    return { namespaces: page.items.map(summarizeNamespace), continue: page.continue };
  },
  async list_pods(input, context) {
    const page = await listResources(namespacedCollectionPath("/api/v1", "pods", input), input, context);
    return { pods: page.items.map(summarizePod), continue: page.continue };
  },
  async get_pod(input, context) {
    return { pod: summarizePod(await requestKubernetesJson(context, { path: podPath(input) })) };
  },
  get_pod_logs: readPodLogs,
  async list_deployments(input, context) {
    const page = await listResources(namespacedCollectionPath("/apis/apps/v1", "deployments", input), input, context);
    return { deployments: page.items.map(summarizeDeployment), continue: page.continue };
  },
  async get_deployment(input, context) {
    return { deployment: summarizeDeployment(await requestKubernetesJson(context, { path: deploymentPath(input) })) };
  },
  async list_services(input, context) {
    const page = await listResources(namespacedCollectionPath("/api/v1", "services", input), input, context);
    return { services: page.items.map(summarizeService), continue: page.continue };
  },
  async list_events(input, context) {
    const page = await listResources(namespacedCollectionPath("/api/v1", "events", input), input, context);
    return { events: page.items.map(summarizeEvent), continue: page.continue };
  },
  async list_nodes(input, context) {
    const page = await listResources("/api/v1/nodes", input, context);
    return { nodes: page.items.map(summarizeNode), continue: page.continue };
  },
  async scale_deployment(input, context) {
    const scale = await requestKubernetesJson(context, {
      path: `${deploymentPath(input)}/scale`,
      method: "PATCH",
      contentType: "application/merge-patch+json",
      body: { spec: { replicas: input.replicas } },
    });
    const metadata = recordOrEmpty(scale.metadata);
    return {
      name: optionalString(metadata.name) ?? requiredInputString(input.name, "name"),
      namespace: optionalString(metadata.namespace) ?? requiredInputString(input.namespace, "namespace"),
      replicas: optionalIntegerOrNull(recordOrEmpty(scale.spec).replicas),
      currentReplicas: optionalIntegerOrNull(recordOrEmpty(scale.status).replicas),
    };
  },
  async restart_deployment(input, context) {
    // kubectl records the restart as an RFC 3339 timestamp without fractional seconds.
    const restartedAt = new Date().toISOString().replace(/\.\d+Z$/u, "Z");
    const deployment = await requestKubernetesJson(context, {
      path: deploymentPath(input),
      method: "PATCH",
      contentType: "application/strategic-merge-patch+json",
      body: { spec: { template: { metadata: { annotations: { [restartedAtAnnotation]: restartedAt } } } } },
    });
    return { deployment: summarizeDeployment(deployment) };
  },
  async delete_pod(input, context) {
    const deleted = await requestKubernetesJson(context, {
      path: podPath(input),
      method: "DELETE",
      query: { gracePeriodSeconds: optionalInteger(input.gracePeriodSeconds)?.toString() },
    });
    // The API server answers with the terminating Pod, or with a Status once the pod is already gone.
    const metadata = recordOrEmpty(deleted.metadata);
    return {
      name: requiredInputString(input.name, "name"),
      namespace: requiredInputString(input.namespace, "namespace"),
      uid: optionalStringOrNull(metadata.uid ?? recordOrEmpty(deleted.details).uid),
      deletionTimestamp: optionalStringOrNull(metadata.deletionTimestamp),
    };
  },
};

export function createKubernetesContext(
  values: Record<string, string>,
  token: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): KubernetesContext {
  const certificateAuthority = normalizeKubernetesCertificateAuthority(values.certificateAuthorityData);
  return {
    token,
    apiBaseUrl: normalizeKubernetesBaseUrl(values.baseUrl),
    // A CA-trusting transport is a fresh base fetch, so the injected fetcher's bound policy is passed on explicitly.
    fetcher: createProviderFetch({
      fetch: certificateAuthority ? createCustomCaFetch(certificateAuthority) : fetcher,
      network: readGuardedFetchNetworkPolicy(fetcher),
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    }),
    signal,
  };
}

/**
 * Prove the token works and identify it with a SelfSubjectReview, which every
 * authenticated subject may create. `/version` cannot do this: it answers
 * anonymous requests, so it would accept any token.
 */
export async function validateKubernetesCredential(
  values: Record<string, string>,
  token: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createKubernetesContext(values, token, fetcher, signal);
  const review = await requestSelfSubjectReview(context);
  const username = optionalString(recordOrEmpty(recordOrEmpty(review.status).userInfo).username);
  if (!username) {
    throw providerInputError("The Kubernetes API server did not report a username for this token.");
  }
  const host = new URL(context.apiBaseUrl).host;
  return {
    profile: { accountId: `kubernetes:${host}:${username}`, displayName: `${username} on ${host}` },
    metadata: { apiBaseUrl: context.apiBaseUrl },
  };
}

async function requestSelfSubjectReview(context: KubernetesContext): Promise<Record<string, unknown>> {
  try {
    return await requestKubernetesJson(context, {
      path: selfSubjectReviewPath,
      method: "POST",
      body: { apiVersion: "authentication.k8s.io/v1", kind: "SelfSubjectReview" },
      phase: "validate",
    });
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) {
      throw providerInputError(
        "This server does not offer SelfSubjectReview. Check that baseUrl points at the API server and that the cluster runs Kubernetes 1.28 or newer.",
      );
    }
    throw error;
  }
}

/**
 * Validate an API server URL, rejecting embedded credentials and unsafe targets
 * and removing query and hash components. A path is kept because API servers
 * behind a management proxy live under one.
 *
 * API servers serve only HTTPS, and a token must not cross the network in
 * clear text, so unlike other self-hosted providers plain HTTP is refused even
 * when the deployment allows private-network targets.
 */
export function normalizeKubernetesBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const url = assertPublicHttpUrl(requiredInputString(value, "baseUrl"), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.protocol !== "https:") throw providerInputError("baseUrl must use https");
  if (url.username || url.password) throw providerInputError("baseUrl must not include credentials");
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/u, "");
}

/**
 * Normalize a cluster CA to PEM. Accepts PEM, or the base64 encoding of it that
 * kubeconfig stores in `certificate-authority-data`, wrapped lines included.
 * Returns undefined when no CA is configured.
 */
export function normalizeKubernetesCertificateAuthority(value: unknown): string | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  const pem = text.includes("-----BEGIN")
    ? text
    : Buffer.from(base64Bytes(text.replace(/\s+/gu, ""), "certificateAuthorityData", providerInputError)).toString(
        "utf8",
      );
  const certificates = pem.match(pemCertificatePattern);
  if (!certificates) {
    throw providerInputError(
      "certificateAuthorityData must be a PEM certificate or the base64 certificate-authority-data value from kubeconfig",
    );
  }
  return `${certificates.join("\n")}\n`;
}

/** Parse a failed response's Kubernetes `Status` object into the error actions and the proxy report. */
export async function readKubernetesError(
  response: Response,
  phase: KubernetesRequestPhase = "execute",
  signal?: AbortSignal,
): Promise<ProviderRequestError> {
  const status = parseStatus(await readProviderErrorTextBody(response, "Kubernetes error response", signal));
  const message =
    optionalString(status.message) ??
    optionalString(response.statusText) ??
    `Kubernetes request failed with HTTP ${response.status}`;
  return new ProviderRequestError(mapKubernetesErrorStatus(response.status, phase), message, {
    reason: optionalStringOrNull(status.reason),
  });
}

function parseStatus(text: string): Record<string, unknown> {
  try {
    return recordOrEmpty(JSON.parse(text));
  } catch {
    return {};
  }
}

function mapKubernetesErrorStatus(status: number, phase: KubernetesRequestPhase): number {
  if (status >= 500) return 502;
  if (phase === "validate" && (status === 401 || status === 403)) return 400;
  // 410 means an expired `continue` cursor, a bad input the runtime has no separate status for.
  return status === 410 ? 400 : status;
}

function sendKubernetesRequest<T>(
  context: KubernetesContext,
  request: KubernetesRequest,
  read: (response: Response, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const url = new URL(`${context.apiBaseUrl}${request.path}`);
  setSearchParams(url, request.query ?? {});
  return runProviderRequest({ signal: context.signal, label: "Kubernetes" }, async (signal) => {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${context.token}`,
      "user-agent": providerUserAgent,
    };
    if (request.body !== undefined) headers["content-type"] = request.contentType ?? "application/json";
    const response = await context.fetcher(url, {
      method: request.method ?? "GET",
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal,
    });
    if (!response.ok) throw await readKubernetesError(response, request.phase, signal);
    return read(response, signal);
  });
}

function requestKubernetesJson(
  context: KubernetesContext,
  request: KubernetesRequest,
): Promise<Record<string, unknown>> {
  return sendKubernetesRequest(context, request, async (response) =>
    requiredResponseRecord(
      await readProviderJsonBody(response, { emptyBody: {}, invalidJsonMessage: "Kubernetes returned invalid JSON" }),
      "Kubernetes response",
    ),
  );
}

interface KubernetesListPage {
  items: Record<string, unknown>[];
  continue: string | null;
}

async function listResources(
  path: string,
  input: Record<string, unknown>,
  context: KubernetesContext,
): Promise<KubernetesListPage> {
  const list = await requestKubernetesJson(context, {
    path,
    query: {
      labelSelector: optionalString(input.labelSelector),
      fieldSelector: optionalString(input.fieldSelector),
      limit: String(optionalInteger(input.limit) ?? defaultListLimit),
      continue: optionalString(input.continue),
    },
  });
  return {
    items: looseArray(list.items).map(recordOrEmpty),
    continue: optionalStringOrNull(recordOrEmpty(list.metadata).continue),
  };
}

async function readPodLogs(input: Record<string, unknown>, context: KubernetesContext): Promise<unknown> {
  const limitBytes = optionalInteger(input.limitBytes) ?? defaultLogBytes;
  const bytes = await sendKubernetesRequest(
    context,
    {
      path: `${podPath(input)}/log`,
      query: {
        container: optionalString(input.container),
        tailLines: optionalInteger(input.tailLines)?.toString(),
        sinceSeconds: optionalInteger(input.sinceSeconds)?.toString(),
        previous: optionalBoolean(input.previous)?.toString(),
        // One byte past the limit tells a log that fits exactly from one that continues.
        limitBytes: String(limitBytes + 1),
      },
    },
    (response, signal) =>
      readBoundedResponseBytes(response, {
        maxBytes: limitBytes + logOverrunAllowanceBytes,
        fieldName: "Kubernetes pod log",
        createError: (message) => new ProviderRequestError(413, message),
        signal,
      }),
  );
  return {
    // Streaming mode holds back a multi-byte character the cut split instead of emitting a replacement character.
    logs: new TextDecoder().decode(bytes.subarray(0, limitBytes), { stream: true }),
    truncated: bytes.byteLength > limitBytes,
  };
}

function namespacedCollectionPath(apiPrefix: string, resource: string, input: Record<string, unknown>): string {
  const namespace = optionalString(input.namespace);
  return namespace
    ? `${apiPrefix}/namespaces/${resourcePathSegment(namespace, "namespace")}/${resource}`
    : `${apiPrefix}/${resource}`;
}

function podPath(input: Record<string, unknown>): string {
  return `/api/v1/namespaces/${resourcePathSegment(input.namespace, "namespace")}/pods/${resourcePathSegment(input.name, "name")}`;
}

function deploymentPath(input: Record<string, unknown>): string {
  return `/apis/apps/v1/namespaces/${resourcePathSegment(input.namespace, "namespace")}/deployments/${resourcePathSegment(input.name, "name")}`;
}

/** Encoding leaves `.` and `..` intact and URL parsing would then walk out of the resource path, so refuse them. */
function resourcePathSegment(value: unknown, fieldName: string): string {
  const segment = requiredInputString(value, fieldName);
  if (segment === "." || segment === "..") throw providerInputError(`${fieldName} is not a valid resource name`);
  return encodePathSegment(segment);
}

function summarizeMetadata(resource: Record<string, unknown>): Record<string, unknown> {
  const metadata = recordOrEmpty(resource.metadata);
  return {
    name: optionalRawString(metadata.name) ?? "",
    uid: optionalStringOrNull(metadata.uid),
    labels: readStringMap(metadata.labels),
    creationTimestamp: optionalStringOrNull(metadata.creationTimestamp),
  };
}

function summarizeNamespacedMetadata(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...summarizeMetadata(resource),
    namespace: optionalStringOrNull(recordOrEmpty(resource.metadata).namespace),
  };
}

function summarizeNamespace(resource: Record<string, unknown>): Record<string, unknown> {
  return { ...summarizeMetadata(resource), phase: optionalStringOrNull(recordOrEmpty(resource.status).phase) };
}

function summarizePod(resource: Record<string, unknown>): Record<string, unknown> {
  const metadata = recordOrEmpty(resource.metadata);
  const spec = recordOrEmpty(resource.spec);
  const status = recordOrEmpty(resource.status);
  const containerStatuses = looseArray(status.containerStatuses).map(recordOrEmpty);
  return {
    ...summarizeNamespacedMetadata(resource),
    phase: optionalStringOrNull(status.phase),
    reason: optionalStringOrNull(status.reason),
    message: optionalStringOrNull(status.message),
    nodeName: optionalStringOrNull(spec.nodeName),
    podIP: optionalStringOrNull(status.podIP),
    startTime: optionalStringOrNull(status.startTime),
    deletionTimestamp: optionalStringOrNull(metadata.deletionTimestamp),
    readyContainers: containerStatuses.filter((container) => container.ready === true).length,
    totalContainers: looseArray(spec.containers).length,
    restartCount: containerStatuses.reduce(
      (total, container) => total + (optionalInteger(container.restartCount) ?? 0),
      0,
    ),
    containers: containerStatuses.map(summarizeContainerStatus),
    initContainers: looseArray(status.initContainerStatuses).map(recordOrEmpty).map(summarizeContainerStatus),
    owners: looseArray(metadata.ownerReferences)
      .map(recordOrEmpty)
      .map((owner) => ({ kind: optionalRawString(owner.kind) ?? "", name: optionalRawString(owner.name) ?? "" })),
    conditions: summarizeConditions(status.conditions),
  };
}

function summarizeContainerStatus(container: Record<string, unknown>): Record<string, unknown> {
  const state = recordOrEmpty(container.state);
  const activeState = containerStates.find((name) => state[name] !== undefined);
  const detail = recordOrEmpty(activeState ? state[activeState] : undefined);
  return {
    name: optionalRawString(container.name) ?? "",
    image: optionalStringOrNull(container.image),
    ready: container.ready === true,
    restartCount: optionalInteger(container.restartCount) ?? 0,
    state: activeState ?? "unknown",
    reason: optionalStringOrNull(detail.reason),
    message: optionalStringOrNull(detail.message),
    exitCode: optionalIntegerOrNull(detail.exitCode),
  };
}

function summarizeDeployment(resource: Record<string, unknown>): Record<string, unknown> {
  const spec = recordOrEmpty(resource.spec);
  const status = recordOrEmpty(resource.status);
  const template = recordOrEmpty(spec.template);
  return {
    ...summarizeNamespacedMetadata(resource),
    replicas: optionalIntegerOrNull(spec.replicas),
    readyReplicas: optionalInteger(status.readyReplicas) ?? 0,
    updatedReplicas: optionalInteger(status.updatedReplicas) ?? 0,
    availableReplicas: optionalInteger(status.availableReplicas) ?? 0,
    unavailableReplicas: optionalInteger(status.unavailableReplicas) ?? 0,
    strategy: optionalStringOrNull(recordOrEmpty(spec.strategy).type),
    paused: spec.paused === true,
    selector: readStringMap(recordOrEmpty(spec.selector).matchLabels),
    containers: looseArray(recordOrEmpty(template.spec).containers)
      .map(recordOrEmpty)
      .map((container) => ({
        name: optionalRawString(container.name) ?? "",
        image: optionalStringOrNull(container.image),
      })),
    restartedAt: optionalStringOrNull(
      recordOrEmpty(recordOrEmpty(template.metadata).annotations)[restartedAtAnnotation],
    ),
    conditions: summarizeConditions(status.conditions),
  };
}

function summarizeService(resource: Record<string, unknown>): Record<string, unknown> {
  const spec = recordOrEmpty(resource.spec);
  return {
    ...summarizeNamespacedMetadata(resource),
    type: optionalStringOrNull(spec.type),
    clusterIP: optionalStringOrNull(spec.clusterIP),
    externalName: optionalStringOrNull(spec.externalName),
    externalIPs: readStrings(spec.externalIPs),
    loadBalancerIngress: looseArray(recordOrEmpty(recordOrEmpty(resource.status).loadBalancer).ingress)
      .map(recordOrEmpty)
      .map((ingress) => ({ ip: optionalStringOrNull(ingress.ip), hostname: optionalStringOrNull(ingress.hostname) })),
    selector: readStringMap(spec.selector),
    ports: looseArray(spec.ports)
      .map(recordOrEmpty)
      .map((port) => ({
        name: optionalStringOrNull(port.name),
        protocol: optionalStringOrNull(port.protocol),
        port: optionalIntegerOrNull(port.port),
        // targetPort is a number or a named container port; one string shape serves both.
        targetPort: optionalScalarString(port.targetPort) ?? null,
        nodePort: optionalIntegerOrNull(port.nodePort),
      })),
  };
}

function summarizeEvent(resource: Record<string, unknown>): Record<string, unknown> {
  const metadata = recordOrEmpty(resource.metadata);
  const involvedObject = recordOrEmpty(resource.involvedObject);
  return {
    name: optionalRawString(metadata.name) ?? "",
    namespace: optionalStringOrNull(metadata.namespace),
    uid: optionalStringOrNull(metadata.uid),
    type: optionalStringOrNull(resource.type),
    reason: optionalStringOrNull(resource.reason),
    message: optionalStringOrNull(resource.message),
    count: optionalIntegerOrNull(resource.count),
    firstTimestamp: optionalStringOrNull(resource.firstTimestamp),
    lastTimestamp: optionalStringOrNull(resource.lastTimestamp),
    eventTime: optionalStringOrNull(resource.eventTime),
    involvedObject: {
      kind: optionalStringOrNull(involvedObject.kind),
      name: optionalStringOrNull(involvedObject.name),
      namespace: optionalStringOrNull(involvedObject.namespace),
    },
    source:
      optionalString(recordOrEmpty(resource.source).component) ?? optionalStringOrNull(resource.reportingComponent),
  };
}

function summarizeNode(resource: Record<string, unknown>): Record<string, unknown> {
  const metadata = recordOrEmpty(resource.metadata);
  const spec = recordOrEmpty(resource.spec);
  const status = recordOrEmpty(resource.status);
  const nodeInfo = recordOrEmpty(status.nodeInfo);
  const readyStatus = looseArray(status.conditions)
    .map(recordOrEmpty)
    .find((condition) => condition.type === "Ready")?.status;
  const internalAddress = looseArray(status.addresses)
    .map(recordOrEmpty)
    .find((address) => address.type === "InternalIP");
  return {
    ...summarizeMetadata(resource),
    ready: readyStatus === "True" ? true : readyStatus === "False" ? false : null,
    unschedulable: spec.unschedulable === true,
    roles: Object.keys(recordOrEmpty(metadata.labels))
      .filter((label) => label.startsWith(nodeRoleLabelPrefix))
      .map((label) => label.slice(nodeRoleLabelPrefix.length)),
    kubeletVersion: optionalStringOrNull(nodeInfo.kubeletVersion),
    osImage: optionalStringOrNull(nodeInfo.osImage),
    containerRuntimeVersion: optionalStringOrNull(nodeInfo.containerRuntimeVersion),
    architecture: optionalStringOrNull(nodeInfo.architecture),
    internalIP: optionalStringOrNull(internalAddress?.address),
    capacity: readStringMap(status.capacity),
    allocatable: readStringMap(status.allocatable),
    taints: looseArray(spec.taints)
      .map(recordOrEmpty)
      .map((taint) => ({
        key: optionalRawString(taint.key) ?? "",
        value: optionalStringOrNull(taint.value),
        effect: optionalStringOrNull(taint.effect),
      })),
    conditions: summarizeConditions(status.conditions),
  };
}

function summarizeConditions(value: unknown): Record<string, unknown>[] {
  return looseArray(value)
    .map(recordOrEmpty)
    .map((condition) => ({
      type: optionalRawString(condition.type) ?? "",
      status: optionalRawString(condition.status) ?? "",
      reason: optionalStringOrNull(condition.reason),
      message: optionalStringOrNull(condition.message),
      lastTransitionTime: optionalStringOrNull(condition.lastTransitionTime),
    }));
}

/** Read a Kubernetes string map, keeping empty values because an empty label value is meaningful. */
function readStringMap(value: unknown): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(recordOrEmpty(value))) {
    const text = optionalRawString(entry);
    if (text !== undefined) output[key] = text;
  }
  return output;
}

function readStrings(value: unknown): string[] {
  return looseArray(value).flatMap((entry) => optionalRawString(entry) ?? []);
}
