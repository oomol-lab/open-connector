import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema } from "./schemas.ts";

const service = "sf_express";

const timePattern = "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$";

const installTypeSchema = s.stringEnum(
  "The service mode: 1 = 仅安装 (install only), 2 = 提货+安装 (pickup and install).",
  ["1", "2"],
);

const serviceTypeSchema = s.stringEnum(
  "The service type: 2 = 提货并安装 (pickup and install), 1 = 仅安装 (install only), 7 = 维修 (repair).",
  ["1", "2", "7"],
);

const appendCargoSchema = s.object(
  "One install cargo entry; the standard category pair and the customer category pair are mutually exclusive (provide one).",
  {
    count: s.integer("The install quantity.", { minimum: 1 }),
    stand_service_name: s.string("The standard category name."),
    stand_service_code: s.string("The standard category code."),
    cus_service_name: s.string("The customer category name."),
    cus_service_code: s.string("The customer category code."),
    cargo_images: s.stringArray("The cargo image URLs, up to 8.", { maxItems: 8 }),
    cargo_evn_images: s.stringArray("The install environment image URLs, up to 8.", { maxItems: 8 }),
  },
  {
    optional: [
      "stand_service_name",
      "stand_service_code",
      "cus_service_name",
      "cus_service_code",
      "cargo_images",
      "cargo_evn_images",
    ],
  },
);

const installCargoSchema = s.object(
  "One install cargo entry; provide either the standard category (product_name/product_sku) or the customer category (customer_product_name/customer_product_sku).",
  {
    count: s.integer("The install quantity.", { minimum: 1 }),
    product_name: s.string("The standard category name."),
    product_sku: s.string("The standard category code."),
    customer_product_sku: s.string("The customer category code."),
    customer_product_name: s.string("The customer category name."),
    goods_remark: s.string("The goods remark, for example special installation notes."),
    repair_remark: s.string("The repair remark; recommended when service_type is 7 (维修)."),
    img_urls: s.stringArray("The cargo image URLs, up to 8.", { maxItems: 8 }),
    video_link_urls: s.stringArray("The cargo or install-process video URLs; at most one is supported.", {
      maxItems: 1,
    }),
  },
  {
    optional: [
      "product_name",
      "product_sku",
      "customer_product_sku",
      "customer_product_name",
      "goods_remark",
      "repair_remark",
      "img_urls",
      "video_link_urls",
    ],
  },
);

const addedServiceSchema = s.object(
  "One value-added service.",
  {
    added_service_name: s.nonEmptyString("The value-added service name, for example 好评返现."),
    added_service_code: s.string("The value-added service code, for example JZ17 for 好评返现."),
    added_service_price: s.string("The service price, when the service supports pricing."),
  },
  { optional: ["added_service_code", "added_service_price"] },
);

const feeItemSchema = s.requiredObject("One fee item.", {
  feeName: s.string("The fee name, for example 安装费."),
  feeTypeCode: s.string("The fee type code, for example JZ01."),
  feeAmt: s.nullableNumber("The fee amount in CNY; null when SF omits it."),
});

const installOrderResultOutputSchema = s.object("The install order result.", {
  orderId: s.string("The SF install order number."),
  outerOrderId: s.string("The client order number, echoed back."),
  installStatus: s.string(
    "The install status: 0 已下单(待分配师傅), 1 已提货, 2 预约中, 3 已预约, 5 已完工, 6 异常, 7 已取消, 8 已分配安装师傅, 9 已上门, 10 已检查.",
  ),
  feeList: s.array("The order fee breakdown.", feeItemSchema),
});

const acknowledgedOutputSchema = (description: string, fields: Record<string, ReturnType<typeof s.string>>) =>
  s.object(description, {
    ...fields,
    acknowledged: s.boolean("Whether SF accepted the request."),
  });

const operateTimeSchema = s.nonEmptyString("The operation time in yyyy-MM-dd HH:mm:ss format.", {
  pattern: timePattern,
});

/** Actions for the SF Express Freight install-service, supplier-integration, and supplier-bidding endpoints. */
export const sfExpressFreightInstallActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "freight_append_install_service",
    description:
      "Append an install service to an existing SF waybill. The append is only confirmed once the waybill is picked up; the final result arrives via the install status push. This endpoint requires SF sales onboarding (联系客户经理).",
    requiredScopes: [],
    inputSchema: s.object(
      "The install service to append.",
      {
        waybill_no: s.nonEmptyString("The SF waybill number."),
        install_type: installTypeSchema,
        outer_order_id: s.string("The source order number."),
        shop_name: s.string("The source shop name."),
        remark: s.string("The remark."),
        cargo_list: s.array("The install cargo entries.", appendCargoSchema, { minItems: 1 }),
      },
      { optional: ["outer_order_id", "shop_name", "remark"] },
    ),
    outputSchema: s.object("The append result.", {
      installOrderId: s.string("The install order number."),
      installFee: s.nullableNumber("The install fee in CNY."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_create_install_order",
    description: "Create an SF install order (安装单下单): install-only, pickup-and-install, or repair.",
    requiredScopes: [],
    inputSchema: s.object(
      "The install order to create.",
      {
        outer_order_id: s.nonEmptyString("The unique client order number; duplicates are rejected."),
        monthly_card_no: s.nonEmptyString("The SF monthly settlement card number (月结卡号) used for billing."),
        service_type: serviceTypeSchema,
        is_arrive: s.boolean("Whether the goods have arrived at the customer."),
        receiver_contact: s.nonEmptyString("The customer name."),
        receiver_mobile: s.nonEmptyString(
          "The customer mobile number; virtual numbers are supported, extensions split by comma or dash.",
        ),
        receiver_address: s.nonEmptyString("The customer detailed address."),
        pickup_zone: s.string("The pickup location name (提货地名称), used for pickup-and-install orders."),
        pickup_contact: s.string("The pickup contact name."),
        pickup_mobile: s.string("The pickup contact mobile number."),
        pickup_address: s.string("The pickup detailed address."),
        parcel_quantity: s.integer("The package count.", { minimum: 1 }),
        cargo_total_weight: s.number("The total cargo weight in kilograms."),
        volume: s.number("The total cargo volume in cubic centimeters."),
        expect_start_time: dateTimeSchema("The expected appointment window start in yyyy-MM-dd HH:mm:ss format."),
        expect_end_time: dateTimeSchema("The expected appointment window end in yyyy-MM-dd HH:mm:ss format."),
        logistics_company: s.string("The logistics company name that carried the goods."),
        original_mail_no: s.string("The original logistics waybill number."),
        shop_name: s.string("The source shop name."),
        remark: s.string("The order remark, for example special installation requirements."),
        cargoes: s.array("The install cargo entries.", installCargoSchema, { minItems: 1 }),
        added_services: s.array("The value-added services.", addedServiceSchema),
        customer_source_order_id: s.string("The source order number."),
        order_channel: s.string("The source platform."),
      },
      {
        optional: [
          "is_arrive",
          "pickup_zone",
          "pickup_contact",
          "pickup_mobile",
          "pickup_address",
          "parcel_quantity",
          "cargo_total_weight",
          "volume",
          "expect_start_time",
          "expect_end_time",
          "logistics_company",
          "original_mail_no",
          "shop_name",
          "remark",
          "added_services",
          "customer_source_order_id",
          "order_channel",
        ],
      },
    ),
    outputSchema: installOrderResultOutputSchema,
    followUpActions: ["sf_express.freight_query_install_order"],
  }),
  defineProviderAction(service, {
    name: "freight_update_install_order",
    description:
      "Update an install order's customer info, non-SF logistics info, or cargo images. Customer and logistics info can only change before a master is assigned; cargo images can change until the waybill is signed.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The install order update; identify the order with one of waybill_no, order_id, or outer_order_id.",
        {
          waybill_no: s.nonEmptyString("The SF waybill number."),
          order_id: s.nonEmptyString("The SF install order number."),
          outer_order_id: s.nonEmptyString("The client order number."),
          logistics_info: s.requiredObject("The non-SF logistics info to update.", {
            logisticsCompany: s.nonEmptyString("The logistics company name."),
            originalMailNo: s.nonEmptyString("The original logistics waybill number."),
          }),
          receiver_info: s.requiredObject("The customer info to update.", {
            receiverContact: s.nonEmptyString("The customer name."),
            receiverMobile: s.nonEmptyString("The customer mobile number."),
            receiverAddress: s.nonEmptyString("The customer detailed address."),
          }),
          cargo_update_info_list: s.array(
            "The cargo image updates; category code/name must match the values used when ordering.",
            s.object("One cargo image update.", {
              cus_service_code: s.string("The customer category code used at order time."),
              cus_service_name: s.string("The customer category name used at order time."),
              stand_service_code: s.string("The standard category code used at order time."),
              stand_service_name: s.string("The standard category name used at order time."),
              cargo_images: s.stringArray("The cargo image URLs, up to 8; an empty array clears them.", {
                maxItems: 8,
              }),
              cargo_evn_images: s.stringArray("The install environment image URLs, up to 8.", { maxItems: 8 }),
            }),
          ),
        },
        {
          optional: [
            "waybill_no",
            "order_id",
            "outer_order_id",
            "logistics_info",
            "receiver_info",
            "cargo_update_info_list",
          ],
        },
      ),
      ["waybill_no", "order_id", "outer_order_id"],
    ),
    outputSchema: acknowledgedOutputSchema("The update acknowledgement.", {
      waybillNo: s.string("The waybill number the update applied to, when given."),
      orderId: s.string("The install order number the update applied to, when given."),
      outerOrderId: s.string("The client order number the update applied to, when given."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_cancel_install_order",
    description: "Cancel an appended install service; the waybill must not be picked up yet.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The install service to cancel; provide waybill_no or order_id.",
        {
          waybill_no: s.nonEmptyString("The SF waybill number."),
          order_id: s.nonEmptyString("The SF install order number."),
        },
        { optional: ["waybill_no", "order_id"] },
      ),
      ["waybill_no", "order_id"],
    ),
    outputSchema: acknowledgedOutputSchema("The cancellation acknowledgement.", {
      waybillNo: s.string("The waybill number the cancellation applied to, when given."),
      orderId: s.string("The install order number the cancellation applied to, when given."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_query_install_order",
    description: "Query an SF install order's status and fee breakdown by client order number.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The install order to query.", {
      outer_order_id: s.nonEmptyString("The client order number."),
    }),
    outputSchema: installOrderResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "freight_create_recovery_order",
    description:
      "Create an SF recovery order (回收单下单) for door-to-door goods recycling. The pickup date must be within 3 days, the window whole hours between 08:00 and 21:00.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The recovery order to create.", {
      outer_order_id: s.nonEmptyString("The unique client order number."),
      sender_contact: s.nonEmptyString("The customer name."),
      sender_mobile: s.nonEmptyString("The customer mobile number."),
      sender_address: s.nonEmptyString("The door-to-door pickup address."),
      expect_date: s.nonEmptyString("The expected pickup date in yyyy-MM-dd format; within 3 days.", {
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      }),
      expect_start_time: s.nonEmptyString(
        "The expected pickup window start in HH:mm format, whole hours from 08:00 through 21:00.",
        {
          pattern: "^(0[89]|1[0-9]|2[01]):00$",
        },
      ),
      expect_end_time: s.nonEmptyString(
        "The expected pickup window end in HH:mm format, whole hours from 08:00 through 21:00.",
        { pattern: "^(0[89]|1[0-9]|2[01]):00$" },
      ),
      product_list: s.array(
        "The recovery products; exactly one product with count 1 is supported.",
        s.object(
          "One recovery product.",
          {
            product_sku: s.nonEmptyString("The recovery category SKU, from freight_query_recovery_products."),
            count: s.integer("The recovery quantity; fixed to 1.", { minimum: 1, maximum: 1 }),
          },
          { optional: ["count"] },
        ),
        { minItems: 1, maxItems: 1 },
      ),
    }),
    outputSchema: s.object("The created recovery order.", {
      orderId: s.string("The SF recovery order number."),
      outerOrderId: s.string("The client order number, echoed back."),
      feeList: s.array("The order fee breakdown.", feeItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_notify_install_arrival",
    description:
      "Mark an install order's goods as arrived (到货通知), optionally completing the pickup address. Only the not-arrived to arrived transition is supported.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The install order to mark as arrived; provide order_id or outer_order_id.",
        {
          order_id: s.nonEmptyString("The SF install order number."),
          outer_order_id: s.nonEmptyString("The client order number."),
          pickup_zone: s.string("The pickup location name."),
          pickup_contact: s.string("The pickup contact name."),
          pickup_mobile: s.string("The pickup contact mobile number."),
          pickup_address: s.string("The pickup detailed address."),
        },
        {
          optional: ["order_id", "outer_order_id", "pickup_zone", "pickup_contact", "pickup_mobile", "pickup_address"],
        },
      ),
      ["order_id", "outer_order_id"],
    ),
    outputSchema: acknowledgedOutputSchema("The arrival acknowledgement.", {
      orderId: s.string("The install order number marked as arrived, when given."),
      outerOrderId: s.string("The client order number marked as arrived, when given."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_cancel_recovery_order",
    description: "Cancel an SF recovery order; not possible once the master has arrived.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The recovery order to cancel.", {
      outer_order_id: s.nonEmptyString("The client order number of the recovery order."),
      cancel_reason: s.nonEmptyString("The cancellation reason."),
    }),
    outputSchema: acknowledgedOutputSchema("The cancellation acknowledgement.", {
      outerOrderId: s.string("The client order number that was cancelled."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_query_recovery_products",
    description:
      "Query the full SF recovery product catalog (回收品类). The list is large and returned in full; cache it instead of calling repeatedly.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to query the recovery product catalog.", {}),
    outputSchema: s.object("The recovery product catalog.", {
      products: s.array(
        "The recovery products.",
        s.object("One recovery product.", {
          businessName: s.string("The business name, for example 电视机."),
          businessCode: s.string("The business code."),
          productCateName: s.string("The category name, for example 小米."),
          productCateCode: s.string("The category code."),
          categoryList: s.array(
            "The category attributes.",
            s.object("One category attribute.", {
              cateName: s.string("The attribute name."),
              cateValue: s.string("The attribute value."),
            }),
          ),
          productSku: s.string("The recovery category SKU used when ordering."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_query_delivery_rules",
    description: "Query the home-delivery service rules (宅配规则) bound to one or more SF monthly cards.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The monthly cards to query.", {
      monthly_cards: s.stringArray("The SF monthly settlement card numbers (月结卡号).", { minItems: 1 }),
    }),
    outputSchema: s.object("The delivery service rules.", {
      rules: s.array(
        "The service rules bound to the given cards.",
        s.object("One service rule.", {
          seviceId: s.string("The service rule ID (upstream field name seviceId)."),
          serviceName: s.string("The service rule name."),
          monthlyCard: s.string("The monthly card the rule is bound to."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_audit_value_added_service",
    description: "Audit a value-added service request (审核增值服务), for example the JZ17 好评返现 service.",
    requiredScopes: [],
    inputSchema: s.object(
      "The audit decision.",
      {
        outer_order_id: s.nonEmptyString("The client order number."),
        added_service_code: s.nonEmptyString("The value-added service code, for example JZ17."),
        audit_status: s.stringEnum("The audit decision.", ["AUDIT_PASSED", "AUDIT_REFUSED"]),
        audit_comments: s.string("The audit comments."),
      },
      { optional: ["audit_comments"] },
    ),
    outputSchema: acknowledgedOutputSchema("The audit acknowledgement.", {
      outerOrderId: s.string("The client order number the audit applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_supplier_report_operation_node",
    description:
      "Report an install-task operation node to SF as the supplier (操作节点回传): assign master, pickup, appointment, arrival check, completion, review, fault detection, and more. Required fields depend on operate_code; images are required for codes 3, 17, 20, 21.",
    requiredScopes: [],
    inputSchema: s.object(
      "The operation node to report.",
      {
        waybill_no: s.nonEmptyString("The SF master waybill number."),
        task_code: s.nonEmptyString("The task code identifying the install task."),
        operate_code: s.integer(
          "The operation code: 1 分配师傅, 3 完工, 9 提货, 10 预约成功, 14 预约失败, 16 上门打卡, 17 检查, 18 重新指派师傅, 20 好评返现, 21 检测, 22 下单结果回传, 23 配件返厂.",
        ),
        operate_time: operateTimeSchema,
        content: s.nonEmptyString("The operation description."),
        install_master: s.nonEmptyString(
          "The install master name (or the operator before one is assigned); required for every code except 22.",
        ),
        install_contact: s.nonEmptyString("The install master contact; required for every code except 18 and 22."),
        emerg_contact_phone: s.nonEmptyString("The install master's emergency contact; used with code 1."),
        app_start_time: dateTimeSchema("The appointment window start; required for code 10."),
        app_end_time: dateTimeSchema("The appointment window end; required for code 10."),
        biz_exception_code: s.stringEnum(
          "The appointment failure reason: 1 电话不通, 2 电话错误, 3 未确定安装时间, 4 产品未到货, 5 暂未装修好; used with code 14.",
          ["1", "2", "3", "4", "5"],
        ),
        images: s.stringArray("The operation image URLs, up to 10; required for codes 3, 17, 20, 21.", {
          maxItems: 10,
        }),
        video_url: s.string("The operation video URL; used with code 3."),
        sn: s.string("The machine SN code; used with code 3."),
        fault_cause: s.stringArray("The fault causes, up to 3; required for code 21.", { maxItems: 3 }),
        is_send_part: s.boolean("Whether replacement parts must be sent; required for code 21."),
        is_self_purchase_part: s.boolean("Whether the customer bought the parts themselves; required for code 21."),
        part_models: s.stringArray(
          "The part models; required for code 21 when is_send_part or is_self_purchase_part is set.",
        ),
        part_amount: s.number(
          "The self-purchased part amount in CNY; required for code 21 when is_self_purchase_part is set.",
        ),
        order_status: s.stringEnum("The order result: 1 下单成功, 2 下单失败; required for code 22.", ["1", "2"]),
        part_logistics_infos: s.array(
          "The return logistics entries; required for code 23.",
          s.requiredObject("One part return logistics entry.", {
            recycle_no: s.nonEmptyString("The part return number from the install task push."),
            logistics_name: s.nonEmptyString("The carrier name."),
            waybill_no: s.nonEmptyString("The return waybill number."),
            images: s.stringArray("The return waybill photos, up to 3.", { maxItems: 3 }),
          }),
        ),
      },
      {
        optional: [
          "install_master",
          "install_contact",
          "emerg_contact_phone",
          "app_start_time",
          "app_end_time",
          "biz_exception_code",
          "images",
          "video_url",
          "sn",
          "fault_cause",
          "is_send_part",
          "is_self_purchase_part",
          "part_models",
          "part_amount",
          "order_status",
          "part_logistics_infos",
        ],
      },
    ),
    outputSchema: acknowledgedOutputSchema("The report acknowledgement.", {
      waybillNo: s.string("The waybill number the report applied to."),
      taskCode: s.string("The task code the report applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_supplier_query_appointment_times",
    description: "Query the appointment times a supplier's master may offer for an install task (送装协同可预约时间).",
    requiredScopes: [],
    inputSchema: s.requiredObject("The install task to query.", {
      waybill_no: s.nonEmptyString("The SF master waybill number."),
      task_code: s.nonEmptyString("The task code identifying the install task."),
    }),
    outputSchema: s.object("The available appointment times.", {
      days: s.array(
        "The bookable days.",
        s.object("One bookable day.", {
          day: s.string("The bookable date in yyyy-MM-dd format."),
          periods: s.array(
            "The bookable periods.",
            s.object("One bookable period.", {
              start: s.string("The period start in HH:mm format."),
              end: s.string("The period end in HH:mm format."),
            }),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_bid_submit_quote",
    description: "Submit a supplier master's quote for a bidding install order (回传报价).",
    requiredScopes: [],
    inputSchema: s.object(
      "The quote to submit.",
      {
        order_no: s.nonEmptyString("The install order number."),
        master_name: s.nonEmptyString("The master name."),
        master_id: s.nonEmptyString("The supplier's unique master ID."),
        offer_price: s.number("The quoted price in CNY, up to 2 decimal places.", { exclusiveMinimum: 0 }),
        avatar: s.string("The master avatar image URL."),
        good_rate_percent: s.string("The master's positive review rate, 0.1-100 without the % sign."),
        negative_comment_count: s.integer("The master's negative review count."),
        complaint_count: s.integer("The master's complaint count."),
        co_work_times: s.integer("The master's cooperation count."),
        master_latest_goods_cat: s.string("The goods category the master served most recently."),
        r30d_trade_complete: s.integer("The master's completed orders in the last 30 days."),
        stars_avg: s.string("The master's overall rating, 0.1-5, for example 4.5."),
        certify_amount: s.number("The master's deposit amount in CNY."),
      },
      {
        optional: [
          "avatar",
          "good_rate_percent",
          "negative_comment_count",
          "complaint_count",
          "co_work_times",
          "master_latest_goods_cat",
          "r30d_trade_complete",
          "stars_avg",
          "certify_amount",
        ],
      },
    ),
    outputSchema: acknowledgedOutputSchema("The quote acknowledgement.", {
      orderNo: s.string("The install order number the quote applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_bid_report_operation_node",
    description:
      "Report an operation node for a bidding install order (供应商自主报价操作节点回传). operate_data's required keys depend on operate_code: OP000006 needs installMaster+installConcat, OP000004 needs appTime, OP000008/OP000001/OP000010 need imgUrl, OP000013 needs closeReason.",
    requiredScopes: [],
    inputSchema: s.object(
      "The operation node to report.",
      {
        order_no: s.nonEmptyString("The install order number."),
        content: s.nonEmptyString("The operation description."),
        operate_code: s.stringEnum(
          "The operation code: OP000006 已分配师傅, OP000004 已预约, OP000000 提货, OP000007 上门打卡, OP000008 装前检查, OP000001 已完工, OP000010 好评返现, OP000011 验收, OP000013 关闭.",
          ["OP000006", "OP000004", "OP000000", "OP000007", "OP000008", "OP000001", "OP000010", "OP000011", "OP000013"],
        ),
        operate_time: operateTimeSchema,
        operate_data: s.record(
          "The operation data; required keys depend on operate_code.",
          s.string("One operation data value; see the action description for the key each operate_code requires."),
        ),
      },
      { optional: ["operate_data"] },
    ),
    outputSchema: acknowledgedOutputSchema("The report acknowledgement.", {
      orderNo: s.string("The install order number the report applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_bid_report_add_fee_result",
    description: "Report the master's decision on a bidding install order's add-fee request (增加费用结果回传).",
    requiredScopes: [],
    inputSchema: s.object(
      "The add-fee decision.",
      {
        order_no: s.nonEmptyString("The install order number."),
        add_fee_no: s.nonEmptyString("The add-fee serial number being answered."),
        detail_result: s.stringEnum("The decision: 1 = 师傅同意 (accepted), 2 = 师傅拒绝 (rejected).", ["1", "2"]),
        remark: s.string("The rejection reason; required when detail_result is 2."),
        add_amt: s.number("The add-fee amount in CNY; must match the original request.", { exclusiveMinimum: 0 }),
      },
      { optional: ["remark", "add_amt"] },
    ),
    outputSchema: acknowledgedOutputSchema("The decision acknowledgement.", {
      orderNo: s.string("The install order number the decision applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_supplier_apply_add_fee",
    description: "Apply for an add-fee on a bidding install order as the supplier (供应商侧发起增加费用).",
    requiredScopes: [],
    inputSchema: s.object(
      "The add-fee application.",
      {
        order_no: s.nonEmptyString("The install order number."),
        add_fee_no: s.nonEmptyString("The unique add-fee serial number for this application."),
        function_flag: s.stringEnum("The operation: 0 = 申请增加费用 (apply), 1 = 取消增加费用 (cancel).", ["0", "1"]),
        add_amt: s.number("The add-fee amount in CNY, up to 2 decimal places.", { exclusiveMinimum: 0 }),
        remark: s.string("The add-fee reason."),
        img_url: s.string("The add-fee image URLs, comma-separated."),
      },
      { optional: ["add_amt", "remark", "img_url"] },
    ),
    outputSchema: s.object("The add-fee application result.", {
      sfAddFeeNo: s.nullableString("The SF add-fee serial number; keep it for reconciliation."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_supplier_query_add_fee_result",
    description:
      "Query the result of a supplier add-fee application (增加费用结果查询); the fallback when the result push or report fails.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The add-fee application to query.", {
      order_no: s.nonEmptyString("The install order number."),
      add_fee_no: s.nonEmptyString("The add-fee serial number to query."),
    }),
    outputSchema: s.object("The add-fee result.", {
      detailResult: s.string("The result: 0 待处理, 1 用户同意, 2 用户拒绝, 3 师傅取消."),
      remark: s.nullableString("The rejection reason when detailResult is 2."),
      addAmt: s.nullableNumber("The add-fee amount in CNY."),
      refundAmt: s.nullableNumber("The refund amount in CNY, when present."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_bid_report_refund_result",
    description: "Report the master's decision on a bidding install order's refund request (退款结果回传).",
    requiredScopes: [],
    inputSchema: s.object(
      "The refund decision.",
      {
        order_no: s.nonEmptyString("The install order number."),
        refund_no: s.nonEmptyString("The refund serial number being answered."),
        refund_status: s.stringEnum("The decision: 0 = 师傅同意 (accepted), 1 = 师傅拒绝 (rejected).", ["0", "1"]),
        remark: s.string("The rejection reason; required when refund_status is 1."),
        refund_amt: s.number("The refund amount in CNY; must match the original request.", { exclusiveMinimum: 0 }),
      },
      { optional: ["remark", "refund_amt"] },
    ),
    outputSchema: acknowledgedOutputSchema("The decision acknowledgement.", {
      orderNo: s.string("The install order number the decision applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_bid_report_complaint_result",
    description: "Report the complaint handling result for a bidding install order (接收投诉结果).",
    requiredScopes: [],
    inputSchema: s.object(
      "The complaint result.",
      {
        order_no: s.nonEmptyString("The install order number."),
        handle_result: s.integer("The handling result: 1 = 成立 (upheld), 2 = 不成立 (dismissed).", {
          minimum: 1,
          maximum: 2,
        }),
        pay_amt: s.string("The compensation amount in CNY."),
        evidence_urls: s.string("The handling evidence URLs, comma-separated."),
        handle_time: s.string("The handling time in yyyy-MM-dd HH:mm format.", {
          pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$",
        }),
        handle_desc: s.string("The handling description.", { maxLength: 1024 }),
        is_online_refund: s.boolean("Whether to refund online."),
      },
      {
        optional: ["pay_amt", "evidence_urls", "handle_time", "handle_desc", "is_online_refund"],
      },
    ),
    outputSchema: acknowledgedOutputSchema("The report acknowledgement.", {
      orderNo: s.string("The install order number the result applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_bid_send_evidence_notice",
    description:
      "Ask the customer for supplementary evidence while handling a complaint (通知用户补充举证). The deadline defaults to 12 hours after the notice time.",
    requiredScopes: [],
    inputSchema: s.object(
      "The evidence request.",
      {
        order_no: s.nonEmptyString("The install order number."),
        notice_time: dateTimeSchema("The notice time in yyyy-MM-dd HH:mm:ss format; defaults to now."),
        expire_time: dateTimeSchema("The evidence deadline in yyyy-MM-dd HH:mm:ss format."),
      },
      { optional: ["notice_time", "expire_time"] },
    ),
    outputSchema: acknowledgedOutputSchema("The notice acknowledgement.", {
      orderNo: s.string("The install order number the notice applied to."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_bid_submit_master_evidence",
    description: "Submit the master's evidence for a complaint on a bidding install order (师傅举证回传).",
    requiredScopes: [],
    inputSchema: s.object(
      "The evidence to submit.",
      {
        order_no: s.nonEmptyString("The install order number."),
        supply_id: s.nonEmptyString("The unique evidence submission ID, used for deduplication."),
        supply_time: operateTimeSchema,
        complaint_desc: s.string("The evidence description."),
        evidence_urls: s.string("The evidence image URLs, comma-separated."),
        audio_urls: s.string("The evidence audio URLs, comma-separated."),
        video_urls: s.string("The evidence video URLs, comma-separated."),
      },
      { optional: ["complaint_desc", "evidence_urls", "audio_urls", "video_urls"] },
    ),
    outputSchema: acknowledgedOutputSchema("The evidence acknowledgement.", {
      orderNo: s.string("The install order number the evidence applied to."),
    }),
  }),
];
