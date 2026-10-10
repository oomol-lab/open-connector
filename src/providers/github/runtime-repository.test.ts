import type { GitHubActionContext } from "./runtime-shared.ts";

import { describe, expect, it, vi } from "vitest";
import { repositoryActionHandlers } from "./runtime-repository.ts";

describe("GitHub repository actions", () => {
  it("returns the verified installation account as the current identity", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(repositoryActionHandlers.get_current_user?.({}, installationContext(fetcher))).resolves.toEqual({
      id: 42,
      login: "amplifthq",
      avatar_url: "https://avatars.githubusercontent.com/u/42?v=4",
      html_url: "https://github.com/amplifthq",
      type: "Organization",
      name: null,
      email: null,
      bio: null,
      company: null,
      location: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lists only repositories granted to the GitHub App installation", async () => {
    const repository = {
      id: 7,
      name: "wakeloop",
      full_name: "amplifthq/wakeloop",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        total_count: 1,
        repositories: [repository],
      }),
    );

    await expect(
      repositoryActionHandlers.list_my_repositories?.({ page: 2, perPage: 25 }, installationContext(fetcher)),
    ).resolves.toEqual({ repositories: [repository] });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/installation/repositories?per_page=25&page=2",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer ghs_installation_token",
        }),
      }),
    );
  });

  it("fails explicitly when user-only repository filters are used with an installation", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      repositoryActionHandlers.list_my_repositories?.({ visibility: "private" }, installationContext(fetcher)),
    ).rejects.toThrow("GitHub App installation repository listing does not support visibility, sort, or direction");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function installationContext(fetcher: typeof fetch): GitHubActionContext {
  return {
    accessToken: "ghs_installation_token",
    fetcher,
    installation: {
      accountAvatarUrl: "https://avatars.githubusercontent.com/u/42?v=4",
      accountHtmlUrl: "https://github.com/amplifthq",
      accountId: "42",
      accountLogin: "amplifthq",
      accountType: "Organization",
      installationId: "987",
      permissions: {
        contents: "write",
        metadata: "read",
      },
      repositorySelection: "selected",
    },
  };
}
