import { describe, expect, it, vi } from "vitest";
import { sfExpressPrintHandlers } from "./runtime-print.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

/** The print endpoints answer with the inner envelope's obj instead of msgData. */
const okObjEnvelope = (obj: unknown): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: JSON.stringify({ success: true, errorCode: "S0000", errorMessage: null, requestId: "req-1", obj }),
  });

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body));

const printFile = {
  url: "https://eos-scp-core-shenzhen-futian1-oss.sf-express.com/print-file/a.pdf",
  token: "AUTH_token",
  waybillNo: "SF1234567890999",
  seqNo: 1,
  areaNo: 1,
  pageNo: 1,
};

describe("SF Express waybill-printing handlers", () => {
  it("builds a PDF print request with fixed version and merge extJson, then normalizes the file list", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const form = readForm(init);
      expect(form.get("serviceCode")).toBe("COM_RECE_CLOUD_PRINT_WAYBILLS");
      expect(JSON.parse(form.get("msgData")!)).toEqual({
        templateCode: "fm_76130_standard_TEST_PARTNER",
        version: "2.0",
        fileType: "pdf",
        sync: true,
        documents: [{ masterWaybillNo: "SF1234567890999" }],
        extJson: { mergePdf: true, mergeType: "all" },
      });
      return okObjEnvelope({
        clientCode: "TEST_PARTNER",
        templateCode: "fm_76130_standard_TEST_PARTNER",
        fileType: "pdf",
        files: [{ ...printFile, pageCount: 1 }],
      });
    });

    const output = await sfExpressPrintHandlers.print_waybill_pdf!(
      {
        template_code: "fm_76130_standard_TEST_PARTNER",
        documents: [{ masterWaybillNo: "SF1234567890999" }],
        merge_pdf: true,
        merge_type: "all",
      },
      context(fetcher),
    );

    expect(output).toEqual({
      files: [{ ...printFile, pageCount: 1 }],
      clientCode: "TEST_PARTNER",
      templateCode: "fm_76130_standard_TEST_PARTNER",
      fileType: "pdf",
    });
  });

  it("returns an empty file list for an asynchronous PDF print", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!).sync).toBe(false);
      return okObjEnvelope(undefined);
    });

    const output = await sfExpressPrintHandlers.print_waybill_pdf!(
      { template_code: "t", documents: [{ masterWaybillNo: "SF1234567890999" }], sync: false },
      context(fetcher),
    );

    expect(output).toEqual({ files: undefined, clientCode: undefined, templateCode: undefined, fileType: undefined });
  });

  it("rejects a sign-back-only print without any waybill number", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressPrintHandlers.print_waybill_pdf!(
        { template_code: "t", documents: [{ remark: "no numbers" }] },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "documents[0] requires masterWaybillNo or backWaybillNo." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes inline printer commands per copy", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData.extJson).toEqual({ commandType: "zpl" });
      expect(msgData.documents).toHaveLength(1);
      return okObjEnvelope({
        clientCode: "TEST_PARTNER",
        templateCode: "t",
        fileType: "command",
        files: [{ waybillNo: "SF1234567890999", contents: [{ area: "master", content: "^XA..." }] }],
      });
    });

    const output = await sfExpressPrintHandlers.print_waybill_command!(
      { template_code: "t", documents: [{ masterWaybillNo: "SF1234567890999" }], command_type: "zpl" },
      context(fetcher),
    );

    expect(output).toEqual({
      files: [
        {
          waybillNo: "SF1234567890999",
          contents: [{ area: "master", content: "^XA..." }],
          url: undefined,
          token: undefined,
          seqNo: undefined,
        },
      ],
      clientCode: "TEST_PARTNER",
      templateCode: "t",
      fileType: "command",
    });
  });

  it("normalizes Cainiao template URLs", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okObjEnvelope({
        clientCode: "TEST_PARTNER",
        templateCode: "t",
        fileType: "cainiao",
        files: [
          {
            waybillNo: "SF1234567890123",
            seqNo: 1,
            contents: [{ templateURL: "https://x.xml", areaNo: 1, pageNo: 1 }],
          },
        ],
      }),
    );

    const output = await sfExpressPrintHandlers.print_waybill_cainiao_template!(
      { template_code: "t", documents: [{ masterWaybillNo: "SF1234567890123" }] },
      context(fetcher),
    );

    expect(output).toMatchObject({
      files: [
        { waybillNo: "SF1234567890123", seqNo: 1, contents: [{ templateURL: "https://x.xml", areaNo: 1, pageNo: 1 }] },
      ],
    });
  });

  it("sends fileType html for the HTML print", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData.fileType).toBe("html");
      expect(msgData.extJson).toEqual({ encryptFlag: "101020" });
      return okObjEnvelope({ files: [printFile], fileType: "html" });
    });

    const output = await sfExpressPrintHandlers.print_waybill_html!(
      { template_code: "t", documents: [{ masterWaybillNo: "SF1234567890999" }], encrypt_flag: "101020" },
      context(fetcher),
    );

    expect(output).toMatchObject({ files: [{ url: printFile.url }], fileType: "html" });
  });

  it("submits a citywide print job on the sfapi host and reads the async batch number from a bare envelope", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://sfapi.sf-express.com/std/service");
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        templateCode: "CITYWIDE_PERSONAL_CARPOOL_001",
        documents: [
          {
            masterWaybillNo: "SF1234567890999",
            seq: 1,
            sum: 1,
            waybillNoCheckType: "1",
            waybillNoCheckValue: "380000",
          },
        ],
      });
      return Response.json({ obj: { printBatchNo: "batch-1" }, requestId: "req-9", success: true });
    });

    const output = await sfExpressPrintHandlers.submit_citywide_print!(
      {
        template_code: "CITYWIDE_PERSONAL_CARPOOL_001",
        documents: [
          {
            masterWaybillNo: "SF1234567890999",
            seq: 1,
            sum: 1,
            waybillNoCheckType: "1",
            waybillNoCheckValue: "380000",
          },
        ],
      },
      context(fetcher),
    );

    expect(output).toEqual({ files: undefined, printBatchNo: "batch-1" });
  });

  it("enforces the 20-document cap for sync citywide prints", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const documents = Array.from({ length: 21 }, () => ({
      masterWaybillNo: "SF1234567890999",
      waybillNoCheckType: "1",
      waybillNoCheckValue: "380000",
    }));

    await expect(
      sfExpressPrintHandlers.submit_citywide_print!({ template_code: "t", documents, sync: true }, context(fetcher)),
    ).rejects.toMatchObject({ status: 400, message: "documents must contain at most 20 items." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("queries a citywide print batch status on the sfapi host", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(String(url)).toBe("https://sfapi.sf-express.com/std/service");
      return Response.json({ obj: { files: [printFile], status: "1" }, requestId: "req-1", success: true });
    });

    const output = await sfExpressPrintHandlers.query_citywide_print_status!(
      { print_batch_no: "batch-1" },
      context(fetcher),
    );

    expect(output).toEqual({ status: "1", errorReason: undefined, files: [{ ...printFile, pageCount: undefined }] });
  });

  it("maps a bare-envelope errorMessage failure to an input error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ success: false, errorCode: "000000", errorMessage: "系统异常！" }),
    );

    await expect(
      sfExpressPrintHandlers.query_citywide_print_status!({ print_batch_no: "batch-1" }, context(fetcher)),
    ).rejects.toMatchObject({ status: 400, message: "系统异常！" });
  });

  it("lists custom templates from a bare obj array with the fixed query type", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ type: 1, sellerUserId: "123" });
      return Response.json({
        obj: [
          {
            customTemplateCode: "fm_76130_standard_custom_1",
            customTemplateName: "130自定义模板1",
            placeholderKeys: ["students"],
            standardTemplateCode: "fm_76130_standard",
          },
        ],
        requestId: "2203251530",
        success: true,
      });
    });

    const output = await sfExpressPrintHandlers.list_print_templates!({ seller_user_id: "123" }, context(fetcher));

    expect(output).toEqual({
      templates: [
        {
          customTemplateName: "130自定义模板1",
          customTemplateCode: "fm_76130_standard_custom_1",
          standardTemplateCode: "fm_76130_standard",
          placeholderKeys: ["students"],
        },
      ],
    });
  });

  it("saves a custom template and reads back the assigned code", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        standardTemplateCode: "fm_76130_standard",
        sellerUserId: "12345",
        customTemplateName: "丰密130自定义模板",
        content: '[{"type":"line"}]',
      });
      return Response.json({ obj: { customTemplateCode: "fm_76130_standard_custom_1" }, success: true });
    });

    const output = await sfExpressPrintHandlers.save_print_template!(
      {
        standard_template_code: "fm_76130_standard",
        seller_user_id: "12345",
        custom_template_name: "丰密130自定义模板",
        content: '[{"type":"line"}]',
      },
      context(fetcher),
    );

    expect(output).toEqual({ customTemplateCode: "fm_76130_standard_custom_1" });
  });

  it("deletes a custom template and reports the echo", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ sellerUserId: "12345", customTemplateCode: "fm_76130_standard_custom_1" });
      return Response.json({ requestId: "2203251530", success: true });
    });

    const output = await sfExpressPrintHandlers.delete_print_template!(
      { seller_user_id: "12345", custom_template_code: "fm_76130_standard_custom_1" },
      context(fetcher),
    );

    expect(output).toEqual({ deleted: true, customTemplateCode: "fm_76130_standard_custom_1" });
  });
});
