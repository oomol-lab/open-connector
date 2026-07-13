import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "luckin_coffee";

export const luckinMcpToolNames = [
  "queryShopList",
  "searchProductForMcp",
  "switchProduct",
  "queryProductDetailInfo",
  "previewOrder",
  "createOrder",
  "queryOrderDetailInfo",
  "cancelOrder",
] as const;

export type LuckinCoffeeActionName = (typeof luckinMcpToolNames)[number];

const longitudeSchema = s.number("Longitude in decimal degrees.", { minimum: -180, maximum: 180 });
const latitudeSchema = s.number("Latitude in decimal degrees.", { minimum: -90, maximum: 90 });
const departmentIdSchema = s.positiveInteger("The Luckin Coffee store ID returned by `queryShopList`.");
const productIdSchema = s.positiveInteger("The Luckin Coffee product ID.");
const skuCodeSchema = s.nonEmptyString("The exact product SKU code.");

const shopSchema = s.looseObject("A Luckin Coffee store.", {
  deptId: s.integer("The store ID."),
  deptName: s.string("The store name."),
  address: s.string("The store address."),
  deptTags: s.stringArray("Store tags."),
  longitude: s.number("The store longitude."),
  latitude: s.number("The store latitude."),
  workTimeStart: s.string("The opening time."),
  workTimeEnd: s.string("The closing time."),
  distance: s.number("The distance from the requested coordinates in kilometers."),
  number: s.string("The store number."),
});

const productSubAttributeSchema = s.looseObject("One selectable product attribute value.", {
  attributeId: s.integer("The attribute value ID."),
  attributeName: s.string("The attribute value name."),
  selected: s.nullableBoolean("Whether this value is selected."),
  price: s.number("The price adjustment for this value."),
  canSelected: s.nullableNumber("Whether this value can be selected."),
});

const productAttributeSchema = s.looseObject("One product attribute group.", {
  attributeId: s.integer("The attribute group ID."),
  attributeName: s.string("The attribute group name."),
  productSubAttrs: s.array("Selectable values in this group.", productSubAttributeSchema),
});

const productSchema = s.looseObject("A Luckin Coffee product and its current configuration.", {
  productId: s.integer("The product ID."),
  productName: s.string("The product name."),
  skuCode: s.string("The configured product SKU code."),
  pictureUrl: s.string("The product image URL."),
  productAttrs: s.array("The product attribute groups.", productAttributeSchema),
  tags: s.nullable(s.stringArray("Product tags.")),
  initialPrice: s.number("The list price."),
  estimatePrice: s.number("The estimated final price."),
});

const orderProductInputSchema = s.requiredObject("One configured product in an order.", {
  amount: s.positiveInteger("The quantity to order."),
  productId: productIdSchema,
  skuCode: skuCodeSchema,
});

const orderProductOutputSchema = s.looseObject("One product in an order response.", {
  productId: s.integer("The product ID."),
  skuCode: s.string("The product SKU code."),
  name: s.string("The product name."),
  amount: s.integer("The ordered quantity."),
  additionDesc: s.string("The selected attribute summary."),
  bigPicUrl: s.nullableString("The large product image URL."),
  breviaryPicUrl: s.nullableString("The product thumbnail URL."),
  initPrice: s.number("The product list price."),
  estimatePrice: s.number("The estimated unit price."),
  estimateTotalPrice: s.number("The estimated line total."),
});

const granularCommoditySchema = s.looseObject("One order commodity price breakdown.", {
  commodityId: s.integer("The commodity ID."),
  commodityCode: s.string("The commodity code."),
  commodityName: s.string("The commodity name."),
  payableMoney: s.number("The payable amount."),
  payMoney: s.number("The paid amount."),
});

const previewOrderSchema = s.looseObject("A Luckin Coffee order preview.", {
  aboutTime: s.number("The estimated pickup or delivery timestamp."),
  discountPrice: s.number("The estimated amount to pay."),
  shopInfo: shopSchema,
  productInfoList: s.array("The configured products in the preview.", orderProductOutputSchema),
  couponCodeList: s.stringArray("Coupon codes selected by the preview."),
  orderGranularCommodityList: s.array("Per-commodity price details.", granularCommoditySchema),
  expressExpectTime: s.nullableNumber("The estimated delivery time."),
  privilegeMoney: s.number("The discount amount."),
  totalInitialPrice: s.number("The total list price."),
});

// Use s.object(..., { additionalProperties: true }) rather than s.looseObject here: this
// schema has a field literally named `description`, which s.looseObject's string-first form
// would misread as its options argument and silently drop every declared field.
const createOrderResultSchema = s.object(
  "The created Luckin Coffee order and payment details.",
  {
    orderId: s.number("The numeric order ID. Prefer `orderIdStr` when passing it to another action."),
    payOrderUrl: s.string("The WeChat payment URL."),
    payOrderQrCodeUrl: s.string("The payment QR-code URL."),
    discountPrice: s.number("The amount to pay."),
    needPay: s.boolean("Whether payment is required."),
    tradeNo: s.nullableString("The payment transaction number."),
    description: s.nullableString("Additional order information."),
    businessNotifyUrl: s.nullableString("The business notification URL."),
    subMchid: s.nullableString("The WeChat Pay sub-merchant ID."),
    orderIdStr: s.string("The order ID as a lossless string."),
  },
  { additionalProperties: true },
);

const takeMealCodeSchema = s.looseObject("Pickup-code information.", {
  code: s.string("The pickup code or its generation status."),
  takeOrderId: s.string("The pickup order ID."),
});

const dispatchInfoSchema = s.looseObject("Delivery information.", {
  dispatcherName: s.string("The courier name."),
  dispatcherMobile: s.string("The courier phone number."),
  dispatchAboutTime: s.string("The estimated delivery time."),
  destinationDistance: s.number("The remaining delivery distance."),
});

const orderDetailSchema = s.looseObject("Luckin Coffee order details.", {
  orderId: s.string("The order ID."),
  orderStatus: s.integer(
    "Order status: 10 pending payment, 20 placed, 30 preparing, 60 ready, 80 completed, 100 canceled.",
  ),
  orderStatusName: s.string("The localized order status name."),
  aboutTime: s.number("The estimated pickup or delivery timestamp."),
  takeMealTime: s.string("The actual pickup time."),
  takeMealCodeInfo: takeMealCodeSchema,
  shopInfo: shopSchema,
  productInfoList: s.nullable(s.array("Products in the order.", orderProductOutputSchema)),
  orderPayAmount: s.number("The paid order amount."),
  dispatchInfo: dispatchInfoSchema,
  orderCommodityList: s.array("Commodity price details.", granularCommoditySchema),
  orderType: s.string("The order type."),
  customerParams: s.nullable(s.unknownObject("Additional customer parameters.")),
});

function luckinResponse(description: string, data: JsonSchema): JsonSchema {
  return s.looseObject(description, {
    code: s.integer("The upstream result code. Zero indicates success."),
    msg: s.string("The upstream result message."),
    data,
    success: s.boolean("Whether the operation succeeded."),
  });
}

export const luckinCoffeeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "queryShopList",
    description: "Find nearby Luckin Coffee stores using a location and optional store name.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for finding Luckin Coffee stores.",
      {
        deptName: s.string("An optional store-name filter."),
        longitude: longitudeSchema,
        latitude: latitudeSchema,
      },
      { optional: ["deptName"] },
    ),
    outputSchema: luckinResponse("Nearby Luckin Coffee stores.", s.array("Matching stores.", shopSchema)),
    followUpActions: ["luckin_coffee.searchProductForMcp"],
  }),
  defineProviderAction(service, {
    name: "searchProductForMcp",
    description: "Search and recommend Luckin Coffee products at a specific store from the user's original request.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for searching Luckin Coffee products.", {
      deptId: departmentIdSchema,
      query: s.nonEmptyString("The user's original product request in natural language."),
    }),
    outputSchema: luckinResponse("Matching Luckin Coffee products.", s.array("Matching products.", productSchema)),
    followUpActions: ["luckin_coffee.queryProductDetailInfo", "luckin_coffee.switchProduct"],
  }),
  defineProviderAction(service, {
    name: "switchProduct",
    description: "Change a selectable attribute on a Luckin Coffee product and return the updated SKU and price.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for changing one product attribute.", {
      deptId: departmentIdSchema,
      productId: productIdSchema,
      skuCode: skuCodeSchema,
      attrOperationParam: s.requiredObject("The attribute operation to apply.", {
        attributeId: s.positiveInteger("The attribute group ID."),
        subAttr: s.requiredObject("The attribute value operation.", {
          attributeId: s.positiveInteger("The attribute value ID."),
          operation: s.integer("The operation code. Use 3 to select the value."),
        }),
      }),
      amount: s.positiveInteger("The product quantity."),
    }),
    outputSchema: luckinResponse("The updated product configuration.", productSchema),
    followUpActions: ["luckin_coffee.previewOrder"],
  }),
  defineProviderAction(service, {
    name: "queryProductDetailInfo",
    description: "Get the current details, attributes, SKU, and price for one Luckin Coffee product at a store.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for reading product details.", {
      deptId: departmentIdSchema,
      productId: productIdSchema,
    }),
    outputSchema: luckinResponse("Luckin Coffee product details.", productSchema),
    followUpActions: ["luckin_coffee.switchProduct", "luckin_coffee.previewOrder"],
  }),
  defineProviderAction(service, {
    name: "previewOrder",
    description: "Preview a Luckin Coffee order, including prices and available coupons, without creating it.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for previewing an order.", {
      deptId: departmentIdSchema,
      productList: s.array("The configured products to preview.", orderProductInputSchema, { minItems: 1 }),
    }),
    outputSchema: luckinResponse("The Luckin Coffee order preview.", previewOrderSchema),
    followUpActions: ["luckin_coffee.createOrder"],
  }),
  defineProviderAction(service, {
    name: "createOrder",
    description:
      "Create a real Luckin Coffee order that may require payment. Preview the order first and obtain the user's confirmation before calling this action.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a confirmed Luckin Coffee order.",
      {
        deptId: departmentIdSchema,
        productList: s.array("The configured products to order.", orderProductInputSchema, { minItems: 1 }),
        longitude: longitudeSchema,
        latitude: latitudeSchema,
        couponCodeList: s.stringArray("Coupon codes returned by `previewOrder`."),
        remark: s.string("An optional order note."),
      },
      { optional: ["couponCodeList", "remark"] },
    ),
    outputSchema: luckinResponse("The created Luckin Coffee order.", createOrderResultSchema),
    followUpActions: ["luckin_coffee.queryOrderDetailInfo", "luckin_coffee.cancelOrder"],
  }),
  defineProviderAction(service, {
    name: "queryOrderDetailInfo",
    description: "Get the current status, pickup details, products, payment, and delivery information for an order.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for reading Luckin Coffee order details.", {
      orderId: s.nonEmptyString("The lossless order ID string returned by `createOrder`."),
    }),
    outputSchema: luckinResponse("Luckin Coffee order details.", orderDetailSchema),
    followUpActions: ["luckin_coffee.cancelOrder"],
  }),
  defineProviderAction(service, {
    name: "cancelOrder",
    description:
      "Cancel a Luckin Coffee order. This changes a real order and may be irreversible; confirm the exact order with the user first.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for canceling a Luckin Coffee order.", {
      orderId: s.nonEmptyString("The exact order ID to cancel."),
    }),
    outputSchema: luckinResponse("The Luckin Coffee order cancellation result.", s.boolean("Whether it was canceled.")),
  }),
];
