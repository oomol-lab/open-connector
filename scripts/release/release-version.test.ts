import { describe, expect, it } from "vitest";
import {
  bumpVersion,
  computeReleaseVersion,
  formatGitHubOutput,
  normalizeExpectedVersion,
  parseTagRefs,
  sortStableTags,
} from "./release-version.ts";

const head = "aaaa";
const tags = [
  { name: "v1.4.1", commit: "1141" },
  { name: "v1.6.0", commit: "1160" },
  { name: "v1.5.0", commit: "1150" },
  { name: "v1.10.0-rc.1", commit: "rc" },
  { name: "v1.10.0", commit: "1110" },
];

describe("sortStableTags", () => {
  it("orders numerically, newest first, and drops prereleases", () => {
    expect(sortStableTags(tags).map((tag) => tag.name)).toEqual(["v1.10.0", "v1.6.0", "v1.5.0", "v1.4.1"]);
  });
});

describe("bumpVersion", () => {
  it("bumps each segment and resets the lower ones", () => {
    expect(bumpVersion("1.6.3", "patch")).toBe("1.6.4");
    expect(bumpVersion("1.6.3", "minor")).toBe("1.7.0");
    expect(bumpVersion("1.6.3", "major")).toBe("2.0.0");
  });
});

describe("normalizeExpectedVersion", () => {
  it("strips a leading v and rejects anything but X.Y.Z", () => {
    expect(normalizeExpectedVersion("v2.0.0")).toBe("2.0.0");
    expect(normalizeExpectedVersion(" 2.0.1 ")).toBe("2.0.1");
    expect(() => normalizeExpectedVersion("2.0")).toThrow(/X\.Y\.Z/);
    expect(() => normalizeExpectedVersion("2.0.0-beta.1")).toThrow(/X\.Y\.Z/);
    expect(() => normalizeExpectedVersion("2.01.0")).toThrow(/X\.Y\.Z/);
  });
});

describe("computeReleaseVersion", () => {
  it("bumps the latest stable tag by default", () => {
    expect(computeReleaseVersion({ expectedVersion: "", versionBump: "patch", tags, headCommit: head })).toEqual({
      version: "1.10.1",
      tagName: "v1.10.1",
      previousTag: "v1.10.0",
      resumed: false,
    });
  });

  it("starts at 0.0.0 when no stable tag exists", () => {
    const result = computeReleaseVersion({ expectedVersion: "", versionBump: "minor", tags: [], headCommit: head });
    expect(result).toEqual({ version: "0.1.0", tagName: "v0.1.0", previousTag: "", resumed: false });
  });

  it("resumes the latest release when its tag already points at the release commit", () => {
    const released = [...tags, { name: "v1.11.0", commit: head }];
    const result = computeReleaseVersion({
      expectedVersion: "",
      versionBump: "patch",
      tags: released,
      headCommit: head,
    });
    expect(result).toEqual({ version: "1.11.0", tagName: "v1.11.0", previousTag: "v1.10.0", resumed: true });
  });

  it("uses an explicit version and reports the previous tag", () => {
    const result = computeReleaseVersion({ expectedVersion: "v2.0.0", versionBump: "patch", tags, headCommit: head });
    expect(result).toEqual({ version: "2.0.0", tagName: "v2.0.0", previousTag: "v1.10.0", resumed: false });
  });

  it("resumes an explicit version whose tag is at the release commit", () => {
    const released = [...tags, { name: "v1.6.1", commit: head }];
    const result = computeReleaseVersion({
      expectedVersion: "1.6.1",
      versionBump: "patch",
      tags: released,
      headCommit: head,
    });
    expect(result).toEqual({ version: "1.6.1", tagName: "v1.6.1", previousTag: "v1.10.0", resumed: true });
  });

  it("refuses an explicit version whose tag points elsewhere", () => {
    expect(() =>
      computeReleaseVersion({ expectedVersion: "1.6.0", versionBump: "patch", tags, headCommit: head }),
    ).toThrow(/v1\.6\.0 already exists at 1160/);
  });
});

describe("parseTagRefs", () => {
  it("peels annotated tags and keeps lightweight tags as they are", () => {
    const refs = parseTagRefs(["v1.0.0 tagobj commitA", "v1.0.1 commitB ", ""].join("\n"));
    expect(refs).toEqual([
      { name: "v1.0.0", commit: "commitA" },
      { name: "v1.0.1", commit: "commitB" },
    ]);
  });
});

describe("formatGitHubOutput", () => {
  it("writes one key per line for GITHUB_OUTPUT", () => {
    expect(formatGitHubOutput({ version: "1.0.0", tagName: "v1.0.0", previousTag: "", resumed: false })).toBe(
      "version=1.0.0\ntag_name=v1.0.0\nprevious_tag=\nresumed=false\n",
    );
  });
});
