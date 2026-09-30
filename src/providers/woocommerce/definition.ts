import type { ProviderDefinition } from "../../core/types.ts";

import { woocommerceActions } from "./actions.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-store-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "woocommerce";

export const provider: ProviderDefinition = {
  service,
  displayName: "WooCommerce",
  categories: ["Marketing"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "storeUrl",
          label: "Store URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://example.com",
          description:
            "WooCommerce store URL used as the REST API host. Use the HTTPS URL of the WordPress site where WooCommerce is installed.",
        },
        {
          key: "consumerKey",
          label: "Consumer Key",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "ck_...",
          description:
            "WooCommerce REST API consumer key used as the Basic Auth username. Create keys in WordPress admin under WooCommerce > Settings > Advanced > REST API.",
        },
        {
          key: "consumerSecret",
          label: "Consumer Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "cs_...",
          description: "WooCommerce REST API consumer secret used as the Basic Auth password.",
        },
        {
          key: "wordpressUsername",
          label: "WordPress Username",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "admin",
          description: "Optional WordPress username used only for media uploads through the WordPress REST API.",
        },
        {
          key: "wordpressApplicationPassword",
          label: "WordPress Application Password",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx",
          description:
            "Optional WordPress application password used only for media uploads through /wp-json/wp/v2/media.",
        },
      ],
      testAction: {
        actionName: "list_products",
        input: {
          perPage: 1,
        },
      },
    },
  ],
  homepageUrl: "https://woocommerce.com",
  actions: woocommerceActions,
  triggers: [triggerSnapshot0_0],
  triggerPermissions,
};
