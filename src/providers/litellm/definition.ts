import type { ProviderDefinition } from "../../core/types.ts";

import { litellmActions } from "./actions.ts";

const service = "litellm";

/**
 * LiteLLM provider backed by a self-hosted LiteLLM AI gateway (proxy server).
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "LiteLLM",
  description:
    "Call chat, message, and embedding models and read model metadata and key budgets through a self-hosted LiteLLM AI gateway.",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk-...",
      description:
        "A LiteLLM virtual key, or the proxy master key, sent as a Bearer token. Create virtual keys in the LiteLLM Admin UI or with POST /key/generate. See https://docs.litellm.ai/docs/proxy/virtual_keys.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Proxy URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://litellm.example.com",
          description:
            "The HTTP or HTTPS URL of your LiteLLM proxy, with or without a trailing /v1. Public addresses work by default; private-network proxies require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK in the self-hosted runtime. Unsafe local, reserved, and cloud-metadata targets always remain blocked.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.litellm.ai",
  actions: litellmActions,
};
