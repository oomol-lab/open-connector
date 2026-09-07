import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
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
        contactInfo: readRegisterContactInfo(input.contact_info),
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
        customerAcctCode: optionalString(input.customer_acct_code),
        phone: optionalString(input.phone),
      }),
      context,
      "execute",
    );
    return { registered: true, waybillNo, imgType };
  },
};

function readRegisterContactInfo(value: unknown): Record<string, unknown> | undefined {
  const contact = optionalRecord(value);
  if (!contact) {
    return undefined;
  }
  return {
    contact: requiredInputString(contact.contact, "contact_info.contact"),
    province: requiredInputString(contact.province, "contact_info.province"),
    city: requiredInputString(contact.city, "contact_info.city"),
    county: requiredInputString(contact.county, "contact_info.county"),
    contactType: contact.contact_type === "recipient" ? 2 : 1,
  };
}
