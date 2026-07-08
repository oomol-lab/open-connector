import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mcdonalds_cn";

const flagString = s.stringEnum(["0", "1"], {
  description: "McDonald's China flag value: 0 for no, 1 for yes.",
});
const dateString = s.string({
  pattern: "^\\d{8}$",
  description: "Date in yyyyMMdd format. When omitted, McDonald's China defaults to the current day.",
});
const timeString = s.string({
  pattern: "^\\d{2}:\\d{2}$",
  description: "Time in HH:mm format. When omitted, McDonald's China defaults to the current time.",
});
const queryString = s.nonEmptyString("A McDonald's China query parameter value.");
const citySchema = s.object(
  {
    code: s.string("City code."),
    name: s.string("City name."),
    latitude: s.number("City center latitude."),
    longitude: s.number("City center longitude."),
  },
  {
    required: ["code", "name"],
    additionalProperties: true,
    description: "A McDonald's China city.",
  },
);
const daypartSchema = s.object(
  {
    daypartCode: s.integer("Daypart code."),
    daypartFlag: s.boolean("Whether this is the default daypart."),
    daypartName: s.string("Daypart name."),
    startTime: s.string("Daypart start time."),
    endTime: s.string("Daypart end time."),
  },
  {
    additionalProperties: true,
    description: "A store daypart.",
  },
);
const storeSchema = s.object(
  {
    code: s.string("Store code."),
    name: s.string("Store name."),
    shortName: s.string("Store short name."),
    beCode: s.string("Store business entity code."),
    beType: s.integer("Store business entity type."),
    cityCode: s.string("City code."),
    cityName: s.string("City name."),
    address: s.string("Store address."),
    latitude: s.number("Store latitude."),
    longitude: s.number("Store longitude."),
    businessStatus: s.integer("Business status code."),
    telephone: s.string("Store phone number."),
    distance: s.integer("Distance in meters."),
    distanceText: s.string("Human-readable distance."),
    dayparts: s.array("Available dayparts.", daypartSchema),
  },
  {
    additionalProperties: true,
    description: "A McDonald's China store.",
  },
);
const priceInfoSchema = s.object(
  {
    eatInPriceText: s.string("Eat-in price text in yuan."),
    takeOutPriceText: s.string("Take-out price text in yuan."),
    deliveryPriceText: s.string("Delivery price text in yuan."),
    eatInPrice: s.integer("Eat-in price in cents."),
    takeOutPrice: s.integer("Take-out price in cents."),
    deliveryPrice: s.integer("Delivery price in cents."),
    discountPrice: s.integer("Discount price in cents."),
    discountPriceText: s.string("Discount price text in yuan."),
    priceShowStyle: s.integer("Price display style."),
  },
  {
    additionalProperties: true,
    description: "McDonald's China product price information.",
  },
);
const productSchema = s.object(
  {
    productCode: s.string("Product code."),
    productName: s.string("Product name."),
    productLongName: s.string("Full product name."),
    productImage: s.url("Product image URL."),
    productType: s.integer("Product type code."),
    saleStatus: s.integer("Sale status code."),
    maxPurchaseQuantity: s.integer("Maximum purchase quantity."),
    priceInfo: priceInfoSchema,
    categoryCodeList: s.array("Category codes that include this product.", s.string()),
    tags: s.array("Product tags.", s.unknownObject("One product tag.")),
    groupList: s.array("Products in this group or combo.", s.unknownObject("One group item.")),
  },
  {
    additionalProperties: true,
    description: "A McDonald's China menu product.",
  },
);
const menuCategorySchema = s.object(
  {
    categoryCode: s.string("Menu category code."),
    categoryName: s.string("Menu category name."),
    image: s.url("Menu category image URL."),
    products: s.array("Products in this category.", productSchema),
  },
  {
    additionalProperties: true,
    description: "A McDonald's China menu category.",
  },
);
const productDetailSchema = s.object(
  {
    image: s.url("Product image URL."),
    code: s.string("Product code."),
    name: s.string("Product name."),
    longName: s.string("Full product name."),
    desc: s.string("Product description."),
    price: s.integer("Product price in cents."),
    priceText: s.string("Product price text in yuan."),
    type: s.integer("Product type code."),
    customizationMode: s.integer("Customization mode."),
    specTypes: s.array("Product spec groups.", s.unknownObject("One product spec group.")),
    choices: s.array("Product choices.", s.unknownObject("One product choice group.")),
  },
  {
    additionalProperties: true,
    description: "A McDonald's China product detail object.",
  },
);

const citiesDataSchema = s.object(
  {
    cities: s.array("Available cities.", citySchema),
    currentCity: citySchema,
  },
  {
    additionalProperties: true,
    description: "McDonald's China cities response data.",
  },
);
const storesDataSchema = s.object(
  {
    stores: s.array("Nearby stores.", storeSchema),
    storeList: s.array("Nearby stores.", storeSchema),
    datetime: s.string("Server datetime."),
  },
  {
    additionalProperties: true,
    description: "McDonald's China nearby store response data.",
  },
);
const menuDataSchema = s.object(
  {
    menu: s.array("Menu categories.", menuCategorySchema),
  },
  {
    additionalProperties: true,
    description: "McDonald's China menu response data.",
  },
);
const productDetailDataSchema = s.object(
  {
    maxPurchaseQuantity: s.integer("Maximum purchase quantity."),
    product: productDetailSchema,
  },
  {
    additionalProperties: true,
    description: "McDonald's China product detail response data.",
  },
);
const productSearchDataSchema = s.object(
  {
    maxPurchaseQuantity: s.integer("Maximum purchase quantity."),
    productList: s.array("Products matching the search.", productSchema),
  },
  {
    additionalProperties: true,
    description: "McDonald's China product search response data.",
  },
);

export type McdonaldsCnActionName =
  | "get_cities"
  | "search_stores"
  | "get_store"
  | "get_store_business"
  | "get_menu"
  | "get_product_detail"
  | "search_products";

export const mcdonaldsCnActions: Array<ProviderActionDefinition<McdonaldsCnActionName>> = [
  defineProviderAction(service, {
    name: "get_cities",
    description: "Get McDonald's China cities that support restaurant and menu lookup.",
    inputSchema: s.object(
      {
        getCurrent: flagString,
      },
      {
        optional: ["getCurrent"],
        description: "City lookup options.",
      },
    ),
    outputSchema: mcdonaldsEnvelope(citiesDataSchema, "McDonald's China city lookup result."),
  }),
  defineProviderAction(service, {
    name: "search_stores",
    description: "Search McDonald's China stores by delivery address, city, location, keyword, or order filters.",
    inputSchema: s.object(
      {
        addressId: queryString,
        beType: queryString,
        cityCode: queryString,
        date: dateString,
        distance: queryString,
        hotTagCode: queryString,
        isCityCenter: flagString,
        keyword: queryString,
        latitude: queryString,
        longitude: queryString,
        orderType: queryString,
        showType: queryString,
        time: timeString,
      },
      {
        optional: [
          "addressId",
          "beType",
          "cityCode",
          "date",
          "distance",
          "hotTagCode",
          "isCityCenter",
          "keyword",
          "latitude",
          "longitude",
          "orderType",
          "showType",
          "time",
        ],
        description: "Nearby store search filters.",
      },
    ),
    outputSchema: mcdonaldsEnvelope(storesDataSchema, "McDonald's China nearby store lookup result."),
    followUpActions: ["mcdonalds_cn.get_store", "mcdonalds_cn.get_store_business", "mcdonalds_cn.get_menu"],
  }),
  defineProviderAction(service, {
    name: "get_store",
    description: "Get one McDonald's China store by store code.",
    inputSchema: s.object(
      {
        storeCode: s.nonEmptyString("Store code."),
      },
      {
        required: ["storeCode"],
        description: "Store lookup input.",
      },
    ),
    outputSchema: mcdonaldsEnvelope(storeSchema, "McDonald's China store detail result."),
    followUpActions: ["mcdonalds_cn.get_store_business", "mcdonalds_cn.get_menu"],
  }),
  defineProviderAction(service, {
    name: "get_store_business",
    description: "Get McDonald's China business details for a store business entity code.",
    inputSchema: s.object(
      {
        beCode: s.nonEmptyString("Store business entity code."),
        date: dateString,
        isGroupMeal: flagString,
        time: timeString,
      },
      {
        required: ["beCode"],
        optional: ["date", "isGroupMeal", "time"],
        description: "Store business detail input.",
      },
    ),
    outputSchema: mcdonaldsEnvelope(storeSchema, "McDonald's China store business detail result."),
    followUpActions: ["mcdonalds_cn.get_menu"],
  }),
  defineProviderAction(service, {
    name: "get_menu",
    description: "Get a McDonald's China store menu for an order type, daypart, and sales channel.",
    inputSchema: s.object(
      {
        storeCode: s.nonEmptyString("Store code."),
        channelCode: s.nonEmptyString("Sales channel code."),
        orderType: s.integer("Order type."),
        dayPartCode: s.integer("Daypart code."),
        beCode: queryString,
        date: dateString,
        time: timeString,
        isGroupMeal: s.integer({
          minimum: 0,
          maximum: 1,
          description: "Group meal flag: 0 for no, 1 for yes.",
        }),
      },
      {
        required: ["storeCode", "channelCode", "orderType", "dayPartCode"],
        optional: ["beCode", "date", "time", "isGroupMeal"],
        description: "Menu lookup input.",
      },
    ),
    outputSchema: mcdonaldsEnvelope(menuDataSchema, "McDonald's China menu result."),
    followUpActions: ["mcdonalds_cn.get_product_detail", "mcdonalds_cn.search_products"],
  }),
  defineProviderAction(service, {
    name: "get_product_detail",
    description: "Get detailed McDonald's China menu product information.",
    inputSchema: s.object(
      {
        code: s.nonEmptyString("Product code."),
        storeCode: s.nonEmptyString("Store code."),
        channelCode: s.nonEmptyString("Sales channel code."),
        daypartCode: queryString,
        orderType: queryString,
        beCode: queryString,
        cardId: queryString,
        date: dateString,
        time: timeString,
        isGroupMeal: flagString,
      },
      {
        required: ["code", "storeCode", "channelCode", "daypartCode", "orderType"],
        optional: ["beCode", "cardId", "date", "time", "isGroupMeal"],
        description: "Product detail lookup input.",
      },
    ),
    outputSchema: mcdonaldsEnvelope(productDetailDataSchema, "McDonald's China product detail result."),
  }),
  defineProviderAction(service, {
    name: "search_products",
    description: "Search McDonald's China menu products for one store, daypart, and order type.",
    inputSchema: s.object(
      {
        keyword: s.nonEmptyString("Search keyword."),
        storeCode: s.nonEmptyString("Store code."),
        daypartCode: queryString,
        orderType: queryString,
        beCode: queryString,
        date: dateString,
        time: timeString,
        isGroupMeal: flagString,
      },
      {
        required: ["keyword", "storeCode", "daypartCode", "orderType"],
        optional: ["beCode", "date", "time", "isGroupMeal"],
        description: "Product search input.",
      },
    ),
    outputSchema: mcdonaldsEnvelope(productSearchDataSchema, "McDonald's China product search result."),
    followUpActions: ["mcdonalds_cn.get_product_detail"],
  }),
];

function mcdonaldsEnvelope(dataSchema: JsonSchema, description: string): JsonSchema {
  return s.object(
    {
      traceId: s.string("McDonald's China trace identifier."),
      datetime: s.string("Server datetime."),
      code: s.integer("Provider status code."),
      data: dataSchema,
      success: s.boolean("Whether the provider request succeeded."),
      message: s.string("Provider status message."),
    },
    {
      required: ["code", "data"],
      optional: ["traceId", "datetime", "success", "message"],
      additionalProperties: true,
      description,
    },
  );
}
