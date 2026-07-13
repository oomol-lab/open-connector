import type { JsonSchema } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { luckinCoffeeActions, luckinMcpToolNames } from "./actions.ts";

function schemaProperties(schema: JsonSchema | undefined): Record<string, JsonSchema> {
  return (schema?.properties as Record<string, JsonSchema> | undefined) ?? {};
}

describe("Luckin Coffee actions", () => {
  it("exposes the complete public MCP tool catalog exactly once", () => {
    const actionNames = luckinCoffeeActions.map((action) => action.name);
    expect(actionNames).toEqual([...luckinMcpToolNames]);
    expect(new Set(actionNames).size).toBe(8);
  });

  it("marks the required official inputs for store lookup and order creation", () => {
    const queryShop = luckinCoffeeActions.find((action) => action.name === "queryShopList");
    const createOrder = luckinCoffeeActions.find((action) => action.name === "createOrder");
    expect(queryShop?.inputSchema.required).toEqual(["longitude", "latitude"]);
    expect(createOrder?.inputSchema.required).toEqual(["deptId", "productList", "longitude", "latitude"]);
  });

  it("warns about real-order side effects", () => {
    const createOrder = luckinCoffeeActions.find((action) => action.name === "createOrder");
    const cancelOrder = luckinCoffeeActions.find((action) => action.name === "cancelOrder");
    expect(createOrder?.description).toContain("real Luckin Coffee order");
    expect(createOrder?.description).toContain("confirmation");
    expect(cancelOrder?.description).toContain("irreversible");
  });

  it("keeps every createOrder result field, including the lossless orderIdStr handoff", () => {
    // Regression guard: the created-order schema has a field literally named `description`.
    // Built with s.looseObject it would be misread as options and drop all fields, erasing the
    // orderIdStr that queryOrderDetailInfo and cancelOrder consume.
    const createOrder = luckinCoffeeActions.find((action) => action.name === "createOrder");
    const dataSchema = schemaProperties(createOrder?.outputSchema).data;
    const fieldNames = Object.keys(schemaProperties(dataSchema));
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "orderId",
        "orderIdStr",
        "payOrderUrl",
        "payOrderQrCodeUrl",
        "discountPrice",
        "needPay",
        "tradeNo",
        "description",
        "businessNotifyUrl",
        "subMchid",
      ]),
    );
    expect(fieldNames).toContain("orderIdStr");
  });
});
