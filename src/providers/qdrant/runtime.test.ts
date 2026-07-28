import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { createQdrantContext, qdrantActionHandlers, validateQdrantCredential } from "./runtime.ts";

const clusterUrl = "https://test-cluster.cloud.qdrant.io:6333";
const apiKey = "qdrant-secret";

function jsonResponse(result: unknown, status = 200): Response {
  return new Response(JSON.stringify({ status: "ok", result }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ status: { error }, result: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup(response: Response | (() => Response) = jsonResponse({})) {
  const fetcher = vi.fn<ProviderFetch>(async () => (typeof response === "function" ? response() : response));
  return {
    fetcher,
    context: createQdrantContext({ clusterUrl, apiKey }, fetcher),
  };
}

function requestOf(fetcher: ReturnType<typeof vi.fn<ProviderFetch>>) {
  const [input, init] = fetcher.mock.calls[0];
  return {
    url: String(input),
    init,
    headers: new Headers(init?.headers),
  };
}

describe("Qdrant runtime", () => {
  it("validates credentials through the collections endpoint and creates a stable profile", async () => {
    const { fetcher } = setup(jsonResponse({ collections: [{ name: "documents" }] }));

    const result = await validateQdrantCredential({ clusterUrl, apiKey }, fetcher);

    expect(result.profile).toEqual({
      accountId: "qdrant:test-cluster.cloud.qdrant.io",
      displayName: "Qdrant Cloud - test-cluster.cloud.qdrant.io",
    });
    expect(result.metadata).toEqual({
      clusterUrl,
      validationEndpoint: "/collections",
      collectionCount: 1,
    });
    const request = requestOf(fetcher);
    expect(request.url).toBe(`${clusterUrl}/collections`);
    expect(request.init?.method).toBe("GET");
    expect(request.headers.get("api-key")).toBe(apiKey);
    expect(request.headers.get("content-type")).toBeNull();
  });

  it("builds create, upsert, and point requests with encoded paths", async () => {
    const create = setup(jsonResponse(true));
    await qdrantActionHandlers.create_collection(
      { collectionName: "my collection", vectorSize: 3, distance: "Cosine" },
      create.context,
    );
    expect(requestOf(create.fetcher).url).toBe(`${clusterUrl}/collections/my%20collection`);
    expect(JSON.parse(String(requestOf(create.fetcher).init?.body))).toEqual({
      vectors: { size: 3, distance: "Cosine" },
    });

    const upsert = setup(jsonResponse({ operation_id: 12, status: "completed" }));
    const upsertResult = await qdrantActionHandlers.upsert_points(
      {
        collectionName: "my collection",
        points: [{ id: "550e8400-e29b-41d4-a716-446655440000", vector: [0.1, 0.2, 0.3], payload: { kind: "doc" } }],
      },
      upsert.context,
    );
    expect(upsertResult).toEqual({ operationId: 12, status: "completed" });
    expect(requestOf(upsert.fetcher).url).toBe(`${clusterUrl}/collections/my%20collection/points?wait=true`);

    const point = setup(jsonResponse({ id: 42, payload: { kind: "doc" } }));
    await qdrantActionHandlers.get_point({ collectionName: "my collection", id: 42 }, point.context);
    expect(requestOf(point.fetcher).url).toBe(`${clusterUrl}/collections/my%20collection/points/42`);
  });

  it("normalizes a null operation ID and rejects excluded point fields", async () => {
    const upsert = setup(jsonResponse({ operation_id: null, status: "wait_timeout" }));
    await expect(
      qdrantActionHandlers.upsert_points(
        { collectionName: "documents", points: [{ id: 1, vector: [0.1], payload: { ok: true } }] },
        upsert.context,
      ),
    ).resolves.toEqual({ operationId: null, status: "wait_timeout" });

    const invalid = setup();
    await expect(
      qdrantActionHandlers.upsert_points(
        { collectionName: "documents", points: [{ id: 1, vector: [0.1], sparse_values: { values: [1] } }] },
        invalid.context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(invalid.fetcher).not.toHaveBeenCalled();
  });

  it("maps query and scroll inputs and normalizes the next page offset", async () => {
    const query = setup(jsonResponse({ points: [{ id: 1, version: 2, score: 0.9 }] }));
    const queryResult = await qdrantActionHandlers.query_points(
      {
        collectionName: "documents",
        vector: [0.1, 0.2],
        filter: { must: [{ key: "tenant", match: { value: "acme" } }] },
        limit: 5,
        offset: 2,
        scoreThreshold: 0.5,
        withPayload: true,
        withVector: false,
      },
      query.context,
    );
    expect(queryResult).toEqual({ points: [{ id: 1, version: 2, score: 0.9 }] });
    expect(JSON.parse(String(requestOf(query.fetcher).init?.body))).toEqual({
      query: [0.1, 0.2],
      filter: { must: [{ key: "tenant", match: { value: "acme" } }] },
      score_threshold: 0.5,
      limit: 5,
      offset: 2,
      with_payload: true,
      with_vector: false,
    });

    const scroll = setup(jsonResponse({ points: [{ id: 1 }], next_page_offset: 42 }));
    await expect(
      qdrantActionHandlers.scroll_points({ collectionName: "documents", limit: 10 }, scroll.context),
    ).resolves.toEqual({ points: [{ id: 1 }], nextOffset: 42, complete: false });
    expect(JSON.parse(String(requestOf(scroll.fetcher).init?.body))).toEqual({ limit: 10 });
  });

  it("marks a final scroll page complete when Qdrant returns no offset", async () => {
    const { context } = setup(jsonResponse({ points: [], next_page_offset: null }));

    await expect(qdrantActionHandlers.scroll_points({ collectionName: "documents" }, context)).resolves.toEqual({
      points: [],
      nextOffset: null,
      complete: true,
    });
  });

  it("preserves execute-phase permission errors and maps validation permission errors", async () => {
    const execute = setup(errorResponse("forbidden", 403));
    await expect(
      qdrantActionHandlers.get_collection({ collectionName: "documents" }, execute.context),
    ).rejects.toMatchObject({
      status: 403,
      message: "forbidden",
    });

    const validateFetcher = vi.fn<ProviderFetch>(async () => errorResponse("invalid key", 401));
    await expect(validateQdrantCredential({ clusterUrl, apiKey }, validateFetcher)).rejects.toMatchObject({
      status: 400,
      message: "invalid key",
    });
  });

  it("rejects unsafe or non-Qdrant Cloud cluster URLs", () => {
    for (const invalidUrl of [
      "http://test-cluster.cloud.qdrant.io:6333",
      "https://test-cluster.example.com:6333",
      "https://test-cluster.cloud.qdrant.io:443",
      "https://test-cluster.cloud.qdrant.io:6333/path",
      "https://test-cluster.cloud.qdrant.io:6333?secret=1",
      "https://user:pass@test-cluster.cloud.qdrant.io:6333",
    ]) {
      expect(() => createQdrantContext({ clusterUrl: invalidUrl, apiKey }, vi.fn() as ProviderFetch)).toThrow();
    }
  });

  it("rejects malformed successful envelopes", async () => {
    const { context } = setup(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

    await expect(qdrantActionHandlers.list_collections({}, context)).rejects.toMatchObject({
      status: 502,
      message: "Qdrant response is missing result",
    });
  });

  it("preserves non-JSON client status and maps server errors to 502", async () => {
    const rateLimited = setup(new Response("rate limited", { status: 429 }));
    await expect(qdrantActionHandlers.list_collections({}, rateLimited.context)).rejects.toMatchObject({
      status: 429,
      message: "rate limited",
    });

    const serverError = setup(errorResponse("database unavailable", 503));
    await expect(qdrantActionHandlers.list_collections({}, serverError.context)).rejects.toMatchObject({
      status: 502,
      message: "database unavailable",
    });
  });
});
