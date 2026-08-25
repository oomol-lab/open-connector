import { describe, expect, it } from "vitest";
import { validateWordpressCredential, validateWordpressOAuthCredential } from "./runtime.ts";

describe("WordPress credentials", () => {
  it("uses the WordPress.com site API selected by the OAuth token response", async () => {
    const result = await validateWordpressOAuthCredential(
      {
        authType: "oauth2",
        accessToken: "wordpress-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {
          blog_id: 12345,
          blog_url: "https://example.wordpress.com",
          scope: "posts taxonomy,comments",
        },
      },
      async (url, init) => {
        expect(url.toString()).toBe("https://public-api.wordpress.com/wp/v2/sites/12345/users/me?context=edit");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer wordpress-oauth-token");
        return Response.json({ id: 42, name: "Alice", slug: "alice" });
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "wordpress:blog:12345:user:42", displayName: "Alice" },
      grantedScopes: ["posts", "taxonomy", "comments"],
      metadata: {
        siteUrl: "https://example.wordpress.com/",
        apiBaseUrl: "https://public-api.wordpress.com/wp/v2/sites/12345",
        userId: 42,
      },
    });
  });

  it("keeps application-password credentials on the site's own REST API", async () => {
    const result = await validateWordpressCredential(
      {
        apiKey: "application-password",
        values: { siteUrl: "https://example.com", username: "editor" },
      },
      async (url, init) => {
        expect(url.toString()).toBe("https://example.com/wp-json/wp/v2/users/me?context=edit");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Basic ${Buffer.from("editor:application-password").toString("base64")}`,
        );
        return Response.json({ id: 7, name: "Editor", slug: "editor" });
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "wordpress:example.com:user:7", displayName: "Editor" },
      metadata: { apiBaseUrl: "https://example.com/wp-json/wp/v2", username: "editor" },
    });
  });
});
