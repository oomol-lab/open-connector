import type { ProviderDefinition } from "../../core/types.ts";

import { sellerspriteActions } from "./actions.ts";

const service = "sellersprite";

/**
 * SellerSprite provider backed by the SellerSprite Open API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "SellerSprite",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret Key",
      placeholder: "sellersprite_secret_key",
      description:
        "SellerSprite Open API secret key sent with the secret-key header. Create or view API keys at https://open.sellersprite.com/app/list.",
    },
  ],
  homepageUrl: "https://www.sellersprite.com/",
  actions: sellerspriteActions,
};
