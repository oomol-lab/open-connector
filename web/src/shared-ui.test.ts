import type { ProviderDefinition } from "./model";

import { describe, expect, it } from "vitest";
import { resolveProviderIconClass } from "./shared-ui";

function provider(options: { service: string; displayName: string; homepageUrl?: string }): ProviderDefinition {
  return {
    service: options.service,
    displayName: options.displayName,
    categories: [],
    authTypes: [],
    auth: [],
    homepageUrl: options.homepageUrl,
    actions: [],
  };
}

describe("resolveProviderIconClass", () => {
  it("uses product-specific logo classes for mapped Google providers", () => {
    const mappedProviders = [
      {
        service: "google_analytics",
        displayName: "Google Analytics",
        homepageUrl: "https://analytics.google.com",
        expected: "i-logos-google-analytics",
      },
      {
        service: "gmail",
        displayName: "Gmail",
        homepageUrl: "https://mail.google.com",
        expected: "i-logos-google-gmail",
      },
      {
        service: "googlephotos",
        displayName: "Google Photos",
        homepageUrl: "https://www.google.com/photos/about/",
        expected: "i-logos-google-photos",
      },
      {
        service: "google_search_console",
        displayName: "Google Search Console",
        homepageUrl: "https://search.google.com/search-console",
        expected: "i-logos-google-search-console",
      },
      {
        service: "google_cloud_sts",
        displayName: "Google Cloud STS",
        homepageUrl: "https://cloud.google.com/iam/docs/workload-identity-federation",
        expected: "i-logos-google-cloud",
      },
      {
        service: "googledrive",
        displayName: "Google Drive",
        homepageUrl: "https://workspace.google.com/products/drive/",
        expected: "i-logos-google-drive",
      },
      {
        service: "googlecalendar",
        displayName: "Google Calendar",
        homepageUrl: "https://workspace.google.com/products/calendar/",
        expected: "i-logos-google-calendar",
      },
      {
        service: "google_address_validation",
        displayName: "Google Address Validation",
        homepageUrl: "https://developers.google.com/maps/documentation/address-validation",
        expected: "i-logos-google-maps",
      },
      {
        service: "google_routes",
        displayName: "Google Routes",
        homepageUrl: "https://developers.google.com/maps/documentation/routes",
        expected: "i-logos-google-maps",
      },
    ];

    for (const mappedProvider of mappedProviders) {
      expect(resolveProviderIconClass(provider(mappedProvider))).toBe(mappedProvider.expected);
    }
  });

  it("uses the default Google logo class for unmapped Google providers", () => {
    expect(
      resolveProviderIconClass(
        provider({
          service: "google_bigquery",
          displayName: "Google BigQuery",
          homepageUrl: "https://cloud.google.com/bigquery",
        }),
      ),
    ).toBe("i-logos-google-icon");
  });
});
