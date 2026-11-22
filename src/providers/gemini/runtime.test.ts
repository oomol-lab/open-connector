import { describe, expect, it } from "vitest";
import { embedGeminiContent } from "./runtime.ts";

describe("Gemini embed_content", () => {
  // Google shut text-embedding-004 down on 2026-01-14, so a default that names
  // it fails every embed_content call made without a model.
  it("calls a served embedding model when the input names none", async () => {
    const urls: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
      urls.push(String(url));
      return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
    };

    const result = await embedGeminiContent({ text: "hello" }, { apiKey: "test-key", fetcher });

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/models/gemini-embedding-001:embedContent");
    expect(result).toMatchObject({ dimensions: 3 });
  });
});
