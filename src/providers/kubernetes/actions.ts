import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kubernetes";

const namespaceSchema = s.string({
  description: "The namespace name.",
  minLength: 1,
  maxLength: 63,
  pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
});

function resourceNameSchema(description: string): JsonSchema {
  return s.string({ description, minLength: 1, maxLength: 253, pattern: "^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$" });
}

const conditionsSchema = s.array(
  "The resource's status conditions.",
  s.object({
    type: s.string("The condition type, such as Ready or Available."),
    status: s.string("Whether the condition holds: True, False, or Unknown."),
    reason: s.nullableString("A short machine-readable reason for the last transition."),
    message: s.nullableString("A readable explanation of the last transition."),
    lastTransitionTime: s.nullableString("When the condition last changed."),
  }),
);
const metadataFields = {
  name: s.string("The resource name."),
  uid: s.nullableString("The cluster-assigned unique identifier."),
  labels: s.record("Labels attached to the resource.", s.string()),
  creationTimestamp: s.nullableString("When the resource was created."),
};
const namespacedMetadataFields = {
  ...metadataFields,
  namespace: s.nullableString("The namespace holding the resource."),
};

const listFilterFields = {
  labelSelector: s.optional(s.nonEmptyString("Only include resources matching this label selector, such as app=web.")),
  fieldSelector: s.optional(
    s.nonEmptyString("Only include resources matching this field selector, such as status.phase=Running."),
  ),
  limit: s.optional(
    s.positiveInteger("The maximum number of resources to return in one page.", { maximum: 1000, default: 100 }),
  ),
  continue: s.optional(s.nonEmptyString("The cursor returned by the previous page.")),
};
const namespacedListInput = s.object({
  namespace: s.optional(s.describe(namespaceSchema, "Only list this namespace. Omit to list all namespaces.")),
  ...listFilterFields,
});
const clusterListInput = s.object({ ...listFilterFields });

function namespacedResourceInput(nameDescription: string): JsonSchema {
  return s.object({ namespace: namespaceSchema, name: resourceNameSchema(nameDescription) });
}

function listOutput(field: string, description: string, item: JsonSchema): JsonSchema {
  return s.object({
    [field]: s.array(description, item),
    continue: s.nullableString("The cursor for the next page, or null on the last page."),
  });
}

const namespaceOutput = s.object({
  ...metadataFields,
  phase: s.nullableString("The namespace lifecycle phase: Active or Terminating."),
});

const containerStatusOutput = s.object({
  name: s.string("The container name."),
  image: s.nullableString("The container image."),
  ready: s.boolean("Whether the container passes its readiness checks."),
  restartCount: s.integer("How many times the container has restarted."),
  state: s.stringEnum("The container's current state.", ["running", "waiting", "terminated", "unknown"]),
  reason: s.nullableString("Why the container is waiting or terminated, such as CrashLoopBackOff or OOMKilled."),
  message: s.nullableString("Further detail on the waiting or terminated state."),
  exitCode: s.nullableInteger("The exit code when the container terminated."),
});

const podOutput = s.object({
  ...namespacedMetadataFields,
  phase: s.nullableString("The pod phase: Pending, Running, Succeeded, Failed, or Unknown."),
  reason: s.nullableString("Why the pod is in this state, such as Evicted."),
  message: s.nullableString("A readable explanation of the pod's state."),
  nodeName: s.nullableString("The node running the pod, once scheduled."),
  podIP: s.nullableString("The pod's cluster IP address."),
  startTime: s.nullableString("When the kubelet acknowledged the pod."),
  deletionTimestamp: s.nullableString("When deletion was requested, if the pod is terminating."),
  readyContainers: s.integer("How many containers are ready."),
  totalContainers: s.integer("How many containers the pod defines."),
  restartCount: s.integer("Total restarts across the pod's containers."),
  containers: s.array("Status of each container, once the kubelet reports them.", containerStatusOutput),
  initContainers: s.array("Status of each init container; a failing one keeps the pod Pending.", containerStatusOutput),
  owners: s.array(
    "The controllers owning the pod.",
    s.object({ kind: s.string("The owner's kind."), name: s.string("The owner's name.") }),
  ),
  conditions: conditionsSchema,
});

const deploymentOutput = s.object({
  ...namespacedMetadataFields,
  replicas: s.nullableInteger("The desired replica count."),
  readyReplicas: s.integer("How many replicas are ready."),
  updatedReplicas: s.integer("How many replicas run the latest pod template."),
  availableReplicas: s.integer("How many replicas are available."),
  unavailableReplicas: s.integer("How many replicas are unavailable."),
  strategy: s.nullableString("The rollout strategy: RollingUpdate or Recreate."),
  paused: s.boolean("Whether the rollout is paused."),
  selector: s.record("The labels selecting this deployment's pods.", s.string()),
  containers: s.array(
    "The containers in the pod template.",
    s.object({ name: s.string("The container name."), image: s.nullableString("The container image.") }),
  ),
  restartedAt: s.nullableString("When a rollout restart was last requested, if any."),
  conditions: conditionsSchema,
});

const serviceOutput = s.object({
  ...namespacedMetadataFields,
  type: s.nullableString("The service type: ClusterIP, NodePort, LoadBalancer, or ExternalName."),
  clusterIP: s.nullableString("The virtual IP inside the cluster."),
  externalName: s.nullableString("The DNS name an ExternalName service points to."),
  externalIPs: s.array("External IP addresses routed to this service.", s.string()),
  loadBalancerIngress: s.array(
    "Addresses of the provisioned load balancer.",
    s.object({
      ip: s.nullableString("The load balancer IP address."),
      hostname: s.nullableString("The load balancer hostname."),
    }),
  ),
  selector: s.record("The labels selecting this service's pods.", s.string()),
  ports: s.array(
    "The ports the service exposes.",
    s.object({
      name: s.nullableString("The port name."),
      protocol: s.nullableString("The port protocol."),
      port: s.nullableInteger("The port the service listens on."),
      targetPort: s.nullableString("The pod port or named port receiving traffic."),
      nodePort: s.nullableInteger("The port opened on each node, if any."),
    }),
  ),
});

const eventOutput = s.object({
  name: s.string("The event name."),
  namespace: s.nullableString("The namespace holding the event."),
  uid: s.nullableString("The cluster-assigned unique identifier."),
  type: s.nullableString("The event type: Normal or Warning."),
  reason: s.nullableString("A short machine-readable reason, such as BackOff or FailedScheduling."),
  message: s.nullableString("A readable description of what happened."),
  count: s.nullableInteger("How many times the event repeated."),
  firstTimestamp: s.nullableString("When the event was first seen."),
  lastTimestamp: s.nullableString("When the event was last seen."),
  eventTime: s.nullableString("When the event was first observed, for events that report it instead of timestamps."),
  involvedObject: s.object({
    kind: s.nullableString("The kind of resource the event is about."),
    name: s.nullableString("The name of the resource the event is about."),
    namespace: s.nullableString("The namespace of the resource the event is about."),
  }),
  source: s.nullableString("The component that reported the event."),
});

const nodeOutput = s.object({
  ...metadataFields,
  ready: s.nullableBoolean("Whether the node is ready, or null when its Ready condition is unknown."),
  unschedulable: s.boolean("Whether new pods are prevented from scheduling on the node."),
  roles: s.array("The node's roles, read from its node-role labels.", s.string()),
  kubeletVersion: s.nullableString("The kubelet version."),
  osImage: s.nullableString("The operating system image."),
  containerRuntimeVersion: s.nullableString("The container runtime and version."),
  architecture: s.nullableString("The CPU architecture."),
  internalIP: s.nullableString("The node's internal IP address."),
  capacity: s.record("The node's total resources.", s.string()),
  allocatable: s.record("The resources available to pods.", s.string()),
  taints: s.array(
    "The taints repelling pods from the node.",
    s.object({
      key: s.string("The taint key."),
      value: s.nullableString("The taint value."),
      effect: s.nullableString("The taint effect."),
    }),
  ),
  conditions: conditionsSchema,
});

export const kubernetesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_namespaces",
    operationType: "read",
    description: "List the cluster's namespaces, usually the first step in finding a workload.",
    inputSchema: clusterListInput,
    outputSchema: listOutput("namespaces", "The matching namespaces.", namespaceOutput),
    providerPermissions: ["namespaces:list"],
  }),
  defineProviderAction(service, {
    name: "list_pods",
    operationType: "read",
    description:
      "List pods with their phase, container readiness, restart counts and node, to spot crashing or stuck workloads.",
    inputSchema: namespacedListInput,
    outputSchema: listOutput("pods", "The matching pods.", podOutput),
    providerPermissions: ["pods:list"],
    followUpActions: ["kubernetes.get_pod", "kubernetes.get_pod_logs", "kubernetes.list_events"],
  }),
  defineProviderAction(service, {
    name: "get_pod",
    operationType: "read",
    description: "Get one pod's phase, conditions and per-container state, including why a container is failing.",
    inputSchema: namespacedResourceInput("The pod name."),
    outputSchema: s.object({ pod: podOutput }),
    providerPermissions: ["pods:get"],
    followUpActions: ["kubernetes.get_pod_logs", "kubernetes.delete_pod"],
  }),
  defineProviderAction(service, {
    name: "get_pod_logs",
    operationType: "read",
    description:
      "Read a container's log output as text. Use previous to see why a crashed container died, and tailLines to focus on recent output.",
    inputSchema: s.object({
      namespace: namespaceSchema,
      name: resourceNameSchema("The pod name."),
      container: s.optional(
        s.nonEmptyString("The container to read. Required when the pod runs more than one container."),
      ),
      tailLines: s.optional(s.nonNegativeInteger("Only return this many lines from the end of the log.")),
      sinceSeconds: s.optional(s.positiveInteger("Only return lines written in the last this many seconds.")),
      previous: s.optional(s.boolean("Read the previous, terminated instance of the container.")),
      limitBytes: s.optional(
        s.positiveInteger("The maximum number of log bytes to return.", { maximum: 4194304, default: 262144 }),
      ),
    }),
    outputSchema: s.object({
      logs: s.string("The log text."),
      truncated: s.boolean("Whether the log continues past limitBytes and was cut off at its end."),
    }),
    providerPermissions: ["pods/log:get"],
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    operationType: "read",
    description: "List deployments with their desired and ready replica counts, to check rollout health.",
    inputSchema: namespacedListInput,
    outputSchema: listOutput("deployments", "The matching deployments.", deploymentOutput),
    providerPermissions: ["deployments:list"],
    followUpActions: ["kubernetes.get_deployment", "kubernetes.scale_deployment", "kubernetes.restart_deployment"],
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    operationType: "read",
    description: "Get one deployment's replica counts, images, rollout strategy and conditions.",
    inputSchema: namespacedResourceInput("The deployment name."),
    outputSchema: s.object({ deployment: deploymentOutput }),
    providerPermissions: ["deployments:get"],
    followUpActions: ["kubernetes.scale_deployment", "kubernetes.restart_deployment"],
  }),
  defineProviderAction(service, {
    name: "list_services",
    operationType: "read",
    description: "List services with their type, addresses and ports, to see how workloads are exposed.",
    inputSchema: namespacedListInput,
    outputSchema: listOutput("services", "The matching services.", serviceOutput),
    providerPermissions: ["services:list"],
  }),
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description:
      "List recent cluster events such as failed scheduling, image pull errors and back-offs. Filter with a field selector such as involvedObject.name=my-pod.",
    inputSchema: namespacedListInput,
    outputSchema: listOutput("events", "The matching events.", eventOutput),
    providerPermissions: ["events:list"],
  }),
  defineProviderAction(service, {
    name: "list_nodes",
    operationType: "read",
    description: "List cluster nodes with their readiness, roles, versions, capacity and taints.",
    inputSchema: clusterListInput,
    outputSchema: listOutput("nodes", "The matching nodes.", nodeOutput),
    providerPermissions: ["nodes:list"],
  }),
  defineProviderAction(service, {
    name: "scale_deployment",
    operationType: "write",
    description: "Set a deployment's desired replica count. Scaling to zero stops all of its pods.",
    inputSchema: s.object({
      namespace: namespaceSchema,
      name: resourceNameSchema("The deployment name."),
      replicas: s.nonNegativeInteger("The desired replica count."),
    }),
    outputSchema: s.object({
      name: s.string("The deployment name."),
      namespace: s.nullableString("The namespace holding the deployment."),
      replicas: s.nullableInteger("The desired replica count now in effect."),
      currentReplicas: s.nullableInteger("How many replicas existed when the change was accepted."),
    }),
    providerPermissions: ["deployments/scale:patch"],
    followUpActions: ["kubernetes.get_deployment"],
  }),
  defineProviderAction(service, {
    name: "restart_deployment",
    operationType: "write",
    description:
      "Trigger a rolling restart of a deployment's pods, the same way kubectl rollout restart does. Pods are replaced according to the rollout strategy.",
    inputSchema: namespacedResourceInput("The deployment name."),
    outputSchema: s.object({ deployment: deploymentOutput }),
    providerPermissions: ["deployments:patch"],
    followUpActions: ["kubernetes.get_deployment"],
  }),
  defineProviderAction(service, {
    name: "delete_pod",
    operationType: "destructive",
    description:
      "Delete a pod. A pod owned by a controller such as a deployment is recreated; a standalone pod is gone for good.",
    inputSchema: s.object({
      namespace: namespaceSchema,
      name: resourceNameSchema("The pod name."),
      gracePeriodSeconds: s.optional(
        s.nonNegativeInteger("Seconds the pod is given to shut down. Zero deletes it immediately."),
      ),
    }),
    outputSchema: s.object({
      name: s.string("The pod name."),
      namespace: s.nullableString("The namespace holding the pod."),
      uid: s.nullableString("The deleted pod's unique identifier, when the API server reports it."),
      deletionTimestamp: s.nullableString("When deletion took effect, while the pod terminates."),
    }),
    providerPermissions: ["pods:delete"],
    followUpActions: ["kubernetes.list_pods"],
  }),
];
