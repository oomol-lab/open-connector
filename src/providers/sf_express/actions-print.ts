import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sf_express";

const templateCodeSchema = s.nonEmptyString(
  "The print template code from the SF console API detail page, for example fm_76130_standard_{partnerId}.",
);

const customTemplateCodeSchema = s.nonEmptyString(
  "The published custom template code, for layouts edited in the SF template editor.",
);

const cloudPrintSyncSchema = s.boolean(
  "Whether to return the files synchronously (default true). When false, SF pushes the files to the configured print callback instead.",
);

const printDocumentSchema = s.requireAnyProperty(
  s.object(
    "One waybill to print; masterWaybillNo is required unless printing a sign-back receipt (backWaybillNo only).",
    {
      masterWaybillNo: s.nonEmptyString(
        "The master waybill number (主运单号); omit only when printing a sign-back receipt.",
      ),
      branchWaybillNo: s.nonEmptyString("The branch waybill number (子运单号); omit for single-parcel shipments."),
      backWaybillNo: s.nonEmptyString(
        "The sign-back waybill number (签回单号); when printing a sign-back receipt, masterWaybillNo and branchWaybillNo stay empty.",
      ),
      seq: s.nonEmptyString(
        "The print sequence number of this waybill; required for master/branch printing (master = 1).",
      ),
      sum: s.nonEmptyString(
        "The total number of waybills in a master/branch shipment; required for master/branch printing.",
      ),
      remark: s.nonEmptyString("A remark printed in the custom area."),
      waybillNoCheckType: s.stringEnum(
        "The waybill ownership check type: 1 = last 6 digits of the recipient phone, 2 = last 6 digits of the sender phone. Required when the partnerID check does not suffice (third-party ERP).",
        ["1", "2"],
      ),
      waybillNoCheckValue: s.nonEmptyString("The phone last-6 value matching waybillNoCheckType."),
      customData: s.record("The variable fields for a custom template, keyed by placeholder name.", true),
    },
    {
      optional: [
        "masterWaybillNo",
        "branchWaybillNo",
        "backWaybillNo",
        "seq",
        "sum",
        "remark",
        "waybillNoCheckType",
        "waybillNoCheckValue",
        "customData",
      ],
    },
  ),
  ["masterWaybillNo", "backWaybillNo"],
);

const citywideDocumentSchema = s.object(
  "One waybill to print.",
  {
    masterWaybillNo: s.nonEmptyString("The master waybill number (母单号)."),
    branchWaybillNo: s.nonEmptyString("The branch waybill number (子单号)."),
    backWaybillNo: s.nonEmptyString("The sign-back waybill number (回单号)."),
    seq: s.integer("The print sequence number; required for master/branch printing (master = 1)."),
    sum: s.integer("The total number of waybills in a master/branch shipment; required for master/branch printing."),
    waybillNoCheckType: s.stringEnum(
      "The waybill ownership check type: 1 = last 6 digits of the recipient phone, 2 = last 6 digits of the sender phone.",
      ["1", "2"],
    ),
    waybillNoCheckValue: s.nonEmptyString("The phone last-6 value matching waybillNoCheckType."),
  },
  { optional: ["branchWaybillNo", "backWaybillNo", "seq", "sum"] },
);

const encryptFlagSchema = s.string(
  "The 6-digit masking flag (0 = print, 1 = mask, 2 = hide) for recipient name, sender name, recipient address, sender address, recipient company, sender company.",
  { pattern: "^[012]{6}$" },
);

const printFileSchema = s.object(
  "One generated print file; download with a GET request carrying the token in the X-Auth-token header (valid 24h).",
  {
    url: s.string("The download URL of the generated file on SF OSS."),
    token: s.string("The X-Auth-token header value required to download the file."),
    waybillNo: s.string("The waybill number the file belongs to."),
    seqNo: s.integer("The print sequence number (the document index)."),
    areaNo: s.integer("The copy (联) number; 1 for large-account templates."),
    pageNo: s.integer("The page number within the copy."),
    pageCount: s.integer("The total page count of the file."),
  },
  { optional: ["pageCount"] },
);

/** The citywide response documents only these four members per file; it never sends areaNo/pageNo/pageCount. */
const citywidePrintFileSchema = s.requiredObject(
  "One generated print file; download with a GET request carrying the token in the X-Auth-token header (valid 24h).",
  {
    url: s.string("The download URL of the generated file on SF OSS."),
    token: s.string("The X-Auth-token header value required to download the file."),
    waybillNo: s.string("The waybill number the file belongs to."),
    seqNo: s.integer("The print sequence number (the document index)."),
  },
);

const printResultSchema = (fileType: string): JsonSchema =>
  s.object(
    "The generated print files. Empty when the print ran asynchronously.",
    {
      files: s.array("The generated files; unordered, sort by seqNo.", printFileSchema),
      clientCode: s.string("The partnerID the files were generated for."),
      templateCode: s.string("The template code used."),
      fileType: s.string(`The generated file type (${fileType}).`),
    },
    { optional: ["files", "clientCode", "templateCode", "fileType"] },
  );

const standardTemplateCodeSchema = s.stringEnum(
  "The standard template code: fm_76130_standard (76mm*130mm), fm_150_standard (100mm*150mm), fm_180_standard (100mm*180mm), fm_210_standard (100mm*210mm), fm_76165_standard1 (76mm*165mm 一联), fm_76165_standard2 (76mm*165mm 二联).",
  [
    "fm_76130_standard",
    "fm_150_standard",
    "fm_180_standard",
    "fm_210_standard",
    "fm_76165_standard1",
    "fm_76165_standard2",
  ],
);

const sellerUserIdSchema = s.nonEmptyString("The merchant account the ISV registered for this seller (isv商家账号).");

const customTemplateListSchema = s.object("The merchant's published custom templates.", {
  templates: s.array(
    "The custom templates.",
    s.object(
      "One custom template.",
      {
        customTemplateName: s.string("The custom template name."),
        customTemplateCode: s.string("The custom template code."),
        standardTemplateCode: s.string("The standard template code this custom template derives from."),
        placeholderKeys: s.stringArray("The placeholder variable names available in the custom area."),
      },
      { optional: ["placeholderKeys"] },
    ),
  ),
});

/** Actions for the SF Express waybill-printing endpoints. */
export const sfExpressPrintActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "print_waybill_pdf",
    description:
      "Generate waybill PDF print files from a cloud print template (云打印面单转PDF). Returns download URLs that need the returned token in the X-Auth-token header (valid 24h).",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybills to render as PDF.",
      {
        template_code: templateCodeSchema,
        documents: s.array("The waybills to print, at most 20 per batch.", printDocumentSchema, {
          minItems: 1,
          maxItems: 20,
        }),
        sync: cloudPrintSyncSchema,
        custom_template_code: customTemplateCodeSchema,
        encrypt_flag: encryptFlagSchema,
        merge_pdf: s.boolean("Whether to merge the batch into one PDF file."),
        merge_type: s.stringEnum(
          "How to merge when merge_pdf is set: all = one PDF for all documents, single = one PDF per document.",
          ["all", "single"],
        ),
      },
      { optional: ["sync", "custom_template_code", "encrypt_flag", "merge_pdf", "merge_type"] },
    ),
    outputSchema: printResultSchema("pdf"),
  }),
  defineProviderAction(service, {
    name: "print_waybill_command",
    description:
      "Convert waybills into printer command sets (云打印面单转指令, cpcl or zpl), returned inline as text or as downloadable files.",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybills to render as printer commands.",
      {
        template_code: templateCodeSchema,
        documents: s.array("The waybills to print, at most 10 per batch.", printDocumentSchema, {
          minItems: 1,
          maxItems: 10,
        }),
        command_type: s.stringEnum(
          "The printer command set: cpcl (portable printers, default) or zpl (desktop printers).",
          ["cpcl", "zpl"],
        ),
        command_file_type: s.stringEnum("Set to url to receive command files instead of inline command text.", ["url"]),
        custom_template_code: customTemplateCodeSchema,
        encrypt_flag: encryptFlagSchema,
      },
      { optional: ["command_type", "command_file_type", "custom_template_code", "encrypt_flag"] },
    ),
    outputSchema: s.object(
      "The generated printer commands.",
      {
        files: s.array(
          "One entry per waybill: inline command text per print copy, or a downloadable file when command_file_type is url.",
          s.object(
            "The commands or file for one waybill.",
            {
              waybillNo: s.string("The waybill number."),
              contents: s.array(
                "The command text per print copy.",
                s.requiredObject("The command text for one copy.", {
                  area: s.string(
                    "The copy name: master 主运单联, additional 附加联, stub 存根联, receipt 发票联, custom 自定义联.",
                  ),
                  content: s.string("The printer command text for this copy."),
                }),
              ),
              url: s.string("The command file download URL (file mode)."),
              token: s.string("The X-Auth-token header value required to download (file mode)."),
              seqNo: s.integer("The print sequence number (file mode)."),
            },
            { optional: ["contents", "url", "token", "seqNo"] },
          ),
        ),
        clientCode: s.string("The partnerID the commands were generated for."),
        templateCode: s.string("The template code used."),
        fileType: s.string("The generated file type (command)."),
      },
      { optional: ["clientCode", "templateCode", "fileType"] },
    ),
  }),
  defineProviderAction(service, {
    name: "print_waybill_cainiao_template",
    description:
      "Convert waybills into Cainiao print template URLs (云打印面单转菜鸟模板) for systems already integrated with the Cainiao print component.",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybills to render as Cainiao templates.",
      {
        template_code: templateCodeSchema,
        documents: s.array("The waybills to print, at most 20 per batch.", printDocumentSchema, {
          minItems: 1,
          maxItems: 20,
        }),
        sync: cloudPrintSyncSchema,
        custom_template_code: customTemplateCodeSchema,
      },
      { optional: ["sync", "custom_template_code"] },
    ),
    outputSchema: s.object(
      "The generated Cainiao templates.",
      {
        files: s.array(
          "One entry per waybill.",
          s.object(
            "The Cainiao template files for one waybill.",
            {
              waybillNo: s.string("The waybill number."),
              seqNo: s.integer("The print sequence number."),
              contents: s.array(
                "The template file per copy.",
                s.requiredObject("The Cainiao template for one copy.", {
                  templateURL: s.string("The Cainiao template download URL (valid 24h)."),
                  areaNo: s.integer("The copy number; 1 for single-copy templates."),
                  pageNo: s.integer("The page number within the copy."),
                }),
              ),
            },
            { optional: ["seqNo"] },
          ),
        ),
        clientCode: s.string("The partnerID the templates were generated for."),
        templateCode: s.string("The template code used."),
        fileType: s.string("The generated file type (cainiao)."),
      },
      { optional: ["clientCode", "templateCode", "fileType"] },
    ),
  }),
  defineProviderAction(service, {
    name: "print_waybill_html",
    description:
      "Generate waybill HTML print files from a cloud print template (云打印面单转HTML). Returns download URLs that need the returned token in the X-Auth-token header (valid 24h).",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybills to render as HTML.",
      {
        template_code: templateCodeSchema,
        documents: s.array("The waybills to print, at most 20 per batch.", printDocumentSchema, {
          minItems: 1,
          maxItems: 20,
        }),
        sync: cloudPrintSyncSchema,
        custom_template_code: customTemplateCodeSchema,
        encrypt_flag: encryptFlagSchema,
      },
      { optional: ["sync", "custom_template_code", "encrypt_flag"] },
    ),
    outputSchema: printResultSchema("html"),
  }),
  defineProviderAction(service, {
    name: "submit_citywide_print",
    description:
      "Submit waybill print content for 大同城 citywide freight orders. Asynchronous by default: returns a print batch number to poll with sf_express.query_citywide_print_status; sync mode (max 20 documents) returns the files directly.",
    requiredScopes: [],
    inputSchema: s.object(
      "The citywide print job.",
      {
        template_code: s.nonEmptyString(
          "The print template code; 拼车集货 uses CITYWIDE_PERSONAL_CARPOOL_001, otherwise the fm_* code from the console.",
        ),
        documents: s.array(
          "The waybills to print; at most 200 asynchronously, at most 20 when sync is true.",
          citywideDocumentSchema,
          { minItems: 1, maxItems: 200 },
        ),
        sync: s.boolean(
          "Whether to print synchronously and return the files directly (default false = asynchronous batch).",
        ),
      },
      { optional: ["sync"] },
    ),
    outputSchema: s.object(
      "The print job result.",
      {
        files: s.array("The generated PDF files (sync mode only); unordered, sort by seqNo.", citywidePrintFileSchema),
        printBatchNo: s.string("The print batch number for polling the status (async mode only, valid 24h)."),
      },
      { optional: ["files", "printBatchNo"] },
    ),
    followUpActions: ["sf_express.query_citywide_print_status"],
  }),
  defineProviderAction(service, {
    name: "query_citywide_print_status",
    description: "Query the status and generated PDF files of a 大同城 citywide print batch.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The print batch to query.", {
      print_batch_no: s.nonEmptyString("The print batch number returned by sf_express.submit_citywide_print."),
    }),
    outputSchema: s.object(
      "The print batch status.",
      {
        status: s.string("The print status: -1 = failed, 0 = printing, 1 = done."),
        errorReason: s.string("The failure reason when status is -1."),
        files: s.array("The generated PDF files; unordered, sort by seqNo.", citywidePrintFileSchema),
      },
      { optional: ["errorReason", "files"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_print_templates",
    description:
      "List a merchant's published custom print templates with their placeholder fields (ISV 自定义模板列表).",
    requiredScopes: [],
    inputSchema: s.object(
      "The template query.",
      {
        seller_user_id: sellerUserIdSchema,
        standard_template_code: standardTemplateCodeSchema,
      },
      { optional: ["standard_template_code"] },
    ),
    outputSchema: customTemplateListSchema,
  }),
  defineProviderAction(service, {
    name: "save_print_template",
    description:
      "Save a merchant custom print template (ISV 保存自定义模板); same name means a new version of the same template. The content follows the SF markup language spec.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The custom template to save.", {
      standard_template_code: standardTemplateCodeSchema,
      seller_user_id: sellerUserIdSchema,
      custom_template_name: s.nonEmptyString(
        "The custom template name; reusing a name creates a new version of that template.",
      ),
      content: s.nonEmptyString(
        "The custom template content in the SF markup language (a JSON array string of layout elements).",
      ),
    }),
    outputSchema: s.requiredObject("The saved template.", {
      customTemplateCode: s.string("The assigned custom template code."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_print_template",
    description:
      "Delete a merchant custom print template (ISV 删除自定义模板); SF caps the number of templates per account, so delete unused ones before adding new.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The custom template to delete.", {
      seller_user_id: sellerUserIdSchema,
      custom_template_code: s.nonEmptyString("The custom template code to delete."),
    }),
    outputSchema: s.requiredObject("The deletion result.", {
      deleted: s.boolean("Whether the template was deleted."),
      customTemplateCode: s.string("The deleted custom template code."),
    }),
  }),
];
