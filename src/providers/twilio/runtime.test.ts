import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { twilioActionHandlers } from "./runtime.ts";

const context = {
  accountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  authToken: "auth-token",
};

describe("Twilio call actions", () => {
  it("lists calls with the documented query parameter names", async () => {
    let requestUrl = "";
    const fetcher: ProviderFetch = async (url) => {
      requestUrl = String(url);
      return new Response(
        JSON.stringify({
          calls: [
            {
              sid: "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              account_sid: context.accountSid,
              status: "completed",
              direction: "outbound-api",
              to: "+14155551212",
              from: "+14155550100",
              duration: "4",
              price: "-0.200",
              price_unit: "USD",
            },
          ],
          page: 0,
          page_size: 1,
          next_page_uri: "/2010-04-01/Accounts/AC/Calls.json?PageToken=next",
          previous_page_uri: null,
        }),
      );
    };

    await expect(
      twilioActionHandlers.list_calls(
        {
          to: "+14155551212",
          status: "completed",
          startTime: "2026-01-01",
          pageSize: 1,
          pageToken: "previous",
        },
        { ...context, fetcher },
      ),
    ).resolves.toMatchObject({
      calls: [
        {
          callSid: "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          status: "completed",
          to: "+14155551212",
          price: "-0.200",
        },
      ],
      page: 0,
      pageSize: 1,
      nextPageUri: "/2010-04-01/Accounts/AC/Calls.json?PageToken=next",
      previousPageUri: null,
    });

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json");
    expect(url.searchParams.get("To")).toBe("+14155551212");
    expect(url.searchParams.get("Status")).toBe("completed");
    expect(url.searchParams.get("StartTime")).toBe("2026-01-01");
    expect(url.searchParams.get("PageSize")).toBe("1");
    expect(url.searchParams.get("PageToken")).toBe("previous");
  });

  it("creates a call with inline TwiML and repeated callback events", async () => {
    let requestBody = "";
    const fetcher: ProviderFetch = async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ sid: "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
    };

    await twilioActionHandlers.create_call(
      {
        to: "+14155551212",
        from: "+14155550100",
        twiml: "<Response><Say>Hello</Say></Response>",
        statusCallback: "https://example.com/twilio/status",
        statusCallbackEvent: ["initiated", "completed"],
      },
      { ...context, fetcher },
    );

    const body = new URLSearchParams(requestBody);
    expect(body.get("To")).toBe("+14155551212");
    expect(body.get("From")).toBe("+14155550100");
    expect(body.get("Twiml")).toBe("<Response><Say>Hello</Say></Response>");
    expect(body.get("StatusCallback")).toBe("https://example.com/twilio/status");
    expect(body.getAll("StatusCallbackEvent")).toEqual(["initiated", "completed"]);
    expect(body.get("Url")).toBeNull();
  });

  it("rejects a call request that omits both TwiML sources", async () => {
    const fetcher: ProviderFetch = async () => {
      throw new Error("the invalid request must not be fetched");
    };

    await expect(
      twilioActionHandlers.create_call({ to: "+14155551212", from: "+14155550100" }, { ...context, fetcher }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
