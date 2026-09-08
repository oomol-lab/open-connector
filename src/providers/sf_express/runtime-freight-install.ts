import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalNumber,
  optionalNumberLike,
  optionalRecord,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputNumber,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { optionalFlagNumber, requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express Freight install-service, supplier-integration, and supplier-bidding endpoints. */
export const sfExpressFreightInstallHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async freight_append_install_service(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_APPEND_ORDER",
      compactObject({
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        outerOrderId: optionalString(input.outer_order_id),
        installTypeCode: requiredInputString(input.install_type, "install_type"),
        shopName: optionalString(input.shop_name),
        remark: optionalString(input.remark),
        cargoList: readAppendCargoes(input.cargo_list),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express append install response");
    return {
      installOrderId: requiredString(record.installOrderId, "installOrderId", providerResponseError),
      installFee: optionalNumberLike(record.installFee) ?? null,
    };
  },
  async freight_create_install_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_INSTALL_ORDER",
      compactObject({
        outerOrderId: requiredInputString(input.outer_order_id, "outer_order_id"),
        monthlyCardNo: requiredInputString(input.monthly_card_no, "monthly_card_no"),
        serviceType: requiredInputString(input.service_type, "service_type"),
        isArrive: optionalFlagNumber(input.is_arrive),
        receiverContact: requiredInputString(input.receiver_contact, "receiver_contact"),
        receiverMobile: requiredInputString(input.receiver_mobile, "receiver_mobile"),
        receiverAddress: requiredInputString(input.receiver_address, "receiver_address"),
        pickupZone: optionalString(input.pickup_zone),
        pickupContact: optionalString(input.pickup_contact),
        pickupMobile: optionalString(input.pickup_mobile),
        pickupAddress: optionalString(input.pickup_address),
        parcelQuantity: optionalNumber(input.parcel_quantity),
        cargoTotalWeight: optionalNumber(input.cargo_total_weight),
        volume: optionalNumber(input.volume),
        expectStartTime: optionalString(input.expect_start_time),
        expectEndTime: optionalString(input.expect_end_time),
        logisticsCompany: optionalString(input.logistics_company),
        originalMailNo: optionalString(input.original_mail_no),
        shopName: optionalString(input.shop_name),
        remark: optionalString(input.remark),
        cargoes: readInstallCargoes(input.cargoes),
        addedServiceDtos: readAddedServices(input.added_services),
        customerSourceOrderId: optionalString(input.customer_source_order_id),
        orderChanel: optionalString(input.order_channel),
      }),
      context,
      "execute",
    );
    return normalizeInstallOrderResult(payload);
  },
  async freight_update_install_order(input, context) {
    const waybillNo = optionalString(input.waybill_no);
    const orderId = optionalString(input.order_id);
    const outerOrderId = optionalString(input.outer_order_id);
    await requestSfExpress(
      "FOP_RECE_FIS_INSTALL_UPDATE",
      compactObject({
        waybillNo,
        orderId,
        outerOrderId,
        logisticsInfo: optionalRecord(input.logistics_info),
        receiverInfo: optionalRecord(input.receiver_info),
        cargoUpdateInfoList: readCargoUpdates(input.cargo_update_info_list),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, waybillNo, orderId, outerOrderId };
  },
  async freight_cancel_install_order(input, context) {
    const waybillNo = optionalString(input.waybill_no);
    const orderId = optionalString(input.order_id);
    await requestSfExpress("FOP_RECE_FIS_CANCEL_INSTALL", compactObject({ waybillNo, orderId }), context, "execute");
    return { acknowledged: true, waybillNo, orderId };
  },
  async freight_query_install_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_INSTALL_QUERY",
      { outerOrderId: requiredInputString(input.outer_order_id, "outer_order_id") },
      context,
      "execute",
    );
    return normalizeInstallOrderResult(payload);
  },
  async freight_create_recovery_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_RECOVERY_ORDER",
      {
        outerOrderId: requiredInputString(input.outer_order_id, "outer_order_id"),
        senderContact: requiredInputString(input.sender_contact, "sender_contact"),
        senderMobile: requiredInputString(input.sender_mobile, "sender_mobile"),
        senderAddress: requiredInputString(input.sender_address, "sender_address"),
        expectDate: readRecoveryDate(input.expect_date),
        expectStartTime: requiredInputString(input.expect_start_time, "expect_start_time"),
        expectEndTime: requiredInputString(input.expect_end_time, "expect_end_time"),
        productList: objectArray(input.product_list, "product_list", providerInputError).map((item, index) => ({
          productSku: requiredInputString(item.product_sku, `product_list[${index}].product_sku`),
          count: 1,
        })),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express recovery order response");
    return {
      orderId: requiredString(record.orderId, "orderId", providerResponseError),
      outerOrderId: requiredString(record.outerOrderId, "outerOrderId", providerResponseError),
      feeList: readFeeList(record.feeList),
    };
  },
  async freight_notify_install_arrival(input, context) {
    const orderId = optionalString(input.order_id);
    const outerOrderId = optionalString(input.outer_order_id);
    await requestSfExpress(
      "FOP_RECE_FIS_ARRIVE",
      compactObject({
        orderId,
        outerOrderId,
        isArrive: 1,
        pickupZone: optionalString(input.pickup_zone),
        pickupContact: optionalString(input.pickup_contact),
        pickupMobile: optionalString(input.pickup_mobile),
        pickupAddress: optionalString(input.pickup_address),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderId, outerOrderId };
  },
  async freight_cancel_recovery_order(input, context) {
    const outerOrderId = requiredInputString(input.outer_order_id, "outer_order_id");
    await requestSfExpress(
      "FOP_RECE_FIS_CANCEL_RECOVERY",
      { outerOrderId, cancelReason: requiredInputString(input.cancel_reason, "cancel_reason") },
      context,
      "execute",
    );
    return { acknowledged: true, outerOrderId };
  },
  async freight_query_recovery_products(input, context) {
    const payload = await requestSfExpress("FOP_RECE_FIS_QRY_RECOVERY_PRODUCT", {}, context, "execute");
    return {
      products: objectArray(payload, "recovery products", providerResponseError).map((item, index) => ({
        businessName: requiredString(item.businessName, `products[${index}].businessName`, providerResponseError),
        businessCode: requiredString(item.businessCode, `products[${index}].businessCode`, providerResponseError),
        productCateName: requiredString(
          item.productCateName,
          `products[${index}].productCateName`,
          providerResponseError,
        ),
        productCateCode: requiredString(
          item.productCateCode,
          `products[${index}].productCateCode`,
          providerResponseError,
        ),
        categoryList: objectArray(
          item.categoryList ?? [],
          `products[${index}].categoryList`,
          providerResponseError,
        ).map((category) => ({
          cateName: requiredString(category.cateName, "categoryList[].cateName", providerResponseError),
          cateValue: requiredString(category.cateValue, "categoryList[].cateValue", providerResponseError),
        })),
        productSku: requiredString(item.productSku, `products[${index}].productSku`, providerResponseError),
      })),
    };
  },
  async freight_query_delivery_rules(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_HD_QUERY_RULE",
      { monthlyCardList: requiredStringArray(input.monthly_cards, "monthly_cards", providerInputError) },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express delivery rules response");
    return {
      rules: objectArray(record.serviceInfoResList ?? [], "serviceInfoResList", providerResponseError).map(
        (rule, index) => ({
          seviceId: requiredString(rule.seviceId, `serviceInfoResList[${index}].seviceId`, providerResponseError),
          serviceName: requiredString(
            rule.serviceName,
            `serviceInfoResList[${index}].serviceName`,
            providerResponseError,
          ),
          monthlyCard: requiredString(
            rule.monthlyCard,
            `serviceInfoResList[${index}].monthlyCard`,
            providerResponseError,
          ),
        }),
      ),
    };
  },
  async freight_audit_value_added_service(input, context) {
    const outerOrderId = requiredInputString(input.outer_order_id, "outer_order_id");
    await requestSfExpress(
      "FOP_RECE_FIS_AUDIT_AS",
      compactObject({
        outerOrderId,
        addedServiceCode: requiredInputString(input.added_service_code, "added_service_code"),
        auditStatus: requiredInputString(input.audit_status, "audit_status"),
        auditComments: optionalString(input.audit_comments),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, outerOrderId };
  },
  async freight_supplier_report_operation_node(input, context) {
    const operateCode = integer(input.operate_code, "operate_code", providerInputError);
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    const taskCode = requiredInputString(input.task_code, "task_code");
    if (operateCode !== 22) {
      requiredInputString(input.install_master, "install_master");
    }
    if (operateCode !== 18 && operateCode !== 22) {
      requiredInputString(input.install_contact, "install_contact");
    }
    if (operateCode === 10) {
      requiredInputString(input.app_start_time, "app_start_time");
      requiredInputString(input.app_end_time, "app_end_time");
    }
    const images = optionalStringList(input.images, "images");
    if ((operateCode === 3 || operateCode === 17 || operateCode === 20 || operateCode === 21) && !images?.length) {
      throw providerInputError("images is required when operate_code is 3, 17, 20, or 21.");
    }
    const payload = compactObject({
      waybillNo,
      taskCode,
      operateCode,
      operateTime: requiredInputString(input.operate_time, "operate_time"),
      content: requiredInputString(input.content, "content"),
      installMaster: optionalString(input.install_master),
      installContact: optionalString(input.install_contact),
      emergContactPhone: optionalString(input.emerg_contact_phone),
      appStartTime: optionalString(input.app_start_time),
      appEndTime: optionalString(input.app_end_time),
      bizExceptionCode: optionalString(input.biz_exception_code),
      images,
      videoUrl: optionalString(input.video_url),
      sn: optionalString(input.sn),
      faultCause: optionalStringList(input.fault_cause, "fault_cause"),
      isSendPart: optionalFlagNumber(input.is_send_part),
      isSelfPurchasePart: optionalFlagNumber(input.is_self_purchase_part),
      partModels: optionalStringList(input.part_models, "part_models"),
      partAmount: optionalNumber(input.part_amount),
      orderStatus: optionalString(input.order_status),
      partLogisticsInfos: readPartLogisticsInfos(input.part_logistics_infos),
    });
    if (operateCode === 21) {
      // Both flags must be stated for code 21; false is an answer, not an omission.
      if (payload.isSendPart === undefined || payload.isSelfPurchasePart === undefined) {
        throw providerInputError("is_send_part and is_self_purchase_part are required when operate_code is 21.");
      }
      const isSendPart = payload.isSendPart === 1;
      const isSelfPurchasePart = payload.isSelfPurchasePart === 1;
      if ((isSendPart || isSelfPurchasePart) && !payload.partModels?.length) {
        throw providerInputError(
          "part_models is required when operate_code is 21 and is_send_part or is_self_purchase_part is set.",
        );
      }
      if (isSelfPurchasePart && payload.partAmount === undefined) {
        throw providerInputError("part_amount is required when operate_code is 21 and is_self_purchase_part is set.");
      }
      if (!payload.faultCause?.length) {
        throw providerInputError("fault_cause is required when operate_code is 21.");
      }
    }
    if (operateCode === 22 && payload.orderStatus === undefined) {
      throw providerInputError("order_status is required when operate_code is 22.");
    }
    if (operateCode === 23 && !payload.partLogisticsInfos?.length) {
      throw providerInputError("part_logistics_infos is required when operate_code is 23.");
    }
    await requestSfExpress("FOP_RECE_FIS_ROUTER", payload, context, "execute");
    return { acknowledged: true, waybillNo, taskCode };
  },
  async freight_supplier_query_appointment_times(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_APPT_TIME",
      {
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        taskCode: requiredInputString(input.task_code, "task_code"),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express appointment times response");
    return {
      days: objectArray(record.days ?? [], "days", providerResponseError).map((day, index) => ({
        day: requiredString(day.day, `days[${index}].day`, providerResponseError),
        periods: objectArray(day.periods ?? [], `days[${index}].periods`, providerResponseError).map((period) => ({
          start: requiredString(period.start, "periods[].start", providerResponseError),
          end: requiredString(period.end, "periods[].end", providerResponseError),
        })),
      })),
    };
  },
  async freight_bid_submit_quote(input, context) {
    const orderNo = requiredInputString(input.order_no, "order_no");
    await requestSfExpress(
      "FOP_RECE_FIS_QUOTE",
      compactObject({
        orderNo,
        masterName: requiredInputString(input.master_name, "master_name"),
        avatar: optionalString(input.avatar),
        offerPrice: optionalNumber(input.offer_price),
        masterId: requiredInputString(input.master_id, "master_id"),
        goodRatePercent: optionalString(input.good_rate_percent),
        negativeCommentCount: optionalNumber(input.negative_comment_count),
        complaintCount: optionalNumber(input.complaint_count),
        coWorkTimes: optionalNumber(input.co_work_times),
        masterLatestGoodsCat: optionalString(input.master_latest_goods_cat),
        r30dTradeComplete: optionalNumber(input.r30d_trade_complete),
        starsAvg: optionalString(input.stars_avg),
        certifyAmount: optionalNumber(input.certify_amount),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderNo };
  },
  async freight_bid_report_operation_node(input, context) {
    const operateCode = requiredInputString(input.operate_code, "operate_code");
    const operateData = optionalRecord(input.operate_data);
    for (const requiredDataKey of bidOperateDataRequiredKeys[operateCode] ?? []) {
      if (optionalString(operateData?.[requiredDataKey]) === undefined) {
        throw providerInputError(`operate_data.${requiredDataKey} is required when operate_code is ${operateCode}.`);
      }
    }
    if (operateCode === "OP000004" && operateData?.functionFlag === "1" && !optionalString(operateData.remark)) {
      throw providerInputError("operate_data.remark is required when operate_data.functionFlag is 1.");
    }
    const orderNo = requiredInputString(input.order_no, "order_no");
    await requestSfExpress(
      "FOP_RECE_FIS_BID_OPEARTION_UPLOAD",
      compactObject({
        orderNo,
        content: requiredInputString(input.content, "content"),
        operateCode,
        operateTime: requiredInputString(input.operate_time, "operate_time"),
        operateData,
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderNo };
  },
  async freight_bid_report_add_fee_result(input, context) {
    const detailResult = requiredInputString(input.detail_result, "detail_result");
    if (detailResult === "2" && !optionalString(input.remark)) {
      throw providerInputError("remark is required when detail_result is 2 (师傅拒绝).");
    }
    const orderNo = requiredInputString(input.order_no, "order_no");
    await requestSfExpress(
      "FOP_RECE_FIS_BID_ADD_FEE_RESULT",
      compactObject({
        orderNo,
        addFeeNo: requiredInputString(input.add_fee_no, "add_fee_no"),
        detailResult,
        remark: optionalString(input.remark),
        addAmt: requiredInputNumber(input.add_amt, "add_amt"),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderNo };
  },
  async freight_supplier_apply_add_fee(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_SUP_ADD_FEE",
      compactObject({
        orderNo: requiredInputString(input.order_no, "order_no"),
        addFeeNo: requiredInputString(input.add_fee_no, "add_fee_no"),
        functionFlag: requiredInputString(input.function_flag, "function_flag"),
        addAmt: requiredInputNumber(input.add_amt, "add_amt"),
        remark: optionalString(input.remark),
        imgUrl: optionalString(input.img_url),
      }),
      context,
      "execute",
    );
    const record =
      payload === null || payload === undefined ? {} : requiredResponseRecord(payload, "SF Express add-fee response");
    return { sfAddFeeNo: optionalString(record.sfAddFeeNo) ?? null };
  },
  async freight_supplier_query_add_fee_result(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FIS_SUP_ADD_FEE_QUERY",
      {
        orderNo: requiredInputString(input.order_no, "order_no"),
        addFeeNo: requiredInputString(input.add_fee_no, "add_fee_no"),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express add-fee result response");
    return {
      detailResult: requiredString(record.detailResult, "detailResult", providerResponseError),
      remark: optionalString(record.remark) ?? null,
      addAmt: optionalNumberLike(record.addAmt) ?? null,
      refundAmt: optionalNumberLike(record.refundAmt) ?? null,
    };
  },
  async freight_bid_report_refund_result(input, context) {
    const refundStatus = requiredInputString(input.refund_status, "refund_status");
    if (refundStatus === "1" && !optionalString(input.remark)) {
      throw providerInputError("remark is required when refund_status is 1 (师傅拒绝).");
    }
    const orderNo = requiredInputString(input.order_no, "order_no");
    await requestSfExpress(
      "FOP_RECE_FIS_BID_REFUND_RESULT",
      compactObject({
        orderNo,
        refundNo: requiredInputString(input.refund_no, "refund_no"),
        refundStatus,
        remark: optionalString(input.remark),
        refundAmt: requiredInputNumber(input.refund_amt, "refund_amt"),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderNo };
  },
  async freight_bid_report_complaint_result(input, context) {
    const orderNo = requiredInputString(input.order_no, "order_no");
    await requestSfExpress(
      "FOP_RECE_FIS_COMPLAINT_RESULT",
      compactObject({
        orderNo,
        handleResult: optionalNumber(input.handle_result),
        payAmt: optionalString(input.pay_amt),
        evidenceUrls: optionalString(input.evidence_urls),
        handleTime: optionalString(input.handle_time),
        handleDesc: optionalString(input.handle_desc),
        isOnlineRefund: optionalFlagNumber(input.is_online_refund),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderNo };
  },
  async freight_bid_send_evidence_notice(input, context) {
    const orderNo = requiredInputString(input.order_no, "order_no");
    await requestSfExpress(
      "FOP_RECE_FIS_COMPLAINT_SUPPLY_NOTICE",
      compactObject({
        orderNo,
        noticeTime: optionalString(input.notice_time),
        expireTime: optionalString(input.expire_time),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderNo };
  },
  async freight_bid_submit_master_evidence(input, context) {
    const orderNo = requiredInputString(input.order_no, "order_no");
    await requestSfExpress(
      "FOP_RECE_FIS_COMPLAINT_MASTER_EVIDENCE",
      compactObject({
        orderNo,
        supplyId: requiredInputString(input.supply_id, "supply_id"),
        supplyTime: requiredInputString(input.supply_time, "supply_time"),
        complaintDesc: optionalString(input.complaint_desc),
        evidenceUrls: optionalString(input.evidence_urls),
        audioUrls: optionalString(input.audio_urls),
        videoUrls: optionalString(input.video_urls),
      }),
      context,
      "execute",
    );
    return { acknowledged: true, orderNo };
  },
};

/** The operate_data keys each bidding operate_code requires; absent means no key is mandated. */
const bidOperateDataRequiredKeys: Record<string, string[]> = {
  OP000006: ["installMaster", "installConcat"],
  OP000004: ["appTime"],
  OP000008: ["imgUrl"],
  OP000001: ["imgUrl"],
  OP000010: ["imgUrl"],
  OP000013: ["closeReason"],
};

/** Read an optional list of strings from action input, requiring a valid string array when present. */
function optionalStringList(value: unknown, fieldName: string): string[] | undefined {
  return value === undefined ? undefined : requiredStringArray(value, fieldName, providerInputError);
}

/** SF measures the pickup window on its own calendar, not the connector host's. */
const sfExpressCalendarTimeZone = "Asia/Shanghai";

/**
 * Read the numeric parts rather than a formatted string: a locale's date layout
 * is ICU data, not a serialization contract, so a host whose `en-CA` falls back
 * to another pattern would otherwise turn the window check into `NaN` and let
 * every date through.
 */
const sfExpressCalendarParts = new Intl.DateTimeFormat("en-US", {
  timeZone: sfExpressCalendarTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Midnight UTC on the current SF calendar day, the anchor the pickup window is measured from. */
function sfExpressCalendarToday(): number {
  const parts: Record<string, string> = {};
  for (const part of sfExpressCalendarParts.formatToParts(new Date())) {
    parts[part.type] = part.value;
  }
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

/** Read the recovery pickup date, enforcing the documented within-3-days window. */
function readRecoveryDate(value: unknown): string {
  const date = requiredInputString(value, "expect_date");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  // Date() normalizes impossible dates (e.g. Feb 30 rolls into March) instead of rejecting.
  const parsed = match ? new Date(`${date}T00:00:00Z`) : null;
  if (
    !match ||
    !parsed ||
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  ) {
    throw providerInputError("expect_date must be a valid date in yyyy-MM-dd format.");
  }
  const diffDays = Math.round((parsed.getTime() - sfExpressCalendarToday()) / 86_400_000);
  if (diffDays < 0 || diffDays > 3) {
    throw providerInputError("expect_date must be within 3 days from today.");
  }
  return date;
}

function readAppendCargoes(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "cargo_list", providerInputError).map((item, index) => {
    const standServiceName = optionalString(item.stand_service_name);
    const standServiceCode = optionalString(item.stand_service_code);
    const cusServiceName = optionalString(item.cus_service_name);
    const cusServiceCode = optionalString(item.cus_service_code);
    const standardFields = [standServiceName, standServiceCode].filter((field) => field !== undefined).length;
    const customerFields = [cusServiceName, cusServiceCode].filter((field) => field !== undefined).length;
    // SF's either-or rule: exactly one pair fully present, the other fully absent.
    if (!((standardFields === 2 && customerFields === 0) || (standardFields === 0 && customerFields === 2))) {
      throw providerInputError(
        `cargo_list[${index}] requires exactly one complete category pair: stand_service_name + stand_service_code, or cus_service_name + cus_service_code.`,
      );
    }
    return compactObject({
      count: optionalNumber(item.count),
      standServiceName,
      standServiceCode,
      cusServiceName,
      cusServiceCode,
      cargoImages: optionalStringList(item.cargo_images, `cargo_list[${index}].cargo_images`),
      cargoEvnImages: optionalStringList(item.cargo_evn_images, `cargo_list[${index}].cargo_evn_images`),
    });
  });
}

function readInstallCargoes(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "cargoes", providerInputError).map((item, index) => {
    const productName = optionalString(item.product_name);
    const productSku = optionalString(item.product_sku);
    const customerProductSku = optionalString(item.customer_product_sku);
    const customerProductName = optionalString(item.customer_product_name);
    const standardFields = [productName, productSku].filter((field) => field !== undefined).length;
    const customerFields = [customerProductSku, customerProductName].filter((field) => field !== undefined).length;
    // SF's either-or rule: exactly one pair fully present, the other fully absent.
    if (!((standardFields === 2 && customerFields === 0) || (standardFields === 0 && customerFields === 2))) {
      throw providerInputError(
        `cargoes[${index}] requires exactly one complete category pair: product_name + product_sku, or customer_product_name + customer_product_sku.`,
      );
    }
    return compactObject({
      count: optionalNumber(item.count),
      productName,
      productSku,
      customerProductSku,
      customerProductName,
      goodsRemark: optionalString(item.goods_remark),
      repairRemark: optionalString(item.repair_remark),
      imgUrls: optionalStringList(item.img_urls, `cargoes[${index}].img_urls`),
      videoLinkUrls: optionalStringList(item.video_link_urls, `cargoes[${index}].video_link_urls`),
    });
  });
}

function readAddedServices(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "added_services", providerInputError).map((item, index) =>
    compactObject({
      addedServiceName: requiredInputString(item.added_service_name, `added_services[${index}].added_service_name`),
      addedServiceCode: optionalString(item.added_service_code),
      addedServicePrice: optionalString(item.added_service_price),
    }),
  );
}

function readCargoUpdates(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "cargo_update_info_list", providerInputError).map((item) =>
    compactObject({
      cusServiceCode: optionalString(item.cus_service_code),
      cusServiceName: optionalString(item.cus_service_name),
      standServiceCode: optionalString(item.stand_service_code),
      standServiceName: optionalString(item.stand_service_name),
      cargoImages: optionalStringList(item.cargo_images, "cargo_update_info_list[].cargo_images"),
      cargoEvnImages: optionalStringList(item.cargo_evn_images, "cargo_update_info_list[].cargo_evn_images"),
    }),
  );
}

function readPartLogisticsInfos(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "part_logistics_infos", providerInputError).map((item, index) => ({
    recycleNo: requiredInputString(item.recycle_no, `part_logistics_infos[${index}].recycle_no`),
    logisticsName: requiredInputString(item.logistics_name, `part_logistics_infos[${index}].logistics_name`),
    waybillNo: requiredInputString(item.waybill_no, `part_logistics_infos[${index}].waybill_no`),
    images: requiredStringArray(item.images, `part_logistics_infos[${index}].images`, providerInputError),
  }));
}

function normalizeInstallOrderResult(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express install order response");
  return {
    orderId: requiredString(record.orderId, "orderId", providerResponseError),
    outerOrderId: requiredString(record.outerOrderId, "outerOrderId", providerResponseError),
    installStatus: requiredString(record.installStatus, "installStatus", providerResponseError),
    feeList: readFeeList(record.feeList),
  };
}

function readFeeList(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value ?? [], "feeList", providerResponseError).map((fee, index) => ({
    feeName: requiredString(fee.feeName, `feeList[${index}].feeName`, providerResponseError),
    feeTypeCode: requiredString(fee.feeTypeCode, `feeList[${index}].feeTypeCode`, providerResponseError),
    feeAmt: optionalNumberLike(fee.feeAmt) ?? null,
  }));
}
