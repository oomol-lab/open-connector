import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalIntegerLike,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  recordOrEmpty,
  requiredBoolean,
  requiredRawString,
  requiredRecord,
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
import { requestSfExpress } from "./runtime.ts";

/**
 * Handlers for the SF Express station endpoints. Three wire families share the
 * category: the KB family sends a flat snake_case msgData with an `api`
 * discriminator, the EOS family wraps the payload in { header, content[, param] },
 * and the centralized-query endpoint multiplexes sub-functions through `api` + `params`.
 */
export const sfExpressStationHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async station_batch_inventory(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_KB_WILLBILLBUSS_EXPRESS_CHECK",
      {
        api: "kbExpressCheck",
        store_code: requiredInputString(input.store_code, "store_code"),
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_nos: requiredStringArray(input.waybill_nos, "waybill_nos", providerInputError),
      },
      context,
      "execute",
    );
    return normalizeInventoryResult(payload);
  },
  async station_handle_exception_return(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_KB_WILLBILLBUSS_659",
      compactObject({
        api: "kbExceptionPack",
        store_code: requiredInputString(input.store_code, "store_code"),
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_no: waybillNo,
        type: requiredInputString(input.type, "type"),
        exception_time: requiredInputString(input.exception_time, "exception_time"),
        exception_reason: optionalString(input.exception_reason),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_verify_waybill_number(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_VERIFY_WAYBILL_NUMBER",
      {
        api: "verify_waybill_number",
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_no: requiredInputString(input.waybill_no, "waybill_no"),
      },
      context,
      "execute",
    );
    return { msg: optionalString(recordOrEmpty(payload).msg) };
  },
  async station_query_waybill_route(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_QUERY_WAYBILL_ROUTE",
      {
        api: "query_waybill_route",
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_no: requiredInputString(input.waybill_no, "waybill_no"),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express station response content");
    return {
      waybill_no: optionalString(record.waybill_no),
      route: objectArray(record.route ?? [], "route", providerResponseError).map((route) => ({
        date: optionalString(route.date),
        time: optionalString(route.time),
        state: optionalString(route.state),
        position: optionalString(route.position),
        oprCode: optionalString(route.oprCode),
        opCode: optionalString(route.opCode),
      })),
    };
  },
  async station_notify_recipient(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_NOTIFY_REC",
      {
        api: "notify_receiver",
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_no: requiredInputString(input.waybill_no, "waybill_no"),
        agent_code: requiredInputString(input.agent_code, "agent_code"),
      },
      context,
      "execute",
    );
    return { msg: optionalString(recordOrEmpty(payload).msg) };
  },
  async station_send_waybill_sms(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_SEND_SMS_BY_WAYBILL",
      compactObject({
        api: "send_sms_by_waybill",
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_no: requiredInputString(input.waybill_no, "waybill_no"),
        agent_code: requiredInputString(input.agent_code, "agent_code"),
        send_to: requiredInputString(input.send_to, "send_to"),
        mobile_phone: requiredInputString(input.mobile_phone, "mobile_phone"),
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return { msg: optionalString(recordOrEmpty(payload).msg) };
  },
  async station_store_batch_inventory(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_STORE_EXPRESS_CHECK",
      {
        api: "express_check",
        agent_code: requiredInputString(input.agent_code, "agent_code"),
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        area_code: requiredInputString(input.area_code, "area_code"),
        waybill_nos: requiredStringArray(input.waybill_nos, "waybill_nos", providerInputError),
      },
      context,
      "execute",
    );
    return normalizeInventoryResult(payload);
  },
  async station_query_centralization(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_QUERY_CENTRALIZE_EXPRESS",
      {
        api: "query_centralize_express",
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        params: {
          type: integer(input.type, "type", providerInputError),
          waybill_no: requiredInputString(input.waybill_no, "waybill_no"),
        },
      },
      context,
      "execute",
    );
    const resultMsg = optionalRecord(requiredResponseRecord(payload, "SF Express station response content").resultMsg);
    return { isCentralism: resultMsg?.isCentralism === true };
  },
  async station_update_outsource_info(input, context) {
    const serviceSignState = integer(input.service_sign_state, "service_sign_state", providerInputError);
    const cancelFields = {
      cancerServeReason: optionalString(input.cancer_serve_reason),
      exitType: optionalNumber(input.exit_type),
      exitReasonType: optionalString(input.exit_reason_type),
      exitDate: optionalString(input.exit_date),
      exitEmployeeDestination: optionalString(input.exit_employee_destination),
    };
    if (serviceSignState === 3 && Object.values(cancelFields).some((value) => value === undefined)) {
      throw providerInputError(
        "cancer_serve_reason, exit_type, exit_reason_type, exit_date and exit_employee_destination are required when service_sign_state is 3 (cancelled).",
      );
    }
    const deptCode = requiredInputString(input.dept_code, "dept_code");
    await requestSfExpress(
      "COM_RECE_QUERY_CENTRALIZE_EXPRESS",
      compactObject({
        api: "yjy_outsource_info_api",
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        params: compactObject({
          deptCode,
          outAoiAreaCode: requiredInputString(input.out_aoi_area_code, "out_aoi_area_code"),
          biddingCreateTm: optionalString(input.bidding_create_tm),
          biddingWinTm: optionalString(input.bidding_win_tm),
          employerEmpNo: requiredInputString(input.employer_emp_no, "employer_emp_no"),
          employerEmpName: requiredInputString(input.employer_emp_name, "employer_emp_name"),
          employerPhone: optionalString(input.employer_phone),
          supplierCode: requiredInputString(input.supplier_code, "supplier_code"),
          serviceState: requiredInputString(input.service_state, "service_state"),
          serviceSignState,
          serviceSignTm: requiredInputString(input.service_sign_tm, "service_sign_tm"),
          contractBeginDate: requiredInputString(input.contract_begin_date, "contract_begin_date"),
          contractEndDate: requiredInputString(input.contract_end_date, "contract_end_date"),
          employeeNoDetail: requiredRawString(input.employee_no_detail, "employee_no_detail", providerInputError),
          thisMonthLeaveEmployee: requiredRawString(
            input.this_month_leave_employee,
            "this_month_leave_employee",
            providerInputError,
          ),
          lastMonthLeaveEmployee: requiredRawString(
            input.last_month_leave_employee,
            "last_month_leave_employee",
            providerInputError,
          ),
          singlePickupAward: optionalNumber(input.single_pickup_award),
          singleDeliverAward: optionalNumber(input.single_deliver_award),
          contractRenew: integer(input.contract_renew, "contract_renew", providerInputError),
          ...cancelFields,
          markCode: requiredInputString(input.mark_code, "mark_code"),
          osMode: integer(input.os_mode, "os_mode", providerInputError),
          preExitStatus: optionalNumber(input.pre_exit_status),
          preExitTime: optionalString(input.pre_exit_time),
        }),
      }),
      context,
      "execute",
    );
    return { deptCode };
  },
  async station_upsert_robot_channel(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_QUERY_CENTRALIZE_EXPRESS",
      {
        api: "robot_add_or_update",
        partnerId: requiredInputString(input.partner_id, "partner_id"),
        params: {
          channelType: "9",
          openStoreInfo: compactObject({
            virtualAddr: optionalString(input.virtual_addr),
            name: requiredInputString(input.name, "name"),
            manufactor: requiredInputString(input.manufactor, "manufactor"),
            storeCode: requiredInputString(input.store_code, "store_code"),
            status: integer(input.status, "status", providerInputError),
            serviceBeginDate: requiredInputString(input.service_begin_date, "service_begin_date"),
            deviceForbiddenDate: requiredInputString(input.device_forbidden_date, "device_forbidden_date"),
            linkman: requiredInputString(input.linkman, "linkman"),
            phone: requiredInputString(input.phone, "phone"),
            maxGridCount: optionalNumber(input.max_grid_count),
            serviceContentType: integer(input.service_content_type, "service_content_type", providerInputError),
            ...readStoreAddress(input),
            storeType: integer(input.store_type, "store_type", providerInputError),
            extendJson: readExtendJson(input.extend_json),
          }),
        },
      },
      context,
      "execute",
    );
    return {
      virtualAddr: optionalString(requiredResponseRecord(payload, "SF Express station response content").virtualAddr),
    };
  },
  async station_upsert_cage_cabinet(input, context) {
    const sn = requiredInputString(input.sn, "sn");
    await requestSfExpress(
      "COM_RECE_QUERY_CENTRALIZE_EXPRESS",
      {
        api: "cageCabinet_add_or_update",
        partnerId: requiredInputString(input.partner_id, "partner_id"),
        params: compactObject({
          sn,
          cabinetCode: requiredInputString(input.cabinet_code, "cabinet_code"),
          lng: requiredInputString(input.lng, "lng"),
          lat: requiredInputString(input.lat, "lat"),
          gridNum: integer(input.grid_num, "grid_num", providerInputError),
          ...readStoreAddress(input),
          status: integer(input.status, "status", providerInputError),
          communityName: optionalString(input.community_name),
          extendJson: readExtendJson(input.extend_json),
        }),
      },
      context,
      "execute",
    );
    return { sn };
  },
  async station_store_handle_exception_return(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_EOS_WILLBILLBUSS_659",
      {
        header: readStationHeader(input.header),
        content: {
          param: compactObject({
            api: "sf_exception_pack",
            agent_code: requiredInputString(input.agent_code, "agent_code"),
            partner_id: requiredInputString(input.partner_id, "partner_id"),
            area_code: requiredInputString(input.area_code, "area_code"),
            city_id: optionalString(input.city_id),
            waybill_no: waybillNo,
            type: requiredInputString(input.type, "type"),
            exception_time: requiredInputString(input.exception_time, "exception_time"),
            exception_reason: optionalString(input.exception_reason),
            extendJson: readExtendJson(input.extend_json),
          }),
        },
      },
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_check_delivery_operation(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_WILLBILLBUSS_130",
      {
        header: compactObject({
          deptCode: requiredInputString(input.dept_code, "dept_code"),
          oprId: requiredInputString(input.opr_id, "opr_id"),
          sgs_netcode: optionalString(input.sgs_net_code),
          accessCode: optionalString(input.access_code),
        }),
        content: compactObject({
          storeCode: requiredInputString(input.store_code, "store_code"),
          deptCode: requiredInputString(input.dept_code, "dept_code"),
          oprTime: requiredInputString(input.opr_time, "opr_time"),
          oprId: requiredInputString(input.opr_id, "opr_id"),
          channel: requiredInputString(input.channel, "channel"),
          systemCode: requiredInputString(input.system_code, "system_code"),
          waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
          ehead: optionalString(input.ehead),
          storeType: optionalString(input.store_type),
        }),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express station response content");
    return {
      operationControl: optionalString(record.operationControl),
      reasonCode: optionalString(record.reasonCode),
      reason: optionalString(record.reason),
    };
  },
  async station_customer_send_in_store(input, context) {
    const receiverPayment = requiredInputString(input.receiver_payment, "receiver_payment");
    const paidFields = {
      weight: optionalString(input.weight),
      pack_fee: optionalString(input.pack_fee),
      insurance_money: optionalString(input.insurance_money),
      insurance_fee: optionalString(input.insurance_fee),
    };
    if (receiverPayment === "0" && Object.values(paidFields).some((value) => value === undefined)) {
      throw providerInputError(
        "weight, pack_fee, insurance_money and insurance_fee are required when receiver_payment is 0 (寄付).",
      );
    }
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_EOS_WILLBILLBUSS_655",
      stationHandoverMessage(input, "customer_send_pack", {
        city_id: requiredInputString(input.city_id, "city_id"),
        receiver_payment: receiverPayment,
        receive_waybill_time: requiredInputString(input.receive_waybill_time, "receive_waybill_time"),
        ...paidFields,
        ext1: optionalString(input.ext1),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_courier_pickup_in_store(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_EOS_WILLBILLBUSS_656",
      stationHandoverMessage(input, "sf_takeaway_pack", {
        receiver_payment: requiredInputString(input.receiver_payment, "receiver_payment"),
        sf_takeaway_time: requiredInputString(input.sf_takeaway_time, "sf_takeaway_time"),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_store_receive_delivery(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_EOS_WILLBILLBUSS_657",
      stationHandoverMessage(input, "sf_handover_pack", {
        receiver_payment: requiredInputString(input.receiver_payment, "receiver_payment"),
        sf_handover_time: requiredInputString(input.sf_handover_time, "sf_handover_time"),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_customer_pickup_in_store(input, context) {
    const receiverPayment = requiredInputString(input.receiver_payment, "receiver_payment");
    const paidFields = {
      weight: optionalString(input.weight),
      pack_fee: optionalString(input.pack_fee),
      insurance_money: optionalString(input.insurance_money),
      insurance_fee: optionalString(input.insurance_fee),
      successfully_payed_fee: optionalString(input.successfully_payed_fee),
    };
    if (receiverPayment === "1" && Object.values(paidFields).some((value) => value === undefined)) {
      throw providerInputError(
        "weight, pack_fee, insurance_money, insurance_fee and successfully_payed_fee are required when receiver_payment is 1 (到付).",
      );
    }
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_EOS_WILLBILLBUSS_658",
      stationHandoverMessage(input, "customer_receive_pack", {
        receiver_payment: receiverPayment,
        deliver_waybill_time: requiredInputString(input.deliver_waybill_time, "deliver_waybill_time"),
        ...paidFields,
        courier_code: optionalString(input.courier_code),
        virtual_store_flag: optionalString(input.virtual_store_flag),
        skss_push80_flag: optionalString(input.skss_push80_flag),
        extend_attach_31: optionalString(input.extend_attach_31),
        extend_attach_32: optionalString(input.extend_attach_32),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_query_store_info(input, context) {
    const virtualAddr = optionalString(input.virtual_addr);
    const storeCode = optionalString(input.store_code);
    if (virtualAddr === undefined && storeCode === undefined) {
      throw providerInputError("One of virtual_addr or store_code is required.");
    }
    const payload = await requestSfExpress(
      "COM_RECE_EOS_WILLBILLBUSS_STORE_INFO",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          virtualAddr,
          systemId: requiredInputString(input.system_id, "system_id"),
          apiVersion: requiredInputString(input.api_version, "api_version"),
          areaCode: optionalString(input.area_code),
          storeCode,
          sceneCode: optionalString(input.scene_code),
          extendJson: readExtendJson(input.extend_json),
        }),
      },
      context,
      "execute",
    );
    return requiredResponseRecord(payload, "SF Express station response content");
  },
  async station_verify_fc_settlement(input, context) {
    const opType = integer(input.op_type, "op_type", providerInputError);
    const dropOff = opType === 1;
    const payload = await requestSfExpress(
      "COM_RECE_FC_SETTLE_VERIFY",
      {
        // Only 订单类型 1 (派件投柜) is modelled; the rental and reservation types carry other data shapes.
        type: 1,
        data: compactObject({
          opType,
          orderId: requiredInputString(input.order_id, "order_id"),
          // The doc marks the rest 是1: they belong to the drop-off, not to giving it up.
          cabinetCode: dropOff ? requiredInputString(input.cabinet_code, "cabinet_code") : undefined,
          empNo: dropOff ? requiredInputString(input.emp_no, "emp_no") : undefined,
          phone: dropOff ? requiredInputString(input.phone, "phone") : undefined,
          paymentType: dropOff ? requiredInputNumber(input.payment_type, "payment_type") : undefined,
          waybillNo: dropOff ? requiredInputString(input.waybill_no, "waybill_no") : undefined,
          gridType: dropOff ? requiredInputNumber(input.grid_type, "grid_type") : undefined,
          discountType: optionalString(input.discount_type) ?? null,
          discountFee: optionalNumber(input.discount_fee) ?? null,
          payedFee: dropOff ? requiredInputNumber(input.payed_fee, "payed_fee") : undefined,
          deliverTm: dropOff ? requiredInputString(input.deliver_tm, "deliver_tm") : undefined,
        }),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express station response content");
    return {
      settleFlag: integer(record.settleFlag, "settleFlag", providerResponseError),
      reason: optionalString(record.reason),
      failCode: optionalString(record.failCode),
      areaCode: requiredString(record.areaCode, "areaCode", providerResponseError),
      deptCode: requiredString(record.deptCode, "deptCode", providerResponseError),
      responseId: requiredString(record.responseId, "responseId", providerResponseError),
    };
  },
  async station_upsert_fc_outsource_store(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_FC_WBSTORE_ADD_OR_UPDATE",
      {
        header: readStationHeader(input.header),
        content: readOutsourceStoreContent(input, {}),
      },
      context,
      "execute",
    );
    return normalizeStoreUpsertResult(payload);
  },
  async station_upsert_ysf_outsource_store(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_YSF_WBSTORE_ADD_OR_UPDATE",
      {
        header: readStationHeader(input.header),
        content: readOutsourceStoreContent(input, {
          aoiCode: requiredInputString(input.aoi_code, "aoi_code"),
          aoiType: requiredInputString(input.aoi_type, "aoi_type"),
          serviceArea: requiredInputString(input.service_area, "service_area"),
          cnCode: requiredInputString(input.cn_code, "cn_code"),
          deptcode: requiredInputString(input.deptcode, "deptcode"),
          areaCode: requiredInputString(input.area_code, "area_code"),
        }),
      },
      context,
      "execute",
    );
    return normalizeStoreUpsertResult(payload);
  },
  async station_save_village_store(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_ADD_VILLAGE_STORE_INFO",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          storeCode: requiredInputString(input.store_code, "store_code"),
          virtualAddr: optionalString(input.virtual_addr),
          name: requiredInputString(input.name, "name"),
          partnerId: requiredInputString(input.partner_id, "partner_id"),
          storeType: integer(input.store_type, "store_type", providerInputError),
          ...readStoreAddress(input),
          agentName: requiredInputString(input.agent_name, "agent_name"),
          agentNo: requiredInputString(input.agent_no, "agent_no"),
          agentPhone: requiredInputString(input.agent_phone, "agent_phone"),
          agentIdCard: optionalString(input.agent_id_card),
          linkmanName: requiredInputString(input.linkman_name, "linkman_name"),
          linkmanPhone: requiredInputString(input.linkman_phone, "linkman_phone"),
          serviceTime: optionalString(input.service_time),
          lng: optionalNumber(input.lng),
          lat: optionalNumber(input.lat),
          remark: optionalString(input.remark),
          openFlag: integer(input.open_flag, "open_flag", providerInputError),
          extendJson: readExtendJson(input.extend_json),
          starBusinessType: optionalString(input.star_business_type),
          shortName: requiredInputString(input.short_name, "short_name"),
        }),
      },
      context,
      "execute",
    );
    return { virtualAddr: normalizeStoreUpsertResult(payload).virtualAddr };
  },
  async station_upload_village_store_images(input, context) {
    const virtualAddr = requiredInputString(input.virtual_addr, "virtual_addr");
    await requestSfExpress(
      "COM_RECE_EOS_ADD_VILLAGE_STORE_IMG",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          virtualAddr,
          outerImageFileNames: requiredStringArray(
            input.outer_image_file_names,
            "outer_image_file_names",
            providerInputError,
          ),
          innerImageFileNames: requiredStringArray(
            input.inner_image_file_names,
            "inner_image_file_names",
            providerInputError,
          ),
          extendJson: readExtendJson(input.extend_json),
        }),
      },
      context,
      "execute",
    );
    return { virtualAddr };
  },
  async station_upsert_store_info(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_ADD_STORE_INFO",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          storeCode: requiredInputString(input.store_code, "store_code"),
          virtualAddr: optionalString(input.virtual_addr),
          name: requiredInputString(input.name, "name"),
          partnerId: requiredInputString(input.partner_id, "partner_id"),
          storeType: integer(input.store_type, "store_type", providerInputError),
          ...readStoreAddress(input),
          lng: optionalNumber(input.lng),
          lat: optionalNumber(input.lat),
          linkman: requiredInputString(input.linkman, "linkman"),
          email: optionalString(input.email),
          phone: optionalString(input.phone),
          telephone: optionalString(input.telephone),
          serviceContentType: optionalString(input.service_content_type),
          serviceContentTypeEx: optionalNumber(input.service_content_type_ex),
          businessType: integer(input.business_type, "business_type", providerInputError),
          serviceTime: requiredInputString(input.service_time, "service_time"),
          serviceTimeFes: optionalString(input.service_time_fes),
          serviceTimeSat: optionalString(input.service_time_sat),
          serviceTimeSun: optionalString(input.service_time_sun),
          asuraSmsFlag: requiredInputString(input.asura_sms_flag, "asura_sms_flag"),
          syncCx: optionalNumber(input.sync_cx),
          settleType: integer(input.settle_type, "settle_type", providerInputError),
          storeAccount: optionalString(input.store_account),
          factoryId: requiredInputString(input.factory_id, "factory_id"),
          fengtu: requiredInputString(input.fengtu, "fengtu"),
          extendJson: readExtendJson(input.extend_json),
          outsourceFlag: optionalNumber(input.outsource_flag),
          outsourceInfo: readOutsourceInfo(input.outsource_info),
          fullName: requiredInputString(input.full_name, "full_name"),
          landMark: optionalString(input.land_mark),
          starBusinessType: optionalString(input.star_business_type),
        }),
      },
      context,
      "execute",
    );
    return normalizeStoreUpsertResult(payload);
  },
  async station_save_xgj_store(input, context) {
    const storeCode = requiredInputString(input.store_code, "store_code");
    await requestSfExpress(
      "COM_RECE_EOS_ADD_XGJ_STORE_INFO",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          virtualAddr: optionalString(input.virtual_addr),
          serviceContentType: requiredInputString(input.service_content_type, "service_content_type"),
          storeCode,
          name: requiredInputString(input.name, "name"),
          partnerId: requiredInputString(input.partner_id, "partner_id"),
          ...readStoreAddress(input),
          lng: optionalNumber(input.lng),
          lat: optionalNumber(input.lat),
          phone: requiredInputString(input.phone, "phone"),
          serviceContentTypeEx: optionalNumber(input.service_content_type_ex),
          businessType: integer(input.business_type, "business_type", providerInputError),
          serviceTime: optionalString(input.service_time),
          serviceTimeFes: optionalString(input.service_time_fes),
          serviceTimeSat: optionalString(input.service_time_sat),
          serviceTimeSun: optionalString(input.service_time_sun),
          cnCode: requiredInputString(input.cn_code, "cn_code"),
          areaCode: requiredInputString(input.area_code, "area_code"),
          deptcode: requiredInputString(input.deptcode, "deptcode"),
          factoryId: requiredInputString(input.factory_id, "factory_id"),
          identityCard: requiredInputString(input.identity_card, "identity_card"),
          sfFamily: optionalString(input.sf_family),
          employeeNo: optionalString(input.employee_no),
          fengtu: requiredInputString(input.fengtu, "fengtu"),
          extendJson: readExtendJson(input.extend_json),
        }),
      },
      context,
      "execute",
    );
    return { storeCode };
  },
  async station_upload_xgj_images(input, context) {
    const virtualAddr = requiredInputString(input.virtual_addr, "virtual_addr");
    await requestSfExpress(
      "COM_RECE_EOS_ADD_XGJ_IMG",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          virtualAddr,
          identityFileNames: requiredStringArray(input.identity_file_names, "identity_file_names", providerInputError),
          faceFileNames: optionalStringArray(input.face_file_names),
          houseFileNames: optionalStringArray(input.house_file_names),
          extendJson: readExtendJson(input.extend_json),
        }),
      },
      context,
      "execute",
    );
    return { virtualAddr };
  },
  async station_get_oss_token(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_GET_OSS_TOKEN",
      {
        header: readStationHeader(input.header),
        content: {
          ossClientName: requiredInputString(input.oss_client_name, "oss_client_name"),
          pathId: requiredInputString(input.path_id, "path_id"),
        },
      },
      context,
      "execute",
    );
    return requiredResponseRecord(payload, "SF Express station response content");
  },
  async station_query_grid_schedule(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_QUERY_GRID_INFO",
      {
        header: readStationHeader(input.header),
        content: {
          courier_code: requiredInputString(input.courier_code, "courier_code"),
          aoi_list: requiredStringArray(input.aoi_list, "aoi_list", providerInputError),
          batch_code: requiredInputString(input.batch_code, "batch_code"),
        },
      },
      context,
      "execute",
    );
    return {
      bin_code: optionalString(requiredResponseRecord(payload, "SF Express station response content").bin_code),
    };
  },
  async station_upload_picture(input, context) {
    const pathId = requiredInputString(input.path_id, "path_id");
    await requestSfExpress(
      "COM_RECE_EOS_UPLOAD_PICTURE",
      {
        header: readStationHeader(input.header),
        content: {
          ossClientName: requiredInputString(input.oss_client_name, "oss_client_name"),
          pathId,
          fileTypeName: requiredInputString(input.file_type_name, "file_type_name"),
          base64Content: requiredInputString(input.base64_content, "base64_content"),
        },
      },
      context,
      "execute",
    );
    return { pathId };
  },
  async station_submit_fc_resource(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_TOAP_SUBMIT_RESOURCE_INFO",
      {
        header: readStationHeader(input.header),
        content: readOutsourceStoreContent(input, {}),
      },
      context,
      "execute",
    );
    return normalizeStoreUpsertResult(payload);
  },
  async station_update_xgj_waybill_fee(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_EOS_XGJ_WAYBILL_INFO",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          waybillNo,
          billType: integer(input.bill_type, "bill_type", providerInputError),
          billDate: requiredInputString(input.bill_date, "bill_date"),
          starVirtualAddr: requiredInputString(input.star_virtual_addr, "star_virtual_addr"),
          starEmpCode: requiredInputString(input.star_emp_code, "star_emp_code"),
          starSendType: optionalNumber(input.star_send_type),
          isSettle: integer(input.is_settle, "is_settle", providerInputError),
          goodFee: optionalNumber(input.good_fee),
          pushTime: requiredInputString(input.push_time, "push_time"),
          remark: optionalString(input.remark),
        }),
      },
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_update_xgj_insurance_fee(input, context) {
    const starVirtualAddr = requiredInputString(input.star_virtual_addr, "star_virtual_addr");
    await requestSfExpress(
      "COM_RECE_EOS_XGJ_UPDATE_SAFE_FEE",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          starVirtualAddr,
          identityCard: requiredInputString(input.identity_card, "identity_card"),
          safeMonth: requiredInputString(input.safe_month, "safe_month"),
          safeFee: optionalNumber(input.safe_fee),
        }),
      },
      context,
      "execute",
    );
    return { starVirtualAddr };
  },
  async station_submit_receipt_info(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_EOS_RECEIPT_WAYBILL_INFO",
      {
        header: readStationHeader(input.header),
        content: {
          param: compactObject({
            api: "waybill_receipt_info",
            waybillNo,
            agent_code: requiredInputString(input.agent_code, "agent_code"),
            partner_id: requiredInputString(input.partner_id, "partner_id"),
            area_code: requiredInputString(input.area_code, "area_code"),
            city_id: requiredInputString(input.city_id, "city_id"),
            clientCode: requiredInputString(input.client_code, "client_code"),
            sysCode: requiredInputString(input.sys_code, "sys_code"),
            destZoneCode: requiredInputString(input.dest_zone_code, "dest_zone_code"),
            realWeightQty: optionalString(input.real_weight_qty),
            deliverEmpCode: requiredInputString(input.deliver_emp_code, "deliver_emp_code"),
            subscriberName: requiredInputString(input.subscriber_name, "subscriber_name"),
            signinTm: requiredInputString(input.signin_tm, "signin_tm"),
            extAttrJson: optionalString(input.ext_attr_json),
            deliveredType: requiredInputString(input.delivered_type, "delivered_type"),
            inputerEmpCode: optionalString(input.inputer_emp_code),
            cargoTypeCode: optionalString(input.cargo_type_code),
            limitTypeCode: optionalString(input.limit_type_code),
            expressTypeCode: optionalString(input.express_type_code),
            createTm: requiredInputString(input.create_tm, "create_tm"),
            waybillFeeDtoList: readReceiptFeeList(input.waybill_fee_dto_list),
            waybillServiceDtoList: readReceiptServiceList(input.waybill_service_dto_list),
            waybillMarkDtoList: readReceiptMarkList(input.waybill_mark_dto_list),
            waybillAdditionDtoList: readReceiptAdditionList(input.waybill_addition_dto_list),
            extendJson: readExtendJson(input.extend_json),
          }),
        },
      },
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_query_waybill_info(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_EOS_QUERY_WAYBILL_INFO",
      {
        header: readStationHeader(input.header),
        content: {
          param: compactObject({
            api: "get_waybill_info",
            waybill_no: requiredInputString(input.waybill_no, "waybill_no"),
            lang_code: optionalString(input.lang_code),
            agent_code: requiredInputString(input.agent_code, "agent_code"),
            partner_id: requiredInputString(input.partner_id, "partner_id"),
            area_code: requiredInputString(input.area_code, "area_code"),
            city_id: requiredInputString(input.city_id, "city_id"),
            extendJson: readExtendJson(input.extend_json),
          }),
        },
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express station response content");
    return {
      receiver_address: optionalString(record.receiver_address),
      sender: optionalString(record.sender),
      sender_phone: optionalString(record.sender_phone),
      sender_mobile: optionalString(record.sender_mobile),
      receiver: optionalString(record.receiver),
      receiver_phone: optionalString(record.receiver_phone),
      receiver_mobile: optionalString(record.receiver_mobile),
      payer: optionalString(record.payer),
      pack_fee: optionalString(record.pack_fee),
      insurance_fee: optionalString(record.insurance_fee),
      cod_bill_flg: optionalString(record.cod_bill_flg),
      cod_fee: optionalString(record.cod_fee),
      deliverEmpCode: optionalString(record.deliverEmpCode),
    };
  },
  async station_upload_fc_images(input, context) {
    const virtualAddr = requiredInputString(input.virtual_addr, "virtual_addr");
    await requestSfExpress(
      "COM_RECE_EOS_ADD_FC_IMG",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          virtualAddr,
          siteDoorFileNames: requiredStringArray(
            input.site_door_file_names,
            "site_door_file_names",
            providerInputError,
          ),
          siteInsideFileNames: optionalStringArray(input.site_inside_file_names),
          siteFileNames: optionalStringArray(input.site_file_names),
          extendJson: readExtendJson(input.extend_json),
        }),
      },
      context,
      "execute",
    );
    return { virtualAddr };
  },
  async station_upload_store_album(input, context) {
    const virtualAddr = requiredInputString(input.virtual_addr, "virtual_addr");
    await requestSfExpress(
      "COM_RECE_EOS_ADD_STORE_IMG",
      {
        header: readStationHeader(input.header),
        content: compactObject({
          virtualAddr,
          backgroundFileNames: optionalStringArray(input.background_file_names),
          licenseFileNames: optionalStringArray(input.license_file_names),
          ...readStationAlbumImages(input),
          extendJson: readExtendJson(input.extend_json),
        }),
      },
      context,
      "execute",
    );
    return { virtualAddr };
  },
  async station_add_brand_inspection_images(input, context) {
    const taskId = requiredInputString(input.task_id, "task_id");
    await requestSfExpress(
      "COM_RECE_BRAND_INSP_ADD_IMAGES",
      compactObject({
        taskId,
        virtualAddr: requiredInputString(input.virtual_addr, "virtual_addr"),
        partnerId: requiredInputString(input.partner_id, "partner_id"),
        extendJson: readExtendJson(input.extend_json),
        backgroundFileNames: requiredStringArray(
          input.background_file_names,
          "background_file_names",
          providerInputError,
        ),
        licenseFileNames: requiredStringArray(input.license_file_names, "license_file_names", providerInputError),
        ...readStationAlbumImages(input),
      }),
      context,
      "execute",
    );
    return { taskId };
  },
  station_pre_handover_pack: kbPackHandler("COM_RECE_KB_PRE_HANDOVER_PACK"),
  station_handover_pack: kbPackHandler("COM_RECE_KB_HANDOVER_PACK"),
  station_customer_receive_pack: kbPackHandler("COM_RECE_KB_CUST_REC_PACK"),

  async station_save_store(input, context) {
    const storeCode = requiredInputString(input.store_code, "store_code");
    await requestSfExpress(
      "COM_RECE_KB_STORE_SAVE",
      compactObject({
        virtualAddr: optionalString(input.virtual_addr),
        name: requiredInputString(input.name, "name"),
        partnerId: requiredInputString(input.partner_id, "partner_id"),
        storeCode,
        storeType: integer(input.store_type, "store_type", providerInputError),
        linkman: requiredInputString(input.linkman, "linkman"),
        phone: requiredInputString(input.phone, "phone"),
        telephone: requiredInputString(input.telephone, "telephone"),
        serviceTime: requiredInputString(input.service_time, "service_time"),
        lng: requiredInputNumber(input.lng, "lng"),
        lat: requiredInputNumber(input.lat, "lat"),
        provincename: requiredInputString(input.province_name, "province_name"),
        cityname: requiredInputString(input.city_name, "city_name"),
        countyname: requiredInputString(input.county_name, "county_name"),
        townname: optionalString(input.town_name),
        address: requiredInputString(input.address, "address"),
        businessScope: integer(input.business_scope, "business_scope", providerInputError),
        square: optionalNumber(input.square),
        areaType: optionalIntegerLike(input.area_type, "area_type", providerInputError),
        administrativeAreaType: optionalIntegerLike(
          input.administrative_area_type,
          "administrative_area_type",
          providerInputError,
        ),
        isDelete: requiredBoolean(input.is_delete, "is_delete", providerInputError) ? 1 : 0,
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return { storeCode };
  },
  async station_add_store_images(input, context) {
    const storeCode = requiredInputString(input.store_code, "store_code");
    await requestSfExpress(
      "COM_RECE_KB_STORE_IMG_ADD",
      compactObject({
        storeCode,
        backgroundFileNames: optionalStringArray(input.background_file_names),
        licenseFileNames: optionalStringArray(input.license_file_names),
        filingFileNames: optionalStringArray(input.filing_file_names),
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return { storeCode };
  },
  async station_send_sms(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_KB_SEND_SMS",
      compactObject({
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        store_code: requiredInputString(input.store_code, "store_code"),
        pick_up_code: requiredInputString(input.pick_up_code, "pick_up_code"),
        waybill_no: waybillNo,
        sms_template: integer(input.sms_template, "sms_template", providerInputError),
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_check_waybill(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    const payload = await requestSfExpress(
      "COM_RECE_KB_WAYBILL_CHECK",
      compactObject({
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_no: waybillNo,
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return {
      waybillNo,
      msg: optionalString(recordOrEmpty(payload).msg),
    };
  },
  async station_temp_store(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "COM_RECE_TEMP_STORE",
      compactObject({
        bill_type: requiredInputString(input.bill_type, "bill_type"),
        agent_code: requiredInputString(input.agent_code, "agent_code"),
        waybill_no: waybillNo,
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  },
  async station_verify_delivery_permission(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_DELIVERY_OPERATION_VERIFY",
      compactObject({
        sgs_username: requiredInputString(input.sgs_username, "sgs_username"),
        sgs_netcode: requiredInputString(input.sgs_netcode, "sgs_netcode"),
        sgs_distcode: requiredInputString(input.sgs_distcode, "sgs_distcode"),
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        channel: requiredInputString(input.channel, "channel"),
        oprId: optionalString(input.opr_id),
        deptCode: optionalString(input.dept_code),
        operationScenario: optionalString(input.operation_scenario),
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return requiredResponseRecord(payload, "SF Express delivery permission verdict");
  },
  async station_validate_delivery_password(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    const payload = await requestSfExpress(
      "COM_RECE_VALIDATE_DELIVERY_PWD",
      compactObject({
        api: "validate_delivery_pwd",
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        waybill_no: waybillNo,
        agent_code: requiredInputString(input.agent_code, "agent_code"),
        pwd: requiredInputString(input.pwd, "pwd"),
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return {
      waybillNo,
      msg: optionalString(recordOrEmpty(payload).msg),
    };
  },
};

/** Build the EOS-family { header, content: { param } } message shared by the store handover endpoints. */
function stationHandoverMessage(
  input: Record<string, unknown>,
  api: string,
  extraParam: Record<string, string | undefined>,
): Record<string, unknown> {
  return {
    header: readStationHeader(input.header),
    content: {
      param: compactObject({
        api,
        agent_code: requiredInputString(input.agent_code, "agent_code"),
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        area_code: requiredInputString(input.area_code, "area_code"),
        city_id: optionalString(input.city_id),
        waybill_no: requiredInputString(input.waybill_no, "waybill_no"),
        // The 655 handover requires city_id, so its extraParam overrides the optional read.
        ...extraParam,
        extendJson: readExtendJson(input.extend_json),
      }),
    },
  };
}

/** Read the EOS request header from the action's header input object. */
function readStationHeader(value: unknown): Record<string, unknown> {
  const header = requiredRecord(value, "header", providerInputError);
  return compactObject({
    oprId: optionalString(header.operatorId),
    deptCode: optionalString(header.deptCode),
    sgs_netcode: optionalString(header.netCode),
    accessCode: optionalString(header.accessCode),
  });
}

/** Map the flat address inputs to the upstream provincename/cityname/... field names. */
function readStoreAddress(input: Record<string, unknown>): Record<string, unknown> {
  return {
    provincename: requiredInputString(input.provincename, "provincename"),
    cityname: requiredInputString(input.cityname, "cityname"),
    countyname: requiredInputString(input.countyname, "countyname"),
    townname: optionalString(input.townname),
    address: requiredInputString(input.address, "address"),
  };
}

/** Read the shared content fields of the outsource store upserts (FC/YSF/TOAP). */
function readOutsourceStoreContent(
  input: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    storeCode: requiredInputString(input.store_code, "store_code"),
    virtualAddr: optionalString(input.virtual_addr),
    partnerId: requiredInputString(input.partner_id, "partner_id"),
    siteStatus: integer(input.site_status, "site_status", providerInputError),
    siteName: requiredInputString(input.site_name, "site_name"),
    openFlag: optionalNumber(input.open_flag),
    startOpenTime: optionalString(input.start_open_time),
    linkman: requiredInputString(input.linkman, "linkman"),
    phone: requiredInputString(input.phone, "phone"),
    emergencyPhone: optionalString(input.emergency_phone),
    ...readStoreAddress(input),
    lng: requiredInputNumber(input.lng, "lng"),
    lat: requiredInputNumber(input.lat, "lat"),
    placeType: optionalString(input.place_type),
    // SF requires at least one of the two service-type fields; the action schemas declare that rule.
    serviceContentType: optionalNumber(input.service_content_type),
    serviceContentTypeEx: optionalNumber(input.service_content_type_ex),
    siteType: integer(input.site_type, "site_type", providerInputError),
    contractor: optionalString(input.contractor),
    contractorPhone: optionalString(input.contractor_phone),
    ...extra,
    serviceTime: requiredInputString(input.service_time, "service_time"),
    extendJson: readExtendJson(input.extend_json),
  });
}

/** The store-upsert obj is a bare station-id string in one doc example and a record of ids in another. */
function normalizeStoreUpsertResult(payload: unknown): Record<string, unknown> {
  const virtualAddr = optionalString(payload);
  if (virtualAddr !== undefined) {
    return { virtualAddr };
  }
  const record = requiredResponseRecord(payload, "SF Express station response content");
  return {
    storeCode: optionalString(record.storeCode),
    virtualAddr: optionalString(record.virtualAddr),
    aoiAreaCode: optionalString(record.aoiAreaCode),
    aoiCode: optionalString(record.aoiCode),
    cnCode: optionalString(record.cnCode),
    areaCode: optionalString(record.areaCode),
    deptCode: optionalString(record.deptCode),
  };
}

function normalizeInventoryResult(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express station response content");
  return {
    msg: optionalString(record.msg),
    failList: objectArray(record.failList ?? [], "failList", providerResponseError).map((item, index) => ({
      waybill_no: requiredString(item.waybill_no, `failList[${index}].waybill_no`, providerResponseError),
      reason: optionalString(item.reason),
    })),
  };
}

function readOutsourceInfo(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const info = requiredRecord(value, "outsource_info", providerInputError);
  return compactObject({
    employerEmpNo: requiredInputString(info.employer_emp_no, "outsource_info.employer_emp_no"),
    employerEmpName: requiredInputString(info.employer_emp_name, "outsource_info.employer_emp_name"),
    outAoiAreaCode: optionalString(info.out_aoi_area_code),
    openTime: requiredInputString(info.open_time, "outsource_info.open_time"),
    rentArea: requiredInputNumber(info.rent_area, "outsource_info.rent_area"),
    rentByMonth: requiredInputNumber(info.rent_by_month, "outsource_info.rent_by_month"),
    rentStartTime: requiredInputString(info.rent_start_time, "outsource_info.rent_start_time"),
    rentEndTime: requiredInputString(info.rent_end_time, "outsource_info.rent_end_time"),
    decorationFlag: integer(info.decoration_flag, "outsource_info.decoration_flag", providerInputError),
    openFlag: integer(info.open_flag, "outsource_info.open_flag", providerInputError),
    storeStatus: optionalNumber(info.store_status),
    filingCode: optionalString(info.filing_code),
  });
}

function readReceiptFeeList(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "waybill_fee_dto_list", providerInputError).map((item, index) =>
    compactObject({
      waybillNo: requiredInputString(item.waybillNo, `waybill_fee_dto_list[${index}].waybillNo`),
      feeTypeCode: requiredInputString(item.feeTypeCode, `waybill_fee_dto_list[${index}].feeTypeCode`),
      feeAmt: requiredInputString(item.feeAmt, `waybill_fee_dto_list[${index}].feeAmt`),
      gatherZoneCode: optionalString(item.gatherZoneCode),
      paymentTypeCode: requiredInputString(item.paymentTypeCode, `waybill_fee_dto_list[${index}].paymentTypeCode`),
      paymentChangeTypeCode: optionalString(item.paymentChangeTypeCode),
      customerAcctCode: requiredRawString(
        item.customerAcctCode,
        `waybill_fee_dto_list[${index}].customerAcctCode`,
        providerInputError,
      ),
      ticketNo: optionalString(item.ticketNo),
      valutionAcctCode: optionalString(item.valutionAcctCode),
      ticketOffsetAmt: optionalString(item.ticketOffsetAmt),
      ticketType: optionalString(item.ticketType),
      ticketKind: optionalString(item.ticketKind),
      ticketPurpose: optionalString(item.ticketPurpose),
      isOnlineDeduct: optionalString(item.isOnlineDeduct),
      currencyCode: requiredInputString(item.currencyCode, `waybill_fee_dto_list[${index}].currencyCode`),
    }),
  );
}

function readReceiptServiceList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "waybill_service_dto_list", providerInputError).map((item, index) =>
    compactObject({
      waybillNo: requiredInputString(item.waybillNo, `waybill_service_dto_list[${index}].waybillNo`),
      serviceProdCode: requiredInputString(item.serviceProdCode, `waybill_service_dto_list[${index}].serviceProdCode`),
      attribute1: optionalString(item.attribute1),
      attribute2: optionalString(item.attribute2),
      attribute3: optionalString(item.attribute3),
      attribute4: optionalString(item.attribute4),
      attribute5: optionalString(item.attribute5),
    }),
  );
}

function readReceiptMarkList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "waybill_mark_dto_list", providerInputError).map((item, index) => ({
    waybillNo: requiredInputString(item.waybillNo, `waybill_mark_dto_list[${index}].waybillNo`),
    labellingPattern: requiredInputString(item.labellingPattern, `waybill_mark_dto_list[${index}].labellingPattern`),
  }));
}

function readReceiptAdditionList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "waybill_addition_dto_list", providerInputError).map((item, index) => ({
    waybillNo: requiredInputString(item.waybillNo, `waybill_addition_dto_list[${index}].waybillNo`),
    additionKey: requiredInputString(item.additionKey, `waybill_addition_dto_list[${index}].additionKey`),
    additionValues: requiredInputString(item.additionValues, `waybill_addition_dto_list[${index}].additionValues`),
  }));
}

function readExtendJson(value: unknown): string | undefined {
  const record = optionalRecord(value);
  return record ? JSON.stringify(record) : undefined;
}

/** The 15 optional album slots shared by the store-album and brand-inspection uploads. */
function readStationAlbumImages(input: Record<string, unknown>): Record<string, string[] | undefined> {
  return {
    doorHead: optionalStringArray(input.door_head),
    lightBox: optionalStringArray(input.light_box),
    imageWall: optionalStringArray(input.image_wall),
    girdle: optionalStringArray(input.girdle),
    cooperationLicense: optionalStringArray(input.cooperation_license),
    businessPoster: optionalStringArray(input.business_poster),
    pickupPoster: optionalStringArray(input.pickup_poster),
    pickupDesk: optionalStringArray(input.pickup_desk),
    wallSystem: optionalStringArray(input.wall_system),
    hangingFlags: optionalStringArray(input.hanging_flags),
    receptionDesk: optionalStringArray(input.reception_desk),
    shelfStickers: optionalStringArray(input.shelf_stickers),
    indication: optionalStringArray(input.indication),
    tips: optionalStringArray(input.tips),
    cartonDesk: optionalStringArray(input.carton_desk),
  };
}

/** The KB handover trio shares one handler shape; only the service code differs. */
function kbPackHandler(serviceCode: string): SfExpressActionHandler {
  return async (input, context) => {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      serviceCode,
      compactObject({
        partner_id: requiredInputString(input.partner_id, "partner_id"),
        store_code: requiredInputString(input.store_code, "store_code"),
        waybill_no: waybillNo,
        extendJson: readExtendJson(input.extend_json),
      }),
      context,
      "execute",
    );
    return { waybillNo };
  };
}
