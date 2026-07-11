import { describe, expect, it, vi } from "vitest";
import { parsePubmedArticleSet } from "./runtime-xml.ts";
import { PubmedRequestGate, PubmedRequestGatePool, pubmedActionHandlers, validatePubmedCredential } from "./runtime.ts";

const articleXml = `<?xml version="1.0" ?>
<!DOCTYPE PubmedArticleSet>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE">
      <PMID Version="1">12345678</PMID>
      <Article PubModel="Electronic">
        <Journal>
          <ISSN IssnType="Electronic">1234-5678</ISSN>
          <JournalIssue>
            <Volume>12</Volume>
            <Issue>3</Issue>
            <PubDate><Year>2025</Year><Month>Dec</Month><Day>24</Day></PubDate>
          </JournalIssue>
          <Title>Journal of Useful Results</Title>
          <ISOAbbreviation>J Useful Results</ISOAbbreviation>
        </Journal>
        <ArticleTitle>Testing <i>structured</i> biomedical records.</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Why the test matters.</AbstractText>
          <AbstractText Label="METHODS">Parsed with <b>mixed content</b>.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author>
            <LastName>Lovelace</LastName><ForeName>Ada</ForeName><Initials>A</Initials>
            <Identifier Source="ORCID">0000-0001-2345-6789</Identifier>
            <AffiliationInfo><Affiliation>Analytical Engine Institute</Affiliation></AffiliationInfo>
          </Author>
          <Author><CollectiveName>PubMed Study Group</CollectiveName></Author>
        </AuthorList>
        <Language>eng</Language>
        <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList>
      </Article>
      <MeshHeadingList>
        <MeshHeading><DescriptorName UI="D012345">Information Storage and Retrieval</DescriptorName></MeshHeading>
      </MeshHeadingList>
      <KeywordList><Keyword>literature search</Keyword></KeywordList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">12345678</ArticleId>
        <ArticleId IdType="doi">10.1000/example</ArticleId>
        <ArticleId IdType="pmc">PMC1234567</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

const bookArticleXml = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedBookArticle>
    <BookDocument>
      <PMID>87654321</PMID>
      <ArticleIdList>
        <ArticleId IdType="pubmed">87654321</ArticleId>
        <ArticleId IdType="doi">10.1000/book-chapter</ArticleId>
      </ArticleIdList>
      <Book>
        <Publisher><PublisherName>National Library of Medicine</PublisherName></Publisher>
        <BookTitle>Biomedical Reference</BookTitle>
        <PubDate><Year>2024</Year><Month>Jan</Month><Day>2</Day></PubDate>
        <Volume>2</Volume>
      </Book>
      <ArticleTitle>Genomics in clinical practice</ArticleTitle>
      <Language>eng</Language>
      <AuthorList>
        <Author><LastName>Hopper</LastName><ForeName>Grace</ForeName></Author>
      </AuthorList>
      <PublicationType UI="D002363">Book Chapter</PublicationType>
      <Abstract><AbstractText>A chapter abstract.</AbstractText></Abstract>
      <KeywordList><Keyword>genomics</Keyword></KeywordList>
    </BookDocument>
    <PubmedBookData>
      <PublicationStatus>ppublish</PublicationStatus>
      <ArticleIdList>
        <ArticleId IdType="pmc">PMC7654321</ArticleId>
      </ArticleIdList>
    </PubmedBookData>
  </PubmedBookArticle>
</PubmedArticleSet>`;

describe("PubMed runtime", () => {
  it("normalizes a PubMed XML article without losing mixed text content", () => {
    expect(parsePubmedArticleSet(articleXml)).toEqual([
      {
        pmid: "12345678",
        title: "Testing structured biomedical records.",
        abstract: [
          { label: "BACKGROUND", text: "Why the test matters." },
          { label: "METHODS", text: "Parsed with mixed content." },
        ],
        authors: [
          {
            name: "Ada Lovelace",
            orcid: "0000-0001-2345-6789",
            affiliations: ["Analytical Engine Institute"],
          },
          {
            name: "PubMed Study Group",
            orcid: null,
            affiliations: [],
          },
        ],
        journal: {
          title: "Journal of Useful Results",
          abbreviation: "J Useful Results",
          issn: "1234-5678",
          volume: "12",
          issue: "3",
        },
        publicationDate: "2025-12-24",
        publicationTypes: ["Journal Article"],
        meshTerms: ["Information Storage and Retrieval"],
        keywords: ["literature search"],
        languages: ["eng"],
        doi: "10.1000/example",
        pmcid: "PMC1234567",
        pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
        pmcUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/",
      },
    ]);
  });

  it("decodes numeric character references in PubMed text", () => {
    const encodedXml = articleXml.replace("Why the test matters.", "Why &#x3b2; matters.");

    expect(parsePubmedArticleSet(encodedXml)[0]?.abstract[0]?.text).toBe("Why \u03b2 matters.");
  });

  it("preserves a PubMed publication season", () => {
    const seasonalXml = articleXml.replace(
      "<Year>2025</Year><Month>Dec</Month><Day>24</Day>",
      "<Year>2025</Year><Season>Winter</Season>",
    );

    expect(parsePubmedArticleSet(seasonalXml)[0]?.publicationDate).toBe("2025 Winter");
  });

  it("normalizes PubMed book articles instead of dropping them", () => {
    expect(parsePubmedArticleSet(bookArticleXml)).toEqual([
      {
        pmid: "87654321",
        title: "Genomics in clinical practice",
        abstract: [{ label: null, text: "A chapter abstract." }],
        authors: [{ name: "Grace Hopper", orcid: null, affiliations: [] }],
        journal: {
          title: "Biomedical Reference",
          abbreviation: null,
          issn: null,
          volume: "2",
          issue: null,
        },
        publicationDate: "2024-01-02",
        publicationTypes: ["Book Chapter"],
        meshTerms: [],
        keywords: ["genomics"],
        languages: ["eng"],
        doi: "10.1000/book-chapter",
        pmcid: "PMC7654321",
        pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/87654321/",
        pmcUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/",
      },
    ]);
  });

  it("searches PubMed and batch-fetches normalized articles", async () => {
    const requestedUrls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      if (url.pathname.endsWith("/esearch.fcgi")) {
        return Response.json({
          esearchresult: {
            count: "42",
            retmax: "1",
            retstart: "10",
            idlist: ["12345678"],
            querytranslation: "cancer[All Fields]",
          },
        });
      }
      return new Response(articleXml, { headers: { "content-type": "application/xml" } });
    });

    const result = await pubmedActionHandlers.search_articles(
      {
        query: "cancer",
        offset: 10,
        limit: 5,
        sort: "publication_date",
        publicationDateRange: { from: "2024-01-01", to: "2025-12-31" },
      },
      createContext(fetcher),
    );

    expect(result).toMatchObject({
      total: 42,
      offset: 10,
      limit: 5,
      queryTranslation: "cancer[All Fields]",
      articles: [{ pmid: "12345678", doi: "10.1000/example" }],
    });
    expect(requestedUrls).toHaveLength(2);
    expect(Object.fromEntries(requestedUrls[0]!.searchParams)).toMatchObject({
      db: "pubmed",
      term: "cancer",
      retmode: "json",
      retstart: "10",
      retmax: "5",
      sort: "pub date",
      datetype: "pdat",
      mindate: "2024/01/01",
      maxdate: "2025/12/31",
      tool: "openconnector",
    });
    expect(requestedUrls[0]!.searchParams.has("api_key")).toBe(false);
    expect(Object.fromEntries(requestedUrls[1]!.searchParams)).toMatchObject({
      db: "pubmed",
      id: "12345678",
      retmode: "xml",
      tool: "openconnector",
    });
  });

  it("uses POST for long PubMed search queries", async () => {
    let requestedUrl: URL | undefined;
    let requestedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestedUrl = new URL(input.toString());
      requestedInit = init;
      return Response.json({
        esearchresult: {
          count: "0",
          retmax: "0",
          retstart: "0",
          idlist: [],
          querytranslation: "",
        },
      });
    });
    const query = "cancer OR ".repeat(60);

    await pubmedActionHandlers.search_articles({ query }, createContext(fetcher));

    expect(requestedInit?.method).toBe("POST");
    expect(new Headers(requestedInit?.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(requestedUrl!.search).toBe("");
    const body = new URLSearchParams(String(requestedInit?.body));
    expect(body.get("term")).toBe(query.trim());
    expect(body.get("db")).toBe("pubmed");
    expect(body.get("tool")).toBe("openconnector");
  });

  it("rejects search pages beyond PubMed's first 10,000 results", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      pubmedActionHandlers.search_articles({ query: "cancer", offset: 9_999, limit: 2 }, createContext(fetcher)),
    ).rejects.toMatchObject({
      status: 400,
      message: "offset plus limit must not exceed 10000 for PubMed searches",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an inverted publication date range", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      pubmedActionHandlers.search_articles(
        {
          query: "cancer",
          publicationDateRange: { from: "2025-01-01", to: "2024-01-01" },
        },
        createContext(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "publicationDateRange.from must not be after publicationDateRange.to",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("gets one article with an optional NCBI API key", async () => {
    let requestedUrl: URL | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = new URL(input.toString());
      return new Response(articleXml, { headers: { "content-type": "application/xml" } });
    });

    const result = await pubmedActionHandlers.get_article(
      { pmid: "12345678" },
      createContext(fetcher, "ncbi-test-key"),
    );

    expect(result).toMatchObject({
      found: true,
      article: { pmid: "12345678", title: "Testing structured biomedical records." },
    });
    expect(Object.fromEntries(requestedUrl!.searchParams)).toMatchObject({
      db: "pubmed",
      id: "12345678",
      retmode: "xml",
      api_key: "ncbi-test-key",
      tool: "openconnector",
    });
  });

  it("reports missing PMIDs from a batch fetch", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => new Response(articleXml));

    const result = await pubmedActionHandlers.get_articles({ pmids: ["12345678", "99999999"] }, createContext(fetcher));

    expect(result).toMatchObject({
      articles: [{ pmid: "12345678" }],
      notFoundPmids: ["99999999"],
    });
  });

  it("finds related articles without returning the source PMID", async () => {
    const requestedUrls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      if (url.pathname.endsWith("/elink.fcgi")) {
        return Response.json({
          linksets: [
            {
              ids: ["11111111"],
              linksetdbs: [{ linkname: "pubmed_pubmed", links: ["11111111", "12345678"] }],
            },
          ],
        });
      }
      return new Response(articleXml);
    });

    const result = await pubmedActionHandlers.find_related_articles(
      { pmid: "11111111", limit: 5 },
      createContext(fetcher),
    );

    expect(result).toMatchObject({
      sourcePmid: "11111111",
      articles: [{ pmid: "12345678" }],
    });
    expect(Object.fromEntries(requestedUrls[0]!.searchParams)).toMatchObject({
      dbfrom: "pubmed",
      db: "pubmed",
      id: "11111111",
      linkname: "pubmed_pubmed",
      cmd: "neighbor",
      retmode: "json",
    });
    expect(requestedUrls[1]!.searchParams.get("id")).toBe("12345678");
  });

  it("matches a raw citation and returns normalized articles", async () => {
    const requestedUrls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      if (url.pathname === "/api/citmatch/") {
        return Response.json({
          version: "1.0",
          operation: "citmatch",
          success: true,
          result: {
            count: 1,
            type: "uids",
            uids: [{ pubmed: "12345678" }],
          },
        });
      }
      return new Response(articleXml);
    });

    const result = await pubmedActionHandlers.match_citation(
      { citation: "Testing structured biomedical records. J Useful Results. 2025;12(3)." },
      createContext(fetcher),
    );

    expect(result).toMatchObject({
      matched: true,
      articles: [{ pmid: "12345678", title: "Testing structured biomedical records." }],
    });
    expect(requestedUrls[0]!.origin).toBe("https://pubmed.ncbi.nlm.nih.gov");
    expect(requestedUrls[0]!.pathname).toBe("/api/citmatch/");
    expect(Object.fromEntries(requestedUrls[0]!.searchParams)).toEqual({
      method: "heuristic",
      "raw-text": "Testing structured biomedical records. J Useful Results. 2025;12(3).",
    });
    expect(requestedUrls[1]!.searchParams.get("id")).toBe("12345678");
  });

  it("gets articles that cite a source PMID", async () => {
    const requestedUrls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      if (url.pathname.endsWith("/elink.fcgi")) {
        return Response.json({
          linksets: [
            {
              ids: ["11111111"],
              linksetdbs: [{ linkname: "pubmed_pubmed_citedin", links: ["12345678"] }],
            },
          ],
        });
      }
      return new Response(articleXml);
    });

    const result = await pubmedActionHandlers.get_citing_articles(
      { pmid: "11111111", limit: 5 },
      createContext(fetcher),
    );

    expect(result).toMatchObject({
      sourcePmid: "11111111",
      articles: [{ pmid: "12345678" }],
    });
    expect(requestedUrls[0]!.searchParams.get("linkname")).toBe("pubmed_pubmed_citedin");
    expect(requestedUrls[1]!.searchParams.get("id")).toBe("12345678");
  });

  it("gets PubMed references for a source PMID", async () => {
    const requestedUrls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      if (url.pathname.endsWith("/elink.fcgi")) {
        return Response.json({
          linksets: [
            {
              ids: ["11111111"],
              linksetdbs: [{ linkname: "pubmed_pubmed_refs", links: ["12345678"] }],
            },
          ],
        });
      }
      return new Response(articleXml);
    });

    const result = await pubmedActionHandlers.get_article_references(
      { pmid: "11111111", limit: 5 },
      createContext(fetcher),
    );

    expect(result).toMatchObject({
      sourcePmid: "11111111",
      articles: [{ pmid: "12345678" }],
    });
    expect(requestedUrls[0]!.searchParams.get("linkname")).toBe("pubmed_pubmed_refs");
    expect(requestedUrls[1]!.searchParams.get("id")).toBe("12345678");
  });

  it("converts article identifiers and preserves not-found results", async () => {
    let requestedUrl: URL | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = new URL(input.toString());
      return Response.json({
        status: "ok",
        records: [
          {
            doi: "10.1000/example",
            pmcid: "PMC1234567",
            pmid: 12345678,
            "requested-id": "12345678",
          },
          {
            pmid: 99999999,
            "requested-id": "99999999",
            status: "error",
            errmsg: "Identifier not found in PMC",
          },
        ],
      });
    });

    const result = await pubmedActionHandlers.convert_article_ids(
      { ids: ["12345678", "99999999"], idType: "pmid" },
      createContext(fetcher),
    );

    expect(result).toEqual({
      records: [
        {
          requestedId: "12345678",
          pmid: "12345678",
          pmcid: "PMC1234567",
          doi: "10.1000/example",
          mid: null,
          error: null,
        },
        {
          requestedId: "99999999",
          pmid: "99999999",
          pmcid: null,
          doi: null,
          mid: null,
          error: "Identifier not found in PMC",
        },
      ],
    });
    expect(requestedUrl!.origin).toBe("https://pmc.ncbi.nlm.nih.gov");
    expect(requestedUrl!.pathname).toBe("/tools/idconv/api/v1/articles/");
    expect(Object.fromEntries(requestedUrl!.searchParams)).toEqual({
      ids: "12345678,99999999",
      idtype: "pmid",
      format: "json",
      tool: "openconnector",
    });
    expect(requestedUrl!.searchParams.has("email")).toBe(false);
  });

  it("serializes concurrent requests through a shared rate-limit gate", async () => {
    let now = 1_000;
    const delays: number[] = [];
    const gate = new PubmedRequestGate(
      () => now,
      async (delayMs) => {
        delays.push(delayMs);
        now += delayMs;
      },
    );

    await Promise.all([gate.wait(334), gate.wait(334), gate.wait(334)]);

    expect(delays).toEqual([334, 334]);
  });

  it("cancels a queued rate-limit wait before reserving a request slot", async () => {
    const controller = new AbortController();
    controller.abort();
    const gate = new PubmedRequestGate();

    await expect(gate.wait(334, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("immediately removes a cancelled wait from the rate-limit queue", async () => {
    let releaseDelay: (() => void) | undefined;
    const delay = new Promise<void>((resolve) => {
      releaseDelay = resolve;
    });
    const gate = new PubmedRequestGate(
      () => 0,
      async () => delay,
    );
    await gate.wait(334);
    const activeWait = gate.wait(334);
    const controller = new AbortController();
    const cancelledWait = gate.wait(334, controller.signal);

    controller.abort();

    await expect(cancelledWait).rejects.toMatchObject({ name: "AbortError" });
    releaseDelay?.();
    await activeWait;
  });

  it("shares rate limits by NCBI quota identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T04:00:00.000Z"));
    try {
      const pool = new PubmedRequestGatePool(2);
      await pool.forKey("key-one").wait(100);
      const sameKey = pool.forKey("key-one").wait(100);
      const secondKey = pool.forKey("key-two").wait(100);
      let sameKeySettled = false;
      void sameKey.then(() => {
        sameKeySettled = true;
      });

      await secondKey;
      expect(sameKeySettled).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      await sameKey;
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds cached quota gates when each wait begins", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T04:00:00.000Z"));
    try {
      const pool = new PubmedRequestGatePool(1);
      const firstContext = pool.forKey("secret-one");
      await pool.forKey("secret-two").wait(100);
      await firstContext.wait(100);
      const sameKeyWait = pool.forKey("secret-one").wait(100);
      let sameKeySettled = false;
      void sameKeyWait.then(() => {
        sameKeySettled = true;
      });

      expect(sameKeySettled).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      await sameKeyWait;
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a rate-limited request using Retry-After", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: "API rate limit exceeded" }, { status: 429, headers: { "retry-after": "1" } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          esearchresult: {
            count: "1",
            retmax: "1",
            retstart: "0",
            idlist: ["12345678"],
            querytranslation: "test",
          },
        }),
      )
      .mockResolvedValueOnce(new Response(articleXml));
    const context = createContext(fetcher);
    context.sleep = sleep;

    const result = await pubmedActionHandlers.search_articles({ query: "test", limit: 1 }, context);

    expect(result).toMatchObject({ articles: [{ pmid: "12345678" }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1_000, undefined);
  });

  it("honors an HTTP-date Retry-After value", async () => {
    const now = Date.parse("2026-07-11T04:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const sleep = vi.fn(async () => undefined);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(
            { error: "API rate limit exceeded" },
            { status: 429, headers: { "retry-after": "Sat, 11 Jul 2026 04:00:05 GMT" } },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({
            esearchresult: {
              count: "0",
              retmax: "0",
              retstart: "0",
              idlist: [],
              querytranslation: "test",
            },
          }),
        );
      const context = createContext(fetcher);
      context.sleep = sleep;

      await pubmedActionHandlers.search_articles({ query: "test" }, context);

      expect(sleep).toHaveBeenCalledWith(5_000, undefined);
    } finally {
      dateNow.mockRestore();
    }
  });

  it("stops retrying when the request is aborted during backoff", async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: "API rate limit exceeded" }, { status: 429, headers: { "retry-after": "1" } }),
      );
    const context = {
      ...createContext(fetcher),
      signal: controller.signal,
      sleep: async (_delayMs: number, signal?: AbortSignal) => {
        controller.abort();
        if (!signal?.aborted) {
          throw new Error("backoff did not receive the request signal");
        }
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      },
    };

    await expect(pubmedActionHandlers.search_articles({ query: "test" }, context)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("times out an NCBI request that does not complete", async () => {
    vi.useFakeTimers();
    try {
      let requestedSignal: AbortSignal | undefined;
      const fetcher = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
          new Promise((_resolve, reject) => {
            requestedSignal = init?.signal ?? undefined;
            requestedSignal?.addEventListener(
              "abort",
              () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
              },
              { once: true },
            );
          }),
      );

      const request = pubmedActionHandlers.search_articles({ query: "test" }, createContext(fetcher));
      const outcome = request.then(
        () => undefined,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(requestedSignal).toBeInstanceOf(AbortSignal);
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(outcome).resolves.toMatchObject({
        status: 504,
        message: "PubMed request timed out",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves caller cancellation when it races with the request timeout", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetcher = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                setTimeout(() => {
                  const error = new Error("caller aborted");
                  error.name = "AbortError";
                  reject(error);
                }, 2);
              },
              { once: true },
            );
          }),
      );
      const context = { ...createContext(fetcher), signal: controller.signal };

      const request = pubmedActionHandlers.search_articles({ query: "test" }, context);
      const outcome = request.then(
        () => undefined,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(0);
      setTimeout(() => controller.abort(), 29_999);

      await vi.advanceTimersByTimeAsync(30_001);
      await expect(outcome).resolves.toMatchObject({
        name: "AbortError",
        message: "caller aborted",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates an NCBI API key with the PubMed EInfo endpoint", async () => {
    let requestedUrl: URL | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = new URL(input.toString());
      return Response.json({
        einforesult: {
          dbinfo: [{ dbname: "pubmed", menuname: "PubMed" }],
        },
      });
    });

    const result = await validatePubmedCredential({ apiKey: "ncbi-test-key" }, fetcher);

    expect(result).toEqual({});
    expect(requestedUrl!.pathname).toMatch(/\/einfo\.fcgi$/u);
    expect(requestedUrl!.searchParams.get("api_key")).toBe("ncbi-test-key");
  });
});

function createContext(fetcher: typeof fetch, apiKey?: string) {
  return {
    apiKey,
    fetcher,
    requestGate: { wait: async () => undefined },
    sleep: async () => undefined,
  };
}
