import type { ProviderDefinition } from "../../core/types.ts";

import { neonAiGatewayActions } from "./actions.ts";

const service = "neon_ai_gateway";

/**
 * Neon AI Gateway provider backed by the branch-scoped LLM gateway built into Neon projects.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Neon AI Gateway",
  description:
    "Call chat, Responses, Anthropic Messages, Gemini, embedding, and System One decision models from Anthropic, OpenAI, Google, TypeSafe, and open-weight labs through one branch-scoped Neon AI Gateway credential.",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Gateway Token",
      placeholder: "nt_live_...",
      description:
        "A Neon branch credential with the ai_gateway:invoke scope, sent as a Bearer token (NEON_AI_GATEWAY_TOKEN). Create it with `neon credentials create --scope ai_gateway:invoke` or from Connect > AI Gateway in the Neon Console. It works on its branch and every branch forked from it. See https://neon.com/docs/ai-gateway/authentication.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Gateway URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://br-example-123-api.ai.c-2.us-east-2.aws.neon.tech",
          description:
            "The branch gateway host (NEON_AI_GATEWAY_BASE_URL), shown in Connect > AI Gateway in the Neon Console. A pasted SDK base URL ending in /v1, /openai/v1, or /anthropic is reduced to the host.",
        },
      ],
    },
  ],
  homepageUrl: "https://neon.com/docs/ai-gateway/overview",
  actions: neonAiGatewayActions,
};
