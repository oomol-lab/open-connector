import type { CredentialValidators, ExecutionContext, ProviderExecutors, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { WechatApiResult, WeixinStoreCredential } from "./access-token.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  positiveInteger,
} from "../../core/cast.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { readTransitFileInput } from "../provider-files.ts";
import {
  createProviderFetch,
  providerInputError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";
import {
  getWechatAccessToken,
  isWechatTokenError,
  normalizeWechatApiError,
  parseWechatJson,
  readWechatErrcode,
  readWeixinStoreCredential,
} from "./access-token.ts";

const service = "weixin_store";
const wechatApiBaseUrl = "https://api.weixin.qq.com";
// Image uploads move up to 10 MB, so they get a wider budget than the shared default.
const wechatImageUploadTimeoutMs = 120_000;
const orderTimeRangeMaxSeconds = 7 * 24 * 60 * 60;
const aftersaleTimeRangeMaxSeconds = 24 * 60 * 60;

interface WeixinStoreContext {
  credential: WeixinStoreCredential;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

type WeixinStoreActionHandler = ProviderRuntimeHandler<WeixinStoreContext>;

interface WechatApiRequest {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown> | FormData;
  timeoutMs?: number;
}

/** Known camelCase product input fields, mapped to WeChat's snake_case; unknown fields pass through unchanged. */
const productFieldMap: Record<string, string> = {
  headImgs: "head_imgs",
  catsV2: "cats_v2",
  deliverMethod: "deliver_method",
  deliverAcctType: "deliver_acct_type",
  extraService: "extra_service",
  outProductId: "out_product_id",
  descInfo: "desc_info",
  brandId: "brand_id",
  expressInfo: "express_info",
  aftersaleDesc: "aftersale_desc",
  limitedInfo: "limited_info",
  sizeChart: "size_chart",
};

const deliveryFieldMap: Record<string, string> = {
  deliverType: "deliver_type",
  waybillId: "waybill_id",
  deliveryId: "delivery_id",
  courseInfo: "course_info",
  snInfo: "sn_info",
};

const deliveryProductFieldMap: Record<string, string> = {
  productId: "product_id",
  skuId: "sku_id",
  productCnt: "product_cnt",
};

const weixinStoreActionHandlers: ProviderActionHandlers<typeof service, WeixinStoreActionHandler> = {
  get_product_qr_code(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/qrcode/get",
      body: compactObject({
        ...readProductShareInput(input),
        qrcode_type: readBoundedInteger(input.qrcodeType, "qrcodeType", 1, 3),
      }),
    });
  },
  get_product_tag_link(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/taglink/get",
      body: readProductShareInput(input),
    });
  },
  get_compass_shop_overview(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/compass/shop/overall/get",
      body: { ds: readCompassDate(input.date) },
    });
  },
  get_funds_balance(_input, context) {
    return callWechatApi(context, { method: "POST", path: "/channels/ec/funds/getbalance", body: {} });
  },
  list_funds_flows(input, context) {
    const page = readBoundedInteger(input.page, "page", 1, Number.MAX_SAFE_INTEGER) ?? 1;
    const pageSize = readBoundedInteger(input.pageSize, "pageSize", 1, Number.MAX_SAFE_INTEGER) ?? 10;
    const nextKey = input.nextKey === undefined ? undefined : requiredInputString(input.nextKey, "nextKey");
    if (page * pageSize >= 10000 && nextKey === undefined) {
      throw providerInputError("nextKey is required when page multiplied by pageSize is at least 10000");
    }
    const range = readOptionalTimeBounds(input, "startTime", "endTime");
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/funds/getfundsflowlist",
      body: compactObject({
        page,
        page_size: pageSize,
        next_key: nextKey,
        start_time: range.start,
        end_time: range.end,
        transaction_id:
          input.transactionId === undefined ? undefined : requiredInputString(input.transactionId, "transactionId"),
      }),
    });
  },
  get_funds_flow(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/funds/getfundsflowdetail",
      body: { flow_id: requiredInputString(input.flowId, "flowId") },
    });
  },
  list_order_settlements(input, context) {
    const settleState = readBoundedInteger(input.settleState, "settleState", 0, 100);
    const orderState = readBoundedInteger(input.orderState, "orderState", 0, 100);
    if (
      settleState === undefined ||
      ![0, 1, 2, 60, 100].includes(settleState) ||
      (orderState !== undefined && ![0, 20, 30, 100].includes(orderState))
    ) {
      throw providerInputError("settleState must be 0, 1, 2, 60 or 100; orderState must be 0, 20, 30 or 100");
    }
    if (input.usePageContext !== undefined && typeof input.usePageContext !== "boolean") {
      throw providerInputError("usePageContext must be a boolean");
    }
    const usePageContext = input.usePageContext ?? true;
    if (input.pageContext !== undefined && typeof input.pageContext !== "string") {
      throw providerInputError("pageContext must be a string");
    }
    if ((usePageContext && input.offset !== undefined) || (!usePageContext && input.pageContext !== undefined)) {
      throw providerInputError("Use pageContext with context pagination, or offset with usePageContext false");
    }
    const range = readOptionalTimeBounds(input, "createTimeStart", "createTimeEnd");
    if (range.start !== undefined && range.end !== undefined && range.end === range.start) {
      throw providerInputError("createTimeEnd is exclusive and must be after createTimeStart");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/funds/listorderflow",
      body: compactObject({
        order_settle_state: settleState,
        order_state: orderState,
        order_pay_method: readBoundedInteger(input.payMethod, "payMethod", 0, 2),
        order_id: input.orderId === undefined ? undefined : readIdString(input.orderId, "orderId"),
        pagination_info: compactObject({
          limit: readBoundedInteger(input.limit, "limit", 1, 100) ?? 20,
          offset: readBoundedInteger(input.offset, "offset", 0, Number.MAX_SAFE_INTEGER),
          use_page_ctx: usePageContext,
          page_ctx: input.pageContext,
        }),
        order_create_time_range:
          range.start === undefined && range.end === undefined
            ? undefined
            : compactObject({ begin: range.start, end: range.end }),
      }),
    });
  },
  list_merchant_tickets(input, context) {
    const range = readOptionalTimeBounds(input, "startTime", "endTime");
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/platformkf/getmchticketlist",
      body: compactObject({
        ticket_state: readBoundedInteger(input.ticketState, "ticketState", 1, 3),
        ticket_class_type: readBoundedInteger(input.ticketClassType, "ticketClassType", 9, 9),
        search_ticket_id:
          input.searchTicketId === undefined ? undefined : requiredInputString(input.searchTicketId, "searchTicketId"),
        search_start_time: range.start,
        search_end_time: range.end,
        sort_order_type: readBoundedInteger(input.sortOrderType, "sortOrderType", 1, 2),
        limit: readBoundedInteger(input.limit, "limit", 1, 50) ?? 10,
        start: readBoundedInteger(input.start, "start", 0, Number.MAX_SAFE_INTEGER) ?? 0,
      }),
    });
  },
  get_merchant_ticket(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/platformkf/getmchticketdetail",
      body: { ticket_id: requiredInputString(input.ticketId, "ticketId") },
    });
  },
  list_aftersale_reasons(_input, context) {
    return callWechatApi(context, { method: "POST", path: "/channels/ec/aftersale/reason/get", body: {} });
  },
  list_aftersale_reject_reasons(_input, context) {
    return callWechatApi(context, { method: "POST", path: "/channels/ec/aftersale/rejectreason/get", body: {} });
  },
  get_aftersale_complaint(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/aftersale/getcomplaintorder",
      body: { complaint_id: requiredInputString(input.complaintId, "complaintId") },
    });
  },
  update_delivery_info(input, context) {
    const changes = objectArray(input.changeInfos, "changeInfos", providerInputError);
    if (changes.length === 0) throw providerInputError("changeInfos must contain at least one package correction");
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/order/deliveryinfo/update",
      body: {
        order_id: readIdString(input.orderId, "orderId"),
        change_infos: changes.map((change) => ({
          old: readDeliveryCorrectionPackage(change.old),
          new: readDeliveryCorrectionPackage(change.new),
        })),
      },
    });
  },
  send_exchange_delivery(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/aftersale/acceptexchangereship",
      body: {
        after_sale_order_id: requiredInputString(input.afterSaleOrderId, "afterSaleOrderId"),
        delivery_id: requiredInputString(input.deliveryId, "deliveryId"),
        waybill_id: requiredInputString(input.waybillId, "waybillId"),
      },
    });
  },
  async upload_aftersale_image(input, context) {
    const file = await readTransitFileInput(input.file, context);
    if (file.sizeBytes > 10 * 1024 * 1024 || file.sizeBytes === 0) {
      throw providerInputError("file must be non-empty and at most 10 MB");
    }
    if (!["image/jpeg", "image/png", "image/bmp", "image/x-ms-bmp", "image/gif"].includes(file.mimeType)) {
      throw providerInputError("file must be a JPEG, PNG, BMP or GIF image");
    }
    const formData = new FormData();
    formData.set("media", file.file, file.name);
    return callWechatApi(context, {
      method: "POST",
      path: "/shop/ec/basics/img/uploadv2",
      query: { scene_type: "170", upload_type: "0" },
      body: formData,
      timeoutMs: wechatImageUploadTimeoutMs,
    });
  },
  async list_league_promoter_products(input, context) {
    const talentAppid = requiredInputString(input.talentAppid, "talentAppid");
    const dataType = positiveInteger(input.dataType, "dataType", providerInputError);
    const pageIndex = positiveInteger(input.pageIndex ?? 1, "pageIndex", providerInputError);
    const pageSize = positiveInteger(input.pageSize ?? 20, "pageSize", providerInputError);
    if (![1, 2].includes(dataType) || !Number.isSafeInteger(pageIndex) || pageSize > 20) {
      throw providerInputError("dataType must be 1 or 2, pageIndex a safe positive integer, and pageSize at most 20");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/talent/getproductdatalist",
      body: { talent_appid: talentAppid, get_data_type: dataType, page_index: pageIndex, page_size: pageSize },
    });
  },
  async list_product_promotion_talents(input, context) {
    const productId = positiveInteger(input.productId, "productId", providerInputError);
    const promotionPlanId = positiveInteger(input.promotionPlanId, "promotionPlanId", providerInputError);
    const pageIndex = positiveInteger(input.pageIndex ?? 1, "pageIndex", providerInputError);
    const pageSize = positiveInteger(input.pageSize ?? 10, "pageSize", providerInputError);
    if (![productId, promotionPlanId, pageIndex].every(Number.isSafeInteger) || pageSize > 10) {
      throw providerInputError("Ids and pageIndex must be safe positive integers; pageSize must be at most 10");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/promotion/talent/list",
      body: compactObject({
        product_id: productId,
        promotion_plan_id: promotionPlanId,
        page_index: pageIndex,
        page_size: pageSize,
        talent_appid:
          input.talentAppid === undefined ? undefined : requiredInputString(input.talentAppid, "talentAppid"),
      }),
    });
  },
  get_product_audit_strategy(_input, context) {
    return callWechatApi(context, { method: "POST", path: "/channels/ec/product/auditstrategy/get", body: {} });
  },
  async list_product_promotion_plans(input, context) {
    const productId = positiveInteger(input.productId, "productId", providerInputError);
    const pageIndex = positiveInteger(input.pageIndex ?? 1, "pageIndex", providerInputError);
    const pageSize = positiveInteger(input.pageSize ?? 20, "pageSize", providerInputError);
    const type =
      input.promotionPlanType === undefined
        ? undefined
        : positiveInteger(input.promotionPlanType, "promotionPlanType", providerInputError);
    if (
      ![productId, pageIndex].every(Number.isSafeInteger) ||
      pageSize > 20 ||
      (type !== undefined && ![100, 200, 300].includes(type))
    ) {
      throw providerInputError(
        "Ids and pageIndex must be safe positive integers, pageSize at most 20, and promotionPlanType 100, 200 or 300",
      );
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/promotion/plan/list",
      body: compactObject({
        product_id: productId,
        page_index: pageIndex,
        page_size: pageSize,
        promotion_plan_type: type,
      }),
    });
  },
  async list_league_products(input, context) {
    const pageIndex = positiveInteger(input.pageIndex ?? 1, "pageIndex", providerInputError);
    const pageSize = positiveInteger(input.pageSize ?? 20, "pageSize", providerInputError);
    const productId =
      input.productId === undefined ? undefined : positiveInteger(input.productId, "productId", providerInputError);
    if (
      !Number.isSafeInteger(pageIndex) ||
      pageSize > 100 ||
      pageSize * pageIndex > 5000 ||
      (productId !== undefined && !Number.isSafeInteger(productId))
    ) {
      throw providerInputError(
        "Product id must be safe, pageSize at most 100, and pageSize multiplied by pageIndex at most 5000",
      );
    }
    if (input.needTotalNum !== undefined && typeof input.needTotalNum !== "boolean") {
      throw providerInputError("needTotalNum must be a boolean");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/item/list/get",
      body: compactObject({
        page_index: pageIndex,
        page_size: pageSize,
        product_id: productId,
        need_total_num: input.needTotalNum,
      }),
    });
  },
  async get_league_plan(input, context) {
    const type = positiveInteger(input.type, "type", providerInputError);
    const productId = positiveInteger(input.productId, "productId", providerInputError);
    const promotionPlanId =
      input.promotionPlanId === undefined
        ? undefined
        : positiveInteger(input.promotionPlanId, "promotionPlanId", providerInputError);
    if (
      ![100, 300].includes(type) ||
      !Number.isSafeInteger(productId) ||
      (promotionPlanId !== undefined && !Number.isSafeInteger(promotionPlanId))
    ) {
      throw providerInputError("type must be 100 or 300 and ids must be safe positive integers");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/item/get",
      body: compactObject({ type, product_id: productId, promotion_plan_id: promotionPlanId }),
    });
  },
  async invite_league_promoter(input, context) {
    if ((input.promoterId !== undefined) === (input.finderId !== undefined)) {
      throw providerInputError("Supply exactly one of promoterId or finderId");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/promoter/add",
      body:
        input.promoterId !== undefined
          ? { promoter_id: requiredInputString(input.promoterId, "promoterId") }
          : { finder_id: requiredInputString(input.finderId, "finderId") },
    });
  },
  async update_league_plan(input, context) {
    const type = positiveInteger(input.type, "type", providerInputError);
    const productId = positiveInteger(input.productId, "productId", providerInputError);
    const promotionPlanId = positiveInteger(input.promotionPlanId, "promotionPlanId", providerInputError);
    const operateType = positiveInteger(input.operateType, "operateType", providerInputError);
    if (
      ![100, 300].includes(type) ||
      ![productId, promotionPlanId].every(Number.isSafeInteger) ||
      ![1, 2, 4].includes(operateType)
    ) {
      throw providerInputError("type must be 100 or 300, ids safe positive integers, and operateType 1, 2 or 4");
    }
    const ratio = optionalNumber(input.ratio);
    if (
      operateType === 1
        ? ratio === undefined || !Number.isFinite(ratio) || ratio < 0 || ratio > 90
        : input.ratio !== undefined
    ) {
      throw providerInputError("ratio must be between 0 and 90 for operateType 1 and omitted for operateType 2 or 4");
    }
    if (input.exclusiveInfo !== undefined || input.exclusive_info !== undefined) {
      throw providerInputError("Audience and timing edits are not supported by this action");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/item/upd",
      body: compactObject({
        type,
        product_id: productId,
        promotion_plan_id: promotionPlanId,
        operate_type: operateType,
        ratio,
      }),
    });
  },
  async list_league_promoters(input, context) {
    const pageIndex = positiveInteger(input.pageIndex ?? 1, "pageIndex", providerInputError);
    const pageSize = positiveInteger(input.pageSize ?? 20, "pageSize", providerInputError);
    if (!Number.isSafeInteger(pageIndex) || pageSize > 20) {
      throw providerInputError("pageIndex must be a safe positive integer and pageSize must be at most 20");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/promoter/list/get",
      body: { page_index: pageIndex, page_size: pageSize },
    });
  },
  async get_league_promoter(input, context) {
    if ((input.talentAppid !== undefined) === (input.talentSearchKey !== undefined)) {
      throw providerInputError("Supply exactly one of talentAppid or talentSearchKey");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/league/promoter/get",
      body:
        input.talentAppid !== undefined
          ? { talent_appid: requiredInputString(input.talentAppid, "talentAppid") }
          : { talent_search_key: requiredInputString(input.talentSearchKey, "talentSearchKey") },
    });
  },
  async get_compass_product_data(input, context) {
    const date = readCompassDate(input.date);
    const productId = positiveInteger(input.productId, "productId", providerInputError);
    if (!Number.isSafeInteger(productId)) {
      throw providerInputError("productId must be a safe positive integer");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/compass/shop/product/data/get",
      body: { ds: date, product_id: productId },
    });
  },
  async get_product_restricted_info(input, context) {
    if (!Array.isArray(input.productIds) || input.productIds.length < 1 || input.productIds.length > 50) {
      throw providerInputError("productIds must contain 1 to 50 product ids");
    }
    const productIds = input.productIds.map((value) => {
      const id = positiveInteger(value, "productIds", providerInputError);
      if (!Number.isSafeInteger(id)) {
        throw providerInputError("productIds must contain only safe positive integers");
      }
      return id;
    });
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/getproductrestrictedinfo",
      body: { product_ids: productIds },
    });
  },
  async upload_qualification_image(input, context) {
    const file = await readTransitFileInput(input.file, context);
    if (file.sizeBytes > 2 * 1024 * 1024) {
      throw providerInputError("file must be at most 2 MB");
    }
    const formData = new FormData();
    formData.set("media", file.file, file.name);
    return callWechatApi(context, {
      method: "POST",
      path: "/shop/ec/basics/qualification/upload",
      body: formData,
      timeoutMs: wechatImageUploadTimeoutMs,
    });
  },
  upload_image(input, context) {
    const imageUrl = optionalString(input.imageUrl);
    if ((imageUrl === undefined) === (input.file === undefined)) {
      throw providerInputError("exactly one of imageUrl and file is required");
    }
    if (imageUrl !== undefined) {
      return callWechatApi(context, {
        method: "POST",
        path: "/shop/ec/basics/img/upload",
        query: { upload_type: "1", resp_type: "1" },
        body: { img_url: imageUrl },
        timeoutMs: wechatImageUploadTimeoutMs,
      });
    }
    return uploadImageFile(context, input);
  },
  get_shop_info(_input, context) {
    return callWechatApi(context, { method: "GET", path: "/channels/ec/basics/info/get" });
  },
  list_categories(_input, context) {
    return callWechatApi(context, { method: "POST", path: "/shop/ec/category/all" });
  },
  get_category(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/shop/ec/category/detail",
      body: { cat_id: positiveInteger(input.catId, "catId", providerInputError) },
    });
  },
  apply_category(input, context) {
    const categoryInfo = optionalRecord(input.categoryInfo);
    if (!categoryInfo) {
      throw providerInputError("categoryInfo must be an object");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/category/add",
      body: { category_info: mapCategoryApplication(categoryInfo) },
    });
  },
  get_category_application(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/shop/ec/category/getbizcatflowdetail",
      body: { audit_id: positiveInteger(input.auditId, "auditId", providerInputError) },
    });
  },
  list_category_permissions(input, context) {
    const status = optionalInteger(input.status);
    return callWechatApi(context, {
      method: "POST",
      path: "/shop/ec/category/get_category_relation_list",
      body: compactObject({ is_filter_status: status !== undefined, status }),
    });
  },
  precheck_product_category(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/categoryprecheck",
      body: compactObject({
        cat_id: input.catId === undefined ? undefined : positiveInteger(input.catId, "catId", providerInputError),
      }),
    });
  },
  get_category_product_rule(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/shop/ec/category/getcategoryproductrule",
      body: compactObject({
        cat_id: positiveInteger(input.catId, "catId", providerInputError),
        release_mode: optionalInteger(input.releaseMode),
        brand_id:
          input.brandId === undefined ? undefined : positiveInteger(input.brandId, "brandId", providerInputError),
      }),
    });
  },
  list_valid_brands(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/brand/valid/list/get",
      body: compactObject({
        page_size: readPageSize(input, 50, 10),
        next_key: optionalString(input.nextKey),
      }),
    });
  },
  add_product(input, context) {
    checkProductPayload(input);
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/add",
      body: mapKeys(input, productFieldMap),
    });
  },
  update_product(input, context) {
    checkProductPayload(input);
    const { productId, ...payload } = input;
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/update",
      // The validated product_id wins over any raw snake_case key in the payload.
      body: { ...mapKeys(payload, productFieldMap), product_id: readIdString(productId, "productId") },
    });
  },
  get_product(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/get",
      body: compactObject({
        product_id: readIdString(input.productId, "productId"),
        data_type: readBoundedInteger(input.dataType, "dataType", 1, 3),
      }),
    });
  },
  get_product_h5_url(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/h5url/get",
      body: readProductShareInput(input),
    });
  },
  list_products(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/list/get",
      body: compactObject({
        status: optionalInteger(input.status),
        page_size: readPageSize(input, 30, 10),
        next_key: optionalString(input.nextKey),
      }),
    });
  },
  listing_product(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/listing",
      body: { product_id: readIdString(input.productId, "productId") },
    });
  },
  delisting_product(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/delisting",
      body: { product_id: readIdString(input.productId, "productId") },
    });
  },
  delete_product(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/delete",
      body: { product_id: readIdString(input.productId, "productId") },
    });
  },
  update_product_stock(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/product/stock/update",
      body: {
        product_id: readIdString(input.productId, "productId"),
        skus: objectArray(input.skus, "skus", providerInputError),
      },
    });
  },
  list_orders(input, context) {
    const ranges = readRequiredTimeRanges(input, orderTimeRangeMaxSeconds, "7 days");
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/order/list/get",
      body: compactObject({
        create_time_range: ranges.create && { start_time: ranges.create.start, end_time: ranges.create.end },
        update_time_range: ranges.update && { start_time: ranges.update.start, end_time: ranges.update.end },
        status: optionalInteger(input.status),
        openid: optionalString(input.openid),
        page_size: readPageSize(input, 100),
        next_key: optionalString(input.nextKey) ?? "",
      }),
    });
  },
  get_order(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/order/get",
      body: { order_id: readIdString(input.orderId, "orderId") },
    });
  },
  update_order_merchant_notes(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/order/merchantnotes/update",
      body: compactObject({
        order_id: readIdString(input.orderId, "orderId"),
        merchant_notes: requiredInputString(input.merchantNotes, "merchantNotes"),
        merchant_notes_tag_color: readBoundedInteger(input.tagColor, "tagColor", 0, 4),
      }),
    });
  },
  send_delivery(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/order/delivery/send",
      body: {
        order_id: readIdString(input.orderId, "orderId"),
        delivery_list: objectArray(input.deliveries, "deliveries", providerInputError).map(mapDelivery),
      },
    });
  },
  list_delivery_companies(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/order/deliverycompanylist/new/get",
      body: { ewaybill_only: optionalBoolean(input.ewaybillOnly) ?? false },
    });
  },
  list_freight_templates(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/merchant/getfreighttemplatelist",
      body: readOffsetLimit(input),
    });
  },
  get_freight_template(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/merchant/getfreighttemplatedetail",
      body: { template_id: requiredInputString(input.templateId, "templateId") },
    });
  },
  list_addresses(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/merchant/address/list",
      body: readOffsetLimit(input),
    });
  },
  get_address(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/merchant/address/get",
      body: { address_id: requiredInputString(input.addressId, "addressId") },
    });
  },
  list_aftersale_orders(input, context) {
    const ranges = readRequiredTimeRanges(input, aftersaleTimeRangeMaxSeconds, "24 hours");
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/aftersale/getaftersalelist",
      body: compactObject({
        begin_create_time: ranges.create?.start,
        end_create_time: ranges.create?.end,
        begin_update_time: ranges.update?.start,
        end_update_time: ranges.update?.end,
        next_key: optionalString(input.nextKey),
      }),
    });
  },
  get_aftersale_order(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/aftersale/getaftersaleorder",
      body: { after_sale_order_id: requiredInputString(input.afterSaleOrderId, "afterSaleOrderId") },
    });
  },
  accept_aftersale(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/aftersale/acceptapply",
      body: compactObject({
        after_sale_order_id: requiredInputString(input.afterSaleOrderId, "afterSaleOrderId"),
        address_id: optionalString(input.addressId),
        accept_type: readBoundedInteger(input.acceptType, "acceptType", 1, 2),
      }),
    });
  },
  reject_aftersale(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/channels/ec/aftersale/rejectapply",
      body: compactObject({
        after_sale_order_id: requiredInputString(input.afterSaleOrderId, "afterSaleOrderId"),
        reject_reason_type: positiveInteger(input.rejectReasonType, "rejectReasonType", providerInputError),
        reject_reason: optionalString(input.rejectReason),
        media_files: input.mediaFiles === undefined ? undefined : readAftersaleMedia(input.mediaFiles),
      }),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<WeixinStoreContext>({
  service,
  handlers: weixinStoreActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<WeixinStoreContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      credential: readWeixinStoreCredential(credential.values),
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher }) {
    const credential = readWeixinStoreCredential(input.values);
    await getWechatAccessToken({
      credential,
      fetcher: createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
    });
    return {
      profile: {
        accountId: credential.appId,
        displayName: `WeChat Store · ${credential.appId}`,
      },
      grantedScopes: [],
      metadata: { appId: credential.appId },
    };
  },
};

/** Upload a local transit file as a store image, which WeChat sizes from the required pixel dimensions. */
async function uploadImageFile(
  context: WeixinStoreContext,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const width = positiveInteger(input.width, "width", providerInputError);
  const height = positiveInteger(input.height, "height", providerInputError);
  const file = await readTransitFileInput(input.file, context);
  const formData = new FormData();
  formData.set("media", file.file, file.name);
  return callWechatApi(context, {
    method: "POST",
    path: "/shop/ec/basics/img/upload",
    query: { upload_type: "0", resp_type: "1", height: String(height), width: String(width) },
    body: formData,
    timeoutMs: wechatImageUploadTimeoutMs,
  });
}

/**
 * Run one JSON API call with the credential's stable access token. When WeChat
 * reports the token as invalid, retry exactly once with a fresh one — or with
 * the token a concurrent caller already refreshed, when the cache has moved on.
 */
async function callWechatApi(context: WeixinStoreContext, request: WechatApiRequest): Promise<Record<string, unknown>> {
  const firstToken = await getWechatAccessToken({ credential: context.credential, fetcher: context.fetcher });
  let result = await executeWechatJsonRequest(context, request, firstToken);
  if (isWechatTokenError(readWechatErrcode(result.record))) {
    const freshToken = await getWechatAccessToken({
      credential: context.credential,
      fetcher: context.fetcher,
      rejectedToken: firstToken,
    });
    result = await executeWechatJsonRequest(context, request, freshToken);
  }
  return resolveWechatJsonResult(result);
}

/** Throw the normalized error for a failed call, or return the payload without the errcode/errmsg envelope. */
function resolveWechatJsonResult(result: WechatApiResult): Record<string, unknown> {
  const errcode = readWechatErrcode(result.record);
  if (result.status >= 400 || result.record === undefined || (errcode !== null && errcode !== 0)) {
    throw normalizeWechatApiError(result);
  }
  const output = { ...result.record };
  delete output.errcode;
  delete output.errmsg;
  return output;
}

async function executeWechatJsonRequest(
  context: WeixinStoreContext,
  request: WechatApiRequest,
  accessToken: string,
): Promise<WechatApiResult> {
  return runProviderRequest(
    { signal: context.signal, label: "WeChat Store", timeoutMs: request.timeoutMs },
    async (signal) => {
      const url = new URL(request.path, wechatApiBaseUrl);
      url.searchParams.set("access_token", accessToken);
      for (const [key, value] of Object.entries(request.query ?? {})) {
        url.searchParams.set(key, value);
      }
      const headers: Record<string, string> = { "user-agent": providerUserAgent };
      let body: BodyInit | undefined;
      if (request.body instanceof FormData) {
        body = request.body;
      } else if (request.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(request.body);
      }
      const response = await context.fetcher(url.toString(), { method: request.method, headers, body, signal });
      const rawText = await response.text();
      return { status: response.status, record: parseWechatJson(rawText), rawText };
    },
  );
}

/**
 * Build the category_info of a category application: force the certificate-group
 * protocol and send every id as the number WeChat documents, since callers often
 * copy them from responses that carry numeric ids as strings.
 */
function mapCategoryApplication(categoryInfo: Record<string, unknown>): Record<string, unknown> {
  return {
    ...categoryInfo,
    cats_v2: objectArray(categoryInfo.cats_v2, "categoryInfo.cats_v2", providerInputError).map((cat) => ({
      ...cat,
      cat_id: positiveInteger(cat.cat_id, "categoryInfo.cats_v2[].cat_id", providerInputError),
    })),
    license_group_list: objectArray(
      categoryInfo.license_group_list,
      "categoryInfo.license_group_list",
      providerInputError,
    ).map((group) => {
      const license = optionalRecord(group.license) ?? {};
      return {
        ...group,
        license_group_id: positiveInteger(
          group.license_group_id,
          "categoryInfo.license_group_list[].license_group_id",
          providerInputError,
        ),
        license: {
          ...license,
          license_id: positiveInteger(
            license.license_id,
            "categoryInfo.license_group_list[].license.license_id",
            providerInputError,
          ),
        },
      };
    }),
    brand_list:
      categoryInfo.brand_list === undefined
        ? undefined
        : objectArray(categoryInfo.brand_list, "categoryInfo.brand_list", providerInputError).map((brand) => ({
            ...brand,
            brand_id: positiveInteger(brand.brand_id, "categoryInfo.brand_list[].brand_id", providerInputError),
          })),
    is_new_apply_cat: true,
  };
}

/** WeChat only reads deliver_acct_type when deliver_method is 3, and then it is required. */
function checkProductPayload(input: Record<string, unknown>): void {
  if (optionalInteger(input.deliverMethod) === 3 && input.deliverAcctType === undefined) {
    throw providerInputError("deliverAcctType is required when deliverMethod is 3");
  }
}

/** Map one camelCase delivery package to WeChat's snake_case, checking the express-only fields. */
function mapDelivery(delivery: Record<string, unknown>): Record<string, unknown> {
  const deliverType = optionalInteger(delivery.deliverType);
  if (deliverType !== 1 && deliverType !== 3) {
    throw providerInputError("deliveries[].deliverType must be 1 (express) or 3 (virtual goods)");
  }
  if (deliverType === 1 && (delivery.waybillId === undefined || delivery.deliveryId === undefined)) {
    throw providerInputError("deliveries[].waybillId and deliveries[].deliveryId are required when deliverType is 1");
  }
  const { productInfos, ...rest } = delivery;
  const mapped = mapKeys(rest, deliveryFieldMap);
  mapped.product_infos = objectArray(productInfos, "deliveries[].productInfos", providerInputError).map((product) =>
    mapKeys(product, deliveryProductFieldMap),
  );
  return mapped;
}

/** Rename an object's known camelCase keys through a field map, keeping every other key unchanged. */
function mapKeys(input: Record<string, unknown>, fieldMap: Record<string, string>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    output[fieldMap[key] ?? key] = value;
  }
  return output;
}

interface TimeRange {
  start: number;
  end: number;
}

/**
 * Read the creation and update time-range pairs of a list call. At least one
 * complete pair is required, and each pair may span at most maxSpanSeconds.
 */
function readRequiredTimeRanges(
  input: Record<string, unknown>,
  maxSpanSeconds: number,
  maxSpanLabel: string,
): { create?: TimeRange; update?: TimeRange } {
  const create = readTimeRangePair(input, "createTimeStart", "createTimeEnd", maxSpanSeconds, maxSpanLabel);
  const update = readTimeRangePair(input, "updateTimeStart", "updateTimeEnd", maxSpanSeconds, maxSpanLabel);
  if (create === undefined && update === undefined) {
    throw providerInputError("at least one of the creation and update time ranges is required");
  }
  return { create, update };
}

/** Read one optional start/end timestamp pair; an absent pair reads as undefined, a partial pair is an error. */
function readTimeRangePair(
  input: Record<string, unknown>,
  startField: string,
  endField: string,
  maxSpanSeconds: number,
  maxSpanLabel: string,
): TimeRange | undefined {
  const start = readOptionalTimestamp(input[startField], startField);
  const end = readOptionalTimestamp(input[endField], endField);
  if (start === undefined && end === undefined) {
    return undefined;
  }
  if (start === undefined || end === undefined) {
    throw providerInputError(`${startField} and ${endField} must be set together`);
  }
  if (end < start) {
    throw providerInputError(`${endField} must be on or after ${startField}`);
  }
  if (end - start > maxSpanSeconds) {
    throw providerInputError(`${startField} and ${endField} may span at most ${maxSpanLabel}`);
  }
  return { start, end };
}

function readOptionalTimestamp(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined;
  const timestamp = optionalInteger(value);
  if (timestamp === undefined || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw providerInputError(`${fieldName} must be a Unix timestamp in seconds`);
  }
  return timestamp;
}

function readOffsetLimit(input: Record<string, unknown>): Record<string, unknown> {
  const offset = optionalInteger(input.offset);
  const limit = optionalInteger(input.limit);
  if (offset !== undefined && offset < 0) {
    throw providerInputError("offset must be a non-negative integer");
  }
  if (limit !== undefined && limit < 1) {
    throw providerInputError("limit must be a positive integer");
  }
  return { offset: offset ?? 0, limit: limit ?? 10 };
}

function readPageSize(input: Record<string, unknown>, max: number, defaultValue?: number): number | undefined {
  return readBoundedInteger(input.pageSize, "pageSize", 1, max) ?? defaultValue;
}

/** Read a WeChat id that the docs type inconsistently as string or number; numbers are sent in string form. */
function readIdString(value: unknown, fieldName: string): string {
  const stringId = optionalString(value);
  if (stringId !== undefined && stringId !== "") {
    return stringId;
  }
  const numericId = optionalInteger(value);
  if (numericId !== undefined && Number.isSafeInteger(numericId)) {
    return String(numericId);
  }
  throw providerInputError(`${fieldName} must be a non-empty string or a safe integer`);
}

/** Read an optional integer bounded to [min, max]; undefined passes through. */
function readBoundedInteger(value: unknown, fieldName: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = optionalInteger(value);
  if (parsed === undefined || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw providerInputError(`${fieldName} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

/** Product sharing uses the same optional, already-bound WeCom attribution across formats. */
function readProductShareInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    product_id: readIdString(input.productId, "productId"),
    wecom_corp_id: input.wecomCorpId === undefined ? undefined : requiredInputString(input.wecomCorpId, "wecomCorpId"),
    wecom_user_id: input.wecomUserId === undefined ? undefined : requiredInputString(input.wecomUserId, "wecomUserId"),
  });
}

/** Funds and ticket queries allow either time bound independently, unlike order-list ranges. */
function readOptionalTimeBounds(
  input: Record<string, unknown>,
  startField: string,
  endField: string,
): { start?: number; end?: number } {
  const start = readOptionalTimestamp(input[startField], startField);
  const end = readOptionalTimestamp(input[endField], endField);
  if (start !== undefined && end !== undefined && end < start)
    throw providerInputError(`${endField} must be on or after ${startField}`);
  return { start, end };
}

/** Corrections must identify the exact old and new express package, not virtual delivery. */
function readDeliveryCorrectionPackage(value: unknown): Record<string, unknown> {
  const packageInfo = optionalRecord(value);
  if (!packageInfo) throw providerInputError("Each change must contain old and new package objects");
  const products = objectArray(packageInfo.productInfos, "productInfos", providerInputError);
  if (products.length === 0) throw providerInputError("Each package must contain at least one product");
  return {
    delivery_id: requiredInputString(packageInfo.deliveryId, "deliveryId"),
    waybill_id: requiredInputString(packageInfo.waybillId, "waybillId"),
    product_infos: products.map((product) => {
      const count = positiveInteger(product.productCnt, "productCnt", providerInputError);
      if (!Number.isSafeInteger(count)) throw providerInputError("productCnt must be a safe positive integer");
      return {
        product_id: requiredInputString(product.productId, "productId"),
        sku_id: requiredInputString(product.skuId, "skuId"),
        product_cnt: count,
      };
    }),
  };
}

/** C2C evidence URLs include authorization query parameters; preserve them verbatim. */
function readAftersaleMedia(value: unknown): Record<string, unknown>[] {
  const media = objectArray(value, "mediaFiles", providerInputError);
  if (media.length === 0) throw providerInputError("mediaFiles must contain at least one evidence item");
  return media.map((item) => {
    if (item.type !== 1 && item.type !== 2)
      throw providerInputError("mediaFiles[].type must be 1 (image) or 2 (video)");
    const key = item.type === 1 ? "picture" : "video";
    if (
      item[item.type === 1 ? "video" : "picture"] !== undefined ||
      (item.type === 1 && item.videoPlayLength !== undefined)
    ) {
      throw providerInputError("Evidence fields must match the media type");
    }
    const reference = optionalRecord(item[key]);
    if (!reference) throw providerInputError(`mediaFiles[].${key} is required`);
    const duration = item.videoPlayLength;
    if (duration !== undefined && (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0)) {
      throw providerInputError("videoPlayLength must be a non-negative finite number");
    }
    return compactObject({
      type: item.type,
      [key]: { c2c_url: requiredInputString(reference.c2cUrl, "c2cUrl") },
      video_play_length: duration,
    });
  });
}

/** Compass only exposes complete historical days in China Standard Time. */
function readCompassDate(value: unknown): string {
  const date = requiredInputString(value, "date");
  const parsed = /^\d{8}$/.test(date)
    ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`)
    : new Date(Number.NaN);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10).replaceAll("-", "") !== date ||
    date >= today
  ) {
    throw providerInputError("date must be a valid YYYYMMDD date, yesterday or earlier in Asia/Shanghai");
  }
  return date;
}
