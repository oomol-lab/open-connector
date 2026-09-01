import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "appledb";

const stringOrStringArray = s.union([s.string(), s.stringArray("String values returned by AppleDB.")], {
  description: "One or more identifiers recorded by AppleDB.",
});
const partialDate = s.string({
  description: "A full or partial release date supplied by AppleDB.",
});
const partialDateOrArray = s.union(
  [partialDate, s.array(partialDate, { description: "Release dates supplied by AppleDB." })],
  { description: "Release date, or one date per variant, as YYYY, YYYY-MM, or YYYY-MM-DD." },
);
const colorSchema = s.object(
  {
    name: s.string({ description: "Color name." }),
    hex: s.union(
      [
        s.string({ description: "Color value as hexadecimal RGB without a leading hash." }),
        s.stringArray("Hexadecimal RGB values without a leading hash, one per tone."),
      ],
      { description: "Color value as hexadecimal RGB without a leading hash, or one value per tone." },
    ),
    released: partialDate,
    discontinued: partialDate,
    key: s.string({ description: "AppleDB color key." }),
  },
  {
    optional: ["hex", "released", "discontinued", "key"],
    additionalProperties: true,
    description: "A device color recorded by AppleDB.",
  },
);
const deviceSchema = s.object(
  {
    key: s.string({ description: "Case-sensitive AppleDB device key used for exact lookup." }),
    name: s.string({ description: "Human-readable device name." }),
    type: s.string({ description: "AppleDB device category, such as iPhone, iPad Pro, Apple Watch, or MacBook Pro." }),
    identifier: stringOrStringArray,
    alias: s.stringArray("Alternative device names."),
    model: stringOrStringArray,
    board: stringOrStringArray,
    soc: stringOrStringArray,
    arch: s.string({ description: "Processor architecture." }),
    released: partialDateOrArray,
    discontinued: partialDateOrArray,
    colors: s.array(colorSchema, { description: "Known device colors." }),
    internal: s.boolean({ description: "Whether AppleDB marks this as an internal device." }),
    group: s.boolean({ description: "Whether this record represents a device group." }),
  },
  {
    required: ["key", "name", "type"],
    additionalProperties: true,
    description: "Community-maintained Apple device metadata from AppleDB.",
  },
);
const sourceLinkSchema = s.object(
  {
    url: s.url("Firmware or release resource URL."),
    active: s.boolean({ description: "Whether AppleDB currently considers the URL active." }),
    decryptionKey: s.string({ description: "Decryption key when the source requires one." }),
    catalog: s.string({ description: "Apple software catalog associated with the URL." }),
  },
  {
    required: ["url", "active"],
    additionalProperties: true,
    description: "A source link recorded by AppleDB.",
  },
);
const releaseLinkSchema = s.union([s.url("Release, enterprise, or security notes URL."), sourceLinkSchema], {
  description: "Notes URL, or a link object when AppleDB tracks whether it is still active.",
});
const firmwareSourceSchema = s.object(
  {
    type: s.string({ description: "Firmware source type, such as ipsw, ota, recovery, pkg, or dmg." }),
    deviceMap: s.stringArray("Device identifiers supported by this source."),
    boardMap: s.stringArray("Board identifiers supported by this source."),
    osMap: s.stringArray("Operating systems supported by this source."),
    size: s.integer({ minimum: 0, description: "Source size in bytes when known." }),
    links: s.array(sourceLinkSchema, { description: "Download links for this source." }),
  },
  {
    required: ["type", "links"],
    additionalProperties: true,
    description: "A firmware or software download source recorded by AppleDB.",
  },
);
const osBuildSchema = s.object(
  {
    key: s.string({ description: "Case-sensitive AppleDB operating system build key." }),
    osStr: s.string({ description: "Marketing name of the operating system." }),
    osType: s.string({ description: "Stable AppleDB operating system type." }),
    version: s.string({ description: "Human-readable operating system version." }),
    build: s.nullableString(
      "Apple build identifier; omitted or null for accessory and app firmware that has no build.",
    ),
    uniqueBuild: s.string({
      description: "AppleDB build key that distinguishes simulator, RC, SDK, and shared builds; the build half of key.",
    }),
    released: partialDate,
    beta: s.boolean({ description: "Whether this is a beta build." }),
    rc: s.boolean({ description: "Whether this is a release candidate." }),
    bsi: s.boolean({ description: "Whether this is a Background Security Improvement build." }),
    rsr: s.boolean({ description: "Whether this is a Rapid Security Response build." }),
    internal: s.boolean({ description: "Whether AppleDB marks this as an internal build." }),
    signed: s.union(
      [
        s.boolean({ description: "Whether the build is signed for all supported devices." }),
        s.stringArray("Device identifiers for which this build remains signed."),
      ],
      { description: "true when signed for every device, or the device identifiers still being signed." },
    ),
    deviceMap: s.stringArray("Device identifiers supported by this build."),
    osMap: s.stringArray("Operating systems represented by this build."),
    notes: s.string({ description: "Additional AppleDB notes." }),
    releaseNotes: releaseLinkSchema,
    enterpriseNotes: releaseLinkSchema,
    securityNotes: s.nullable(releaseLinkSchema),
    sources: s.array(firmwareSourceSchema, {
      description: "Firmware and software sources, included only when include_sources is true.",
    }),
  },
  {
    required: ["osStr", "version"],
    additionalProperties: true,
    description: "Community-maintained Apple operating system build metadata from AppleDB.",
  },
);
const deviceSearchResultSchema = s.object(
  {
    key: s.string({ description: "AppleDB device key for get_device." }),
    name: s.string({ description: "Human-readable device name." }),
    type: s.string({ description: "AppleDB device category." }),
    identifier: stringOrStringArray,
    model: stringOrStringArray,
    soc: stringOrStringArray,
    released: partialDateOrArray,
    discontinued: partialDateOrArray,
  },
  {
    required: ["key", "name", "type"],
    description: "A compact AppleDB device search result.",
  },
);
const osBuildSearchResultSchema = s.object(
  {
    key: s.string({ description: "AppleDB build key for get_os_build." }),
    os: s.string({
      description:
        "AppleDB operating system name (osStr) for get_os_build; the iOS calendar also reports iPadOS, iPhone OS, and iPhone Software builds.",
    }),
    version: s.string({
      description: "Version text from the calendar summary, such as 18.0, 18.1 beta 2, or 15.0 RC.",
    }),
    build: s.string({
      description: "AppleDB build key for get_os_build; may carry a variant suffix such as -sim, -RC, or -SDK.",
    }),
    released: s.string({ description: "Release date in YYYY-MM-DD form." }),
    summary: s.string({ description: "AppleDB calendar event summary." }),
    url: s.url("AppleDB page for this build."),
  },
  {
    required: ["key", "os", "version", "build", "released", "summary"],
    description: "A compact AppleDB operating system build search result.",
  },
);
const resultLimitSchema = s.optional(
  s.integer({
    minimum: 1,
    maximum: 100,
    default: 20,
    description: "Maximum number of matches to return.",
  }),
);

export const appledbActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_device",
    description: "Get an Apple device record by its case-sensitive AppleDB key, such as iPhone17,1.",
    inputSchema: s.object(
      {
        key: s.nonWhitespaceString("Case-sensitive AppleDB device key, usually a hardware identifier."),
      },
      { required: ["key"], description: "Exact AppleDB device lookup input." },
    ),
    outputSchema: deviceSchema,
  }),
  defineProviderAction(service, {
    name: "search_devices",
    description: "Search AppleDB devices by name, key, identifier, model, board, or processor.",
    inputSchema: s.object(
      {
        query: s.nonWhitespaceString("Device search text, such as iPhone 16 Pro, iPhone17,1, or A3293."),
        type: s.optional(
          s.nonWhitespaceString(
            "Optional case-insensitive AppleDB device category filter, matched exactly; examples: iPhone, iPad Pro, Apple Watch, MacBook Pro, Mac mini, AirPods.",
          ),
        ),
        limit: resultLimitSchema,
      },
      { required: ["query"], description: "AppleDB device search input." },
    ),
    outputSchema: searchOutputSchema("devices", deviceSearchResultSchema, "Matching AppleDB devices."),
    followUpActions: ["appledb.get_device"],
  }),
  defineProviderAction(service, {
    name: "get_os_build",
    description: "Get an Apple operating system build record by its AppleDB operating system name and build key.",
    inputSchema: s.object(
      {
        os: s.nonWhitespaceString(
          "Case-sensitive AppleDB operating system name (osStr), such as iOS, iPadOS, macOS, or Mac OS X.",
        ),
        build: s.nonWhitespaceString(
          "AppleDB build key: usually the Apple build identifier, such as 22A3354, but simulator, RC, and SDK variants carry suffixes such as 22A3351-sim or 22H355-RC, and accessory firmware uses its version. Pass the build returned by search_os_builds verbatim; use search_os_builds when a plain build identifier is not found.",
        ),
        include_sources: s.optional(
          s.boolean({
            default: false,
            description: "Include firmware and software download sources; false keeps the result compact.",
          }),
        ),
      },
      { required: ["os", "build"], description: "Exact AppleDB operating system build lookup input." },
    ),
    outputSchema: osBuildSchema,
  }),
  defineProviderAction(service, {
    name: "search_os_builds",
    description:
      "Search an AppleDB firmware calendar by version, build, device identifier, or release text; results are newest first.",
    inputSchema: s.object(
      {
        os_type: s.nonWhitespaceString(
          "Case-sensitive AppleDB OS type that names the calendar, such as iOS, macOS, watchOS, tvOS, visionOS, bridgeOS, or HomePod Software. iPadOS builds live in the iOS calendar and audioOS builds in the HomePod Software calendar; each result carries its own os for get_os_build.",
        ),
        query: s.nonWhitespaceString("Search text, such as 18.0, 22A3354, or iPhone17,1."),
        limit: resultLimitSchema,
      },
      { required: ["os_type", "query"], description: "AppleDB operating system build search input." },
    ),
    outputSchema: searchOutputSchema("builds", osBuildSearchResultSchema, "Matching AppleDB builds."),
    followUpActions: ["appledb.get_os_build"],
  }),
];

function searchOutputSchema(resultKey: string, itemSchema: JsonSchema, description: string): JsonSchema {
  return s.object(
    {
      [resultKey]: s.array(itemSchema, { description }),
      count: s.integer({ minimum: 0, description: "Number of matches returned." }),
      total_matches: s.integer({ minimum: 0, description: "Number of matches before applying the result limit." }),
      truncated: s.boolean({ description: "Whether additional matches were omitted by the result limit." }),
    },
    {
      required: [resultKey, "count", "total_matches", "truncated"],
      description: "Bounded AppleDB search results.",
    },
  );
}
