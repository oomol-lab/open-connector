import type { FeishuJsonRequest } from "./client.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../../provider-runtime.ts";
import { createFeishuBaseActionHandlers } from "./base-runtime.ts";

const recordMatrix = {
  fields: ["Name", "Status"],
  field_id_list: ["fld_name", "fld_status"],
  record_id_list: ["rec_1", "rec_2"],
  data: [
    ["Alice", "Done"],
    ["Bob", null],
  ],
  total: 2,
  has_more: false,
};

const expectedRecords = [
  {
    record_id: "rec_1",
    fields: { Name: "Alice", Status: "Done" },
  },
  {
    record_id: "rec_2",
    fields: { Name: "Bob", Status: null },
  },
];

const tableRecordsPath = "/base/v3/bases/base_1/tables/tbl_1/records";

interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

function recordingRequest(response: Record<string, unknown>) {
  const calls: RecordedCall[] = [];
  const request: FeishuJsonRequest = async (input) => {
    calls.push({ method: input.method ?? "GET", path: input.path, body: input.body });
    return response;
  };
  return { calls, handlers: createFeishuBaseActionHandlers(request) };
}

describe("Feishu Base record responses", () => {
  it("decodes record matrices returned by list and search", async () => {
    const { calls, handlers } = recordingRequest(recordMatrix);
    const listInput = {
      appToken: "base_1",
      tableId: "tbl_1",
      offset: 0,
      limit: 2,
    };
    const searchInput = { ...listInput, keyword: "Alice", searchFields: ["Name"] };

    await expect(handlers.list_base_records(listInput)).resolves.toEqual({
      items: expectedRecords,
      offset: 0,
      limit: 2,
      total: 2,
      hasMore: false,
    });
    await expect(handlers.search_base_records(searchInput)).resolves.toEqual({
      items: expectedRecords,
      offset: 0,
      limit: 2,
      total: 2,
      hasMore: false,
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${tableRecordsPath}`,
      `POST ${tableRecordsPath}/search`,
    ]);
  });

  it("accepts the legacy record list shapes", async () => {
    const legacyRecords = [{ record_id: "rec_9", fields: { Name: "Z" } }];
    for (const response of [{ records: legacyRecords }, { items: legacyRecords }]) {
      const { handlers } = recordingRequest(response);

      await expect(handlers.list_base_records({ appToken: "base_1", tableId: "tbl_1" })).resolves.toEqual({
        items: legacyRecords,
        offset: 0,
        limit: 100,
        total: 1,
        hasMore: false,
      });
    }
  });

  it("returns an empty page for an empty record matrix", async () => {
    const { handlers } = recordingRequest({
      fields: ["Name"],
      record_id_list: [],
      data: [],
      has_more: false,
    });

    await expect(handlers.list_base_records({ appToken: "base_1", tableId: "tbl_1" })).resolves.toEqual({
      items: [],
      offset: 0,
      limit: 100,
      total: 0,
      hasMore: false,
    });
  });

  it("derives the total from the offset when the matrix reports more pages", async () => {
    const { handlers } = recordingRequest({
      fields: ["Name"],
      record_id_list: ["rec_1"],
      data: [["Alice"]],
      has_more: true,
    });

    await expect(
      handlers.list_base_records({ appToken: "base_1", tableId: "tbl_1", offset: 10, limit: 50 }),
    ).resolves.toEqual({
      items: [{ record_id: "rec_1", fields: { Name: "Alice" } }],
      offset: 10,
      limit: 50,
      total: 11,
      hasMore: true,
    });
  });

  it("decodes the record matrix returned by batch get", async () => {
    const { calls, handlers } = recordingRequest({
      fields: recordMatrix.fields,
      field_id_list: recordMatrix.field_id_list,
      record_id_list: ["rec_1"],
      data: [["Alice", "Done"]],
    });

    await expect(
      handlers.get_base_record({
        appToken: "base_1",
        tableId: "tbl_1",
        recordId: "rec_1",
      }),
    ).resolves.toEqual({ record: expectedRecords[0] });
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${tableRecordsPath}/batch_get`,
        body: { record_id_list: ["rec_1"] },
      },
    ]);
  });

  it("rejects a record listed in record_not_found", async () => {
    const { handlers } = recordingRequest({
      fields: ["Name", "Note"],
      record_id_list: ["rec_missing"],
      data: [[null, null]],
      record_not_found: ["rec_missing"],
      has_more: false,
    });

    const missing = handlers.get_base_record({
      appToken: "base_1",
      tableId: "tbl_1",
      recordId: "rec_missing",
    });
    await expect(missing).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(missing).rejects.toMatchObject({ status: 404 });
    await expect(missing).rejects.toThrow("Base record rec_missing was not found");
  });

  it("picks the requested record out of a partially found batch", async () => {
    const { handlers } = recordingRequest({
      fields: ["Name"],
      record_id_list: ["rec_1", "rec_missing"],
      data: [["Alice"], [null]],
      record_not_found: ["rec_missing"],
      has_more: false,
    });

    await expect(
      handlers.get_base_record({ appToken: "base_1", tableId: "tbl_1", recordId: "rec_1" }),
    ).resolves.toEqual({ record: { record_id: "rec_1", fields: { Name: "Alice" } } });
    await expect(
      handlers.get_base_record({ appToken: "base_1", tableId: "tbl_1", recordId: "rec_missing" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a batch get that returns a different record", async () => {
    const { handlers } = recordingRequest({
      fields: ["Name"],
      record_id_list: ["rec_other"],
      data: [["Alice"]],
      has_more: false,
    });

    await expect(handlers.get_base_record({ appToken: "base_1", tableId: "tbl_1", recordId: "rec_1" })).rejects.toThrow(
      "Base record rec_1 was not returned",
    );
  });

  it("rejects inconsistent record matrices", async () => {
    const { handlers } = recordingRequest({
      fields: ["Name"],
      record_id_list: ["rec_1"],
      data: [],
    });

    await expect(handlers.list_base_records({ appToken: "base_1", tableId: "tbl_1" })).rejects.toThrow(
      "record_id_list and data lengths differ",
    );
  });
});
