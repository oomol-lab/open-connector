import type { ProviderDefinition } from "../../core/types.ts";

import { oracleCloudActions } from "./actions.ts";

const service = "oracle_cloud";

export const provider: ProviderDefinition = {
  service,
  displayName: "Oracle Cloud Infrastructure",
  description:
    "Manage OCI compute hosts, networking, monitoring, identity discovery, and Oracle Cloud Agent commands through signed official REST APIs.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "tenancyId",
          label: "Tenancy OCID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "ocid1.tenancy.oc1..example",
          description:
            "The tenancy OCID from the OCI API key configuration. See https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm.",
        },
        {
          key: "userId",
          label: "User OCID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "ocid1.user.oc1..example",
          description: "The OCI IAM user OCID associated with the API signing key.",
        },
        {
          key: "fingerprint",
          label: "API Key Fingerprint",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "12:34:56:78:90:ab:cd:ef:...",
          description: "The colon-separated fingerprint shown for the OCI IAM user's API signing key.",
        },
        {
          key: "privateKey",
          label: "API Signing Private Key",
          inputType: "textarea",
          required: true,
          secret: true,
          placeholder: "-----BEGIN PRIVATE KEY-----",
          description:
            "The PEM-encoded RSA private key paired with the configured OCI API key. OpenConnector treats this as a secret; configure OOMOL_CONNECT_ENCRYPTION_KEY to encrypt stored credentials at rest.",
        },
        {
          key: "privateKeyPassphrase",
          label: "Private Key Passphrase",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Optional PEM passphrase",
          description: "Optional passphrase when the PEM private key is encrypted.",
        },
        {
          key: "region",
          label: "OCI Region",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "us-ashburn-1",
          description:
            "The OCI region identifier used for Compute, Networking, Monitoring, Identity, and Instance Agent API requests.",
        },
        {
          key: "realm",
          label: "OCI Realm",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "oc1",
          description:
            "Optional OCI realm identifier used to resolve the API domain. Defaults to oc1 for commercial regions.",
        },
        {
          key: "defaultCompartmentId",
          label: "Default Compartment OCID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "ocid1.compartment.oc1..example",
          description:
            "The default compartment searched by list actions. The tenancy OCID may be used when resources live in the root compartment.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.oracle.com/cloud/",
  actions: oracleCloudActions,
};
