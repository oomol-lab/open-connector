import type { ProviderDefinition } from "../../core/types.ts";

import { kubernetesActions } from "./actions.ts";

const service = "kubernetes";

export const provider: ProviderDefinition = {
  service,
  displayName: "Kubernetes",
  description: "Inspect workloads, read pod logs, and scale or restart deployments on a Kubernetes cluster.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Bearer Token",
      placeholder: "Enter a ServiceAccount token",
      description:
        "A ServiceAccount token, from `kubectl create token <service-account> --duration=...` or a `kubernetes.io/service-account-token` Secret, bound to a Role that grants only what this connection needs. It is sent as a Bearer token. Exec and OIDC credential plugins and kubeconfig upload are not supported.",
      extraFields: [
        {
          key: "baseUrl",
          label: "API Server URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://kubernetes.example.com:6443",
          description:
            "The HTTPS URL of the API server, found in your kubeconfig under clusters[].cluster.server. Public addresses work by default; private-network clusters require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK in the self-hosted runtime. Unsafe local, reserved, and cloud-metadata targets always remain blocked.",
        },
        {
          key: "certificateAuthorityData",
          label: "Cluster CA Certificate",
          inputType: "textarea",
          required: false,
          secret: false,
          placeholder: "-----BEGIN CERTIFICATE-----",
          description:
            "The cluster's certificate authority, as PEM or as the base64 certificate-authority-data value from your kubeconfig. Needed unless the API server certificate chains to a public CA. Requires a Node.js or Bun runtime; Cloudflare Workers cannot trust a custom CA.",
        },
      ],
    },
  ],
  homepageUrl: "https://kubernetes.io",
  actions: kubernetesActions,
};
