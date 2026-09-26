import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { googleChatActions } from "./actions.ts";
import { googleChatActionHandlers } from "./executors.ts";
import {
  googleChatMembershipsReadonlyScope,
  googleChatMessagesCreateScope,
  googleChatOAuthScopes,
  googleChatServiceAccountScopes,
  googleDirectoryReadonlyScope,
} from "./scopes.ts";

const accessToken = "test-token";
const selfId = "111";
const peerId = "222";

interface Membership {
  member: { name: string; type: string };
  role?: string;
}

/** A directory entry, or a per-person failure carrying a google.rpc.Code. */
type FakePerson = { names: string[]; emails: string[] } | { rpcCode: number };

interface FakeGoogleOptions {
  space?: Record<string, unknown>;
  memberPages?: Membership[][];
  membersStatus?: number;
  selfStatus?: number;
  batchStatus?: number;
  people?: Record<string, FakePerson>;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function googleError(status: number): Response {
  return json({ error: { code: status, message: `status ${status}` } }, status);
}

function human(id: string, role = "ROLE_MEMBER"): Membership {
  return { member: { name: `users/${id}`, type: "HUMAN" }, role };
}

function bot(id: string): Membership {
  return { member: { name: `users/${id}`, type: "BOT" }, role: "ROLE_MEMBER" };
}

function person(names: string[], emails: string[] = []): FakePerson {
  return { names, emails };
}

function personResponse(resourceName: string, entry: FakePerson | undefined): Record<string, unknown> {
  if (!entry) {
    return { requestedResourceName: resourceName, status: { code: 5, message: "not found" } };
  }
  if ("rpcCode" in entry) {
    return { requestedResourceName: resourceName, status: { code: entry.rpcCode, message: "failed" } };
  }
  return {
    requestedResourceName: resourceName,
    status: {},
    person: {
      resourceName,
      names: entry.names.map((displayName, index) => ({ displayName, metadata: { primary: index === 0 } })),
      emailAddresses: entry.emails.map((value, index) => ({ value, metadata: { primary: index === 0 } })),
    },
  };
}

/** A fake of the Chat and People endpoints the member resolver talks to, recording every request. */
function fakeGoogle(options: FakeGoogleOptions = {}) {
  const requests: URL[] = [];
  const pages = options.memberPages ?? [[human(selfId), human(peerId)]];
  const fetcher: ProviderFetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.hostname === "chat.googleapis.com" && url.pathname === "/v1/spaces/D") {
      return json(options.space ?? { name: "spaces/D", spaceType: "DIRECT_MESSAGE" });
    }
    if (url.hostname === "chat.googleapis.com" && url.pathname === "/v1/spaces:findDirectMessage") {
      return json(options.space ?? { name: "spaces/D", spaceType: "DIRECT_MESSAGE" });
    }
    if (url.hostname === "chat.googleapis.com" && url.pathname === "/v1/spaces/D/members") {
      if (options.membersStatus) {
        return googleError(options.membersStatus);
      }
      const index = Number(url.searchParams.get("pageToken") ?? "0");
      const nextPageToken = index + 1 < pages.length ? String(index + 1) : undefined;
      return json({ memberships: pages[index], nextPageToken });
    }
    if (url.hostname === "people.googleapis.com" && url.pathname === "/v1/people/me") {
      return options.selfStatus ? googleError(options.selfStatus) : json({ resourceName: `people/${selfId}` });
    }
    if (url.hostname === "people.googleapis.com" && url.pathname === "/v1/people:batchGet") {
      if (options.batchStatus) {
        return googleError(options.batchStatus);
      }
      const responses = url.searchParams
        .getAll("resourceNames")
        .map((name) => personResponse(name, options.people?.[name.replace("people/", "")]));
      return json({ responses });
    }
    throw new Error(`unexpected request ${url.toString()}`);
  };

  return { requests, fetcher };
}

function batchLookups(requests: URL[]): URL[] {
  return requests.filter((url) => url.pathname === "/v1/people:batchGet");
}

describe("Google Chat get_direct_message_peer", () => {
  it("resolves the other human member to a directory name and email", async () => {
    const { requests, fetcher } = fakeGoogle({ people: { [peerId]: person(["山田花子"], ["hanako@example.com"]) } });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toEqual({
      space: "spaces/D",
      peer: { kind: "HUMAN", user: `users/${peerId}`, displayName: "山田花子", email: "hanako@example.com" },
    });
    const [lookup] = batchLookups(requests);
    expect(lookup.searchParams.getAll("resourceNames")).toEqual([`people/${peerId}`]);
    expect(lookup.searchParams.get("personFields")).toBe("names,emailAddresses");
    expect(lookup.searchParams.getAll("sources")).toEqual(["READ_SOURCE_TYPE_PROFILE"]);
  });

  it("prefers the primary name and email over earlier non-primary entries", async () => {
    const base = fakeGoogle();
    const fetcher: ProviderFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/people:batchGet") {
        return json({
          responses: [
            {
              requestedResourceName: `people/${peerId}`,
              person: {
                names: [
                  { displayName: "Nickname", metadata: { primary: false } },
                  { displayName: "Real Name", metadata: { primary: true } },
                ],
                emailAddresses: [
                  { value: "alias@example.com", metadata: { primary: false } },
                  { value: "real@example.com", metadata: { primary: true } },
                ],
              },
            },
          ],
        });
      }
      return base.fetcher(input, init);
    };

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({ peer: { displayName: "Real Name", email: "real@example.com" } });
  });

  it("finds the self member on a later page before choosing the peer", async () => {
    const { requests, fetcher } = fakeGoogle({
      memberPages: [[human(peerId)], [human(selfId)]],
      people: { [peerId]: person(["Peer"]) },
    });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({ peer: { kind: "HUMAN", user: `users/${peerId}` } });
    const memberRequests = requests.filter((url) => url.pathname === "/v1/spaces/D/members");
    expect(memberRequests.map((url) => url.searchParams.get("pageToken"))).toEqual([null, "1"]);
  });

  it("finds the peer on a later page", async () => {
    const { fetcher } = fakeGoogle({
      memberPages: [[human(selfId)], [human(peerId)]],
      people: { [peerId]: person(["Peer"]) },
    });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({ peer: { kind: "HUMAN", user: `users/${peerId}`, displayName: "Peer" } });
  });

  it("classifies a direct message with an app as a bot peer without a People lookup", async () => {
    const { requests, fetcher } = fakeGoogle({ memberPages: [[human(selfId), bot("B1")]] });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toEqual({
      space: "spaces/D",
      peer: { kind: "BOT", user: "users/B1", displayName: null, email: null },
    });
    expect(batchLookups(requests)).toHaveLength(0);
  });

  it("classifies a direct message with only the authenticated user as self", async () => {
    const { requests, fetcher } = fakeGoogle({ memberPages: [[human(selfId)]] });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toEqual({
      space: "spaces/D",
      peer: { kind: "SELF", user: `users/${selfId}`, displayName: null, email: null },
    });
    expect(batchLookups(requests)).toHaveLength(0);
  });

  it("reports more than one other human as ambiguous instead of picking one", async () => {
    const { requests, fetcher } = fakeGoogle({ memberPages: [[human(selfId), human(peerId), human("333")]] });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toEqual({
      space: "spaces/D",
      peer: {
        kind: "AMBIGUOUS",
        user: null,
        displayName: null,
        email: null,
        candidates: [`users/${peerId}`, "users/333"],
      },
    });
    expect(batchLookups(requests)).toHaveLength(0);
  });

  it("rejects a space that is not a direct message without listing its members", async () => {
    const { requests, fetcher } = fakeGoogle({ space: { name: "spaces/D", spaceType: "SPACE" } });

    await expect(
      googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("not a direct message") });
    expect(requests.some((url) => url.pathname.endsWith("/members"))).toBe(false);
  });

  it("rejects an invalid space name before any request", async () => {
    const { requests, fetcher } = fakeGoogle();

    await expect(
      googleChatActionHandlers.get_direct_message_peer({ space: ".." }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 400 });
    expect(requests).toHaveLength(0);
  });

  it.each([
    ["people_forbidden", 403],
    ["people_not_found", 404],
    ["people_request_failed", 429],
    ["people_request_failed", 503],
  ])("keeps the peer id and reports %s when the People lookup answers %i", async (reason, status) => {
    const { fetcher } = fakeGoogle({ batchStatus: status });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toEqual({
      space: "spaces/D",
      peer: {
        kind: "HUMAN",
        user: `users/${peerId}`,
        displayName: null,
        email: null,
        profileUnavailableReason: reason,
      },
    });
  });

  it("reports profile_name_missing when the directory hides the name but keeps what it did return", async () => {
    const { fetcher } = fakeGoogle({ people: { [peerId]: person([], ["peer@example.com"]) } });

    const result = await googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({
      peer: {
        kind: "HUMAN",
        displayName: null,
        email: "peer@example.com",
        profileUnavailableReason: "profile_name_missing",
      },
    });
  });

  it("fails loudly when the authenticated user's own id cannot be read", async () => {
    const { fetcher } = fakeGoogle({ selfStatus: 403 });

    await expect(
      googleChatActionHandlers.get_direct_message_peer({ space: "D" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("could not read the authenticated user's own id"),
    });
  });
});

describe("Google Chat find_direct_message peer", () => {
  it("attaches the resolved peer to the found space without fetching the space again", async () => {
    const { requests, fetcher } = fakeGoogle({ people: { [peerId]: person(["Peer"], ["peer@example.com"]) } });

    const result = await googleChatActionHandlers.find_direct_message(
      { user: "peer@example.com" },
      { accessToken, fetcher },
    );

    expect(result).toMatchObject({
      name: "spaces/D",
      spaceType: "DIRECT_MESSAGE",
      peer: { kind: "HUMAN", user: `users/${peerId}`, displayName: "Peer", email: "peer@example.com" },
    });
    expect(result).not.toHaveProperty("peerError");
    expect(requests.some((url) => url.pathname === "/v1/spaces/D")).toBe(false);
  });

  it("still returns the space with an explicit peerError when the peer cannot be resolved", async () => {
    const { fetcher } = fakeGoogle({ membersStatus: 403 });

    const result = await googleChatActionHandlers.find_direct_message(
      { user: "peer@example.com" },
      { accessToken, fetcher },
    );

    expect(result).toMatchObject({
      name: "spaces/D",
      peer: null,
      peerError: { status: 403 },
    });
  });
});

describe("Google Chat list_space_members", () => {
  const groupPage = [human(selfId, "ROLE_MANAGER"), human(peerId), human("333"), bot("B1")];

  it("names every human member with one batched directory lookup and marks the caller", async () => {
    const { requests, fetcher } = fakeGoogle({
      memberPages: [groupPage],
      people: {
        [selfId]: person(["Self"], ["self@example.com"]),
        [peerId]: person(["山田花子"], ["hanako@example.com"]),
        "333": person(["佐藤太郎"], ["taro@example.com"]),
      },
    });

    const result = await googleChatActionHandlers.list_space_members({ space: "D" }, { accessToken, fetcher });

    expect(result).toEqual({
      space: "spaces/D",
      members: [
        {
          user: `users/${selfId}`,
          kind: "HUMAN",
          role: "ROLE_MANAGER",
          isSelf: true,
          displayName: "Self",
          email: "self@example.com",
        },
        {
          user: `users/${peerId}`,
          kind: "HUMAN",
          role: "ROLE_MEMBER",
          isSelf: false,
          displayName: "山田花子",
          email: "hanako@example.com",
        },
        {
          user: "users/333",
          kind: "HUMAN",
          role: "ROLE_MEMBER",
          isSelf: false,
          displayName: "佐藤太郎",
          email: "taro@example.com",
        },
        { user: "users/B1", kind: "BOT", role: "ROLE_MEMBER", isSelf: false, displayName: null, email: null },
      ],
      nextPageToken: null,
    });
    const lookups = batchLookups(requests);
    expect(lookups).toHaveLength(1);
    expect(lookups[0].searchParams.getAll("resourceNames")).toEqual([
      `people/${selfId}`,
      `people/${peerId}`,
      "people/333",
    ]);
  });

  it("works for any space type without fetching the space", async () => {
    const { requests, fetcher } = fakeGoogle({
      memberPages: [[human(selfId)]],
      people: { [selfId]: person(["Self"]) },
    });

    await googleChatActionHandlers.list_space_members({ space: "D" }, { accessToken, fetcher });

    // Listing members makes no claim about who "the" peer is, so the space type
    // does not matter and is not fetched.
    expect(requests.some((url) => url.pathname === "/v1/spaces/D")).toBe(false);
  });

  it("returns one page at a time and forwards the page token", async () => {
    const { requests, fetcher } = fakeGoogle({
      memberPages: [[human(selfId)], [human(peerId)]],
      people: { [selfId]: person(["Self"]), [peerId]: person(["Peer"]) },
    });

    const first = await googleChatActionHandlers.list_space_members(
      { space: "D", pageSize: 1 },
      { accessToken, fetcher },
    );
    const second = await googleChatActionHandlers.list_space_members(
      { space: "D", pageSize: 1, pageToken: "1" },
      { accessToken, fetcher },
    );

    expect(first).toMatchObject({ members: [{ user: `users/${selfId}` }], nextPageToken: "1" });
    expect(second).toMatchObject({ members: [{ user: `users/${peerId}` }], nextPageToken: null });
    const memberRequests = requests.filter((url) => url.pathname === "/v1/spaces/D/members");
    expect(memberRequests.map((url) => url.searchParams.get("pageSize"))).toEqual(["1", "1"]);
    expect(memberRequests.map((url) => url.searchParams.get("pageToken"))).toEqual([null, "1"]);
  });

  it.each([0, 201, 1.5])("rejects a pageSize of %s, which one batched lookup cannot cover", async (pageSize) => {
    const { requests, fetcher } = fakeGoogle();

    await expect(
      googleChatActionHandlers.list_space_members({ space: "D", pageSize }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 400 });
    expect(requests).toHaveLength(0);
  });

  it.each([
    ["people_not_found", 5],
    ["people_forbidden", 7],
    ["people_request_failed", 13],
  ])("reports %s for a member whose own lookup fails with rpc code %i", async (reason, rpcCode) => {
    const { fetcher } = fakeGoogle({
      memberPages: [[human(selfId), human(peerId)]],
      people: { [selfId]: person(["Self"]), [peerId]: { rpcCode } },
    });

    const result = await googleChatActionHandlers.list_space_members({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({
      members: [
        { user: `users/${selfId}`, displayName: "Self" },
        { user: `users/${peerId}`, displayName: null, email: null, profileUnavailableReason: reason },
      ],
    });
  });

  it("treats a member missing from the batch response as a failed request, not a missing person", async () => {
    const base = fakeGoogle({ memberPages: [[human(selfId), human(peerId)]] });
    const fetcher: ProviderFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/people:batchGet") {
        return json({ responses: [personResponse(`people/${selfId}`, person(["Self"]))] });
      }
      return base.fetcher(input, init);
    };

    const result = await googleChatActionHandlers.list_space_members({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({
      members: [
        { user: `users/${selfId}`, displayName: "Self" },
        { user: `users/${peerId}`, displayName: null, profileUnavailableReason: "people_request_failed" },
      ],
    });
  });

  it("marks every human unnamed with the batch failure reason when the whole lookup fails", async () => {
    const { fetcher } = fakeGoogle({ memberPages: [[human(selfId), human(peerId), bot("B1")]], batchStatus: 403 });

    const result = await googleChatActionHandlers.list_space_members({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({
      members: [
        { user: `users/${selfId}`, profileUnavailableReason: "people_forbidden" },
        { user: `users/${peerId}`, profileUnavailableReason: "people_forbidden" },
        { user: "users/B1", kind: "BOT" },
      ],
    });
  });

  it("skips the directory lookup when a page has no human members", async () => {
    const { requests, fetcher } = fakeGoogle({ memberPages: [[bot("B1")]] });

    const result = await googleChatActionHandlers.list_space_members({ space: "D" }, { accessToken, fetcher });

    expect(result).toMatchObject({ members: [{ user: "users/B1", kind: "BOT" }] });
    expect(batchLookups(requests)).toHaveLength(0);
  });

  it("fails loudly when the authenticated user's own id cannot be read", async () => {
    const { fetcher } = fakeGoogle({ selfStatus: 403 });

    await expect(
      googleChatActionHandlers.list_space_members({ space: "D" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("Google Chat member lookup scopes", () => {
  it("requests the membership and directory scopes through OAuth", () => {
    expect(googleChatOAuthScopes).toEqual(
      expect.arrayContaining([googleChatMembershipsReadonlyScope, googleDirectoryReadonlyScope]),
    );
  });

  it("keeps service account tokens on the scopes existing delegations already grant", () => {
    // Minting a service account token with a scope the domain-wide delegation does
    // not cover fails the whole token request, so adding these would break every
    // existing Chat action for delegated connections.
    expect(googleChatServiceAccountScopes).not.toContain(googleChatMessagesCreateScope);
    expect(googleChatServiceAccountScopes).not.toContain(googleChatMembershipsReadonlyScope);
    expect(googleChatServiceAccountScopes).not.toContain(googleDirectoryReadonlyScope);
  });

  it.each(["get_direct_message_peer", "list_space_members"])(
    "declares every scope %s needs as a read action",
    (name) => {
      const action = googleChatActions.find((candidate) => candidate.name === name);

      expect(action?.operationType).toBe("read");
      expect(action?.requiredScopes).toEqual(
        expect.arrayContaining([googleChatMembershipsReadonlyScope, googleDirectoryReadonlyScope]),
      );
    },
  );
});
