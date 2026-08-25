import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

const expectedOAuthScopes = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendars",
  "https://www.googleapis.com/auth/calendar.calendarlist",
  "https://www.googleapis.com/auth/calendar.settings.readonly",
  "https://www.googleapis.com/auth/calendar.acls",
  "https://www.googleapis.com/auth/calendar.acls.readonly",
];

describe("Google Calendar provider definition", () => {
  it("does not request the redundant full-calendar scope alongside narrower scopes", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).toEqual(expectedOAuthScopes);
  });
});
