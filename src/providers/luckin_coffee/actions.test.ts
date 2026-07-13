import { describe, expect, it } from "vitest";
import { luckinCoffeeActions, luckinMcpToolNames } from "./actions.ts";

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
});
