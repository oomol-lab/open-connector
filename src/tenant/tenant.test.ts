import { describe, expect, it } from "vitest";
import { formatSubject, isSubject, LEGACY_LOCAL_SUBJECT, parseSubject, requireSubject } from "./subject.ts";
import { TenantError } from "./tenant-error.ts";
import { DEFAULT_TENANT_ID, isTenantId, requireTenantId } from "./tenant-id.ts";

describe("tenant id", () => {
  it("accepts the default and org-shaped ids", () => {
    for (const id of [DEFAULT_TENANT_ID, "org-123", "acme_corp", "a", "tenant.example"]) {
      expect(isTenantId(id), id).toBe(true);
      expect(requireTenantId(id)).toBe(id);
    }
  });

  it("rejects wildcards, separators, and empty values", () => {
    for (const id of ["", "*", "all", "ALL", "All", "-x", "a/b", "a:b", "a b", "x".repeat(64), "../escape"]) {
      expect(isTenantId(id), id).toBe(false);
      expect(() => requireTenantId(id), id).toThrow(TenantError);
    }
  });

  it("reports a stable error code", () => {
    try {
      requireTenantId("*");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TenantError);
      expect((error as TenantError).code).toBe("invalid_tenant_id");
    }
  });
});

describe("subject", () => {
  it("round-trips the three kinds", () => {
    for (const kind of ["user", "space", "service"] as const) {
      const subject = `${kind}:abc-123`;
      expect(isSubject(subject)).toBe(true);
      expect(parseSubject(subject)).toEqual({ kind, id: "abc-123" });
      expect(formatSubject({ kind, id: "abc-123" })).toBe(subject);
    }
  });

  it("rejects malformed values", () => {
    for (const value of ["", "user", "user:", ":id", "group:x", "user:a/b", " user:x", "user: x"]) {
      expect(isSubject(value), value).toBe(false);
      expect(parseSubject(value), value).toBeNull();
    }
  });

  it("rejects the legacy single-tenant owner as new input", () => {
    expect(isSubject(LEGACY_LOCAL_SUBJECT)).toBe(false);
    expect(() => requireSubject(LEGACY_LOCAL_SUBJECT)).toThrow(TenantError);
  });
});
