import type { FeishuJsonRequest } from "./client.ts";

import { describe, expect, it } from "vitest";
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

describe("Feishu Base record responses", () => {
  it("decodes record matrices returned by list and search", async () => {
    const request: FeishuJsonRequest = async () => recordMatrix;
    const handlers = createFeishuBaseActionHandlers(request);
    const input = {
      appToken: "base_1",
      tableId: "tbl_1",
      keyword: "Alice",
      searchFields: ["Name"],
      offset: 0,
      limit: 2,
    };

    await expect(handlers.list_base_records(input)).resolves.toEqual({
      items: expectedRecords,
      offset: 0,
      limit: 2,
      total: 2,
      hasMore: false,
    });
    await expect(handlers.search_base_records(input)).resolves.toEqual({
      items: expectedRecords,
      offset: 0,
      limit: 2,
      total: 2,
      hasMore: false,
    });
  });

  it("decodes the record matrix returned by batch get", async () => {
    const request: FeishuJsonRequest = async () => ({
      fields: recordMatrix.fields,
      field_id_list: recordMatrix.field_id_list,
      record_id_list: ["rec_1"],
      data: [["Alice", "Done"]],
    });
    const handlers = createFeishuBaseActionHandlers(request);

    await expect(
      handlers.get_base_record({
        appToken: "base_1",
        tableId: "tbl_1",
        recordId: "rec_1",
      }),
    ).resolves.toEqual({ record: expectedRecords[0] });
  });

  it("rejects inconsistent record matrices", async () => {
    const request: FeishuJsonRequest = async () => ({
      fields: ["Name"],
      record_id_list: ["rec_1"],
      data: [],
    });
    const handlers = createFeishuBaseActionHandlers(request);

    await expect(handlers.list_base_records({ appToken: "base_1", tableId: "tbl_1" })).rejects.toThrow(
      "record_id_list and data lengths differ",
    );
  });
});
