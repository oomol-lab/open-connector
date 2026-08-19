import { describe, expect, it } from "vitest";
import {
  assertProviderActionIdentity,
  diffCatalogAndExecutorKeys,
  executableActionIdsFromProviders,
  findingFromActionExecutorGap,
  formatConformanceFindings,
  scanProviderRuntimeSource,
  scanProviderSkipDnsPolicy,
  scanProviderEgressPolicy,
  findMissingPrivateNetworkRatchetProviders,
} from "./provider-conformance.ts";

describe("diffCatalogAndExecutorKeys", () => {
  it("returns undefined when catalog ids and executor keys match", () => {
    expect(
      diffCatalogAndExecutorKeys({
        service: "example",
        catalogActionIds: ["example.ping", "example.pong"],
        executorKeys: ["example.pong", "example.ping"],
      }),
    ).toBeUndefined();
  });

  it("reports catalog-only actions and orphan executor keys", () => {
    const gap = diffCatalogAndExecutorKeys({
      service: "example",
      catalogActionIds: ["example.ping", "example.missing"],
      executorKeys: ["example.ping", "example.extra"],
    });

    expect(gap).toEqual({
      service: "example",
      catalogOnlyActionIds: ["example.missing"],
      extraExecutorKeys: ["example.extra"],
    });
    expect(findingFromActionExecutorGap(gap!).kind).toBe("catalog_action_mismatch");
  });
});

describe("assertProviderActionIdentity", () => {
  it("accepts stable <service>.<name> action ids", () => {
    expect(() =>
      assertProviderActionIdentity({
        service: "example",
        displayName: "Example",
        categories: ["Developer Tools"],
        authTypes: ["no_auth"],
        auth: [{ type: "no_auth" }],
        actions: [
          {
            id: "example.ping",
            service: "example",
            name: "ping",
            description: "Ping.",
            requiredScopes: [],
            providerPermissions: [],
            inputSchema: {},
            outputSchema: {},
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects action ids that do not match the provider service and name", () => {
    expect(() =>
      assertProviderActionIdentity({
        service: "example",
        displayName: "Example",
        categories: ["Developer Tools"],
        authTypes: ["no_auth"],
        auth: [{ type: "no_auth" }],
        actions: [
          {
            id: "other.ping",
            service: "example",
            name: "ping",
            description: "Ping.",
            requiredScopes: [],
            providerPermissions: [],
            inputSchema: {},
            outputSchema: {},
          },
        ],
      }),
    ).toThrow("action id other.ping must be example.ping");
  });
});

describe("executableActionIdsFromProviders", () => {
  it("flattens and sorts action ids without expanding by service", () => {
    expect(
      executableActionIdsFromProviders([
        {
          service: "zulu",
          displayName: "Zulu",
          categories: ["Developer Tools"],
          authTypes: ["no_auth"],
          auth: [{ type: "no_auth" }],
          actions: [
            {
              id: "zulu.beta",
              service: "zulu",
              name: "beta",
              description: "Beta.",
              requiredScopes: [],
              providerPermissions: [],
              inputSchema: {},
              outputSchema: {},
            },
          ],
        },
        {
          service: "alpha",
          displayName: "Alpha",
          categories: ["Developer Tools"],
          authTypes: ["no_auth"],
          auth: [{ type: "no_auth" }],
          actions: [
            {
              id: "alpha.ping",
              service: "alpha",
              name: "ping",
              description: "Ping.",
              requiredScopes: [],
              providerPermissions: [],
              inputSchema: {},
              outputSchema: {},
            },
          ],
        },
      ]),
    ).toEqual(["alpha.ping", "zulu.beta"]);
  });
});

describe("scanProviderRuntimeSource", () => {
  it("allows guarded fetch and skips generate.ts", () => {
    expect(
      scanProviderRuntimeSource({
        service: "example",
        fileName: "executors.ts",
        nodeOnly: false,
        text: `await context.fetcher("https://example.com");\nawait providerFetch(url);\n`,
      }),
    ).toEqual([]);
    expect(
      scanProviderRuntimeSource({
        service: "example",
        fileName: "generate.ts",
        nodeOnly: false,
        text: `await fetch("https://example.com/openapi.json");\n`,
      }),
    ).toEqual([]);
  });

  it("flags global fetch, raw WebSocket, and definition/executor cycles", () => {
    expect(
      scanProviderRuntimeSource({
        service: "example",
        fileName: "runtime.ts",
        nodeOnly: false,
        text: `import { provider } from "./definition.ts";\nawait fetch(url);\nnew WebSocket(url);\n`,
      }),
    ).toEqual([
      {
        service: "example",
        file: "runtime.ts",
        kind: "executors_import_definition",
        detail: "runtime.ts must not import definition.ts to reuse catalog metadata",
      },
      {
        service: "example",
        file: "runtime.ts",
        kind: "global_fetch",
        detail: "use context.fetcher, providerFetch, or createProviderFetch instead of the global fetch",
      },
      {
        service: "example",
        file: "runtime.ts",
        kind: "raw_websocket",
        detail: "use openGuardedWebSocket instead of new WebSocket",
      },
    ]);
    expect(
      scanProviderRuntimeSource({
        service: "example",
        fileName: "definition.ts",
        nodeOnly: false,
        text: `import { executors } from "./executors.ts";\n`,
      }).map((finding) => finding.kind),
    ).toEqual(["definition_imports_executors"]);
  });

  it("flags qualified global fetch and WebSocket constructors", () => {
    expect(
      scanProviderRuntimeSource({
        service: "example",
        fileName: "runtime.ts",
        nodeOnly: false,
        text: `await globalThis.fetch(url);\nnew globalThis.WebSocket(url);\n`,
      }).map((finding) => finding.kind),
    ).toEqual(["global_fetch", "raw_websocket"]);
    expect(
      scanProviderRuntimeSource({
        service: "example",
        fileName: "runtime.ts",
        nodeOnly: false,
        text: `await self.fetch(url);\nnew window.WebSocket(url);\n`,
      }).map((finding) => finding.kind),
    ).toEqual(["global_fetch", "raw_websocket"]);
  });

  it("ignores fetch mentioned in comments and schema copy", () => {
    expect(
      scanProviderRuntimeSource({
        service: "example",
        fileName: "runtime.ts",
        nodeOnly: false,
        text: `// the bytes sent by the proxy's fetch(url) match the SN\nawait context.fetcher(url);\n`,
      }),
    ).toEqual([]);
    expect(
      scanProviderRuntimeSource({
        service: "googlephotos",
        fileName: "actions.ts",
        nodeOnly: false,
        text: `mediaItemIds: s.stringArray("The list of media item IDs to fetch (1-50)."),\n`,
      }),
    ).toEqual([]);
  });

  it("requires nodeOnly when a Node-only package is imported", () => {
    expect(
      scanProviderRuntimeSource({
        service: "aliyun_oss",
        fileName: "executors.ts",
        nodeOnly: false,
        text: `import AliOss from "ali-oss";\n`,
      }).map((finding) => finding.kind),
    ).toEqual(["node_only_package_unmarked"]);
    expect(
      scanProviderRuntimeSource({
        service: "mailer",
        fileName: "runtime.ts",
        nodeOnly: false,
        text: `import nodemailer from "nodemailer";\n`,
      }).map((finding) => finding.kind),
    ).toEqual(["node_only_package_unmarked"]);
    expect(
      scanProviderRuntimeSource({
        service: "feishu",
        fileName: "shared/mail-runtime.ts",
        nodeOnly: false,
        text: `import MailComposer from "nodemailer/lib/mail-composer/index.js";\n`,
      }),
    ).toEqual([]);
    expect(
      scanProviderRuntimeSource({
        service: "aliyun_oss",
        fileName: "executors.ts",
        nodeOnly: true,
        text: `import AliOss from "ali-oss";\n`,
      }),
    ).toEqual([]);
  });
});

describe("scanProviderSkipDnsPolicy", () => {
  it("allows skipDnsValidation when the host is a code-controlled literal", () => {
    expect(
      scanProviderSkipDnsPolicy({
        service: "example",
        files: [
          {
            service: "example",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `
              const exampleApiHost = "api.example.com";
              const exampleApiBaseUrl = \`https://\${exampleApiHost}\`;
              export const executors = defineApiKeyProviderExecutors(service, handlers, { skipDnsValidation: true });
              export const proxy = defineProviderProxy({ service, baseUrl: exampleApiBaseUrl, skipDnsValidation: true, auth: { type: "bearer" } });
            `,
          },
        ],
      }),
    ).toEqual([]);
  });

  it("flags skipDnsValidation combined with allowPrivateNetwork", () => {
    expect(
      scanProviderSkipDnsPolicy({
        service: "selfhosted",
        files: [
          {
            service: "selfhosted",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `defineProviderExecutors({ skipDnsValidation: true, allowPrivateNetwork: isPrivateNetworkAccessAllowed });\n`,
          },
        ],
      }).map((finding) => finding.kind),
    ).toEqual(["skip_dns_dynamic_host"]);
  });

  it("flags skipDnsValidation with credential resolvers and interpolated hosts", () => {
    expect(
      scanProviderSkipDnsPolicy({
        service: "example",
        files: [
          {
            service: "example",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `
              export const proxy = defineProviderProxy({
                service,
                skipDnsValidation: true,
                baseUrl: credentialProviderProxyBaseUrl("instanceUrl"),
                auth: { type: "bearer" },
              });
            `,
          },
        ],
      }).map((finding) => finding.kind),
    ).toEqual(["skip_dns_dynamic_host", "skip_dns_dynamic_host"]);

    expect(
      scanProviderSkipDnsPolicy({
        service: "aws_sts",
        files: [
          {
            service: "aws_sts",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `
              const awsStsFetch = createProviderFetch({ skipDnsValidation: true });
              const url = new URL(\`https://sts.\${region}.amazonaws.com/\`);
            `,
          },
        ],
      }).map((finding) => finding.detail),
    ).toEqual([
      "skipDnsValidation used with interpolated hostname `https://sts.${region}.amazonaws.com/`; only literal hosts may skip DNS",
    ]);
  });

  it("allows path glue on a literal hostname", () => {
    expect(
      scanProviderSkipDnsPolicy({
        service: "pixellab",
        files: [
          {
            service: "pixellab",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `defineApiKeyProviderExecutors("pixellab", handlers, { skipDnsValidation: true });\n`,
          },
          {
            service: "pixellab",
            fileName: "runtime-ui.ts",
            nodeOnly: false,
            text: "const url = new URL(`https://placeholder.invalid${path}`);\n",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("flags skipDnsValidation on a proxy whose base URL is resolved at request time", () => {
    expect(
      scanProviderSkipDnsPolicy({
        service: "amplitude",
        files: [
          {
            service: "amplitude",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `
              export const proxy = defineProviderProxy({
                service,
                skipDnsValidation: true,
                baseUrl: async (context) => resolveAmplitudeCredentialBaseUrl(dataResidency),
                auth: { type: "none" },
              });
            `,
          },
        ],
      }).map((finding) => finding.kind),
    ).toEqual(["skip_dns_dynamic_host"]);

    expect(
      scanProviderSkipDnsPolicy({
        service: "saucelabs",
        files: [
          {
            service: "saucelabs",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `
              export const proxy = defineProviderProxy({
                service: "saucelabs",
                skipDnsValidation: true,
                async baseUrl(context) {
                  return resolveSaucelabsCredential(values).apiBaseUrl;
                },
              });
            `,
          },
        ],
      }).map((finding) => finding.kind),
    ).toEqual(["skip_dns_dynamic_host"]);
  });

  it("treats exported typed string constants as code-controlled literals", () => {
    expect(
      scanProviderSkipDnsPolicy({
        service: "sif",
        files: [
          {
            service: "sif",
            fileName: "runtime.ts",
            nodeOnly: false,
            text: `
              export const sifMcpOrigin: string = "https://mcp.sif.com";
              export const sifMcpEndpoint: string = \`\${sifMcpOrigin}/mcp\`;
            `,
          },
          {
            service: "sif",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `
              export const executors = defineApiKeyProviderExecutors("sif", handlers, { skipDnsValidation: true });
              export const proxy = defineProviderProxy({ service: "sif", baseUrl: sifMcpOrigin, skipDnsValidation: true, auth: { type: "bearer" } });
            `,
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("scanProviderEgressPolicy", () => {
  it("accepts Dokploy-style private-network opt-in paired with assertPublicHttpUrl", () => {
    expect(
      scanProviderEgressPolicy({
        service: "dokploy",
        files: [
          {
            service: "dokploy",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `defineProviderExecutors({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });\n`,
          },
          {
            service: "dokploy",
            fileName: "runtime.ts",
            nodeOnly: false,
            text: `assertPublicHttpUrl(instanceUrl, { allowPrivateNetwork });\n`,
          },
        ],
      }),
    ).toEqual([]);
  });

  it("flags a new private-network provider that uses a bespoke host check", () => {
    expect(
      scanProviderEgressPolicy({
        service: "new_selfhost",
        files: [
          {
            service: "new_selfhost",
            fileName: "executors.ts",
            nodeOnly: false,
            text: `defineProviderExecutors({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });\n`,
          },
          {
            service: "new_selfhost",
            fileName: "runtime.ts",
            nodeOnly: false,
            text: `function normalizeBaseUrl(value: string) { return new URL(value).toString(); }\n`,
          },
        ],
      }),
    ).toEqual([
      {
        service: "new_selfhost",
        file: "executors.ts",
        kind: "private_network_without_url_assert",
        detail:
          "allowPrivateNetwork requires assertPublicHttpUrl or assertGuardedEgressUrl on the instance URL (see Dokploy)",
      },
    ]);
  });

  it("ratchets existing gaps and fails when the list goes stale", () => {
    const files = [
      {
        service: "legacy",
        fileName: "executors.ts",
        nodeOnly: false,
        text: `defineProviderExecutors({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });\n`,
      },
    ];
    expect(
      scanProviderEgressPolicy({
        service: "legacy",
        knownPrivateNetworkWithoutSharedAssert: ["legacy"],
        files,
      }),
    ).toEqual([]);
    expect(
      scanProviderEgressPolicy({
        service: "legacy",
        knownPrivateNetworkWithoutSharedAssert: ["legacy"],
        files: [
          ...files,
          {
            service: "legacy",
            fileName: "runtime.ts",
            nodeOnly: false,
            text: `assertPublicHttpUrl(baseUrl, { allowPrivateNetwork });\n`,
          },
        ],
      }).map((finding) => finding.detail),
    ).toEqual([
      "remove legacy from knownPrivateNetworkWithoutSharedAssert; it now calls assertPublicHttpUrl or assertGuardedEgressUrl",
    ]);
    expect(
      scanProviderEgressPolicy({
        service: "legacy",
        knownPrivateNetworkWithoutSharedAssert: ["legacy"],
        files: [
          { service: "legacy", fileName: "executors.ts", nodeOnly: false, text: `defineProviderExecutors({});\n` },
        ],
      }).map((finding) => finding.detail),
    ).toEqual(["remove legacy from knownPrivateNetworkWithoutSharedAssert; it no longer sets allowPrivateNetwork"]);
    expect(
      findMissingPrivateNetworkRatchetProviders({
        knownPrivateNetworkWithoutSharedAssert: ["legacy"],
        scannedServices: ["dokploy"],
      }).map((finding) => finding.detail),
    ).toEqual(["remove legacy from knownPrivateNetworkWithoutSharedAssert; provider is missing"]);
  });
});

describe("formatConformanceFindings", () => {
  it("renders one finding per line", () => {
    expect(
      formatConformanceFindings([
        { service: "example", file: "runtime.ts", kind: "global_fetch", detail: "use providerFetch" },
      ]),
    ).toBe("example/runtime.ts: global_fetch: use providerFetch");
  });
});
