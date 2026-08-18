import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { createVonageContext, vonageActionHandlers } from "./runtime.ts";

describe("Vonage SMS report actions", () => {
  it("lists SMS records through the Reports API with cursor pagination", async () => {
    let requestUrl = "";
    let authorization = "";
    const fetcher: ProviderFetch = async (url, init) => {
      requestUrl = String(url);
      authorization = String(new Headers(init?.headers).get("authorization"));
      return new Response(
        JSON.stringify({
          request_id: "request-1",
          request_status: "SUCCESS",
          items_count: 1,
          cursor: "cursor-2",
          iv: "iv-2",
          records: [
            {
              id: "record-1",
              message_id: "message-1",
              account_id: "api-key",
              direction: "outbound",
              from: "Vonage",
              to: "447700900000",
              status: "delivered",
              date_received: "2026-01-01T00:00:00Z",
              date_finalized: "2026-01-01T00:00:01Z",
              total_price: "0.0333",
              currency: "EUR",
              message_body: "Hello",
              error_code: "0",
              error_code_description: "Delivered",
            },
          ],
        }),
      );
    };
    const context = createVonageContext({ apiKey: "api-key", apiSecret: "api-secret" }, fetcher);

    await expect(
      vonageActionHandlers.list_sms_records(
        {
          direction: "outbound",
          dateStart: "2026-01-01T00:00:00Z",
          dateEnd: "2026-01-02T00:00:00Z",
          includeMessage: true,
          showConcatenated: true,
        },
        context,
      ),
    ).resolves.toMatchObject({
      requestId: "request-1",
      requestStatus: "SUCCESS",
      itemsCount: 1,
      nextCursor: "cursor-2",
      iv: "iv-2",
      records: [
        {
          recordId: "record-1",
          messageId: "message-1",
          status: "delivered",
          messageBody: "Hello",
        },
      ],
    });

    const url = new URL(requestUrl);
    expect(url.origin).toBe("https://api.nexmo.com");
    expect(url.pathname).toBe("/v2/reports/records");
    expect(url.searchParams.get("product")).toBe("SMS");
    expect(url.searchParams.get("account_id")).toBe("api-key");
    expect(url.searchParams.get("direction")).toBe("outbound");
    expect(url.searchParams.get("date_start")).toBe("2026-01-01T00:00:00Z");
    expect(url.searchParams.get("include_message")).toBe("true");
    expect(url.searchParams.get("show_concatenated")).toBe("true");
    expect(authorization).toMatch(/^Basic /);
  });

  it("retrieves a single SMS record by message ID", async () => {
    let requestUrl = "";
    const fetcher: ProviderFetch = async (url) => {
      requestUrl = String(url);
      return new Response(JSON.stringify({ records: [], ids_not_found: "message-404" }));
    };
    const context = createVonageContext({ apiKey: "api-key", apiSecret: "api-secret" }, fetcher);

    await expect(
      vonageActionHandlers.get_sms_record({ messageId: "message-404", direction: "inbound" }, context),
    ).resolves.toMatchObject({ records: [], idsNotFound: "message-404" });

    const url = new URL(requestUrl);
    expect(url.searchParams.get("product")).toBe("SMS");
    expect(url.searchParams.get("id")).toBe("message-404");
    expect(url.searchParams.get("direction")).toBe("inbound");
  });
});
