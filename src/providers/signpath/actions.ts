import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "signpath";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const optionalNonEmptyString = (description: string) => nonEmptyString(description);
const signpathUuid = (description: string) => s.uuid(description);
const rawObjectSchema = s.looseObject("Raw JSON object returned by the SignPath API.");

const signatureAlgorithmSchema = s.stringEnum("The signature algorithm used by the SignPath signing policy.", [
  "RsaPkcs1",
  "RsaPss",
  "Ecdsa",
]);
const rsaHashAlgorithmOidSchema = s.string("The RSA hash algorithm OID used when the signing policy uses an RSA key.", {
  minLength: 1,
});
const ecdsaSignatureFormatSchema = s.stringEnum(
  "The ECDSA signature format used when the signing policy uses an ECDSA key.",
  ["Ieee", "Asn1"],
);
const signingRequestStatusSchema = s.stringEnum("The high-level SignPath request status.", [
  "InProgress",
  "WaitingForApproval",
  "Completed",
  "Failed",
  "Denied",
  "Canceled",
]);

const signingPolicySchema = s.object(
  "A SignPath signing policy visible to the API token.",
  {
    signingPolicyId: signpathUuid("The unique identifier of the signing policy."),
    signingPolicySlug: nonEmptyString("The slug of the signing policy."),
    projectSlug: nonEmptyString("The slug of the project that owns the signing policy."),
    keyType: nonEmptyString("The key type returned by SignPath, such as Rsa or Ecc."),
    keySizeInBits: s.positiveInteger("The signing key size in bits when available."),
    rsaParameters: s.looseObject("The RSA public key parameters returned for RSA-backed signing policies.", {
      publicExponent: nonEmptyString("The base64 public exponent returned by SignPath."),
      modulus: nonEmptyString("The base64 modulus returned by SignPath."),
    }),
    certificateBytes: nonEmptyString("The base64-encoded X.509 certificate bytes returned by SignPath."),
    publicKeyBytes: nonEmptyString("The base64-encoded public key bytes returned by SignPath."),
  },
  { optional: ["keySizeInBits", "rsaParameters", "certificateBytes", "publicKeyBytes"] },
);

const signingRequestSchema = s.object(
  "A normalized SignPath signing request.",
  {
    id: signpathUuid("The signing request identifier."),
    status: signingRequestStatusSchema,
    isFinalStatus: s.boolean("Whether the signing request has reached a terminal status."),
    workflowStatus: nonEmptyString("The detailed workflow status reported by SignPath."),
    description: nonEmptyString("The optional description attached to the signing request."),
    projectId: signpathUuid("The project identifier."),
    projectSlug: nonEmptyString("The project slug."),
    projectName: nonEmptyString("The project display name."),
    artifactConfigurationId: signpathUuid("The artifact configuration identifier."),
    artifactConfigurationSlug: nonEmptyString("The artifact configuration slug."),
    artifactConfigurationName: nonEmptyString("The artifact configuration display name."),
    signingPolicyId: signpathUuid("The signing policy identifier."),
    signingPolicySlug: nonEmptyString("The signing policy slug."),
    signingPolicyName: nonEmptyString("The signing policy display name."),
    unsignedArtifactLink: s.url("The SignPath link for downloading the unsigned artifact."),
    signedArtifactLink: s.url("The SignPath link for downloading the signed artifact."),
    origin: rawObjectSchema,
    parameters: rawObjectSchema,
  },
  {
    optional: [
      "description",
      "projectId",
      "projectSlug",
      "projectName",
      "artifactConfigurationId",
      "artifactConfigurationSlug",
      "artifactConfigurationName",
      "signingPolicyId",
      "signingPolicySlug",
      "signingPolicyName",
      "unsignedArtifactLink",
      "signedArtifactLink",
      "origin",
      "parameters",
    ],
  },
);

const fastSignHashInputBaseSchema = s.object(
  "Input parameters for submitting a fast SignPath hash-signing request.",
  {
    projectSlug: nonEmptyString("The project slug to submit the signing request to."),
    signingPolicySlug: nonEmptyString("The signing policy slug to submit the request to."),
    signatureAlgorithm: signatureAlgorithmSchema,
    rsaHashAlgorithm: rsaHashAlgorithmOidSchema,
    ecdsaSignatureFormat: ecdsaSignatureFormatSchema,
    base64EncodedHash: nonEmptyString("The base64-encoded hash digest that SignPath should sign."),
    description: optionalNonEmptyString(
      "Optional description to attach to the signing request, such as a version label.",
    ),
    metadata: rawObjectSchema,
  },
  { optional: ["rsaHashAlgorithm", "ecdsaSignatureFormat", "description", "metadata"] },
);

const fastSignHashInputSchema = fastSignHashInputBaseSchema;

export const signpathActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_signing_policies",
    description:
      "List SignPath signing policies visible to the API token, optionally filtered by project and policy slug.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing SignPath signing policies.",
      {
        projectSlug: optionalNonEmptyString("Optional project slug to filter returned signing policies."),
        signingPolicySlug: optionalNonEmptyString("Optional signing policy slug to filter returned signing policies."),
      },
      { optional: ["projectSlug", "signingPolicySlug"] },
    ),
    outputSchema: s.object("The normalized SignPath signing policy list.", {
      signingPolicies: s.array("The signing policies returned by SignPath.", signingPolicySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_signing_request",
    description:
      "Get the current status and metadata for a SignPath signing request so callers can poll for completion.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "signpath.fast_sign_hash",
      statusActionId: "signpath.get_signing_request",
    },
    inputSchema: s.object("Input parameters for retrieving one SignPath signing request.", {
      signingRequestId: signpathUuid("The signing request identifier returned by SignPath."),
    }),
    outputSchema: s.object("The normalized SignPath signing request result.", {
      signingRequest: signingRequestSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "fast_sign_hash",
    description:
      "Submit a fast SignPath hash-signing request using the REST API payload.json contract and return the signature result immediately.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "signpath.fast_sign_hash",
      statusActionId: "signpath.get_signing_request",
    },
    inputSchema: fastSignHashInputSchema,
    outputSchema: s.object(
      "The normalized result returned by a fast SignPath hash-signing request.",
      {
        signingRequestId: signpathUuid("The signing request identifier created by SignPath."),
        webLink: s.url("The SignPath web application link for the signing request."),
        signature: nonEmptyString("The base64-encoded signature returned by SignPath."),
        signatureAlgorithm: signatureAlgorithmSchema,
        rsaHashAlgorithm: rsaHashAlgorithmOidSchema,
        base64EncodedHash: nonEmptyString("The base64-encoded hash digest that was signed."),
        metadata: rawObjectSchema,
      },
      { optional: ["rsaHashAlgorithm", "metadata"] },
    ),
  }),
];
