import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express push-registration endpoints. */
export const sfExpressPushHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async register_route_push(input, context) {
    const attributeNo = requiredInputString(input.attribute_no, "attribute_no");
    await requestSfExpress(
      "EXP_RECE_REGISTER_ROUTE",
      compactObject({
        type: input.register_by === "waybill" ? "2" : "1",
        attributeNo,
        checkPhoneNo: optionalString(input.check_phone_no),
        language: optionalString(input.language),
        country: optionalString(input.country),
      }),
      context,
      "execute",
    );
    return { registered: true, attributeNo };
  },
  async register_waybill_picture_push(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    const imgType = requiredInputString(input.img_type, "img_type");
    await requestSfExpress(
      "EXP_RECE_REGISTER_WAYBILL_PICTURE",
      compactObject({
        clientCode: context.partnerId,
        waybillNo,
        imgType,
        customerAcctCode: requiredInputString(input.customer_acct_code, "customer_acct_code"),
        phone: requiredInputString(input.phone, "phone"),
      }),
      context,
      "execute",
    );
    return { registered: true, waybillNo, imgType };
  },
};
