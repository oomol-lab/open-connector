import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  looseArray,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRawString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express waybill-printing endpoints. */
export const sfExpressPrintHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async print_waybill_pdf(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CLOUD_PRINT_WAYBILLS",
      compactObject({
        templateCode: requiredInputString(input.template_code, "template_code"),
        version: "2.0",
        fileType: "pdf",
        sync: input.sync !== false,
        documents: readCloudPrintDocuments(input.documents, 20),
        customTemplateCode: optionalString(input.custom_template_code),
        extJson: buildPrintExtJson(input, {
          mergePdf: optionalBoolean(input.merge_pdf),
          mergeType: optionalString(input.merge_type),
        }),
      }),
      context,
      "execute",
    );
    return normalizePrintResult(payload);
  },
  async print_waybill_command(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CLOUD_PRINT_COMMAND",
      compactObject({
        templateCode: requiredInputString(input.template_code, "template_code"),
        version: "2.0",
        documents: readCloudPrintDocuments(input.documents, 10),
        customTemplateCode: optionalString(input.custom_template_code),
        extJson: buildPrintExtJson(input, {
          commandType: optionalString(input.command_type),
          commandFileType: optionalString(input.command_file_type),
        }),
      }),
      context,
      "execute",
    );
    return normalizeCommandResult(payload);
  },
  async print_waybill_cainiao_template(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CLOUD_PRINT_CAINIAO",
      compactObject({
        templateCode: requiredInputString(input.template_code, "template_code"),
        version: "2.0",
        sync: input.sync !== false,
        documents: readCloudPrintDocuments(input.documents, 20),
        customTemplateCode: optionalString(input.custom_template_code),
      }),
      context,
      "execute",
    );
    return normalizeCainiaoResult(payload);
  },
  async print_waybill_html(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CLOUD_PRINT_HTML",
      compactObject({
        templateCode: requiredInputString(input.template_code, "template_code"),
        version: "2.0",
        fileType: "html",
        sync: input.sync !== false,
        documents: readCloudPrintDocuments(input.documents, 20),
        customTemplateCode: optionalString(input.custom_template_code),
        extJson: buildPrintExtJson(input, {}),
      }),
      context,
      "execute",
    );
    return normalizePrintResult(payload);
  },
  async submit_citywide_print(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CITYWIDE_PRINT_SUBMIT",
      compactObject({
        templateCode: requiredInputString(input.template_code, "template_code"),
        sync: optionalBoolean(input.sync),
        documents: readCitywideDocuments(input.documents, input.sync === true ? 20 : 200),
      }),
      context,
      "execute",
    );
    const obj = optionalRecord(payload) ?? {};
    return {
      files: Array.isArray(obj.files) ? obj.files.map(normalizeCitywidePrintFile) : undefined,
      printBatchNo: optionalString(obj.printBatchNo),
    };
  },
  async query_citywide_print_status(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CITYWIDE_PRINT_STATUS",
      { printBatchNo: requiredInputString(input.print_batch_no, "print_batch_no") },
      context,
      "execute",
    );
    const obj = requiredResponseRecord(payload, "SF Express citywide print status response");
    return {
      status: requiredString(obj.status, "status", providerResponseError),
      errorReason: optionalString(obj.errorReason),
      files: Array.isArray(obj.files) ? obj.files.map(normalizeCitywidePrintFile) : undefined,
    };
  },
  async list_print_templates(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CLOUD_CUSTOMTEMPLATE_LIST",
      compactObject({
        type: 1,
        sellerUserId: requiredInputString(input.seller_user_id, "seller_user_id"),
        standardTemplateCode: optionalString(input.standard_template_code),
      }),
      context,
      "execute",
    );
    return {
      templates: looseArray(payload).map((item, index) => {
        const template = requiredRecord(item, `templates[${index}]`, providerResponseError);
        return {
          customTemplateName: requiredString(
            template.customTemplateName,
            `templates[${index}].customTemplateName`,
            providerResponseError,
          ),
          customTemplateCode: requiredString(
            template.customTemplateCode,
            `templates[${index}].customTemplateCode`,
            providerResponseError,
          ),
          standardTemplateCode: requiredString(
            template.standardTemplateCode,
            `templates[${index}].standardTemplateCode`,
            providerResponseError,
          ),
          placeholderKeys: optionalStringArray(template.placeholderKeys),
        };
      }),
    };
  },
  async save_print_template(input, context) {
    const payload = await requestSfExpress(
      "COM_RECE_CLOUD_CUSTOMTEMPLATE_SAVE",
      {
        standardTemplateCode: requiredInputString(input.standard_template_code, "standard_template_code"),
        sellerUserId: requiredInputString(input.seller_user_id, "seller_user_id"),
        customTemplateName: requiredInputString(input.custom_template_name, "custom_template_name"),
        content: requiredInputString(input.content, "content"),
      },
      context,
      "execute",
    );
    const obj = requiredResponseRecord(payload, "SF Express save template response");
    return { customTemplateCode: requiredString(obj.customTemplateCode, "customTemplateCode", providerResponseError) };
  },
  async delete_print_template(input, context) {
    const customTemplateCode = requiredInputString(input.custom_template_code, "custom_template_code");
    await requestSfExpress(
      "COM_RECE_CLOUD_CUSTOMTEMPLATE_DELETE",
      {
        sellerUserId: requiredInputString(input.seller_user_id, "seller_user_id"),
        customTemplateCode,
      },
      context,
      "execute",
    );
    return { deleted: true, customTemplateCode };
  },
};

function buildPrintExtJson(
  input: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const extJson = compactObject({ encryptFlag: optionalString(input.encrypt_flag), ...extra });
  return Object.keys(extJson).length > 0 ? extJson : undefined;
}

function readCloudPrintDocuments(value: unknown, maxItems: number): Array<Record<string, unknown>> {
  const documents = objectArray(value, "documents", providerInputError);
  if (documents.length > maxItems) {
    throw providerInputError(`documents must contain at most ${maxItems} items.`);
  }
  return documents.map((doc, index) => {
    const masterWaybillNo = optionalString(doc.masterWaybillNo);
    const backWaybillNo = optionalString(doc.backWaybillNo);
    if (masterWaybillNo === undefined && backWaybillNo === undefined) {
      throw providerInputError(`documents[${index}] requires masterWaybillNo or backWaybillNo.`);
    }
    return compactObject({
      masterWaybillNo,
      branchWaybillNo: optionalString(doc.branchWaybillNo),
      backWaybillNo,
      seq: optionalString(doc.seq),
      sum: optionalString(doc.sum),
      remark: optionalString(doc.remark),
      waybillNoCheckType: optionalString(doc.waybillNoCheckType),
      waybillNoCheckValue: optionalString(doc.waybillNoCheckValue),
      customData: optionalRecord(doc.customData),
    });
  });
}

function readCitywideDocuments(value: unknown, maxItems: number): Array<Record<string, unknown>> {
  const documents = objectArray(value, "documents", providerInputError);
  if (documents.length > maxItems) {
    throw providerInputError(`documents must contain at most ${maxItems} items.`);
  }
  return documents.map((doc, index) =>
    compactObject({
      masterWaybillNo: requiredInputString(doc.masterWaybillNo, `documents[${index}].masterWaybillNo`),
      branchWaybillNo: optionalString(doc.branchWaybillNo),
      backWaybillNo: optionalString(doc.backWaybillNo),
      seq: optionalInteger(doc.seq),
      sum: optionalInteger(doc.sum),
      waybillNoCheckType: requiredInputString(doc.waybillNoCheckType, `documents[${index}].waybillNoCheckType`),
      waybillNoCheckValue: requiredInputString(doc.waybillNoCheckValue, `documents[${index}].waybillNoCheckValue`),
    }),
  );
}

function normalizePrintResult(payload: unknown): Record<string, unknown> {
  const obj = optionalRecord(payload) ?? {};
  return {
    files: Array.isArray(obj.files) ? obj.files.map(normalizePrintFile) : undefined,
    clientCode: optionalString(obj.clientCode),
    templateCode: optionalString(obj.templateCode),
    fileType: optionalString(obj.fileType),
  };
}

function normalizePrintFile(value: unknown, index: number): Record<string, unknown> {
  const file = requiredRecord(value, `files[${index}]`, providerResponseError);
  return {
    url: requiredString(file.url, `files[${index}].url`, providerResponseError),
    token: requiredString(file.token, `files[${index}].token`, providerResponseError),
    waybillNo: requiredString(file.waybillNo, `files[${index}].waybillNo`, providerResponseError),
    seqNo: integer(file.seqNo, `files[${index}].seqNo`, providerResponseError),
    areaNo: integer(file.areaNo, `files[${index}].areaNo`, providerResponseError),
    pageNo: integer(file.pageNo, `files[${index}].pageNo`, providerResponseError),
    pageCount: optionalInteger(file.pageCount),
  };
}

/** The citywide print response carries only url/token/waybillNo/seqNo per file. */
function normalizeCitywidePrintFile(value: unknown, index: number): Record<string, unknown> {
  const file = requiredRecord(value, `files[${index}]`, providerResponseError);
  return {
    url: requiredString(file.url, `files[${index}].url`, providerResponseError),
    token: requiredString(file.token, `files[${index}].token`, providerResponseError),
    waybillNo: requiredString(file.waybillNo, `files[${index}].waybillNo`, providerResponseError),
    seqNo: integer(file.seqNo, `files[${index}].seqNo`, providerResponseError),
  };
}

function normalizeCommandResult(payload: unknown): Record<string, unknown> {
  const obj = optionalRecord(payload) ?? {};
  const files = Array.isArray(obj.files) ? obj.files : [];
  return {
    files: files.map((value, index) => {
      const file = requiredRecord(value, `files[${index}]`, providerResponseError);
      return {
        waybillNo: requiredString(file.waybillNo, `files[${index}].waybillNo`, providerResponseError),
        contents: Array.isArray(file.contents)
          ? file.contents.map((content, contentIndex) => {
              const part = requiredRecord(content, `files[${index}].contents[${contentIndex}]`, providerResponseError);
              return {
                area: requiredString(
                  part.area,
                  `files[${index}].contents[${contentIndex}].area`,
                  providerResponseError,
                ),
                // Printer commands are a byte stream the caller forwards verbatim,
                // so leading and trailing whitespace must survive the read.
                content: requiredRawString(
                  part.content,
                  `files[${index}].contents[${contentIndex}].content`,
                  providerResponseError,
                ),
              };
            })
          : undefined,
        url: optionalString(file.url),
        token: optionalString(file.token),
        seqNo: optionalInteger(file.seqNo),
      };
    }),
    clientCode: optionalString(obj.clientCode),
    templateCode: optionalString(obj.templateCode),
    fileType: optionalString(obj.fileType),
  };
}

function normalizeCainiaoResult(payload: unknown): Record<string, unknown> {
  const obj = optionalRecord(payload) ?? {};
  const files = Array.isArray(obj.files) ? obj.files : [];
  return {
    files: files.map((value, index) => {
      const file = requiredRecord(value, `files[${index}]`, providerResponseError);
      return {
        waybillNo: requiredString(file.waybillNo, `files[${index}].waybillNo`, providerResponseError),
        seqNo: optionalInteger(file.seqNo),
        contents: objectArray(file.contents, `files[${index}].contents`, providerResponseError).map(
          (content, contentIndex) => ({
            templateURL: requiredString(
              content.templateURL,
              `files[${index}].contents[${contentIndex}].templateURL`,
              providerResponseError,
            ),
            areaNo: integer(content.areaNo, `files[${index}].contents[${contentIndex}].areaNo`, providerResponseError),
            pageNo: integer(content.pageNo, `files[${index}].contents[${contentIndex}].pageNo`, providerResponseError),
          }),
        ),
      };
    }),
    clientCode: optionalString(obj.clientCode),
    templateCode: optionalString(obj.templateCode),
    fileType: optionalString(obj.fileType),
  };
}
