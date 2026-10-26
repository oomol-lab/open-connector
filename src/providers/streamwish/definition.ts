import type { ProviderDefinition } from "../../core/types.ts";

import { streamwishActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "streamwish",
  displayName: "StreamWish",
  description: "Video hosting, streaming, and media library management",
  homepageUrl: "https://streamwish.com",
  categories: ["Storage", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Sign in at https://streamwish.com/login.html to obtain your account API key. It is sent as the key query parameter; see https://streamwish.com/api.html.",
    },
  ],
  actions: streamwishActions,
};
