import { afterEach, describe, expect, it, vi } from "vitest";
import { pubmedActions } from "./actions.ts";
import { executors } from "./executors.ts";
import { pubmedActionHandlers } from "./runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PubMed executors", () => {
  it("defines one handler for every catalog action", () => {
    expect(Object.keys(pubmedActionHandlers).sort()).toEqual(pubmedActions.map((action) => action.name).sort());
  });

  it("executes article retrieval with a no-auth connection", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> =>
        new Response(`
          <PubmedArticleSet>
            <PubmedArticle>
              <MedlineCitation>
                <PMID>12345678</PMID>
                <Article>
                  <Journal><Title>Test Journal</Title></Journal>
                  <ArticleTitle>Test article</ArticleTitle>
                </Article>
              </MedlineCitation>
              <PubmedData><ArticleIdList /></PubmedData>
            </PubmedArticle>
          </PubmedArticleSet>
        `),
    );
    vi.stubGlobal("fetch", fetcher);

    const result = await executors["pubmed.get_article"]?.(
      { pmid: "12345678" },
      { getCredential: async () => ({ authType: "no_auth" }) },
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        found: true,
        article: { pmid: "12345678", title: "Test article" },
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
