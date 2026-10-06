import type { GoogleAdsActionName } from "./actions.ts";

import { describe, expect, it } from "vitest";
import { googleAdsActionHandlers } from "./executors.ts";

describe("Google Ads v25 campaign dates", () => {
  it.each<GoogleAdsActionName>(["get_campaign_by_id", "get_campaign_by_name"])(
    "%s queries date-time fields and preserves date-only output",
    async (actionName) => {
      const result = await googleAdsActionHandlers[actionName]!(
        { customerId: "123", developerToken: "developer-token", campaignId: "456", name: "Campaign" },
        {
          accessToken: "access-token",
          fetcher: async (url, init) => {
            expect(url.toString()).toBe("https://googleads.googleapis.com/v25/customers/123/googleAds:search");
            const body = JSON.parse(String(init?.body));
            expect(body.query).toContain("campaign.start_date_time,");
            expect(body.query).toContain("campaign.end_date_time FROM");
            expect(body.query).not.toMatch(/campaign\.(start_date|end_date)\b/);
            return Response.json({
              results: [
                {
                  campaign: {
                    resourceName: "customers/123/campaigns/456",
                    id: "456",
                    name: "Campaign",
                    startDateTime: "2026-10-08 00:00:00",
                    endDateTime: "2026-10-31 23:59:59",
                  },
                },
              ],
            });
          },
        },
      );
      const campaign = {
        resourceName: "customers/123/campaigns/456",
        id: "456",
        name: "Campaign",
        startDate: "2026-10-08",
        endDate: "2026-10-31",
      };
      expect(result).toEqual(actionName === "get_campaign_by_id" ? { campaign } : { campaigns: [campaign] });
    },
  );

  it("converts create and update dates and updates masks without adding absent dates", async () => {
    await googleAdsActionHandlers.mutate_campaigns!(
      {
        customerId: "123",
        developerToken: "developer-token",
        operations: [
          {
            operationType: "create",
            create: {
              name: "Campaign",
              campaignBudget: "customers/123/campaignBudgets/789",
              advertisingChannelType: "SEARCH",
              startDate: "2026-10-08",
              endDate: "2026-10-31",
            },
          },
          {
            operationType: "update",
            update: {
              resourceName: "customers/123/campaigns/456",
              startDate: "2026-10-09",
              endDate: "2026-11-01",
            },
          },
          {
            operationType: "update",
            update: { resourceName: "customers/123/campaigns/456", name: "Renamed" },
          },
        ],
      },
      {
        accessToken: "access-token",
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://googleads.googleapis.com/v25/customers/123/campaigns:mutate");
          expect(JSON.parse(String(init?.body)).operations).toEqual([
            {
              create: {
                name: "Campaign",
                campaignBudget: "customers/123/campaignBudgets/789",
                advertisingChannelType: "SEARCH",
                startDateTime: "2026-10-08 00:00:00",
                endDateTime: "2026-10-31 23:59:59",
              },
            },
            {
              update: {
                resourceName: "customers/123/campaigns/456",
                startDateTime: "2026-10-09 00:00:00",
                endDateTime: "2026-11-01 23:59:59",
              },
              updateMask: "startDateTime,endDateTime",
            },
            {
              update: { resourceName: "customers/123/campaigns/456", name: "Renamed" },
              updateMask: "name",
            },
          ]);
          return Response.json({ results: [] });
        },
      },
    );
  });
});
