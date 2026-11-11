import type { JustoneapiEndpoint } from "./endpoint-definition.ts";

import { s } from "../../core/json-schema.ts";

const shopeeSite = s.withEnum(
  s.string("Shopee marketplace site.\n\nAvailable Values:\n- `TW`: Taiwan\n- `ID`: Indonesia\n- `TH`: Thailand", {
    minLength: 1,
  }),
  ["TW", "ID", "TH"],
);
const amazonCountries = [
  "US",
  "AU",
  "BR",
  "CA",
  "CN",
  "FR",
  "DE",
  "IN",
  "IT",
  "MX",
  "NL",
  "SG",
  "ES",
  "TR",
  "AE",
  "GB",
  "JP",
  "SA",
  "PL",
  "SE",
  "BE",
  "EG",
  "ZA",
  "IE",
];
const amazonCountryDescription =
  "Country code for the Amazon product.\n\nAvailable Values:\n- `US`: United States\n- `AU`: Australia\n- `BR`: Brazil\n- `CA`: Canada\n- `CN`: China\n- `FR`: France\n- `DE`: Germany\n- `IN`: India\n- `IT`: Italy\n- `MX`: Mexico\n- `NL`: Netherlands\n- `SG`: Singapore\n- `ES`: Spain\n- `TR`: Turkey\n- `AE`: United Arab Emirates\n- `GB`: United Kingdom\n- `JP`: Japan\n- `SA`: Saudi Arabia\n- `PL`: Poland\n- `SE`: Sweden\n- `BE`: Belgium\n- `EG`: Egypt\n- `ZA`: South Africa\n- `IE`: Ireland";
const amazonCountry = s.withDefault(s.withEnum(s.string(amazonCountryDescription), amazonCountries), "US");

export const commerceEndpoints: readonly JustoneapiEndpoint[] = [
  {
    name: "taobao_and_tmall_product_details",
    method: "GET",
    path: "/api/taobao/get-item-detail/v9",
    authLocation: "query",
    description:
      "Retrieves Taobao or Tmall product details by item ID through the V9 endpoint. Use it to perform direct product lookup for catalog research, product monitoring, or ecommerce analysis.",
    inputSchema: s.object(
      "Input for Taobao and Tmall Product Details.",
      {
        itemId: s.string("Unique product identifier on Taobao/Tmall (item ID).", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "taobao_and_tmall_product_reviews",
    method: "GET",
    path: "/api/taobao/get-item-comment/v3",
    authLocation: "query",
    description:
      "Retrieves Taobao and Tmall product reviews by item ID with page-based pagination and configurable sorting. Use it to analyze customer feedback.",
    inputSchema: s.object(
      "Input for Taobao and Tmall Product Reviews.",
      {
        itemId: s.string("Unique product identifier on Taobao/Tmall (item ID).", { minLength: 1 }),
        orderType: s.withDefault(
          s.withEnum(
            s.string(
              "Sort order for the result set.\n\nAvailable Values:\n- `feedbackdate`: Sort by feedback date\n- `general`: General sorting",
            ),
            ["feedbackdate", "general"],
          ),
          "feedbackdate",
        ),
        page: s.integer("Page number for pagination.", { default: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "taobao_and_tmall_product_questions",
    method: "GET",
    path: "/api/taobao/get-social-feed/v1",
    authLocation: "query",
    description:
      "Retrieves the Taobao or Tmall product social feed by item ID with page-based pagination. Use it to review product questions and related discussion during customer-concern or product research.",
    inputSchema: s.object(
      "Input for Taobao and Tmall Product Questions.",
      {
        itemId: s.string("Unique product identifier on Taobao/Tmall (item ID).", { minLength: 1 }),
        page: s.integer("Page number for pagination.", { default: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "taobao_and_tmall_shop_product_list",
    method: "GET",
    path: "/api/taobao/get-shop-item-list/v5",
    authLocation: "query",
    description:
      "Retrieves products from a Taobao shop by seller ID and shop ID, with optional shop-category filtering, keyword search, sorting, and page-based pagination. Use it to browse a shop catalog or find matching products within a shop.",
    inputSchema: s.object(
      "Shop Product List input.",
      {
        sellerId: s.string("Taobao seller user ID associated with the shop."),
        shopId: s.string("Taobao shop ID associated with the seller."),
        catId: s.string("Shop category ID from Shop Detail. Omit to include all shop categories."),
        keyword: s.string(
          "Keyword to search for products within the shop. Omit to list products without a keyword filter.",
        ),
        sort: s.withEnum(
          s.string(
            "Product sort order.\n\nAvailable Values:\n- `comprehensive`: Comprehensive sorting\n- `sales`: Sort by sales volume\n- `new`: Sort by new arrivals, newest first\n- `price-asc`: Price, lowest first\n- `price-desc`: Price, highest first",
            { default: "comprehensive" },
          ),
          ["comprehensive", "sales", "new", "price-asc", "price-desc"],
        ),
        page: s.integer("Page number, starting from 1.", { format: "int32", default: 1 }),
      },
      { required: ["sellerId", "shopId"] },
    ),
  },
  {
    name: "taobao_and_tmall_product_search",
    method: "GET",
    path: "/api/taobao/search-item-list/v2",
    authLocation: "query",
    description:
      "Searches Taobao and Tmall products by keyword with page-based pagination and returns results sorted by sales. Use it to discover popular products for ecommerce research, catalog analysis, or product selection.",
    inputSchema: s.object(
      "Input for Taobao and Tmall Product Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.integer("Page number for pagination, starting from 1.", { default: 1 }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "xiaohongshu_e_commerce_rednote_product_search",
    method: "GET",
    path: "/api/xiaohongshu-ec/search-products/v1",
    authLocation: "query",
    description:
      "Searches Xiaohongshu E-commerce (RedNote) products by keyword with page and search-ID pagination; pages after the first require the search ID returned by the initial search. Use it to discover marketplace products and continue through multi-page results.",
    inputSchema: s.object(
      "Input for Xiaohongshu E-commerce (RedNote) Product Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.string("Page number, starting from 1."),
        searchId: s.string("Search ID returned by the first-page response; required when page is greater than 1.", {
          default: "",
        }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "douyin_e_commerce_item_details",
    method: "GET",
    path: "/api/douyin-ec/get-item-detail/v2",
    authLocation: "query",
    description:
      "Retrieves Douyin E-commerce product details by item ID. Use it to inspect a known marketplace item for catalog or product research.",
    inputSchema: s.object(
      "Input for Douyin E-commerce Item Details.",
      {
        itemId: s.string("The unique ID of the item on Douyin E-commerce.", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "douyin_e_commerce_product_sku_info",
    method: "GET",
    path: "/api/douyin-ec/get-item-sku-info/v2",
    authLocation: "query",
    description:
      "Retrieves SKU information for a Douyin E-commerce product by item ID. Returns code 202 when the product is not supported.",
    inputSchema: s.object(
      "Input for Douyin E-commerce Product SKU Info.",
      {
        itemId: s.string("The unique ID of the item on Douyin E-commerce.", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "douyin_e_commerce_product_search",
    method: "GET",
    path: "/api/douyin-ec/search-item-list/v1",
    authLocation: "query",
    description:
      "Searches Douyin E-commerce products by keyword with page and search-ID pagination. Use it to discover marketplace products and continue a multi-page search.",
    inputSchema: s.object(
      "Input for Douyin E-commerce Product Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.string("Page number for pagination."),
        searchId: s.string("Search ID; use the search_id value returned by the last response for subsequent pages.", {
          default: "",
        }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "douyin_e_commerce_item_comments",
    method: "GET",
    path: "/api/douyin-ec/get-item-comments/v1",
    authLocation: "query",
    description:
      "Retrieves paginated customer comments for a Douyin E-commerce product by item ID. Use it to review product feedback for a known marketplace item.",
    inputSchema: s.object(
      "Input for Douyin E-commerce Item Comments.",
      {
        itemId: s.string("The unique ID of the item on Douyin E-commerce.", { minLength: 1 }),
        page: s.string("Page number for paginated comments."),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "douyin_e_commerce_shop_product_list",
    method: "GET",
    path: "/api/douyin-ec/get-shop-item-list/v1",
    authLocation: "query",
    description:
      "Retrieves a paginated product list for a Douyin E-commerce shop by shop ID. Use it to browse a known seller's marketplace catalog page by page.",
    inputSchema: s.object(
      "Input for Douyin E-commerce Shop Product List.",
      {
        shopId: s.string("The unique ID of the shop on Douyin E-commerce.", { minLength: 1 }),
        page: s.string("Page number for pagination."),
      },
      { required: ["shopId"] },
    ),
  },
  {
    name: "jdcom_product_details",
    method: "GET",
    path: "/api/jd/get-item-detail/v4",
    authLocation: "query",
    description:
      "Retrieve JD.com product details by item ID, including a complete set of product images. Use it to review product information and images for catalog research or ecommerce analysis.",
    inputSchema: s.object(
      "Input for JD.com Product Details.",
      {
        itemId: s.string("A unique product identifier on JD.com (item ID).", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "jdcom_product_price",
    method: "GET",
    path: "/api/jd/get-item-price/v2",
    authLocation: "query",
    description:
      "Retrieve JD.com product prices for up to 10 comma-separated item IDs in one request. Use it for batch price checks and catalog comparisons.",
    inputSchema: s.object(
      "Product Price input.",
      { itemIds: s.string("Between 1 and 10 numeric JD.com item IDs, separated by commas without spaces.") },
      { required: ["itemIds"] },
    ),
  },
  {
    name: "jdcom_product_search",
    method: "GET",
    path: "/api/jd/search-item-list/v1",
    authLocation: "query",
    description:
      "Search JD.com products by keyword with page-based pagination. Use it to discover products and collect item IDs for follow-up lookups.",
    inputSchema: s.object(
      "Input for JD.com Product Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.string("Page number for pagination."),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "jdcom_shop_product_list",
    method: "GET",
    path: "/api/jd/get-shop-item-list/v1",
    authLocation: "query",
    description:
      "Retrieve a page of products from a JD.com shop identified by shop ID. Use it to browse a seller's catalog and collect item IDs for follow-up lookups.",
    inputSchema: s.object(
      "Input for JD.com Shop Product List.",
      {
        shopId: s.string("A unique shop identifier on JD.com (Shop ID).", { minLength: 1 }),
        page: s.string("Page number for the paginated shop product list."),
      },
      { required: ["shopId"] },
    ),
  },
  {
    name: "xianyu_goofish_product_search",
    method: "GET",
    path: "/api/xianyu/search-item-list/v1",
    authLocation: "query",
    description:
      "Searches Xianyu (GooFish) second-hand listings by keyword with page and sort controls. Use it to discover resale items by activity, recency, seller credit, price, or listing time.",
    inputSchema: s.object(
      "Input for Xianyu (GooFish) Product Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.string("Page number for pagination. The first page is 1."),
        sort: s.withDefault(
          s.withEnum(
            s.string(
              "Sort order for Xianyu search results.\n\nAvailable Values:\n- `active`: Active listings first.\n- `recent`: Recent nearby or position-based results first.\n- `credit`: Seller credit first.\n- `price_asc`: Lowest price first.\n- `price_desc`: Highest price first.\n- `price_drop`: Reduced-price listings first.\n- `newest`: Newly listed items first.",
            ),
            ["active", "recent", "credit", "price_asc", "price_desc", "price_drop", "newest"],
          ),
          "active",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "xianyu_goofish_product_details",
    method: "GET",
    path: "/api/xianyu/get-item-detail/v1",
    authLocation: "query",
    description:
      "Retrieves the public detail for a Xianyu (GooFish) second-hand listing by item ID. Use it to inspect a known resale item after search or link discovery.",
    inputSchema: s.object(
      "Input for Xianyu (GooFish) Product Details.",
      {
        itemId: s.string("A unique product identifier on Xianyu.", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "1688_product_details",
    method: "GET",
    path: "/api/1688/get-item-detail/v2",
    authLocation: "query",
    description:
      "Retrieves 1688 product details by item ID with an optional output language and dropshipping scene. Use it to inspect a known product during sourcing and catalog research.",
    inputSchema: s.object(
      "Product Details input.",
      {
        itemId: s.string("1688 product ID."),
        scene: s.withEnum(
          s.string("Optional dropshipping pricing scene.\n\nAvailable Values:\n- `drop_shipping`: Dropshipping"),
          ["drop_shipping"],
        ),
        optimizeTitle: s.boolean({
          description: "Optimize Chinese titles by removing non-core words.",
          default: false,
        }),
        language: s.withEnum(
          s.string(
            "Output language.\n\nAvailable Values:\n- `en`: English\n- `zh`: Chinese\n- `ru`: Russian\n- `th`: Thai\n- `pt`: Portuguese\n- `es`: Spanish\n- `tr`: Turkish\n- `vi`: Vietnamese\n- `ja`: Japanese\n- `ko`: Korean",
            { default: "zh" },
          ),
          ["en", "zh", "ru", "th", "pt", "es", "tr", "vi", "ja", "ko"],
        ),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "1688_product_search",
    method: "GET",
    path: "/api/1688/search-item-list/v2",
    authLocation: "query",
    description:
      "Searches 1688 products by keyword with pagination, sorting, price ranges and optional sourcing filters. Use it to discover products during procurement and market research.",
    inputSchema: s.object(
      "Product Search input.",
      {
        keyword: s.string("Search keyword."),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        sort: s.withEnum(
          s.string(
            "Product sort order.\n\nAvailable Values:\n- `default`: Default order\n- `sales`: Sales order\n- `price_up`: Price ascending\n- `price_down`: Price descending",
            { default: "default" },
          ),
          ["default", "sales", "price_up", "price_down"],
        ),
        moq: s.integer("Minimum order quantity filter.", { format: "int32" }),
        priceStart: s.string("Minimum price filter in CNY."),
        priceEnd: s.string("Maximum price filter in CNY."),
        newArrival: s.boolean({ description: "Filter for new products." }),
        supportDropshipping: s.boolean({ description: "Filter for support for dropshipping." }),
        freeShipping: s.boolean({ description: "Filter for free shipping." }),
        isSuperFactory: s.boolean({ description: "Optional super-factory filter." }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "aliexpress_product_search",
    method: "GET",
    path: "/api/aliexpress/search-products/v1",
    authLocation: "query",
    description:
      "Searches AliExpress products with optional query, page, sort, category, brand, location, attribute, price, locale, region, and currency controls. Use it for product discovery, catalog research, and marketplace assortment analysis.",
    inputSchema: s.object(
      "Input for AliExpress Product Search.",
      {
        q: s.string("Product search query."),
        page: s.string("One-based page number for pagination."),
        sort: s.withDefault(
          s.withEnum(
            s.string(
              "Sort order for product search results.\n\nAvailable Values:\n- `default`: Default result order\n- `salesDesc`: Sales volume, highest first\n- `priceAsc`: Price, lowest first\n- `priceDesc`: Price, highest first",
            ),
            ["default", "salesDesc", "priceAsc", "priceDesc"],
          ),
          "default",
        ),
        catId: s.string("Category ID used to filter product search results."),
        brandId: s.string("Brand ID used to filter product search results."),
        loc: s.string("Location filter for product search results."),
        switches: s.string("Search switches used to select optional result features."),
        attr: s.string("Product attribute filter for search results."),
        startPrice: s.number("Minimum product price filter, inclusive."),
        endPrice: s.number("Maximum product price filter, inclusive."),
        locale: s.string("Locale used for the AliExpress response."),
        region: s.string("AliExpress marketplace region."),
        currency: s.string("Currency code used for product prices."),
      },
      { required: [] },
    ),
  },
  {
    name: "aliexpress_product_overview",
    method: "GET",
    path: "/api/aliexpress/get-product-detail/v1",
    authLocation: "query",
    description:
      "Retrieves an AliExpress product overview by item ID for the United States or global site. Use it to inspect a known listing for catalog review or search snippets.",
    inputSchema: s.object(
      "Input for AliExpress Product Overview.",
      {
        itemId: s.string("Numeric AliExpress item ID.", { minLength: 1 }),
        site: s.withDefault(
          s.withEnum(
            s.string(
              "AliExpress site: US (default) or GLO (global).\n\nAvailable Values:\n- `GLO`: Global site\n- `US`: United States site",
            ),
            ["GLO", "US"],
          ),
          "US",
        ),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "shopee_item_details",
    method: "GET",
    path: "/api/shopee/get-item-detail/v2",
    authLocation: "query",
    description:
      "Retrieves Shopee item details by marketplace site, shop ID, and item ID using the version 2 data source.",
    inputSchema: s.object(
      "Input for Shopee Item Details.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "shopee_shop_profile_and_rating_summary",
    method: "GET",
    path: "/api/shopee/get-shop-seo/v1",
    authLocation: "query",
    description: "Retrieves a Shopee shop profile and rating summary by marketplace site and shop ID.",
    inputSchema: s.object(
      "Input for Shopee Shop Profile and Rating Summary.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
      },
      { required: ["site", "shopId"] },
    ),
  },
  {
    name: "shopee_shop_item_list",
    method: "GET",
    path: "/api/shopee/get-shop-item-list/v1",
    authLocation: "query",
    description: "Retrieves Shopee item cards for a shop username in the selected marketplace site.",
    inputSchema: s.object(
      "Input for Shopee Shop Item List.",
      {
        site: shopeeSite,
        username: s.string("Shopee shop username.", { minLength: 1 }),
      },
      { required: ["site", "username"] },
    ),
  },
  {
    name: "shopee_item_sku_matrix",
    method: "GET",
    path: "/api/shopee/get-item-sku-matrix/v1",
    authLocation: "query",
    description: "Retrieves the SKU option matrix for a Shopee item in the selected marketplace site.",
    inputSchema: s.object(
      "Input for Shopee Item SKU Matrix.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "shopee_item_sku_models",
    method: "GET",
    path: "/api/shopee/get-item-sku-models/v1",
    authLocation: "query",
    description: "Retrieves observed SKU models for a Shopee item with offset and rating filters.",
    inputSchema: s.object(
      "Input for Shopee Item SKU Models.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
        offset: s.string("Zero-based result offset."),
        ratingType: s.string("Rating filter from 0 to 5, where 0 includes all ratings."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "shopee_shop_basic_profile",
    method: "GET",
    path: "/api/shopee/get-shop-base/v1",
    authLocation: "query",
    description: "Retrieves the basic Shopee shop profile by username and marketplace site.",
    inputSchema: s.object(
      "Input for Shopee Shop Basic Profile.",
      {
        site: shopeeSite,
        username: s.string("Shopee shop username.", { minLength: 1 }),
      },
      { required: ["site", "username"] },
    ),
  },
  {
    name: "shopee_item_search",
    method: "GET",
    path: "/api/shopee/search-item-list/v1",
    authLocation: "query",
    description: "Searches Shopee items by keyword in the selected marketplace site.",
    inputSchema: s.object(
      "Input for Shopee Item Search.",
      {
        site: shopeeSite,
        keyword: s.string("Product search keyword.", { minLength: 1 }),
      },
      { required: ["site", "keyword"] },
    ),
  },
  {
    name: "shopee_shop_details",
    method: "GET",
    path: "/api/shopee/get-shop-detail/v1",
    authLocation: "query",
    description: "Retrieves detailed Shopee shop information by username and marketplace site.",
    inputSchema: s.object(
      "Input for Shopee Shop Details.",
      {
        site: shopeeSite,
        username: s.string("Shopee shop username.", { minLength: 1 }),
      },
      { required: ["site", "username"] },
    ),
  },
  {
    name: "shopee_rich_shop_reviews",
    method: "GET",
    path: "/api/shopee/get-shop-reviews-rich/v1",
    authLocation: "query",
    description: "Retrieves enriched Shopee shop reviews using a zero-based result offset.",
    inputSchema: s.object(
      "Input for Shopee Rich Shop Reviews.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        offset: s.string("Zero-based result offset."),
      },
      { required: ["site", "shopId"] },
    ),
  },
  {
    name: "shopee_item_display_snapshot",
    method: "GET",
    path: "/api/shopee/get-item-snapshot/v1",
    authLocation: "query",
    description: "Retrieves a display snapshot for a Shopee item in the selected marketplace site.",
    inputSchema: s.object(
      "Input for Shopee Item Display Snapshot.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "shopee_shop_reviews",
    method: "GET",
    path: "/api/shopee/get-shop-reviews/v1",
    authLocation: "query",
    description: "Retrieves Shopee shop reviews with offset pagination and a rating filter.",
    inputSchema: s.object(
      "Input for Shopee Shop Reviews.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        offset: s.string("Zero-based result offset."),
        ratingType: s.string("Rating filter from 0 to 5, where 0 includes all ratings."),
      },
      { required: ["site", "shopId"] },
    ),
  },
  {
    name: "shopee_item_reviews",
    method: "GET",
    path: "/api/shopee/get-item-reviews/v1",
    authLocation: "query",
    description: "Retrieves reviews for a specified Shopee item with offset pagination and a rating filter.",
    inputSchema: s.object(
      "Input for Shopee Item Reviews.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
        offset: s.string("Zero-based result offset."),
        ratingType: s.string("Rating filter from 0 to 5, where 0 includes all ratings."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "shopee_shop_categories",
    method: "GET",
    path: "/api/shopee/get-shop-categories/v1",
    authLocation: "query",
    description: "Retrieves Shopee shop categories using a zero-based result offset.",
    inputSchema: s.object(
      "Input for Shopee Shop Categories.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        offset: s.string("Zero-based result offset."),
      },
      { required: ["site", "shopId"] },
    ),
  },
  {
    name: "shopee_item_review_model_distribution",
    method: "GET",
    path: "/api/shopee/get-item-review-models/v1",
    authLocation: "query",
    description: "Retrieves the review distribution across SKU models for a Shopee item.",
    inputSchema: s.object(
      "Input for Shopee Item Review Model Distribution.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "shopee_item_review_tags",
    method: "GET",
    path: "/api/shopee/get-item-review-tags/v1",
    authLocation: "query",
    description: "Retrieves review tags for a Shopee item in the selected marketplace site.",
    inputSchema: s.object(
      "Input for Shopee Item Review Tags.",
      {
        site: shopeeSite,
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "shopee_search_category_facets",
    method: "GET",
    path: "/api/shopee/get-search-facets/v1",
    authLocation: "query",
    description: "Retrieves category facets for a Shopee product search keyword.",
    inputSchema: s.object(
      "Input for Shopee Search Category Facets.",
      {
        site: shopeeSite,
        keyword: s.string("Product search keyword.", { minLength: 1 }),
      },
      { required: ["site", "keyword"] },
    ),
  },
  {
    name: "shopee_item_installments_and_amounts",
    method: "GET",
    path: "/api/shopee/get-item-installments/v1",
    authLocation: "query",
    description:
      "Retrieves installment and amount information for a Shopee item. This operation supports Taiwan and Indonesia but not Thailand.",
    inputSchema: s.object(
      "Input for Shopee Item Installments and Amounts.",
      {
        site: s.withEnum(
          s.string(
            "Shopee marketplace site. Taiwan and Indonesia are supported for this operation.\n\nAvailable Values:\n- `TW`: Taiwan\n- `ID`: Indonesia\n- `TH`: Thailand",
            { minLength: 1 },
          ),
          ["TW", "ID", "TH"],
        ),
        shopId: s.integer("Shopee shop ID."),
        itemId: s.integer("Shopee item ID."),
        detailLevel: s.string("Detail level for the installment response."),
      },
      { required: ["site", "shopId", "itemId"] },
    ),
  },
  {
    name: "tiktok_shop_product_search",
    method: "GET",
    path: "/api/tiktok-shop/search-products/v1",
    authLocation: "query",
    description:
      "Searches TikTok Shop products by keyword within a selected region, with offset and page-token pagination. Use it to discover regional products and continue through search results.",
    inputSchema: s.object(
      "Input for TikTok Shop Product Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        region: s.withDefault(
          s.withEnum(
            s.string(
              "Target region for product search.\n\nAvailable Values:\n- `US`: United States\n- `GB`: United Kingdom\n- `FR`: France\n- `SG`: Singapore\n- `MY`: Malaysia\n- `PH`: Philippines\n- `TH`: Thailand\n- `VN`: Vietnam\n- `ID`: Indonesia",
            ),
            ["US", "GB", "FR", "SG", "MY", "PH", "TH", "VN", "ID"],
          ),
          "US",
        ),
        offset: s.integer("Search result offset.", { default: 0 }),
        pageToken: s.string("Pagination token for the next page."),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "tiktok_shop_product_details",
    method: "GET",
    path: "/api/tiktok-shop/get-product-detail/v1",
    authLocation: "query",
    description:
      "Retrieves the public TikTok Shop product detail for a product ID in a selected region. Use it to inspect a known regional product after search or catalog discovery.",
    inputSchema: s.object(
      "Input for TikTok Shop Product Details.",
      {
        productId: s.string("TikTok Shop Product ID.", { minLength: 1 }),
        region: s.withDefault(
          s.withEnum(
            s.string(
              "Target region for product detail.\n\nAvailable Values:\n- `US`: United States\n- `GB`: United Kingdom\n- `FR`: France\n- `SG`: Singapore\n- `MY`: Malaysia\n- `PH`: Philippines\n- `TH`: Thailand\n- `VN`: Vietnam\n- `ID`: Indonesia",
            ),
            ["US", "GB", "FR", "SG", "MY", "PH", "TH", "VN", "ID"],
          ),
          "US",
        ),
      },
      { required: ["productId"] },
    ),
  },
  {
    name: "amazon_product_search",
    method: "GET",
    path: "/api/amazon/search-products/v1",
    authLocation: "query",
    description:
      "Searches Amazon marketplace products by keyword or ASIN with country, sort, condition, Prime-only, deals, and page controls. Use it to discover products for catalog research, price comparison, or competitive assortment analysis.",
    inputSchema: s.object(
      "Input for Amazon Product Search.",
      {
        keyword: s.string("Search keyword or ASIN to find Amazon products.", { minLength: 1 }),
        country: s.withDefault(
          s.withEnum(
            s.string(
              amazonCountryDescription.replace(
                "Country code for the Amazon product.",
                "Country code for the Amazon marketplace.",
              ),
            ),
            amazonCountries,
          ),
          "US",
        ),
        sortBy: s.withDefault(
          s.withEnum(
            s.string(
              "Sort order for Amazon product search results.\n\nAvailable Values:\n- `RELEVANCE`: Relevance\n- `LOWEST_PRICE`: Lowest Price\n- `HIGHEST_PRICE`: Highest Price\n- `REVIEWS`: Reviews\n- `NEWEST`: Newest\n- `BEST_SELLERS`: Best Sellers",
            ),
            ["RELEVANCE", "LOWEST_PRICE", "HIGHEST_PRICE", "REVIEWS", "NEWEST", "BEST_SELLERS"],
          ),
          "RELEVANCE",
        ),
        productCondition: s.withDefault(
          s.withEnum(
            s.string(
              "Product condition filter for Amazon search results.\n\nAvailable Values:\n- `ALL`: All product conditions\n- `NEW`: New products\n- `USED`: Used products\n- `RENEWED`: Renewed products\n- `COLLECTIBLE`: Collectible products",
            ),
            ["ALL", "NEW", "USED", "RENEWED", "COLLECTIBLE"],
          ),
          "ALL",
        ),
        isPrime: s.boolean({
          description: "Whether to return only Prime-eligible products.",
          default: false,
        }),
        dealsAndDiscounts: s.withDefault(
          s.withEnum(
            s.string(
              "Deals and discounts filter for Amazon search results.\n\nAvailable Values:\n- `NONE`: Do not filter by deals or discounts\n- `ALL_DISCOUNTS`: Return discounted products\n- `TODAYS_DEALS`: Return today's deals",
            ),
            ["NONE", "ALL_DISCOUNTS", "TODAYS_DEALS"],
          ),
          "NONE",
        ),
        page: s.integer("Page number for pagination.", { default: 1 }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "amazon_product_details",
    method: "GET",
    path: "/api/amazon/get-product-detail/v1",
    authLocation: "query",
    description:
      "Retrieves details for an Amazon product identified by ASIN in a selected country marketplace. Use it to look up a known listing for catalog review, product comparison, or downstream commerce analysis.",
    inputSchema: s.object(
      "Input for Amazon Product Details.",
      {
        asin: s.string("ASIN (Amazon Standard Identification Number).", { minLength: 1 }),
        country: amazonCountry,
      },
      { required: ["asin"] },
    ),
  },
  {
    name: "amazon_product_top_reviews",
    method: "GET",
    path: "/api/amazon/get-product-top-reviews/v1",
    authLocation: "query",
    description:
      "Retrieves the top reviews for an Amazon product identified by ASIN in a selected country marketplace. Use it to review prominent customer feedback for product research, sentiment analysis, or quality assessment.",
    inputSchema: s.object(
      "Input for Amazon Product Top Reviews.",
      {
        asin: s.string("ASIN (Amazon Standard Identification Number).", { minLength: 1 }),
        country: amazonCountry,
      },
      { required: ["asin"] },
    ),
  },
  {
    name: "amazon_best_sellers",
    method: "GET",
    path: "/api/amazon/get-best-sellers/v1",
    authLocation: "query",
    description:
      "Retrieves paginated Amazon Best Sellers for a category path in a selected country marketplace. Use it to study category leaders, discover popular products, or compare bestseller pages across marketplaces.",
    inputSchema: s.object(
      "Input for Amazon Best Sellers.",
      {
        category: s.string(
          "Best Sellers category path taken from an Amazon Best Sellers URL. It may be a category slug or a nested category path.",
          { minLength: 1 },
        ),
        country: amazonCountry,
        page: s.integer("Page number for pagination.", { default: 1 }),
      },
      { required: ["category"] },
    ),
  },
  {
    name: "amazon_products_by_category",
    method: "GET",
    path: "/api/amazon/get-category-products/v1",
    authLocation: "query",
    description:
      "Retrieves paginated Amazon products for a numeric category node in a selected country marketplace, with configurable result sorting. Use it to browse a category, compare assortments, or collect category-specific product candidates.",
    inputSchema: s.object(
      "Input for Amazon Products By Category.",
      {
        categoryId: s.string("Numeric Amazon category node ID taken from the node query parameter of a category URL.", {
          minLength: 1,
        }),
        country: amazonCountry,
        sortBy: s.withDefault(
          s.withEnum(
            s.string(
              "Sort by.\n\nAvailable Values:\n- `RELEVANCE`: Relevance\n- `LOWEST_PRICE`: Lowest Price\n- `HIGHEST_PRICE`: Highest Price\n- `REVIEWS`: Reviews\n- `NEWEST`: Newest\n- `BEST_SELLERS`: Best Sellers",
            ),
            ["RELEVANCE", "LOWEST_PRICE", "HIGHEST_PRICE", "REVIEWS", "NEWEST", "BEST_SELLERS"],
          ),
          "RELEVANCE",
        ),
        page: s.integer("Page number for pagination.", { default: 1 }),
      },
      { required: ["categoryId"] },
    ),
  },
  {
    name: "1688_category_information",
    method: "GET",
    path: "/api/1688/get-category-info/v1",
    authLocation: "query",
    description:
      "Retrieves 1688 category information by category ID, or root categories when no ID is supplied. Use it to navigate categories during product sourcing.",
    inputSchema: s.object("Category Information input.", { catId: s.string("1688 platform category ID.") }, {}),
  },
  {
    name: "1688_category_products",
    method: "GET",
    path: "/api/1688/get-category-item-list/v2",
    authLocation: "query",
    description:
      "Retrieves 1688 products by category ID with output language, pagination, sorting and price filters. Use it to discover category products for multilingual sourcing.",
    inputSchema: s.object(
      "Category Products input.",
      {
        catId: s.string("1688 platform category ID."),
        language: s.withEnum(
          s.string(
            "Output language.\n\nAvailable Values:\n- `en`: English\n- `zh`: Chinese\n- `ru`: Russian\n- `vi`: Vietnamese\n- `ja`: Japanese\n- `ko`: Korean",
            { default: "zh" },
          ),
          ["en", "zh", "ru", "vi", "ja", "ko"],
        ),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        sort: s.withEnum(
          s.string(
            "Product sort order.\n\nAvailable Values:\n- `default`: Default order\n- `sales`: Sales order\n- `price_up`: Price ascending\n- `price_down`: Price descending",
            { default: "default" },
          ),
          ["default", "sales", "price_up", "price_down"],
        ),
        priceStart: s.string("Minimum price filter in CNY."),
        priceEnd: s.string("Maximum price filter in CNY."),
        newArrival: s.boolean({ description: "Filter for new products." }),
        supportDropshipping: s.boolean({ description: "Filter for support for dropshipping." }),
        freeShipping: s.boolean({ description: "Filter for free shipping." }),
        isSuperFactory: s.boolean({ description: "Optional super-factory filter." }),
      },
      { required: ["catId"] },
    ),
  },
  {
    name: "1688_cross_border_product_search_by_image",
    method: "GET",
    path: "/api/1688/search-cross-border-item-by-image/v2",
    authLocation: "query",
    description:
      "Searches 1688 cross-border products by image with language selection, pagination, sorting and sourcing filters. Use it to find products for multilingual visual sourcing.",
    inputSchema: s.object(
      "Cross-border Image Search input.",
      {
        imgUrl: s.string(
          "Image reference returned by Image Conversion with searchApiEndpoint=cross_border_v2. Convert full image URLs before searching.",
        ),
        language: s.withEnum(
          s.string(
            "Output language.\n\nAvailable Values:\n- `en`: English\n- `zh`: Chinese\n- `ru`: Russian\n- `vi`: Vietnamese\n- `ja`: Japanese\n- `ko`: Korean",
            { default: "en" },
          ),
          ["en", "zh", "ru", "vi", "ja", "ko"],
        ),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        sort: s.withEnum(
          s.string(
            "Product sort order.\n\nAvailable Values:\n- `default`: Default order\n- `sales`: Sales order\n- `price_up`: Price ascending\n- `price_down`: Price descending",
            { default: "default" },
          ),
          ["default", "sales", "price_up", "price_down"],
        ),
        priceStart: s.string("Minimum price filter in CNY."),
        priceEnd: s.string("Maximum price filter in CNY."),
        supportDropshipping: s.boolean({ description: "Filter for support for dropshipping." }),
        isFactory: s.boolean({ description: "Filter by factory status." }),
        verifiedSupplier: s.boolean({ description: "Filter for verified sellers." }),
        freeShipping: s.boolean({ description: "Filter for free shipping." }),
        newArrival: s.boolean({ description: "Filter for new products." }),
      },
      { required: ["imgUrl"] },
    ),
  },
  {
    name: "1688_cross_border_product_search",
    method: "GET",
    path: "/api/1688/search-cross-border-item-list/v1",
    authLocation: "query",
    description:
      "Searches 1688 cross-border products by keyword or category with language selection, pagination and sourcing filters. Use it to discover products for multilingual procurement.",
    inputSchema: s.object(
      "Cross-border Product Search input.",
      {
        keyword: s.string("Search keyword. Supply keyword or catId."),
        catId: s.string("1688 category ID. Supply catId or keyword."),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        language: s.withEnum(
          s.string(
            "Output language.\n\nAvailable Values:\n- `en`: English\n- `zh`: Chinese\n- `ru`: Russian\n- `vi`: Vietnamese\n- `ja`: Japanese\n- `ko`: Korean",
            { default: "en" },
          ),
          ["en", "zh", "ru", "vi", "ja", "ko"],
        ),
        sort: s.withEnum(
          s.string(
            "Product sort order.\n\nAvailable Values:\n- `default`: Default order\n- `sales`: Sales order\n- `price_up`: Price ascending\n- `price_down`: Price descending",
            { default: "default" },
          ),
          ["default", "sales", "price_up", "price_down"],
        ),
        priceStart: s.string("Minimum price filter in CNY."),
        priceEnd: s.string("Maximum price filter in CNY."),
        newArrival: s.boolean({ description: "Filter for new products." }),
        supportDropshipping: s.boolean({ description: "Filter for support for dropshipping." }),
        freeShipping: s.boolean({ description: "Filter for free shipping." }),
        isSuperFactory: s.boolean({ description: "Optional super-factory filter." }),
      },
      {
        anyOf: [
          { required: ["keyword"], properties: { keyword: { type: "string", minLength: 1 } } },
          { required: ["catId"], properties: { catId: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "1688_factory_search",
    method: "GET",
    path: "/api/1688/search-factory/v1",
    authLocation: "query",
    description:
      "Searches 1688 factories by keyword with pagination and default or repurchase-rate sorting. Use it to discover manufacturers during procurement research.",
    inputSchema: s.object(
      "Factory Search input.",
      {
        keyword: s.string("Factory search keyword."),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        sort: s.withEnum(
          s.string(
            "Factory sort order.\n\nAvailable Values:\n- `default`: Default order\n- `repurchase_rate`: Repurchase-rate order",
            { default: "default" },
          ),
          ["default", "repurchase_rate"],
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "1688_image_conversion",
    method: "POST",
    path: "/api/1688/convert-image/v1",
    authLocation: "query",
    bodyEncoding: "json",
    description:
      "Converts an image URL or JPEG Base64 input into an image reference for a selected 1688 image search endpoint. Use it to prepare external images for visual product sourcing.",
    inputSchema: s.object(
      "Image Conversion input.",
      {
        url: s.string("Image URL. Supply either url or imgBase64."),
        imgBase64: s.string(
          "JPEG image encoded as Base64 without a data URI prefix; decoded size must not exceed 100 KB.",
        ),
        searchApiEndpoint: s.withEnum(
          s.string("Image search target for the converted reference.", { default: "standard" }),
          ["standard", "cross_border_v1", "cross_border_v2"],
        ),
      },
      {
        anyOf: [
          { required: ["url"], properties: { url: { type: "string", minLength: 1 } } },
          { required: ["imgBase64"], properties: { imgBase64: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "1688_product_description_images",
    method: "GET",
    path: "/api/1688/get-item-description-images/v1",
    authLocation: "query",
    description:
      "Retrieves 1688 product description images by item ID. Use it to review listing descriptions during catalog preparation and product research.",
    inputSchema: s.object(
      "Product Description Images input.",
      { itemId: s.string("1688 product ID.") },
      { required: ["itemId"] },
    ),
  },
  {
    name: "1688_product_details_by_url",
    method: "GET",
    path: "/api/1688/get-item-detail-by-url/v1",
    authLocation: "query",
    description:
      "Retrieves 1688 product details by product URL with an optional output language. Use it to inspect a known listing during sourcing and catalog research.",
    inputSchema: s.object(
      "Product Details [URL] input.",
      {
        url: s.string("1688 product URL."),
        scene: s.withEnum(
          s.string("Optional dropshipping pricing scene.\n\nAvailable Values:\n- `drop_shipping`: Dropshipping"),
          ["drop_shipping"],
        ),
        optimizeTitle: s.boolean({
          description: "Optimize Chinese titles by removing non-core words.",
          default: false,
        }),
        language: s.withEnum(
          s.string(
            "Output language.\n\nAvailable Values:\n- `en`: English\n- `zh`: Chinese\n- `ru`: Russian\n- `th`: Thai\n- `pt`: Portuguese\n- `es`: Spanish\n- `tr`: Turkish\n- `vi`: Vietnamese\n- `ja`: Japanese\n- `ko`: Korean",
            { default: "zh" },
          ),
          ["en", "zh", "ru", "th", "pt", "es", "tr", "vi", "ja", "ko"],
        ),
      },
      { required: ["url"] },
    ),
  },
  {
    name: "1688_product_reviews",
    method: "GET",
    path: "/api/1688/get-item-rating-list/v1",
    authLocation: "query",
    description:
      "Retrieves 1688 product reviews by item ID with pagination and default or latest sorting. Use it to review buyer feedback during product sourcing.",
    inputSchema: s.object(
      "Product Reviews input.",
      {
        itemId: s.string("1688 product ID."),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        sortType: s.withEnum(
          s.string(
            "Review sort order.\n\nAvailable Values:\n- `default`: Default order\n- `latest`: Latest reviews first",
            { default: "default" },
          ),
          ["default", "latest"],
        ),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "1688_product_search_by_image",
    method: "GET",
    path: "/api/1688/search-item-by-image/v1",
    authLocation: "query",
    description:
      "Searches 1688 products by image with pagination, sorting and optional sourcing filters. Use it to find matching products during visual sourcing.",
    inputSchema: s.object(
      "Product Search by Image input.",
      {
        imgUrl: s.string(
          "Image URL or image reference returned by Image Conversion. Convert external images for the selected search target before searching.",
        ),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        sort: s.withEnum(
          s.string(
            "Product sort order.\n\nAvailable Values:\n- `default`: Default order\n- `sales`: Sales order\n- `price_up`: Price ascending\n- `price_down`: Price descending",
            { default: "default" },
          ),
          ["default", "sales", "price_up", "price_down"],
        ),
        moq: s.integer("Minimum order quantity filter.", { format: "int32" }),
        priceStart: s.string("Minimum price filter in CNY."),
        priceEnd: s.string("Maximum price filter in CNY."),
        supportDropshipping: s.boolean({ description: "Filter for support for dropshipping." }),
        isFactory: s.boolean({ description: "Filter by factory status." }),
        verifiedSupplier: s.boolean({ description: "Filter for verified sellers." }),
        freeShipping: s.boolean({ description: "Filter for free shipping." }),
        newArrival: s.boolean({ description: "Filter for new products." }),
      },
      { required: ["imgUrl"] },
    ),
  },
  {
    name: "1688_product_shipping_fee",
    method: "GET",
    path: "/api/1688/get-item-shipping/v1",
    authLocation: "query",
    description:
      "Retrieves a 1688 product shipping estimate for a Chinese province using quantity and optional total weight. Use it to estimate domestic procurement shipping costs.",
    inputSchema: s.object(
      "Product Shipping Fee input.",
      {
        itemId: s.string("1688 product ID."),
        province: s.string("Chinese province name or abbreviation, for example Guangdong or gd."),
        totalQuantity: s.integer("Total number of items to ship.", { format: "int32", default: 1 }),
        totalWeight: s.number("Total shipment weight in kilograms."),
      },
      { required: ["itemId", "province"] },
    ),
  },
  {
    name: "1688_shop_categories",
    method: "GET",
    path: "/api/1688/get-shop-category/v1",
    authLocation: "query",
    description:
      "Retrieves all categories for a 1688 shop by shop URL or seller member ID. Use it to navigate a shop catalog during product sourcing.",
    inputSchema: s.object(
      "Shop Categories input.",
      {
        shopUrl: s.string("1688 shop homepage URL. Supply shopUrl or memberId."),
        memberId: s.string("Seller member ID. Supply memberId or shopUrl."),
      },
      {
        anyOf: [
          { required: ["shopUrl"], properties: { shopUrl: { type: "string", minLength: 1 } } },
          { required: ["memberId"], properties: { memberId: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "1688_shop_information",
    method: "GET",
    path: "/api/1688/get-shop-info/v1",
    authLocation: "query",
    description:
      "Retrieves 1688 shop information by shop URL or seller member ID. Use it to research a known shop during procurement.",
    inputSchema: s.object(
      "Shop Information input.",
      {
        shopUrl: s.string("1688 shop homepage URL. Supply shopUrl or memberId."),
        memberId: s.string("Seller member ID. Supply memberId or shopUrl."),
      },
      {
        anyOf: [
          { required: ["shopUrl"], properties: { shopUrl: { type: "string", minLength: 1 } } },
          { required: ["memberId"], properties: { memberId: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "1688_shop_products_by_member_id",
    method: "GET",
    path: "/api/1688/get-shop-item-list/v1",
    authLocation: "query",
    description:
      "Retrieves 1688 shop products by seller member ID with pagination, sorting and optional category and price filters. Use it to research a shop product catalog.",
    inputSchema: s.object(
      "Shop Products [ID] input.",
      {
        memberId: s.string("Seller member ID."),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        sort: s.withEnum(
          s.string(
            "Shop product sort order.\n\nAvailable Values:\n- `default`: Default order\n- `sales`: Sales order\n- `price_up`: Price ascending\n- `price_down`: Price descending\n- `time_up`: Time ascending\n- `time_down`: Time descending",
            { default: "default" },
          ),
          ["default", "sales", "price_up", "price_down", "time_up", "time_down"],
        ),
        shopCatId: s.string("Shop category ID."),
        priceStart: s.string("Minimum price filter in CNY."),
        priceEnd: s.string("Maximum price filter in CNY."),
      },
      { required: ["memberId"] },
    ),
  },
  {
    name: "1688_shop_products_by_url",
    method: "GET",
    path: "/api/1688/get-shop-item-list-by-url/v1",
    authLocation: "query",
    description:
      "Retrieves 1688 shop products by shop homepage URL with pagination, sorting and optional category filters. Use it to research a shop product catalog.",
    inputSchema: s.object(
      "Shop Products [URL] input.",
      {
        shopUrl: s.string("1688 shop homepage URL."),
        page: s.integer("Page number, starting at 1.", { format: "int32", default: 1 }),
        pageSize: s.integer("Number of items requested per page. The returned count may differ.", {
          format: "int32",
          default: 20,
        }),
        sort: s.withEnum(
          s.string(
            "Shop product sort order.\n\nAvailable Values:\n- `default`: Default order\n- `sales`: Sales order\n- `price_up`: Price ascending\n- `price_down`: Price descending\n- `time_up`: Time ascending\n- `time_down`: Time descending",
            { default: "default" },
          ),
          ["default", "sales", "price_up", "price_down", "time_up", "time_down"],
        ),
        cat: s.string("Optional category ID filter."),
        catType: s.withEnum(
          s.string(
            "Optional category mode: 0 or 1.\n\nAvailable Values:\n- `0`: Category mode 0\n- `1`: Category mode 1",
          ),
          ["0", "1"],
        ),
      },
      { required: ["shopUrl"] },
    ),
  },
  {
    name: "jdcom_product_description_images",
    method: "GET",
    path: "/api/jd/get-item-description-images/v1",
    authLocation: "query",
    description:
      "Retrieve JD.com product description images and product attributes by item ID. Use it to review product introductions for catalog research and product presentation.",
    inputSchema: s.object(
      "Product Description Images input.",
      { itemId: s.string("A unique product identifier on JD.com (item ID).") },
      { required: ["itemId"] },
    ),
  },
  {
    name: "taobao_and_tmall_product_description_images",
    method: "GET",
    path: "/api/taobao/get-item-description/v1",
    authLocation: "query",
    description:
      "Retrieves Taobao or Tmall product description HTML and a separate list of description images by item ID. Use it to collect listing description assets for catalog preparation and product content review.",
    inputSchema: s.object(
      "Product Description Images input.",
      { itemId: s.string("Unique product identifier on Taobao/Tmall (item ID).") },
      { required: ["itemId"] },
    ),
  },
  {
    name: "taobao_and_tmall_shop_detail",
    method: "GET",
    path: "/api/taobao/get-shop-detail/v1",
    authLocation: "query",
    description:
      "Retrieves a Taobao shop's homepage information, shop categories, and default product listing by seller ID and shop ID. Use it to inspect a shop and discover its categories before querying products.",
    inputSchema: s.object(
      "Shop Detail input.",
      {
        sellerId: s.string("Taobao seller user ID associated with the shop."),
        shopId: s.string("Taobao shop ID associated with the seller."),
      },
      { required: ["sellerId", "shopId"] },
    ),
  },
  {
    name: "xiaohongshu_e_commerce_rednote_product_detail",
    method: "GET",
    path: "/api/xiaohongshu-ec/get-product-detail/v1",
    authLocation: "query",
    description:
      "Retrieves Xiaohongshu E-commerce (RedNote) product details by SKU ID. Use it to look up a specific marketplace product for product research and catalog workflows.",
    inputSchema: s.object("Product Detail input.", { skuId: s.string("Product SKU ID.") }, { required: ["skuId"] }),
  },
];
