import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "truvera";

const didTypeSchema = s.stringEnum("The DID method to create or filter, as documented by Truvera.", [
  "cheqd",
  "dock",
  "key",
]);

const keyTypeSchema = s.stringEnum("The public key type used for the DID.", ["ed25519", "bjj", "secp256k1", "sr25519"]);

const didStringSchema = s.string("A fully qualified decentralized identifier.", {
  minLength: 1,
});

const jobStatusSchema = s.stringEnum("The Truvera job status.", ["todo", "finalized", "in_progress", "error"]);

const profileSchema = s.object("The authenticated Truvera account profile returned by the profile endpoint.", {
  name: s.string("The Truvera profile display name.", { minLength: 1 }),
  image: s.string("The Truvera profile image URL or asset path.", { minLength: 1 }),
});

const verificationMethodReferenceSchema = s.oneOf(
  [
    s.string("A DID URL reference to a verification method.", { minLength: 1 }),
    s.looseObject("An inline verification method object returned by Truvera."),
  ],
  { description: "A DID verification method expressed either as an inline object or a DID URL string." },
);

const didPublicKeySchema = s.object("One public key entry from a Truvera DID document.", {
  id: s.string("The DID URL identifier for the public key.", { minLength: 1 }),
  type: s.string("The verification key type returned by Truvera.", { minLength: 1 }),
  controller: s.string("The DID that controls the key.", { minLength: 1 }),
  publicKeyBase58: s.string("The Base58-encoded public key material.", { minLength: 1 }),
});

const didDocumentSchema = s.object(
  "A DID document returned by Truvera.",
  {
    "@context": s.anyOf("The JSON-LD context for the DID document.", [
      s.string("A single JSON-LD context URI.", { minLength: 1 }),
      s.array("An array of JSON-LD context values.", s.unknown("One JSON-LD context value.")),
    ]),
    id: didStringSchema,
    authentication: s.array("The DID authentication verification methods.", verificationMethodReferenceSchema),
    assertionMethod: s.array("The DID assertion verification methods.", verificationMethodReferenceSchema),
    capabilityInvocation: s.array(
      "The DID capability invocation verification methods.",
      verificationMethodReferenceSchema,
    ),
    publicKey: s.array("The public keys published in the DID document.", didPublicKeySchema),
  },
  {
    optional: ["@context", "id", "authentication", "assertionMethod", "capabilityInvocation", "publicKey"],
  },
);

const didSummarySchema = s.object(
  "One DID summary entry returned by Truvera.",
  {
    id: s.nullable(s.string("The DID identifier.", { minLength: 1 })),
    did: s.nullable(s.string("The DID value.", { minLength: 1 })),
    type: s.nullable(didTypeSchema),
    controller: s.nullable(s.string("The DID controller.", { minLength: 1 })),
    credentialCount: s.nullable(
      s.string("The number of credentials issued by the DID as returned by Truvera.", {
        minLength: 1,
      }),
    ),
    updatedLast: s.nullable(s.dateTime("The ISO timestamp of the DID metadata update time.")),
    profile: s.nullable(
      s.object(
        "The optional public profile metadata associated with the DID.",
        {
          name: s.string("The DID profile display name.", { minLength: 1 }),
          logo: s.string("The DID profile logo URL or empty string.", { minLength: 0 }),
          description: s.string("The DID profile description.", { minLength: 1 }),
        },
        { optional: ["name", "logo", "description"] },
      ),
    ),
    keyId: s.nullable(s.string("The DID key identifier.", { minLength: 1 })),
    jobId: s.nullable(s.string("The Truvera background job identifier for this DID.", { minLength: 1 })),
    trustRegistries: s.array(
      "The trust registries associated with the DID.",
      s.object(
        "One trust registry summary associated with the DID.",
        {
          id: s.string("The trust registry identifier.", { minLength: 1 }),
          name: s.string("The trust registry display name.", { minLength: 1 }),
          logoUrl: s.url("The trust registry logo URL."),
        },
        { optional: ["id", "name", "logoUrl"] },
      ),
    ),
  },
  {
    optional: [
      "id",
      "did",
      "type",
      "controller",
      "credentialCount",
      "updatedLast",
      "profile",
      "keyId",
      "jobId",
      "trustRegistries",
    ],
  },
);

const schemaDefinitionSchema = s.object(
  "The JSON Schema body Truvera stores for a credential schema.",
  {
    $schema: s.string("The JSON Schema dialect URI.", { minLength: 1 }),
    name: s.string("The schema name.", { minLength: 1 }),
    description: s.string("The schema description.", { minLength: 1 }),
    type: s.string("The JSON Schema type, typically `object`.", { minLength: 1 }),
    properties: s.record(
      "The credential subject properties defined by the schema.",
      s.looseObject("One JSON Schema property definition."),
    ),
    required: s.array(
      "The required credential subject property names.",
      s.string("One required property name.", { minLength: 1 }),
    ),
    additionalProperties: s.boolean("Whether additional properties are allowed by the schema."),
  },
  {
    optional: ["$schema", "name", "description", "type", "properties", "required", "additionalProperties"],
  },
);

const schemaSummarySchema = s.object(
  "One credential schema summary returned by Truvera.",
  {
    id: s.string("The schema identifier.", { minLength: 1 }),
    schema: s.nullable(schemaDefinitionSchema),
    uri: s.nullable(s.string("The schema URI.", { minLength: 1 })),
    created: s.nullable(s.dateTime("The ISO timestamp when the schema was created.")),
    isOwner: s.nullable(s.boolean("Whether the authenticated user owns the schema.")),
    ownerName: s.nullable(s.string("The schema owner display name.", { minLength: 1 })),
    ownerLogo: s.nullable(s.string("The schema owner logo URL.", { minLength: 1 })),
  },
  {
    optional: ["id", "schema", "uri", "created", "isOwner", "ownerName", "ownerLogo"],
  },
);

const jobResultSchema = s.object("The background job handle returned by Truvera submit endpoints.", {
  jobId: s.string("The Truvera background job identifier.", { minLength: 1 }),
  data: s.looseObject("The immediate submit payload returned with the background job handle."),
});

const jobSchema = s.object(
  "The Truvera job status payload.",
  {
    jobId: s.string("The Truvera background job identifier.", { minLength: 1 }),
    status: jobStatusSchema,
    result: s.looseObject("The blockchain or API result associated with the job."),
  },
  { optional: ["result"] },
);

export const truveraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description: "Get the authenticated Truvera account profile for the configured API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the authenticated Truvera profile.", {}),
    outputSchema: s.object("The authenticated Truvera profile response.", {
      profile: profileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_dids",
    operationType: "read",
    description: "List the DIDs controlled by the authenticated Truvera account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Truvera DIDs.",
      {
        offset: s.nonNegativeInteger("How many DID results to skip before listing."),
        limit: s.integer("How many DID results to return, up to the Truvera maximum of 64.", {
          minimum: 1,
          maximum: 64,
        }),
        type: didTypeSchema,
      },
      { optional: ["offset", "limit", "type"] },
    ),
    outputSchema: s.object("The list of DIDs returned by Truvera.", {
      dids: s.array("The DID summaries returned by Truvera.", didSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_did",
    operationType: "read",
    description: "Get one DID document from Truvera by DID value.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving one DID document.", {
      did: didStringSchema,
    }),
    outputSchema: s.object("The DID document returned by Truvera.", {
      didDocument: didDocumentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_did",
    operationType: "write",
    description: "Create a new Truvera DID and return the background job handle for polling blockchain completion.",
    requiredScopes: [],
    asyncLifecycle: { startActionId: "truvera.create_did", statusActionId: "truvera.get_job" },
    inputSchema: s.object(
      "Input parameters for creating a DID in Truvera.",
      {
        type: didTypeSchema,
        did: didStringSchema,
        controller: didStringSchema,
        keyType: keyTypeSchema,
        didcommServiceUrl: s.url("An optional DIDComm service URL to publish in the DID document."),
        includeDidcommService: s.boolean(
          "Whether Truvera should include a DIDComm service endpoint in the DID document.",
        ),
      },
      {
        optional: ["type", "did", "controller", "keyType", "didcommServiceUrl", "includeDidcommService"],
      },
    ),
    outputSchema: jobResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_did",
    operationType: "destructive",
    description: "Delete a Truvera DID and return the background job handle for polling blockchain completion.",
    requiredScopes: [],
    asyncLifecycle: { startActionId: "truvera.delete_did", statusActionId: "truvera.get_job" },
    inputSchema: s.object(
      "Input parameters for deleting a DID from Truvera.",
      {
        did: didStringSchema,
        fromBlockchain: s.boolean(
          "Whether to delete the DID from the blockchain instead of only from the Truvera account.",
        ),
      },
      { optional: ["fromBlockchain"] },
    ),
    outputSchema: jobResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_credential_schemas",
    operationType: "read",
    description: "List credential schemas created by the authenticated Truvera account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Truvera credential schemas.",
      {
        offset: s.nonNegativeInteger("How many schema results to skip before listing."),
        limit: s.integer("How many schema results to return, up to the Truvera maximum of 64.", {
          minimum: 1,
          maximum: 64,
        }),
        includeEcosystems: s.boolean("Whether Truvera should include ecosystem metadata in schema results."),
      },
      { optional: ["offset", "limit", "includeEcosystems"] },
    ),
    outputSchema: s.object("The list of credential schemas returned by Truvera.", {
      schemas: s.array("The credential schema summaries returned by Truvera.", schemaSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_credential_schema",
    operationType: "read",
    description: "Get one Truvera credential schema by schema identifier.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving one Truvera credential schema.", {
      schemaId: s.string("The credential schema identifier.", { minLength: 1 }),
    }),
    outputSchema: s.object("The Truvera credential schema response.", {
      schema: schemaSummarySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_credential_schema",
    operationType: "write",
    description:
      "Create a credential schema in Truvera and return the background job handle for polling blockchain completion.",
    requiredScopes: [],
    asyncLifecycle: { startActionId: "truvera.create_credential_schema", statusActionId: "truvera.get_job" },
    inputSchema: s.object("Input parameters for creating a Truvera credential schema.", {
      schema: schemaDefinitionSchema,
    }),
    outputSchema: jobResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_credential_schema",
    operationType: "destructive",
    description: "Delete a Truvera credential schema and return the background job handle for polling completion.",
    requiredScopes: [],
    asyncLifecycle: { startActionId: "truvera.delete_credential_schema", statusActionId: "truvera.get_job" },
    inputSchema: s.object("Input parameters for deleting a Truvera credential schema.", {
      schemaId: s.string("The credential schema identifier.", { minLength: 1 }),
    }),
    outputSchema: jobResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Get the latest status and result payload for a Truvera background job.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving one Truvera background job.", {
      jobId: s.string("The Truvera background job identifier.", { minLength: 1 }),
    }),
    outputSchema: jobSchema,
  }),
];
