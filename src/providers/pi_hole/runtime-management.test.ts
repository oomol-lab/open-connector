import { afterEach, describe, expect, it } from "vitest";
import { piHoleManagementActionHandlers } from "./runtime-management.ts";
import { clearPiHoleSessionCache, piHoleActionHandlers } from "./runtime.ts";
import { createTestContext, sessionResponse } from "./test-helpers.ts";

afterEach(() => clearPiHoleSessionCache());

const handlers = { ...piHoleActionHandlers, ...piHoleManagementActionHandlers };

function processedResponse(): Response {
  return Response.json(
    {
      processed: {
        success: [{ item: "example.com" }],
        errors: [{ item: "other.com", error: "The item is already present" }],
      },
      took: 0.1,
    },
    { status: 201 },
  );
}

describe("group management", () => {
  it("creates a group with body fields carried through", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/groups") {
        return processedResponse();
      }
      return undefined;
    });

    const result = await handlers.create_group!(
      { name: "Home-Automation", comment: "smart home devices", enabled: false },
      context,
    );
    expect(result).toEqual({
      processed: { success: ["example.com"], errors: [{ item: "other.com", error: "The item is already present" }] },
    });

    const post = requests.find((request) => request.method === "POST" && request.url.pathname === "/api/groups")!;
    expect(post.body).toEqual({ name: "Home-Automation", comment: "smart home devices", enabled: false });
  });

  it("sends an array of group names through as-is", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/groups") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.create_group!({ name: ["A", "B", "C"] }, context);

    const post = requests.find((request) => request.method === "POST" && request.url.pathname === "/api/groups")!;
    expect(post.body).toEqual({ name: ["A", "B", "C"] });
  });

  it("renames a group while preserving the current comment and enabled state", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "GET" && request.url.pathname === "/api/groups") {
        return Response.json({ groups: [{ name: "Old Name", comment: "keep me", enabled: false }], took: 0.1 });
      }
      if (request.method === "PUT" && request.url.pathname === "/api/groups/Old%20Name") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.update_group!({ name: "Old Name", newName: "New Name" }, context);

    const put = requests.find((request) => request.method === "PUT")!;
    expect(put.url.pathname).toBe("/api/groups/Old%20Name");
    expect(put.body).toEqual({ name: "New Name", comment: "keep me", enabled: false });
  });

  it("preserves an existing comment when only disabling a group", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "GET" && request.url.pathname === "/api/groups") {
        return Response.json({ groups: [{ name: "Test", comment: "existing", enabled: true }], took: 0.1 });
      }
      if (request.method === "PUT" && request.url.pathname === "/api/groups/Test") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.update_group!({ name: "Test", enabled: false }, context);

    const put = requests.find((request) => request.method === "PUT")!;
    expect(put.body).toEqual({ name: "Test", comment: "existing", enabled: false });
  });

  it("explicitly clearing a comment is honored", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "GET" && request.url.pathname === "/api/groups") {
        return Response.json({ groups: [{ name: "Test", comment: "existing", enabled: true }], took: 0.1 });
      }
      if (request.method === "PUT") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.update_group!({ name: "Test", comment: null }, context);

    const put = requests.find((request) => request.method === "PUT")!;
    expect(put.body).toEqual({ name: "Test", comment: null, enabled: true });
  });

  it("reports a missing group as not found", async () => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "GET" && request.url.pathname === "/api/groups") {
        return Response.json({ groups: [{ name: "Other", comment: null, enabled: true }], took: 0.1 });
      }
      return undefined;
    });

    await expect(handlers.update_group!({ name: "Missing" }, context)).rejects.toThrow(
      "Pi-hole item not found: group Missing",
    );
  });

  it("deletes a group and reports success", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "DELETE" && request.url.pathname === "/api/groups/Test") {
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    const result = await handlers.delete_group!({ name: "Test" }, context);
    expect(result).toEqual({ deleted: true });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.method).toBe("DELETE");
  });
});

describe("list management", () => {
  it("adds a blocklist with the required type query and body fields", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/lists") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.add_list!(
      {
        address: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
        type: "block",
        comment: "StevenBlack",
        groups: [1, 2],
        enabled: true,
      },
      context,
    );

    const post = requests.find((request) => request.method === "POST" && request.url.pathname === "/api/lists")!;
    expect(post.url.searchParams.get("type")).toBe("block");
    expect(post.body).toEqual({
      address: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
      comment: "StevenBlack",
      groups: [1, 2],
      enabled: true,
    });
  });

  it("preserves the current comment when only toggling a list", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "GET" && request.url.pathname === "/api/lists") {
        return Response.json({
          lists: [{ address: "https://hosts/file.txt", type: "block", comment: "keep", enabled: true, groups: [0] }],
          took: 0.1,
        });
      }
      if (request.method === "PUT") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.update_list!({ address: "https://hosts/file.txt", type: "block", enabled: false }, context);

    const put = requests.find((request) => request.method === "PUT")!;
    expect(put.url.searchParams.get("type")).toBe("block");
    expect(put.body).toEqual({ comment: "keep", enabled: false });
  });

  it("deletes a list with the type query and an encoded address", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "DELETE" && request.url.pathname.startsWith("/api/lists/")) {
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    await handlers.delete_list!({ address: "https://hosts/file.txt", type: "allow" }, context);

    const del = requests.find((request) => request.method === "DELETE")!;
    expect(del.url.pathname).toBe("/api/lists/https%3A%2F%2Fhosts%2Ffile.txt");
    expect(del.url.searchParams.get("type")).toBe("allow");
  });
});

describe("domain management", () => {
  it("adds an exact allow entry with body fields", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/domains/allow/exact") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.add_domain!({ domain: "example.com", type: "allow", kind: "exact", enabled: false }, context);

    const post = requests.find(
      (request) => request.method === "POST" && request.url.pathname === "/api/domains/allow/exact",
    )!;
    expect(post.body).toEqual({ domain: "example.com", enabled: false });
  });

  it("lists domains with the requested path narrowing", async () => {
    const paths: string[] = [];
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      paths.push(request.url.pathname);
      return Response.json({ domains: [], took: 0.1 });
    });

    await handlers.list_domains!({}, context);
    await handlers.list_domains!({ type: "deny" }, context);
    await handlers.list_domains!({ type: "allow", kind: "regex" }, context);

    expect(paths).toEqual(["/api/domains", "/api/domains/deny", "/api/domains/allow/regex"]);
  });

  it("deletes a domain entry via its type, kind, and encoded domain", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    await handlers.delete_domain!({ type: "deny", kind: "regex", domain: "ads*.example" }, context);

    const del = requests.find((request) => request.method === "DELETE")!;
    // Wildcards are left literal (they are part of the regex item), and the
    // server URL-decodes encoded bytes before matching the item.
    expect(del.url.pathname).toBe("/api/domains/deny/regex/ads*.example");
  });
});

describe("client management", () => {
  it("updates a client comment and groups while preserving the current comment when only groups change", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "GET" && request.url.pathname === "/api/clients") {
        return Response.json({
          clients: [{ client: "192.168.1.5", name: "living-room", comment: "existing", groups: [0] }],
          took: 0.1,
        });
      }
      if (request.method === "PUT" && request.url.pathname === "/api/clients/192.168.1.5") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.update_client!({ client: "192.168.1.5", comment: "living room", groups: [1] }, context);

    const put = requests.find((request) => request.method === "PUT")!;
    expect(put.url.pathname).toBe("/api/clients/192.168.1.5");
    expect(put.body).toEqual({ comment: "living room", groups: [1] });
  });

  it("looks a client up by its resolved hostname", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "GET" && request.url.pathname === "/api/clients") {
        return Response.json({
          clients: [{ client: "10.0.0.9", name: "nas.lan", comment: "old", groups: [0] }],
          took: 0.1,
        });
      }
      if (request.method === "PUT" && request.url.pathname === "/api/clients/10.0.0.9") {
        return processedResponse();
      }
      return undefined;
    });

    await handlers.update_client!({ client: "nas.lan", comment: "nas" }, context);

    const put = requests.find((request) => request.method === "PUT")!;
    // The write endpoint must target the canonical stored identifier, not the
    // hostname alias used to find the client.
    expect(put.url.pathname).toBe("/api/clients/10.0.0.9");
    expect(put.body).toEqual({ comment: "nas" });
  });

  it("deletes a client by identifier", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "DELETE" && request.url.pathname === "/api/clients/%3Aeth0") {
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    const result = await handlers.delete_client!({ client: ":eth0" }, context);
    expect(result).toEqual({ deleted: true });
    const del = requests.find((request) => request.method === "DELETE")!;
    // Colons are percent-encoded in the path and decoded by the server before
    // the client identifier is matched.
    expect(del.url.pathname).toBe("/api/clients/%3Aeth0");
  });
});

describe("batch deletes", () => {
  it("deletes multiple groups with the item body shape", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/groups:batchDelete") {
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    const result = await handlers.batch_delete_groups!({ items: ["A", "B"] }, context);
    expect(result).toEqual({ deleted: true });
    const post = requests.find((request) => request.url.pathname === "/api/groups:batchDelete")!;
    expect(post.body).toEqual([{ item: "A" }, { item: "B" }]);
  });

  it("deletes multiple lists with per-entry type", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/lists:batchDelete") {
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    await handlers.batch_delete_lists!(
      {
        items: [
          { address: "https://a.example/list", type: "block" },
          { address: "https://b.example/list", type: "allow" },
        ],
      },
      context,
    );

    const post = requests.find((request) => request.url.pathname === "/api/lists:batchDelete")!;
    expect(post.url.searchParams.has("type")).toBe(false);
    expect(post.body).toEqual([
      { item: "https://a.example/list", type: "block" },
      { item: "https://b.example/list", type: "allow" },
    ]);
  });

  it("deletes multiple domains with per-entry type and kind", async () => {
    const { context, requests } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/domains:batchDelete") {
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    await handlers.batch_delete_domains!(
      {
        items: [{ domain: "a.example", type: "allow", kind: "exact" }],
      },
      context,
    );

    const post = requests.find((request) => request.url.pathname === "/api/domains:batchDelete")!;
    expect(post.body).toEqual([{ item: "a.example", type: "allow", kind: "exact" }]);
  });

  it("reports deleted=false when the instance finds no matching items", async () => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.method === "POST" && request.url.pathname === "/api/clients:batchDelete") {
        return new Response(null, { status: 404 });
      }
      return undefined;
    });

    const result = await handlers.batch_delete_clients!({ items: ["10.0.0.1", "10.0.0.2"] }, context);
    expect(result).toEqual({ deleted: false });
  });
});

describe("network reads", () => {
  it.each([
    ["get_dhcp_leases", "/api/dhcp/leases", "leases"],
    ["get_network_devices", "/api/network/devices", "devices"],
  ] as const)("%s passes through its payload array", async (name, pathname, key) => {
    const { context } = createTestContext((request) => {
      if (request.method === "POST" && request.url.pathname === "/api/auth") {
        return sessionResponse("sid");
      }
      if (request.url.pathname === pathname) {
        return Response.json({ [key]: [{ id: 1 }], took: 0.1 });
      }
      return undefined;
    });

    const result = await handlers[name]!({}, context);
    expect(result).toEqual({ [key]: [{ id: 1 }] });
  });
});
