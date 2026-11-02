import { optionalRawString, optionalRecord } from "../../core/cast.ts";
import { requiredResponseRecord, providerInputError, providerResponseError } from "../provider-runtime.ts";
export function encodeSkillPackageName(packageName: string): string {
  const parts = packageName.split("/");
  const scoped = packageName.startsWith("@");
  const names = scoped ? [parts[0]!.slice(1), ...parts.slice(1)] : parts;
  if (
    parts.length !== (scoped ? 2 : 1) ||
    names.some(
      (name) =>
        name.length === 0 ||
        name === "." ||
        name === ".." ||
        [...name].some((char) => char.trim() === "" || "@#?%\\:".includes(char)),
    )
  ) {
    throw providerInputError("packageName must be an exact registry package name without a version or share ID");
  }
  return parts.map((part) => encodeURIComponent(part).replaceAll("%40", "@")).join("/");
}
export function parseSkillPackages(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw providerResponseError("OOMOL Console skill packages data is not an array");
  }
  return value
    .map((item) => {
      const pkg = requiredResponseRecord(item, "OOMOL Console skill package");
      if (pkg.skills !== undefined && !Array.isArray(pkg.skills)) {
        throw providerResponseError("OOMOL Console package skills is not an array");
      }
      const skills = (pkg.skills ?? []).map((item: unknown) => {
        const skill = requiredResponseRecord(item, "OOMOL Console package skill");
        const name = optionalRawString(skill.name) || optionalRawString(skill.path);
        if (!name) {
          throw providerResponseError("OOMOL Console package skill has no name or path");
        }
        return {
          ...skill,
          name,
          title: optionalRawString(skill.title),
          description: optionalRawString(skill.description) ?? "",
        };
      });
      const packageName = optionalRawString(pkg.packageName) || optionalRawString(pkg.name);
      if (skills.length > 0 && !packageName) {
        throw providerResponseError("OOMOL Console skill package has no package name");
      }
      return {
        ...pkg,
        packageName,
        version:
          optionalRawString(pkg.version) ||
          optionalRawString(pkg.packageVersion) ||
          optionalRawString(optionalRecord(pkg.extra)?.latestVersion),
        title: optionalRawString(pkg.title) || optionalRawString(pkg.displayName),
        description: optionalRawString(pkg.description) ?? "",
        visibility:
          pkg.visibility === "public" || pkg.visibility === "private"
            ? pkg.visibility
            : typeof pkg.isPrivate === "boolean"
              ? pkg.isPrivate
                ? "private"
                : "public"
              : undefined,
        skills,
      };
    })
    .filter((pkg) => pkg.skills.length > 0);
}
