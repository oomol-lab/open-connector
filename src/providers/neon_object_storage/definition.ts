import type { ProviderDefinition } from "../../core/types.ts";

import { neonObjectStorageActions } from "./actions.ts";

const service = "neon_object_storage";

/**
 * Neon Object Storage provider backed by the branch storage routes of the public Neon API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Neon Object Storage",
  description:
    "Manage branchable S3-compatible buckets and objects on Neon branches, and mint presigned upload and download URLs, without handling S3 keys.",
  categories: ["Storage", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "napi_...",
      description:
        "Neon API key used with the Authorization Bearer header. Create it in Account settings > API keys in the Neon Console: https://neon.com/docs/manage/api-keys.",
    },
  ],
  homepageUrl: "https://neon.com/docs/storage/overview",
  actions: neonObjectStorageActions,
};
