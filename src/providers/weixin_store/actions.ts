import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "weixin_store";

const emptyInput = s.actionInput({}, [], "This action takes no input.");

const emptyOutputSchema = s.looseObject("The upstream WeChat response. It carries no fields on success.");

const uploadImageOutputSchema = s.looseObject("The upstream WeChat image upload response.", {
  pic_file: s.looseObject("The uploaded image file descriptors.", {
    img_url: s.string("The WeChat-hosted image URL (mmecimage.cn) accepted by every product image field."),
    media_id: s.string("The media_id of the uploaded image."),
    pay_media_id: s.string("The pay_media_id of the uploaded image."),
  }),
});

const shopInfoOutputSchema = s.looseObject("The upstream WeChat shop information.", {
  info: s.looseObject("The shop's basic information.", {
    nickname: s.string("The shop name."),
    headimg_url: s.string("The shop avatar URL."),
    subject_type: s.string("The shop subject type, e.g. 企业 or 个体工商户."),
    status: s.string("The shop status: opening, open_finished, closing, or close_finished."),
    username: s.string("The shop's original id."),
    open_timestamp: s.integer("The shop opening time as a Unix timestamp."),
  }),
});

const categoryListOutputSchema = s.looseObject("The upstream WeChat category trees.", {
  cats: s.array("The legacy three-level category tree.", s.looseObject("One category node.")),
  cats_v2: s.array(
    "The multi-level category tree whose nodes carry a leaf flag; use the leaf cat_id values for add_product and get_category.",
    s.looseObject("One category node."),
  ),
});

const categoryDetailOutputSchema = s.looseObject("The upstream WeChat category detail.", {
  info: s.looseObject("The category identity, with cat_id and name."),
  attr: s.looseObject(
    "The category attributes: brand requirements, deposit, product_attr_list and sale_attr_list publishing attributes, and more.",
  ),
  product_qua_list: s.array(
    "The qualifications required to publish in this category.",
    s.looseObject("One qualification."),
  ),
});

/**
 * A numeric WeChat id input. WeChat documents ids such as cat_id and brand_id as
 * numbers but returns them as strings from list_categories and get_category, so
 * both forms are accepted and the executor sends them upstream as numbers.
 */
function numericIdInput(description: string): JsonSchema {
  return s.union(
    [
      s.positiveInteger("The id as a number."),
      s.stringPattern("^[1-9][0-9]*$", { description: "The id as a numeric string." }),
    ],
    { description },
  );
}

const qualificationImageOutputSchema = s.looseObject("The uploaded qualification image.", {
  data: s.looseObject("The uploaded file reference.", {
    file_id: s.nonEmptyString("The file id to use in a category or brand qualification application."),
  }),
});

const categoryApplicationInputSchema = s.looseRequiredObject(
  "The new category application, using WeChat field names.",
  {
    cats_v2: s.array(
      "The category path from root to leaf, using cat_id values from list_categories.",
      s.requiredObject("One category in the path.", { cat_id: numericIdInput("One category id in the path.") }),
      { minItems: 1 },
    ),
    license_group_list: s.array(
      "One selected license for each required certificate group from list_categories; empty when no licenses are required.",
      s.requiredObject("One certificate group selection.", {
        license_group_id: numericIdInput("The required certificate group id."),
        license: s.requiredObject("The selected license.", {
          license_id: numericIdInput("One permitted license id in the group."),
          file_id_list: s.stringArray("Qualification image file ids from upload_qualification_image."),
          license_field_list: s.array(
            "The required license fields for this certificate.",
            s.requiredObject("One license field.", {
              key: s.nonEmptyString("The license field key."),
              value: s.nonEmptyString("The license field value."),
            }),
          ),
        }),
      }),
    ),
    brand_list: s.optional(
      s.array(
        "Approved brand ids, required when get_category reports attr.is_limit_brand=true.",
        s.requiredObject("An approved brand.", {
          brand_id: numericIdInput("An approved brand id from list_valid_brands."),
        }),
        { minItems: 1 },
      ),
    ),
  },
);

const categoryApplicationOutputSchema = s.looseObject("The created category audit application.", {
  audit_id: s.positiveInteger("The audit id to pass to get_category_application."),
});

const categoryApplicationDetailOutputSchema = s.looseObject("The category audit application.", {
  info: s.looseObject("The audit status and submitted materials.", {
    audit_id: s.positiveInteger("The audit id."),
    cat_id: s.positiveInteger("The leaf category id."),
    status: s.integer("1 = in review, 2 = rejected, 3 = approved, 4 = canceled."),
    audit_reason: s.string("The rejection reason, when rejected."),
  }),
});

const categoryPermissionsOutputSchema = s.looseObject("The store's current category permissions.", {
  list: s.array(
    "The category permissions.",
    s.looseObject("One category permission.", {
      id: s.positiveInteger("The leaf category id."),
      status: s.integer("1 = effective, 2 = expired."),
      uneffective_reason: s.string("Why an expired permission is no longer effective."),
    }),
  ),
});

const productCategoryPrecheckOutputSchema = s.looseObject("The product publishing readiness check.", {
  all_pass: s.boolean("Whether the store may publish in the category."),
  fail_reasons: s.array("Reasons publishing is blocked.", s.unknown("One failure reason.")),
});

const categoryProductRuleOutputSchema = s.looseObject("The category's product publishing rules.", {
  product_attr_list: s.array("Product attribute requirements.", s.looseObject("One product attribute rule.")),
  sale_attr_list: s.array("SKU attribute requirements.", s.looseObject("One sale attribute rule.")),
  product_qua_list: s.array("Product qualification requirements.", s.looseObject("One qualification rule.")),
  floor_price: s.integer("The lowest allowed sale price, in cents."),
});

const brandListOutputSchema = s.looseObject("The upstream WeChat brand page.", {
  brands: s.array("The effective brand qualifications of the shop.", s.looseObject("One brand qualification.")),
  total_num: s.integer("The total number of effective brand qualifications."),
  next_key: s.string("The pagination cursor; an empty value means the last page."),
});

const productIdOutputSchema = s.looseObject("The upstream WeChat response carrying the created product.", {
  data: s.looseObject("The creation result.", {
    product_id: s.string("The id of the created product."),
    create_time: s.string("The creation time, formatted as YYYY-MM-DD hh:mm:ss."),
  }),
});

const productUpdateOutputSchema = s.looseObject("The upstream WeChat response carrying the updated product.", {
  data: s.looseObject("The update result.", {
    product_id: s.string("The id of the updated product."),
    update_time: s.string("The update time, formatted as YYYY-MM-DD hh:mm:ss."),
  }),
});

const productOutputSchema = s.looseObject("The upstream WeChat product data.", {
  product: s.looseObject("The product, with its skus, category path, attrs, and audit state."),
});

const productListOutputSchema = s.looseObject("The upstream WeChat product page.", {
  product_ids: s.array("The product ids in this page.", s.string("One product id.")),
  next_key: s.string("The pagination cursor for the next page."),
  total_num: s.integer("The total number of products matching the filter."),
});

const orderListOutputSchema = s.looseObject("The upstream WeChat order page.", {
  order_id_list: s.array("The order ids in this page.", s.string("One order id.")),
  next_key: s.string("The pagination cursor for the next page."),
  has_more: s.boolean("Whether more orders follow this page."),
});

const orderOutputSchema = s.looseObject("The upstream WeChat order data.", {
  order: s.looseObject(
    "The order, with status, order_detail (product_infos, pay_info, price_info, delivery_info, ext_info), and aftersale_detail.",
  ),
});

const deliveryCompanyListOutputSchema = s.looseObject("The upstream WeChat delivery company list.", {
  company_list: s.array(
    "The supported delivery companies.",
    s.looseObject("One delivery company.", {
      delivery_id: s.string("The delivery company id to pass to send_delivery, e.g. SF, ZTO, YTO, JD, EMS, or OTHER."),
      delivery_name: s.string("The delivery company name."),
    }),
  ),
});

const freightTemplateListOutputSchema = s.looseObject("The upstream WeChat freight template page.", {
  template_id_list: s.array("The freight template ids in this page.", s.string("One freight template id.")),
});

const addressListOutputSchema = s.looseObject("The upstream WeChat address page.", {
  address_id_list: s.array("The address ids in this page.", s.string("One address id.")),
});

const addressOutputSchema = s.looseObject("The upstream WeChat address detail.", {
  address_detail: s.looseObject(
    "The address, with its send/recv flags and the address_info object (user_name, tel_number, province_name, city_name, county_name, detail_info, postal_code, national_code, house_number, lat, lng).",
  ),
});

const freightTemplateOutputSchema = s.looseObject("The upstream WeChat freight template detail.", {
  freight_template: s.looseObject(
    "The freight template, with name, valuation_type, shipping_method, delivery_type, send_time, the sender address_info, and its freight rules.",
  ),
});

const aftersaleListOutputSchema = s.looseObject("The upstream WeChat after-sale page.", {
  after_sale_order_id_list: s.array("The after-sale order ids in this page.", s.string("One after-sale order id.")),
  has_more: s.boolean("Whether more after-sale orders follow this page."),
  next_key: s.string("The pagination cursor for the next page."),
});

const aftersaleOutputSchema = s.looseObject("The upstream WeChat after-sale order data.", {
  after_sale_order: s.looseObject(
    "The after-sale order, with status, type (REFUND, RETURN, EXCHANGE, or RESHIP), order_id, product_info, refund_info, return_info, and reason_text.",
  ),
});

const productIdInputSchema = s.union(
  [s.nonEmptyString("The product_id as a string."), s.positiveInteger("The product_id as a number.")],
  {
    description:
      "The product_id returned by add_product or list_products. WeChat documents it as a number in some responses and a string in others; both forms are accepted.",
  },
);
const orderIdInputSchema = s.union(
  [s.nonEmptyString("The order_id as a string."), s.positiveInteger("The order_id as a number.")],
  {
    description:
      "The order_id returned by list_orders. WeChat documents it as a number in some endpoints and a string in others; both forms are accepted.",
  },
);
const nextKeyInputSchema = s.nonEmptyString(
  "The pagination cursor returned by the previous call. Omit for the first page.",
);

const productSkuSchema = s.looseObject(
  "One SKU in WeChat snake_case: stock_num (required, integer), sale_price (required, integer, the price in 分), sku_attrs ([{attr_key, attr_value}]), out_sku_id, thumb_img, and any other WeChat SKU field passed through unchanged.",
);
const productCatSchema = s.looseObject(
  "One level of the multi-level category path, ordered from the top category down to the leaf category.",
  {
    cat_id: s.union(
      [s.positiveInteger("The category id as a number."), s.nonEmptyString("The category id as a string.")],
      {
        description:
          "A category id from list_categories. WeChat documents cat_id as a number on some endpoints and a string on others; both forms are accepted.",
      },
    ),
  },
);
const productExtraServiceSchema = s.looseObject(
  "The after-sale services of the product in WeChat snake_case: seven_day_return and freight_insurance, each 0 or 1.",
);
const productDescInfoSchema = s.looseObject(
  "The product detail description in WeChat snake_case: imgs (image URLs from upload_image) and desc (text).",
);
const productAttrSchema = s.looseObject(
  "One product attribute in WeChat snake_case: attr_key and attr_value. Which attributes a category requires is listed by get_category.",
);

const productPayloadProperties = {
  title: s.nonEmptyString("The product title, at most 60 characters.", { maxLength: 60 }),
  headImgs: s.array(
    "The product head images: 3 to 9 image URLs returned by upload_image.",
    s.url("A WeChat-hosted product image URL."),
    { minItems: 3, maxItems: 9 },
  ),
  catsV2: s.array("The multi-level category path of the product, ordered down to a leaf category.", productCatSchema, {
    minItems: 1,
  }),
  deliverMethod: s.union([s.literal(0), s.literal(1), s.literal(3)], {
    description:
      "The delivery method: 0 = express delivery, 1 = virtual goods delivered to a phone number, 3 = virtual goods delivered to an account chosen by the buyer.",
  }),
  deliverAcctType: s.array(
    "The account types buyers may receive virtual goods through: 1 = WeChat openid, 2 = QQ, 3 = phone number, 4 = email. Required when deliverMethod is 3.",
    s.union([s.literal(1), s.literal(2), s.literal(3), s.literal(4)], { description: "One delivery account type." }),
    { minItems: 1 },
  ),
  extraService: productExtraServiceSchema,
  skus: s.array("The SKUs of the product, between 1 and 500.", productSkuSchema, { minItems: 1, maxItems: 500 }),
  outProductId: s.nonEmptyString("The merchant-side product id, for joining with an external system."),
  descInfo: productDescInfoSchema,
  attrs: s.array("The product attributes required by its category.", productAttrSchema),
  brandId: s.positiveInteger(
    "The brand_id from list_valid_brands. Pass 2100000000 for a brandless product; required when the category limits brands.",
  ),
  expressInfo: s.looseObject(
    "The express settings in WeChat snake_case: template_id (a freight template id from list_freight_templates; inspect one with get_freight_template) and weight.",
  ),
  listing: s.literal(1, {
    description: "Pass 1 to submit the product for review and list it directly instead of saving a draft.",
  }),
  aftersaleDesc: s.nonEmptyString("The after-sale description shown to buyers."),
  limitedInfo: s.looseObject("The purchase-limit settings in WeChat snake_case, passed through unchanged."),
  sizeChart: s.looseObject("The size chart in WeChat snake_case, passed through unchanged."),
};

const productRequiredFields = ["title", "headImgs", "catsV2", "deliverMethod", "extraService", "skus"];

const productManagePermission = "Manage the products of the connected WeChat Store";
const orderManagePermission = "Manage the orders of the connected WeChat Store";
const aftersaleManagePermission = "Manage the after-sale orders of the connected WeChat Store";

const leaguePermission =
  "WeChat Store alliance access must be enabled and approved; service providers require permission set 141";
const leaguePlanIdentity = {
  type: s.union([s.literal(100), s.literal(300)], {
    description:
      "100 = all talents, 300 = specified talents. These endpoints do not support filtered audience type 200.",
  }),
  productId: numericIdInput("The existing product id; must be a safe positive integer."),
  promotionPlanId: numericIdInput("The existing promotion plan id; must be a safe positive integer."),
};
const leaguePlanStatus = s.integer(
  "1 active, 2 delisted, 4 deleted, 5 ineligible, 7 product delisted, 8 expired, 9 banned, 10 pending activation.",
);

export const weixinStoreActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_qualification_image",
    operationType: "write",
    description:
      "Upload a qualification image (up to 2 MB) and return the file_id required for category and brand applications. Product images from upload_image cannot be used here.",
    inputSchema: s.actionInput(
      { file: s.transitFile("The qualification image previously uploaded to the local transit file API.") },
      ["file"],
      "The qualification image to upload.",
    ),
    outputSchema: qualificationImageOutputSchema,
    providerPermissions: ["Upload qualification images to the connected WeChat Store"],
  }),
  defineProviderAction(service, {
    name: "upload_image",
    operationType: "write",
    description:
      "Upload an image to the store and get back its WeChat-hosted URL (mmecimage.cn), the only URL form accepted by product image fields. Provide either imageUrl for WeChat to fetch, or a local transit file with its pixel size. At most 10 MB per image.",
    inputSchema: s.actionInput(
      {
        imageUrl: s.url(
          "A publicly accessible image URL that WeChat fetches and re-hosts. Exactly one of imageUrl and file is required.",
        ),
        file: s.transitFile(
          "The image file previously uploaded to the local transit file API. Exactly one of imageUrl and file is required.",
        ),
        width: s.positiveInteger("The image width in pixels. Required when file is used."),
        height: s.positiveInteger("The image height in pixels. Required when file is used."),
      },
      [],
      "The image to upload.",
    ),
    outputSchema: uploadImageOutputSchema,
    providerPermissions: ["Upload images to the connected WeChat Store"],
  }),
  defineProviderAction(service, {
    name: "get_shop_info",
    operationType: "read",
    description: "Get the basic information of the connected WeChat Store: name, avatar, subject type, and status.",
    inputSchema: emptyInput,
    outputSchema: shopInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    operationType: "read",
    description:
      "Get the full category tree of the store, including the qualifications each category requires. Use the leaf cat_id values from cats_v2 for add_product and get_category.",
    inputSchema: emptyInput,
    outputSchema: categoryListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_category",
    operationType: "read",
    description:
      "Get the publishing rules of one leaf category: required product and sale attributes, brand restrictions, deposit, and qualifications.",
    inputSchema: s.actionInput(
      { catId: numericIdInput("The id of a leaf category from list_categories.") },
      ["catId"],
      "The category to inspect.",
    ),
    outputSchema: categoryDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "apply_category",
    operationType: "write",
    description:
      "Apply for permission to sell in a leaf category using the new category tree and certificate groups. Returns an audit id; check the audit and effective permission before publishing products.",
    inputSchema: s.actionInput(
      { categoryInfo: categoryApplicationInputSchema },
      ["categoryInfo"],
      "The category application. The new certificate-group protocol is used automatically.",
    ),
    outputSchema: categoryApplicationOutputSchema,
    providerPermissions: ["Apply for categories in the connected WeChat Store"],
    followUpActions: ["weixin_store.get_category_application"],
  }),
  defineProviderAction(service, {
    name: "get_category_application",
    operationType: "read",
    description: "Get the status and any rejection reason of a category application by audit id.",
    inputSchema: s.actionInput(
      { auditId: s.positiveInteger("The audit_id returned by apply_category.") },
      ["auditId"],
      "The category application to inspect.",
    ),
    outputSchema: categoryApplicationDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_permissions",
    operationType: "read",
    description:
      "List the store's category permissions. Filter to status 1 to find categories currently allowed for sale.",
    inputSchema: s.actionInput(
      { status: s.union([s.literal(1), s.literal(2)], { description: "1 = effective, 2 = expired; omit for both." }) },
      [],
      "The category permissions to list.",
    ),
    outputSchema: categoryPermissionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "precheck_product_category",
    operationType: "read",
    description:
      "Check whether the store may publish in a leaf category, including category permission, deposit, freight insurance, and store restrictions. Omit catId for store-wide checks only.",
    inputSchema: s.actionInput(
      { catId: numericIdInput("The leaf category id to check; omit for a store-wide check.") },
      [],
      "The category to check before publishing.",
    ),
    outputSchema: productCategoryPrecheckOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_category_product_rule",
    operationType: "read",
    description:
      "Get the category's product attribute, sale attribute, qualification, price, and other publishing rules for the chosen release mode.",
    inputSchema: s.actionInput(
      {
        catId: numericIdInput("The leaf category id."),
        releaseMode: s.union([s.literal(0), s.literal(1)], { description: "0 = normal, 1 = simplified." }),
        brandId: numericIdInput("An approved brand id when publishing a branded product."),
      },
      ["catId", "releaseMode"],
      "The category publishing rules to retrieve.",
    ),
    outputSchema: categoryProductRuleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_valid_brands",
    operationType: "read",
    description:
      "List the brand qualifications currently in effect for the store, paginated by cursor. Use a returned brand_id when adding a product in a brand-restricted category.",
    inputSchema: s.actionInput(
      {
        pageSize: s.positiveInteger("The number of brands per page, at most 50. Defaults to 10.", {
          maximum: 50,
          default: 10,
        }),
        nextKey: nextKeyInputSchema,
      },
      [],
      "The brand page to list.",
    ),
    outputSchema: brandListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_product",
    operationType: "write",
    description:
      "Create a product. All image fields must be WeChat-hosted URLs from upload_image. By default the product is saved as a draft; pass listing 1 to submit it for review and list it directly. Nested objects and arrays keep their WeChat snake_case fields as documented per field.",
    inputSchema: s.actionInput(productPayloadProperties, productRequiredFields, "The product to create."),
    outputSchema: productIdOutputSchema,
    providerPermissions: [productManagePermission],
    followUpActions: ["weixin_store.listing_product"],
  }),
  defineProviderAction(service, {
    name: "update_product",
    operationType: "write",
    description:
      "Replace a product's editable data. This is a full overwrite: every field of add_product applies, SKUs that carry an existing sku_id are updated, SKUs without one are added, and previously existing SKUs missing from the list are deleted.",
    inputSchema: s.actionInput(
      { productId: productIdInputSchema, ...productPayloadProperties },
      ["productId", ...productRequiredFields],
      "The product replacement.",
    ),
    outputSchema: productUpdateOutputSchema,
    providerPermissions: [productManagePermission],
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Get one product by product_id. Products keep a draft and an online copy; dataType selects which.",
    inputSchema: s.actionInput(
      {
        productId: productIdInputSchema,
        dataType: s.positiveInteger("Which copy to read: 1 = the online product (default), 2 = the draft, 3 = both.", {
          maximum: 3,
        }),
      },
      ["productId"],
      "The product to get.",
    ),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List the product ids of the store, paginated by cursor.",
    inputSchema: s.actionInput(
      {
        status: s.union([s.literal(0), s.literal(5), s.literal(11), s.literal(6)], {
          description:
            "Filter by product status: 0 = initial, 5 = listed, 11 = delisted, 6 = recycled. Omit to list every status except drafts and recycled products.",
        }),
        pageSize: s.positiveInteger("The number of products per page, at most 30. Defaults to 10.", {
          maximum: 30,
          default: 10,
        }),
        nextKey: nextKeyInputSchema,
      },
      [],
      "The product page to list.",
    ),
    outputSchema: productListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "listing_product",
    operationType: "write",
    description: "Submit a product for review and list it once approved.",
    inputSchema: s.actionInput({ productId: productIdInputSchema }, ["productId"], "The product to list."),
    outputSchema: emptyOutputSchema,
    providerPermissions: [productManagePermission],
  }),
  defineProviderAction(service, {
    name: "delisting_product",
    operationType: "write",
    description: "Take a listed product off the shelf.",
    inputSchema: s.actionInput({ productId: productIdInputSchema }, ["productId"], "The product to delist."),
    outputSchema: emptyOutputSchema,
    providerPermissions: [productManagePermission],
  }),
  defineProviderAction(service, {
    name: "delete_product",
    operationType: "destructive",
    description:
      "Permanently delete a product by product_id. A product under review cannot be deleted. This cannot be undone.",
    inputSchema: s.actionInput({ productId: productIdInputSchema }, ["productId"], "The product to delete."),
    outputSchema: emptyOutputSchema,
    providerPermissions: [productManagePermission],
  }),
  defineProviderAction(service, {
    name: "update_product_stock",
    operationType: "write",
    description: "Update the stock of a product's SKUs. This does not consume the product review quota.",
    inputSchema: s.actionInput(
      {
        productId: productIdInputSchema,
        skus: s.array(
          "The SKU stock updates in WeChat snake_case: [{sku_id, stock_num}].",
          s.looseObject("One SKU stock update: sku_id and stock_num."),
          { minItems: 1 },
        ),
      },
      ["productId", "skus"],
      "The stock update.",
    ),
    outputSchema: emptyOutputSchema,
    providerPermissions: [productManagePermission],
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description:
      "List the order ids of the store, paginated by cursor. At least one time range is required, as a pair of Unix timestamps in seconds spanning at most 7 days.",
    inputSchema: s.actionInput(
      {
        createTimeStart: s.positiveInteger(
          "The start of the order creation time range, as a Unix timestamp in seconds.",
        ),
        createTimeEnd: s.positiveInteger("The end of the order creation time range, as a Unix timestamp in seconds."),
        updateTimeStart: s.positiveInteger("The start of the order update time range, as a Unix timestamp in seconds."),
        updateTimeEnd: s.positiveInteger("The end of the order update time range, as a Unix timestamp in seconds."),
        status: s.union(
          [
            s.literal(10),
            s.literal(12),
            s.literal(13),
            s.literal(20),
            s.literal(21),
            s.literal(30),
            s.literal(100),
            s.literal(250),
          ],
          {
            description:
              "Filter by order status: 10 = pending payment, 12 = pending gift receipt, 13 = pending group buy, 20 = pending shipment, 21 = partially shipped, 30 = shipped, 100 = completed, 250 = cancelled.",
          },
        ),
        openid: s.nonEmptyString("Filter by the buyer's openid."),
        pageSize: s.positiveInteger("The number of orders per page, at most 100.", { maximum: 100 }),
        nextKey: nextKeyInputSchema,
      },
      [],
      "The order page to list.",
    ),
    outputSchema: orderListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description:
      "Get one order by order_id, including its products, payment, price, and delivery details. Buyer address fields are masked.",
    inputSchema: s.actionInput({ orderId: orderIdInputSchema }, ["orderId"], "The order to get."),
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_order_merchant_notes",
    operationType: "write",
    description: "Replace the merchant note of one order, optionally with a tag color.",
    inputSchema: s.actionInput(
      {
        orderId: orderIdInputSchema,
        merchantNotes: s.nonEmptyString("The merchant note to set on the order."),
        tagColor: s.nonNegativeInteger("The note tag color: 0 = gray, 1 = red, 2 = orange, 3 = green, 4 = blue.", {
          maximum: 4,
        }),
      },
      ["orderId", "merchantNotes"],
      "The merchant note update.",
    ),
    outputSchema: emptyOutputSchema,
    providerPermissions: [orderManagePermission],
  }),
  defineProviderAction(service, {
    name: "send_delivery",
    operationType: "write",
    description:
      "Ship an order, in one or more packages. Each package either ships by express with a waybill (deliverType 1, needs waybillId and deliveryId from list_delivery_companies, or OTHER when the company is not listed) or delivers virtual goods without logistics (deliverType 3, only for orders whose products use the phone-number delivery method).",
    inputSchema: s.actionInput(
      {
        orderId: orderIdInputSchema,
        deliveries: s.array(
          "The packages to ship for this order.",
          s.object(
            "One shipped package.",
            {
              deliverType: s.union([s.literal(1), s.literal(3)], {
                description: "1 = ship by express with a waybill, 3 = virtual goods without logistics.",
              }),
              waybillId: s.nonEmptyString("The waybill number. Required when deliverType is 1."),
              deliveryId: s.nonEmptyString(
                "The delivery company id from list_delivery_companies, or OTHER. Required when deliverType is 1.",
              ),
              productInfos: s.array(
                "The products in this package.",
                s.object(
                  "One shipped product.",
                  {
                    productId: s.nonEmptyString("The product_id of the shipped product."),
                    skuId: s.nonEmptyString("The sku_id of the shipped product."),
                    productCnt: s.positiveInteger("The shipped quantity."),
                  },
                  { optional: [], additionalProperties: true },
                ),
                { minItems: 1 },
              ),
            },
            { optional: ["waybillId", "deliveryId"], additionalProperties: true },
          ),
          { minItems: 1 },
        ),
      },
      ["orderId", "deliveries"],
      "The delivery to send.",
    ),
    outputSchema: emptyOutputSchema,
    providerPermissions: [orderManagePermission],
  }),
  defineProviderAction(service, {
    name: "list_delivery_companies",
    operationType: "read",
    description: "List the delivery companies the store can ship with, including each company's delivery_id.",
    inputSchema: s.actionInput(
      {
        ewaybillOnly: s.withDefault(
          s.boolean("Whether to return only companies that support electronic waybills. Defaults to false."),
          false,
        ),
      },
      [],
      "The delivery company filter.",
    ),
    outputSchema: deliveryCompanyListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_freight_templates",
    operationType: "read",
    description: "List the freight template ids of the store.",
    inputSchema: s.actionInput(
      {
        offset: s.nonNegativeInteger("The zero-based offset of the first template to return. Defaults to 0.", {
          default: 0,
        }),
        limit: s.positiveInteger("The number of templates to return. Defaults to 10.", { default: 10 }),
      },
      [],
      "The freight template page to list.",
    ),
    outputSchema: freightTemplateListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_freight_template",
    operationType: "read",
    description:
      "Get one freight template by template_id, including its valuation type, shipping method, sender address, and freight rules. Freight templates bind to products through expressInfo on add_product.",
    inputSchema: s.actionInput(
      { templateId: s.nonEmptyString("The template_id returned by list_freight_templates.") },
      ["templateId"],
      "The freight template to get.",
    ),
    outputSchema: freightTemplateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_addresses",
    operationType: "read",
    description:
      "List the merchant address ids of the store. After-sale returns need one of these address ids when accepting a return.",
    inputSchema: s.actionInput(
      {
        offset: s.nonNegativeInteger("The zero-based offset of the first address to return. Defaults to 0.", {
          default: 0,
        }),
        limit: s.positiveInteger("The number of addresses to return. Defaults to 10.", { default: 10 }),
      },
      [],
      "The address page to list.",
    ),
    outputSchema: addressListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_address",
    operationType: "read",
    description:
      "Get one merchant address by address_id, including its contact, region, and send/recv flags. Accepting an after-sale return needs one of these address ids.",
    inputSchema: s.actionInput(
      { addressId: s.nonEmptyString("The address_id returned by list_addresses.") },
      ["addressId"],
      "The address to get.",
    ),
    outputSchema: addressOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_aftersale_orders",
    operationType: "read",
    description:
      "List the after-sale order ids of the store, paginated by cursor. At least one time range pair is required, as Unix timestamps in seconds spanning at most 24 hours.",
    inputSchema: s.actionInput(
      {
        createTimeStart: s.positiveInteger(
          "The start of the after-sale creation time range, as a Unix timestamp in seconds.",
        ),
        createTimeEnd: s.positiveInteger(
          "The end of the after-sale creation time range, as a Unix timestamp in seconds.",
        ),
        updateTimeStart: s.positiveInteger(
          "The start of the after-sale update time range, as a Unix timestamp in seconds.",
        ),
        updateTimeEnd: s.positiveInteger(
          "The end of the after-sale update time range, as a Unix timestamp in seconds.",
        ),
        nextKey: nextKeyInputSchema,
      },
      [],
      "The after-sale page to list.",
    ),
    outputSchema: aftersaleListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_aftersale_order",
    operationType: "read",
    description: "Get one after-sale order by its id, including its status, type, products, and refund details.",
    inputSchema: s.actionInput(
      { afterSaleOrderId: s.nonEmptyString("The after_sale_order_id returned by list_aftersale_orders.") },
      ["afterSaleOrderId"],
      "The after-sale order to get.",
    ),
    outputSchema: aftersaleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "accept_aftersale",
    operationType: "write",
    description:
      "Accept a buyer's after-sale request. Accepting a return needs a merchant address id from list_addresses; acceptType chooses between accepting the return (1) and accepting the refund (2), and is chosen automatically when omitted.",
    inputSchema: s.actionInput(
      {
        afterSaleOrderId: s.nonEmptyString("The after_sale_order_id to accept."),
        addressId: s.nonEmptyString(
          "The merchant return address id from list_addresses; inspect candidates with get_address. Required when accepting a return.",
        ),
        acceptType: s.union([s.literal(1), s.literal(2)], {
          description:
            "1 = accept the return (return-and-refund or exchange), 2 = accept the refund. Chosen automatically from the after-sale order's state when omitted.",
        }),
      },
      ["afterSaleOrderId"],
      "The after-sale acceptance.",
    ),
    outputSchema: emptyOutputSchema,
    providerPermissions: [aftersaleManagePermission],
  }),
  defineProviderAction(service, {
    name: "reject_aftersale",
    operationType: "write",
    description: "Reject a buyer's after-sale request with a reason.",
    inputSchema: s.actionInput(
      {
        afterSaleOrderId: s.nonEmptyString("The after_sale_order_id to reject."),
        rejectReasonType: s.positiveInteger("The rejection reason type, from the reason enum of the after-sale order."),
        rejectReason: s.nonEmptyString("A custom rejection description; a default description is used when omitted."),
      },
      ["afterSaleOrderId", "rejectReasonType"],
      "The after-sale rejection.",
    ),
    outputSchema: emptyOutputSchema,
    providerPermissions: [aftersaleManagePermission],
  }),
  defineProviderAction(service, {
    name: "list_league_promoters",
    operationType: "read",
    description:
      "List the connected merchant's alliance talents. This is not a platform-wide talent search; follow continue_flag to paginate.",
    inputSchema: s.actionInput(
      {
        pageIndex: s.positiveInteger("The 1-based page index.", { default: 1 }),
        pageSize: s.positiveInteger("The number of talents per page, at most 20.", { maximum: 20, default: 20 }),
      },
      [],
      "Merchant alliance talent pagination.",
    ),
    outputSchema: s.looseObject("The merchant alliance talent page.", {
      total_num: s.integer("The total number of talents."),
      continue_flag: s.boolean("Whether another page is available."),
      list: s.array(
        "The talents in this page.",
        s.looseObject("One talent.", {
          talent_appid: s.string("The talent appid used by get_league_promoter."),
          nickname: s.string("The talent nickname; not a lookup identifier."),
        }),
      ),
    }),
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "get_league_promoter",
    operationType: "read",
    description:
      "Read a known alliance talent's profile, sales metrics and blacklist status. Supply exactly one talent identifier, not a nickname.",
    inputSchema: s.requireExactlyOneProperty(
      s.actionInput(
        {
          talentAppid: s.nonEmptyString("The talent_appid returned by list_league_promoters."),
          talentSearchKey: s.nonEmptyString(
            "A talent appid or WeChat Channels finder_id; not a nickname or a third-party search id.",
          ),
        },
        [],
        "Exactly one known talent identifier.",
      ),
      ["talentAppid", "talentSearchKey"],
    ),
    outputSchema: s.looseObject("The alliance talent detail.", {
      talent: s.looseObject("The talent profile and metrics.", {
        base_talent_info: s.looseObject("Talent identity.", {
          talent_appid: s.string("The talent appid."),
          nickname: s.string("The nickname."),
          head_img: s.string("The avatar URL."),
        }),
        data: s.looseObject("Upstream sales and window metrics.", {
          total_sale_gmv: s.number("Lifetime sales GMV, in upstream units."),
          sale_gmv_30d: s.number("30-day sales GMV, in upstream units."),
          total_order_num: s.number("Lifetime orders."),
          order_num_30d: s.number("30-day orders."),
          sale_product_num_30d: s.number("Products sold in 30 days."),
          window_product_num: s.number("Products in the talent window."),
        }),
        feature_info: s.looseObject("Talent features.", {
          level: s.integer("The upstream level, 0 through 5."),
          is_blacklisted: s.boolean("Whether the talent is blacklisted."),
        }),
      }),
    }),
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "get_compass_product_data",
    operationType: "read",
    description:
      "Read historical Compass product click and transaction data. T+1 only: date must be yesterday or earlier in Asia/Shanghai. Monetary values and counts retain upstream string units.",
    inputSchema: s.actionInput(
      {
        date: s.withExamples(
          s.stringPattern("^[0-9]{8}$", {
            description: "A valid historical date as YYYYMMDD, yesterday or earlier in Asia/Shanghai.",
          }),
          ["20240520"],
        ),
        productId: numericIdInput("The product id, no greater than JavaScript's maximum safe integer."),
      },
      ["date", "productId"],
      "A historical product data query.",
    ),
    outputSchema: s.looseObject("Historical product data; upstream fields and nullable ratios are preserved.", {
      product_info: s.looseObject("The product and historical metrics.", {
        product_id: s.string("The product id."),
        head_img_url: s.string("The product image URL."),
        title: s.string("The title."),
        price: s.string("The price in fen, as an upstream string."),
        first_category_id: s.string("The first-level category id."),
        second_category_id: s.string("The second-level category id."),
        third_category_id: s.string("The third-level category id."),
        data: s.looseObject("Raw Compass metrics; monetary values are in fen and ratios can be null.", {
          product_click_uv: s.string("Unique product click visitors."),
          product_click_cnt: s.string("Product clicks."),
          pay_gmv: s.string("Paid GMV in fen."),
          pay_cnt: s.string("Paid orders."),
          pay_uv: s.string("Paying users."),
          pay_product_cnt: s.string("Paid product quantity."),
        }),
      }),
    }),
    providerPermissions: ["WeChat Store Compass data access; service providers require permission set 175"],
  }),
  defineProviderAction(service, {
    name: "get_product_restricted_info",
    operationType: "read",
    description:
      "Read restricted sales scenes for 1 to 50 products, including alliance and talent-window restrictions. This does not change product status. Merchant quota: 100 calls per minute.",
    inputSchema: s.actionInput(
      {
        productIds: s.array(
          "Product ids, each no greater than JavaScript's maximum safe integer.",
          numericIdInput("A product id."),
          { minItems: 1, maxItems: 50 },
        ),
      },
      ["productIds"],
      "Products to inspect for scene restrictions.",
    ),
    outputSchema: s.looseObject("Product scene restrictions.", {
      data: s.looseObject("The restriction response data.", {
        restricted_info_list: s.array(
          "Restrictions per product.",
          s.looseObject("One product's restricted scenes.", {
            product_id: numericIdInput("The product id, returned as a number or numeric string."),
            scene_info: s.array(
              "Restricted scenes and policy sources.",
              s.looseObject("One restriction.", {
                scene: s.integer(
                  "1 live, 2 short video, 3 store home/talent window, 4 search, 5 ads, 6 orders/cards, 7 alliance, 8 recommendation, 9 selling, 10 invalid-product hiding.",
                ),
                source: s.integer(
                  "1 low-risk policy, 2 similar-product policy, 3 hidden-image policy, 4 trial category, 5 window hiding, 6 minimal mode, 7 selling restriction, 8 inventory restriction.",
                ),
              }),
            ),
          }),
        ),
      }),
    }),
    providerPermissions: ["WeChat Store product access; service providers require permission set 129"],
  }),
  defineProviderAction(service, {
    name: "list_league_promoter_products",
    operationType: "read",
    description:
      "Read a known cooperating talent's current window products or products sold in the last 30 days. This does not discover new talents or add products to a window.",
    inputSchema: s.actionInput(
      {
        talentAppid: s.nonEmptyString("The cooperating talent appid."),
        dataType: s.union([s.literal(1), s.literal(2)], {
          description: "1 = products with sales in the last 30 days, 2 = current window products.",
        }),
        pageIndex: s.positiveInteger("The 1-based page index.", { default: 1 }),
        pageSize: s.positiveInteger("Page size, at most 20.", { maximum: 20, default: 20 }),
      },
      ["talentAppid", "dataType"],
      "A cooperating talent's product data page.",
    ),
    outputSchema: s.looseObject("Talent product data page.", {
      total_num: s.integer("Total matching products."),
      continue_flag: s.boolean("Whether another page exists."),
      list: s.array(
        "Product data.",
        s.looseObject("One product.", {
          spu_id: s.integer("The product id."),
          product_data: s.looseObject("Sales metrics.", {
            total_sale_gmv: s.number("Lifetime sales GMV, in upstream units."),
            sale_gmv_30d: s.number("30-day sales GMV, in upstream units."),
            total_order_num: s.number("Lifetime orders."),
            order_num_30d: s.number("30-day orders."),
          }),
          talent_commission_info: s.looseObject("Commission information; read only.", {
            commission_type: s.integer("1 ordinary, 2 targeted, 3 exclusive."),
            ratio: s.integer("Commission ratio on the upstream 0–1000000 scale; 1000000 means 100%."),
          }),
        }),
      ),
    }),
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "list_product_promotion_talents",
    operationType: "read",
    description:
      "Read talents related to one existing product promotion plan and their promotion relationship status. This is not platform-wide discovery and does not prove that a product is in a talent's window.",
    inputSchema: s.actionInput(
      {
        productId: leaguePlanIdentity.productId,
        promotionPlanId: leaguePlanIdentity.promotionPlanId,
        talentAppid: s.nonEmptyString("Optional talent appid filter."),
        pageIndex: s.positiveInteger("The 1-based page index.", { default: 1 }),
        pageSize: s.positiveInteger("Page size, at most 10.", { maximum: 10, default: 10 }),
      },
      ["productId", "promotionPlanId"],
      "One existing promotion plan's talent page.",
    ),
    outputSchema: s.looseObject("Promotion talent relationships.", {
      total_num: s.integer("Total matching records."),
      continue_flag: s.boolean("Whether another page exists."),
      list: s.array(
        "Related talents.",
        s.looseObject("One relationship.", {
          base_talent_info: s.looseObject("Talent identity.", {
            nickname: s.string("The nickname."),
            head_img: s.string("The avatar URL."),
            talent_appid: s.string("The talent appid."),
          }),
          commission_info: s.looseObject("Read-only commission terms.", {
            promotion_plan_id: s.integer("The plan id."),
            promotion_plan_type: s.integer("The plan type."),
            ratio: s.integer(
              "Upstream scale: 1000000 means 100%; not the 0–90 percentage scale of update_league_plan.",
            ),
          }),
          talent_relation_status: s.integer("1 promoting, 4 removed, 10 blacklisted."),
        }),
      ),
    }),
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "get_product_audit_strategy",
    operationType: "read",
    description:
      "Read store-wide product listing policy switches. This is not a historical delisting-reason log and does not change any policy.",
    inputSchema: emptyInput,
    outputSchema: s.looseObject("Store listing policy.", {
      audit_strategy: s.looseObject("Each switch is 1 enabled or 2 disabled.", {
        hide_err_field_flag: s.integer("List with erroneous product information hidden."),
        hit_duplicated_flag: s.integer("Allow similar products."),
        hit_low_risk_rule_flag: s.integer("Allow products matching low-risk rules."),
      }),
    }),
    providerPermissions: ["WeChat Store product access; service providers require permission set 129"],
  }),
  defineProviderAction(service, {
    name: "list_product_promotion_plans",
    operationType: "read",
    description:
      "List an existing product's alliance promotion plan identifiers before inspecting or changing a specific plan. Filtered audience type 200 is supported by this list only, not get_league_plan or update_league_plan.",
    inputSchema: s.actionInput(
      {
        productId: leaguePlanIdentity.productId,
        promotionPlanType: s.union([s.literal(100), s.literal(200), s.literal(300)], {
          description: "100 all, 200 filtered, 300 specified talents.",
        }),
        pageIndex: s.positiveInteger("The 1-based page index.", { default: 1 }),
        pageSize: s.positiveInteger("Page size, at most 20.", { maximum: 20, default: 20 }),
      },
      ["productId"],
      "The product's existing promotion plans.",
    ),
    outputSchema: s.looseObject("The promotion plan page.", {
      total_num: s.integer("Total matching records."),
      continue_flag: s.boolean("Whether another page exists."),
      list: s.array(
        "Existing plan identifiers.",
        s.looseObject("One plan.", {
          promotion_plan_id: s.nullable(s.integer("The plan id.")),
          promotion_plan_type: s.nullable(s.integer("100 all, 200 filtered, 300 specified talents.")),
        }),
      ),
    }),
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "list_league_products",
    operationType: "read",
    description:
      "List existing alliance products and eligibility status. Pagination is bounded by pageSize multiplied by pageIndex <= 5000; no undocumented cursor is sent.",
    inputSchema: s.actionInput(
      {
        pageIndex: s.positiveInteger("The 1-based page index.", { default: 1 }),
        pageSize: s.positiveInteger("Page size, at most 100.", { maximum: 100, default: 20 }),
        productId: leaguePlanIdentity.productId,
        needTotalNum: s.boolean("Request the total count."),
      },
      [],
      "An alliance product page.",
    ),
    outputSchema: s.looseObject("Alliance products.", {
      items: s.array(
        "Products and eligibility.",
        s.looseObject("One alliance product.", {
          product_id: numericIdInput("The product id, returned as a number or numeric string."),
          status: leaguePlanStatus,
        }),
      ),
      has_more: s.boolean("Whether more products exist."),
      total_num: s.integer("Total products when requested."),
    }),
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "get_league_plan",
    operationType: "read",
    description:
      "Read an existing alliance plan's activation, eligibility and commission. The returned item.type uses legacy values 1/2/3; do not reuse it as request type 100/300.",
    inputSchema: s.actionInput(
      leaguePlanIdentity,
      ["type", "productId"],
      "An existing all-talent or specified-talent plan; include promotionPlanId to inspect a specific plan.",
    ),
    outputSchema: s.looseObject("Alliance plan detail.", {
      item: s.looseObject("The existing plan.", {
        product_id: s.union([s.integer("Product id as a number."), s.string("Product id as an upstream string.")]),
        type: s.integer("Legacy response type: 1 ordinary, 2 targeted, 3 exclusive; not request audience type."),
        status: leaguePlanStatus,
        ratio: s.number("Commission percentage, 0–90; not the 0–1000000 talent-data scale."),
        exclusive_info: s.looseObject("Upstream plan identity, timing and talent information."),
        ext_info: s.looseObject("Upstream restriction flags."),
      }),
    }),
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "invite_league_promoter",
    operationType: "write",
    description:
      "Invite one known talent to cooperate with the shop. This sends an external invitation: obtain approval for the exact recipient first. Supply promoterId or the deprecated finderId, never infer promoterId from talent_appid. Do not retry blindly after a timeout; WeChat rejects duplicate invitations within 24 hours and already-cooperating talents.",
    inputSchema: s.requireExactlyOneProperty(
      s.actionInput(
        {
          promoterId: s.nonEmptyString(
            "The verified talent promoter_id (talent selling id), not an unverified talent_appid or third-party id.",
          ),
          finderId: s.nonEmptyString(
            "The verified WeChat Channels finder_id. Deprecated upstream; prefer promoterId when known.",
          ),
        },
        [],
        "Exactly one verified invitation recipient.",
      ),
      ["promoterId", "finderId"],
    ),
    outputSchema: emptyOutputSchema,
    providerPermissions: [leaguePermission],
  }),
  defineProviderAction(service, {
    name: "update_league_plan",
    operationType: "write",
    description:
      "Change one existing alliance promotion plan: edit commission and activate (1), delist (2), or activate (4). Obtain approval for the exact plan and change first; activation or commission changes can incur commission spending. Read the plan before and after; no automatic fallback, audience changes, new plan creation or deletion is provided.",
    inputSchema: s.oneOf(
      [
        s.actionInput(
          {
            ...leaguePlanIdentity,
            operateType: s.literal(1, { description: "Edit commission and activate." }),
            ratio: s.number("Commission percentage, 0–90 (not the 0–1000000 read scale).", { minimum: 0, maximum: 90 }),
          },
          ["type", "productId", "promotionPlanId", "operateType", "ratio"],
          "Approved commission edit and activation.",
        ),
        s.actionInput(
          {
            ...leaguePlanIdentity,
            operateType: s.union([s.literal(2), s.literal(4)], {
              description: "2 = delist, 4 = activate. No commission fields accepted.",
            }),
          },
          ["type", "productId", "promotionPlanId", "operateType"],
          "Approved activation-state change only.",
        ),
      ],
      { description: "One approved existing-plan update; commission is required only for edit-and-activate." },
    ),
    outputSchema: s.looseObject("The upstream update result; inspect failures and reread actual state.", {
      promotion_plan_id: s.integer("The updated plan id."),
      fail_talent_appids: s.array(
        "Talents that failed to update; a nonempty list means partial failure.",
        s.string("A talent appid."),
      ),
    }),
    providerPermissions: [leaguePermission],
  }),
];
