import type { JsonSchema, ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ngrok";

const limitField = s.integer({
  minimum: 1,
  maximum: 100,
  description: "Maximum number of results to return. ngrok accepts values from 1 to 100.",
});
const beforeIdField = s.nonEmptyString("Pagination cursor that requests results created before this resource ID.");
const filterField = s.nonEmptyString("CEL filter expression used by ngrok to filter the returned resources.");
const endpointIdField = s.nonEmptyString("Unique identifier of the ngrok endpoint.");
const reservedDomainIdField = s.nonEmptyString("Unique identifier of the ngrok reserved domain.");
const dateTimeField = s.string("Timestamp in RFC 3339 format.");

const refSchema = s.looseObject(
  {
    id: s.string("ngrok resource identifier."),
    uri: s.string("Canonical ngrok API URI for this resource."),
  },
  { description: "Reference to another ngrok API resource." },
);

const endpointSchema = s.looseObject(
  {
    id: s.string("Unique endpoint resource identifier."),
    created_at: dateTimeField,
    updated_at: dateTimeField,
    type: s.string("Endpoint type returned by ngrok, such as edge or cloud."),
    proto: s.string("Protocol served by this endpoint."),
    public_url: s.string("Public URL currently serving this endpoint."),
    url: s.string("API URL or frontend URL returned by ngrok for this endpoint."),
    description: s.string("Human-readable description configured on this endpoint."),
    metadata: s.string("User-defined metadata attached to this endpoint."),
    host: s.string("Host portion returned by ngrok for this endpoint."),
    name: s.string("User-defined endpoint name returned by ngrok."),
    port: s.integer("Port returned by ngrok for this endpoint."),
    region: s.string("Region identifier returned by ngrok for this endpoint."),
    scheme: s.string("Scheme returned by ngrok for this endpoint."),
    bindings: s.array("Bindings configured on this endpoint.", s.string("Binding value returned by ngrok.")),
    hostport: s.string("Hostport returned by ngrok for this endpoint."),
    tcp_addr: refSchema,
    principal: refSchema,
    edge: refSchema,
    domain: refSchema,
    tunnel: refSchema,
    tunnel_session: refSchema,
    upstream_url: s.string("Upstream URL forwarded to by this endpoint, when returned."),
    upstream_protocol: s.string("Upstream protocol used by the ngrok agent, when returned."),
    traffic_policy: s.string("Traffic policy attached to this endpoint, when returned."),
    pooling_enabled: s.boolean("Whether pooling is enabled for this endpoint."),
  },
  { description: "ngrok endpoint object." },
);

const tunnelSchema = s.looseObject(
  {
    id: s.string("Unique tunnel resource identifier."),
    started_at: dateTimeField,
    region: s.string("Region where this tunnel is running."),
    forwards_to: s.string("Upstream address that this tunnel forwards traffic to."),
    proto: s.string("Tunnel protocol returned by ngrok."),
    public_url: s.string("Public URL currently serving this tunnel."),
    metadata: s.string("User-defined metadata attached to this tunnel."),
    endpoint: refSchema,
    tunnel_session: refSchema,
    backends: s.array("Backends attached to this tunnel group, when returned.", refSchema),
    labels: s.record("Label map returned by ngrok for this tunnel.", s.string("Label value returned by ngrok.")),
  },
  { description: "ngrok tunnel object." },
);

const tunnelSessionSchema = s.looseObject(
  {
    id: s.string("Unique tunnel session resource identifier."),
    uri: s.string("Canonical ngrok API URI for this tunnel session."),
    agent_version: s.string("ngrok agent version serving this session."),
    credential: refSchema,
    ip: s.string("Source IP address of the tunnel session."),
    os: s.string("Operating system reported by the ngrok agent."),
    region: s.string("ngrok region where this session is connected."),
    started_at: dateTimeField,
    transport: s.string("Transport protocol used by this tunnel session."),
    metadata: s.string("User-defined metadata attached to this session."),
  },
  { description: "ngrok tunnel session object." },
);

const certificateJobSchema = s.looseObject(
  {
    msg: s.string("Status or error message returned for the certificate job."),
    error_code: s.string("Certificate job error code returned by ngrok, when present."),
    retries_at: s.string("Timestamp when ngrok will retry the certificate job, when present."),
    started_at: dateTimeField,
  },
  { description: "ngrok reserved domain certificate provisioning job." },
);
const certificatePolicySchema = s.looseObject(
  {
    authority: s.string("Certificate authority used by automatic management."),
    private_key_type: s.string("Private key type used by automatic management."),
  },
  { description: "ngrok reserved domain certificate management policy." },
);
const certificateStatusSchema = s.looseObject(
  {
    renews_at: s.string("Timestamp when the managed certificate renews, when returned."),
    provisioning_job: certificateJobSchema,
  },
  { description: "ngrok reserved domain certificate management status." },
);
const reservedDomainResolveSchema = s.looseObject(
  {
    value: s.string("Resolver target value returned by ngrok."),
  },
  { description: "ngrok reserved domain resolve target." },
);
const reservedDomainSchema = s.looseObject(
  {
    id: s.string("Unique reserved domain resource identifier."),
    uri: s.string("Canonical ngrok API URI for this reserved domain."),
    created_at: dateTimeField,
    domain: s.string("Hostname reserved on the ngrok account."),
    region: s.string("Deprecated region field returned by ngrok, when present."),
    metadata: s.string("User-defined metadata attached to this reserved domain."),
    description: s.string("Human-readable description configured on this reserved domain."),
    certificate: refSchema,
    cname_target: s.string("DNS CNAME target for this reserved domain."),
    acme_challenge_cname_target: s.string("DNS CNAME target used for ACME validation, when returned."),
    resolves_to: s.array(
      "Resolver targets configured on this reserved domain, when returned.",
      reservedDomainResolveSchema,
    ),
    certificate_management_policy: certificatePolicySchema,
    certificate_management_status: certificateStatusSchema,
  },
  { description: "ngrok reserved domain object." },
);

function paginatedOutput(description: string, collectionKey: string, itemSchema: JsonSchema): JsonSchema {
  return s.looseObject(
    {
      uri: s.string(`Canonical ngrok API URI for the ${collectionKey} collection.`),
      [collectionKey]: s.array(`Resources returned by ngrok for this page.`, itemSchema),
      next_page_uri: s.nullableString("URI of the next page, or null when there is no next page."),
    },
    { description },
  );
}

export const ngrokActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_endpoints",
    description: "List active ngrok endpoints for the current account, with optional pagination and CEL filtering.",
    inputSchema: s.object(
      {
        limit: limitField,
        before_id: beforeIdField,
        filter: filterField,
      },
      {
        optional: ["limit", "before_id", "filter"],
        description: "Input payload for listing ngrok endpoints.",
      },
    ),
    outputSchema: paginatedOutput("Paginated ngrok endpoints response.", "endpoints", endpointSchema),
  }),
  defineProviderAction(service, {
    name: "get_endpoint",
    description: "Fetch one ngrok endpoint by ID and return the upstream endpoint object.",
    inputSchema: s.object(
      {
        endpoint_id: endpointIdField,
      },
      {
        required: ["endpoint_id"],
        description: "Input payload for fetching one ngrok endpoint by ID.",
      },
    ),
    outputSchema: endpointSchema,
  }),
  defineProviderAction(service, {
    name: "list_tunnels",
    description: "List online ngrok tunnels for the current account with pagination support.",
    inputSchema: s.object(
      {
        limit: limitField,
        before_id: beforeIdField,
      },
      {
        optional: ["limit", "before_id"],
        description: "Input payload for listing ngrok tunnels.",
      },
    ),
    outputSchema: paginatedOutput("Paginated ngrok tunnels response.", "tunnels", tunnelSchema),
  }),
  defineProviderAction(service, {
    name: "list_tunnel_sessions",
    description: "List online ngrok tunnel sessions for the current account with pagination and CEL filtering.",
    inputSchema: s.object(
      {
        limit: limitField,
        before_id: beforeIdField,
        filter: filterField,
      },
      {
        optional: ["limit", "before_id", "filter"],
        description: "Input payload for listing ngrok tunnel sessions.",
      },
    ),
    outputSchema: paginatedOutput("Paginated ngrok tunnel sessions response.", "tunnel_sessions", tunnelSessionSchema),
  }),
  defineProviderAction(service, {
    name: "list_reserved_domains",
    description: "List reserved ngrok domains for the current account with pagination and CEL filtering.",
    inputSchema: s.object(
      {
        limit: limitField,
        before_id: beforeIdField,
        filter: filterField,
      },
      {
        optional: ["limit", "before_id", "filter"],
        description: "Input payload for listing ngrok reserved domains.",
      },
    ),
    outputSchema: paginatedOutput(
      "Paginated ngrok reserved domains response.",
      "reserved_domains",
      reservedDomainSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_reserved_domain",
    description: "Fetch one ngrok reserved domain by ID and return the upstream domain object.",
    inputSchema: s.object(
      {
        reserved_domain_id: reservedDomainIdField,
      },
      {
        required: ["reserved_domain_id"],
        description: "Input payload for fetching one ngrok reserved domain by ID.",
      },
    ),
    outputSchema: reservedDomainSchema,
  }),
];
