import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appResource,
  deleteProvisioningRoles,
  deletedOutput,
  manageProvisioningRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
} from "./schemas.ts";

export const bundleIdPlatforms: readonly string[] = ["IOS", "MAC_OS", "UNIVERSAL"];
export const capabilityTypes: readonly string[] = [
  "ICLOUD",
  "IN_APP_PURCHASE",
  "GAME_CENTER",
  "PUSH_NOTIFICATIONS",
  "WALLET",
  "INTER_APP_AUDIO",
  "MAPS",
  "ASSOCIATED_DOMAINS",
  "PERSONAL_VPN",
  "APP_GROUPS",
  "HEALTHKIT",
  "HOMEKIT",
  "WIRELESS_ACCESSORY_CONFIGURATION",
  "APPLE_PAY",
  "DATA_PROTECTION",
  "SIRIKIT",
  "NETWORK_EXTENSIONS",
  "MULTIPATH",
  "HOT_SPOT",
  "NFC_TAG_READING",
  "CLASSKIT",
  "AUTOFILL_CREDENTIAL_PROVIDER",
  "ACCESS_WIFI_INFORMATION",
  "NETWORK_CUSTOM_PROTOCOL",
  "COREMEDIA_HLS_LOW_LATENCY",
  "SYSTEM_EXTENSION_INSTALL",
  "USER_MANAGEMENT",
  "APPLE_ID_AUTH",
];
export const capabilitySettingKeys: readonly string[] = [
  "ICLOUD_VERSION",
  "DATA_PROTECTION_PERMISSION_LEVEL",
  "APPLE_ID_AUTH_APP_CONSENT",
];
export const capabilityOptionKeys: readonly string[] = [
  "XCODE_5",
  "XCODE_6",
  "COMPLETE_PROTECTION",
  "PROTECTED_UNLESS_OPEN",
  "PROTECTED_UNTIL_FIRST_USER_AUTH",
  "PRIMARY_APP_CONSENT",
];
export const capabilityAllowedInstances: readonly string[] = ["ENTRY", "SINGLE", "MULTIPLE"];
export const certificateTypes: readonly string[] = [
  "APPLE_PAY",
  "APPLE_PAY_MERCHANT_IDENTITY",
  "APPLE_PAY_PSP_IDENTITY",
  "APPLE_PAY_RSA",
  "DEVELOPER_ID_KEXT",
  "DEVELOPER_ID_KEXT_G2",
  "DEVELOPER_ID_APPLICATION",
  "DEVELOPER_ID_APPLICATION_G2",
  "DEVELOPMENT",
  "DISTRIBUTION",
  "IDENTITY_ACCESS",
  "IOS_DEVELOPMENT",
  "IOS_DISTRIBUTION",
  "MAC_APP_DISTRIBUTION",
  "MAC_INSTALLER_DISTRIBUTION",
  "MAC_APP_DEVELOPMENT",
  "PASS_TYPE_ID",
  "PASS_TYPE_ID_WITH_NFC",
];
export const profileTypes: readonly string[] = [
  "IOS_APP_DEVELOPMENT",
  "IOS_APP_STORE",
  "IOS_APP_ADHOC",
  "IOS_APP_INHOUSE",
  "MAC_APP_DEVELOPMENT",
  "MAC_APP_STORE",
  "MAC_APP_DIRECT",
  "TVOS_APP_DEVELOPMENT",
  "TVOS_APP_STORE",
  "TVOS_APP_ADHOC",
  "TVOS_APP_INHOUSE",
  "MAC_CATALYST_APP_DEVELOPMENT",
  "MAC_CATALYST_APP_STORE",
  "MAC_CATALYST_APP_DIRECT",
];
export const profileStates: readonly string[] = ["ACTIVE", "INVALID"];
export const deviceClasses: readonly string[] = [
  "APPLE_VISION_PRO",
  "APPLE_WATCH",
  "IPAD",
  "IPHONE",
  "IPOD",
  "APPLE_TV",
  "MAC",
];
export const deviceStatuses: readonly string[] = ["ENABLED", "DISABLED"];

const certificateSortValues: readonly string[] = [
  "displayName",
  "-displayName",
  "certificateType",
  "-certificateType",
  "serialNumber",
  "-serialNumber",
  "id",
  "-id",
];

const bundleIdIdDescription =
  "App Store Connect identifier of the bundle ID record (the opaque resource id, not the reverse-DNS identifier string).";
const certificateIdDescription = "App Store Connect identifier of the certificate.";
const profileIdDescription = "App Store Connect identifier of the provisioning profile.";
const deviceIdDescription = "App Store Connect identifier of the device.";
const merchantIdIdDescription =
  "App Store Connect identifier of the merchant ID record (the opaque resource id, not the merchant.com.example identifier string).";
const passTypeIdIdDescription =
  "App Store Connect identifier of the pass type ID record (the opaque resource id, not the pass.com.example identifier string).";

export const bundleIdResource: JsonSchema = resourceObject(
  "A bundle ID (App ID) registered with the team.",
  "App Store Connect identifier of the bundle ID record.",
  {
    name: s.nullableString("Display name given to the bundle ID when it was registered."),
    platform: nullableEnum("Platform the bundle ID is registered for.", bundleIdPlatforms),
    identifier: s.nullableString(
      "Reverse-DNS bundle identifier string, such as com.example.app, or a wildcard ending in *.",
    ),
    seedId: s.nullableString("Team ID prefix (seed ID) associated with the bundle ID."),
  },
);

const capabilityOptionOutput = s.looseObject("One selectable option of a capability setting.", {
  key: nullableEnum("Option key.", capabilityOptionKeys),
  name: s.nullableString("Option name shown in the developer portal."),
  description: s.nullableString("Option description shown in the developer portal."),
  enabledByDefault: s.nullableBoolean("Whether the option is enabled unless configured otherwise."),
  enabled: s.nullableBoolean("Whether the option is currently enabled."),
  supportsWildcard: s.nullableBoolean("Whether the option applies to wildcard bundle IDs."),
});

const capabilitySettingOutput = s.looseObject("One configurable setting of a capability.", {
  key: nullableEnum("Setting key.", capabilitySettingKeys),
  name: s.nullableString("Setting name shown in the developer portal."),
  description: s.nullableString("Setting description shown in the developer portal."),
  enabledByDefault: s.nullableBoolean("Whether the setting is enabled unless configured otherwise."),
  visible: s.nullableBoolean("Whether the setting is shown in the developer portal."),
  allowedInstances: nullableEnum("How many options of the setting may be enabled at once.", capabilityAllowedInstances),
  minInstances: s.nullableInteger("Minimum number of options that must be enabled."),
  options: s.nullable(s.array("Options available for the setting.", capabilityOptionOutput)),
});

export const bundleIdCapabilityResource: JsonSchema = resourceObject(
  "A capability enabled on a bundle ID.",
  "App Store Connect identifier of the bundle ID capability.",
  {
    capabilityType: nullableEnum("Capability that is enabled.", capabilityTypes),
    settings: s.nullable(s.array("Configured settings of the capability.", capabilitySettingOutput)),
  },
);

const capabilitySettingsInput = s.array(
  "Capability settings to configure, for capabilities such as ICLOUD, DATA_PROTECTION, and APPLE_ID_AUTH that expose options. Each setting names its key and the options to enable.",
  s.object(
    "One capability setting with the options to apply.",
    {
      key: s.stringEnum("Setting key.", capabilitySettingKeys),
      options: s.array(
        "Options of the setting to configure.",
        s.object(
          "One option of the setting.",
          {
            key: s.stringEnum("Option key.", capabilityOptionKeys),
            enabled: s.boolean("Whether to enable the option."),
          },
          { additionalProperties: true, required: ["key"] },
        ),
        { minItems: 1 },
      ),
    },
    { required: ["key"] },
  ),
  { minItems: 1 },
);

export const certificateResource: JsonSchema = resourceObject(
  "A signing certificate issued by Apple.",
  "App Store Connect identifier of the certificate.",
  {
    name: s.nullableString("Certificate name."),
    certificateType: nullableEnum("Kind of certificate.", certificateTypes),
    displayName: s.nullableString("Certificate display name shown in the developer portal."),
    serialNumber: s.nullableString("Serial number of the certificate."),
    platform: nullableEnum("Platform the certificate applies to.", bundleIdPlatforms),
    expirationDate: s.nullableString("When the certificate expires, as an ISO 8601 timestamp."),
    certificateContent: s.nullableString(
      "Base64-encoded DER certificate. Decode it to a .cer file to install it in a keychain.",
    ),
    activated: s.nullableBoolean(
      "Whether the certificate is activated. Only Apple Pay payment processing certificates carry an activation state.",
    ),
  },
);

export const profileResource: JsonSchema = resourceObject(
  "A provisioning profile.",
  "App Store Connect identifier of the provisioning profile.",
  {
    name: s.nullableString("Profile name."),
    platform: nullableEnum("Platform the profile applies to.", bundleIdPlatforms),
    profileType: nullableEnum("Distribution method and platform of the profile.", profileTypes),
    profileState: nullableEnum(
      "Whether the profile is still valid. A profile becomes INVALID when a certificate it contains is revoked or a device it contains is disabled.",
      profileStates,
    ),
    profileContent: s.nullableString(
      "Base64-encoded provisioning profile. Decode it to a .mobileprovision or .provisionprofile file to install it.",
    ),
    uuid: s.nullableString("UUID embedded in the profile."),
    createdDate: s.nullableString("When the profile was created, as an ISO 8601 timestamp."),
    expirationDate: s.nullableString("When the profile expires, as an ISO 8601 timestamp."),
  },
);

export const deviceResource: JsonSchema = resourceObject(
  "A device registered with the team for development.",
  "App Store Connect identifier of the device.",
  {
    name: s.nullableString("Device name given when it was registered."),
    platform: nullableEnum("Platform the device runs.", bundleIdPlatforms),
    udid: s.nullableString("Unique device identifier (UDID) of the device."),
    deviceClass: nullableEnum("Hardware class of the device.", deviceClasses),
    status: nullableEnum(
      "Whether the device is enabled for development. Disabled devices are excluded from new profiles.",
      deviceStatuses,
    ),
    model: s.nullableString("Device model name."),
    addedDate: s.nullableString("When the device was registered, as an ISO 8601 timestamp."),
  },
);

export const merchantIdResource: JsonSchema = resourceObject(
  "An Apple Pay merchant ID registered with the team.",
  "App Store Connect identifier of the merchant ID record.",
  {
    name: s.nullableString("Display name of the merchant ID."),
    identifier: s.nullableString("Merchant identifier string, such as merchant.com.example.shop."),
  },
);

export const passTypeIdResource: JsonSchema = resourceObject(
  "A Wallet pass type ID registered with the team.",
  "App Store Connect identifier of the pass type ID record.",
  {
    name: s.nullableString("Display name of the pass type ID."),
    identifier: s.nullableString("Pass type identifier string, such as pass.com.example.ticket."),
  },
);

const certificateFilterInputs = {
  displayName: nonEmptyString("Return only certificates with this exact display name."),
  certificateType: s.stringEnum("Return only certificates of this type.", certificateTypes),
  serialNumber: nonEmptyString("Return only the certificate with this serial number."),
  sort: s.stringEnum("Sort order for the returned certificates.", certificateSortValues),
  ...paginationInputs,
};
const certificateFilterKeys: readonly string[] = [
  "displayName",
  "certificateType",
  "serialNumber",
  "sort",
  "limit",
  "cursor",
];

const certificatePageOutput = (description: string) =>
  pageOutput("certificates", certificateResource, "Certificates returned for this page.", description);

const relatedListInput = (idField: string, idDescription: string, description: string) =>
  s.object(
    description,
    { [idField]: nonEmptyString(idDescription), ...paginationInputs },
    {
      required: [idField],
    },
  );

const idInput = (idField: string, idDescription: string, description: string) =>
  s.actionInput({ [idField]: nonEmptyString(idDescription) }, [idField], description);

const singleOutput = (key: string, resource: JsonSchema, description: string) =>
  s.actionOutput({ [key]: resource }, description);

export const appStoreConnectSigningActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_bundle_ids",
    operationType: "read",
    description:
      "List the bundle IDs (App IDs) registered with the team, optionally filtered by identifier, name, platform, or seed ID.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "Filters for browsing bundle IDs.",
      {
        identifier: nonEmptyString(
          "Return only the bundle ID with this exact reverse-DNS identifier, such as com.example.app.",
        ),
        name: nonEmptyString("Return only bundle IDs with this exact name."),
        platform: s.stringEnum("Return only bundle IDs for this platform.", bundleIdPlatforms),
        seedId: nonEmptyString("Return only bundle IDs with this seed ID (team ID prefix)."),
        sort: s.stringEnum("Sort order for the returned bundle IDs.", [
          "name",
          "-name",
          "platform",
          "-platform",
          "identifier",
          "-identifier",
          "seedId",
          "-seedId",
          "id",
          "-id",
        ]),
        ...paginationInputs,
      },
      { optional: ["identifier", "name", "platform", "seedId", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "bundleIds",
      bundleIdResource,
      "Bundle IDs returned for this page.",
      "A page of bundle IDs.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_bundle_id",
    operationType: "read",
    description: "Read one bundle ID record by its App Store Connect identifier.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("bundleIdId", bundleIdIdDescription, "Identifies the bundle ID to read."),
    outputSchema: singleOutput("bundleId", bundleIdResource, "The requested bundle ID."),
  }),
  defineProviderAction(service, {
    name: "create_bundle_id",
    operationType: "write",
    description:
      "Register a new bundle ID (App ID) with the team. Capabilities are added afterwards with enable_bundle_id_capability.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The bundle ID to register.",
      {
        identifier: nonEmptyString(
          "Reverse-DNS bundle identifier, such as com.example.app. A wildcard identifier ends in an asterisk, such as com.example.*.",
        ),
        name: nonEmptyString("Display name for the bundle ID."),
        platform: s.stringEnum("Platform to register the bundle ID for.", bundleIdPlatforms),
        seedId: nonEmptyString(
          "Seed ID (team ID prefix) to register the bundle ID under. Leave out to use the team default.",
        ),
      },
      { required: ["identifier", "name", "platform"] },
    ),
    outputSchema: singleOutput("bundleId", bundleIdResource, "The registered bundle ID."),
  }),
  defineProviderAction(service, {
    name: "update_bundle_id",
    operationType: "write",
    description:
      "Rename a bundle ID. The name is the only attribute App Store Connect lets you change; the identifier string and platform are fixed once registered.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The bundle ID to rename and its new name.",
      {
        bundleIdId: nonEmptyString(bundleIdIdDescription),
        name: nonEmptyString("New display name for the bundle ID."),
      },
      { required: ["bundleIdId", "name"] },
    ),
    outputSchema: singleOutput("bundleId", bundleIdResource, "The renamed bundle ID."),
  }),
  defineProviderAction(service, {
    name: "delete_bundle_id",
    operationType: "destructive",
    description:
      "Delete a bundle ID from the team. App Store Connect refuses to delete a bundle ID that an app record still uses.",
    requiredScopes: [],
    providerPermissions: [...deleteProvisioningRoles],
    inputSchema: idInput("bundleIdId", bundleIdIdDescription, "Identifies the bundle ID to delete."),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted bundle ID."),
      "Confirmation that the bundle ID was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_bundle_id_profiles",
    operationType: "read",
    description: "List the provisioning profiles that were created for one bundle ID.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: relatedListInput(
      "bundleIdId",
      bundleIdIdDescription,
      "Identifies the bundle ID whose profiles to list.",
    ),
    outputSchema: pageOutput(
      "profiles",
      profileResource,
      "Provisioning profiles returned for this page.",
      "A page of provisioning profiles for one bundle ID.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_bundle_id_app",
    operationType: "read",
    description:
      "Read the App Store Connect app that uses one bundle ID. Returns null when no app has been created for the bundle ID yet.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("bundleIdId", bundleIdIdDescription, "Identifies the bundle ID whose app to read."),
    outputSchema: s.actionOutput(
      { app: s.nullable(appResource) },
      "The app using the bundle ID, or null when there is none.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_bundle_id_capabilities",
    operationType: "read",
    description: "List the capabilities enabled on one bundle ID, with their configured settings.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: relatedListInput(
      "bundleIdId",
      bundleIdIdDescription,
      "Identifies the bundle ID whose capabilities to list.",
    ),
    outputSchema: pageOutput(
      "bundleIdCapabilities",
      bundleIdCapabilityResource,
      "Capabilities returned for this page.",
      "A page of capabilities enabled on one bundle ID.",
    ),
  }),
  defineProviderAction(service, {
    name: "enable_bundle_id_capability",
    operationType: "write",
    description:
      "Enable a capability such as push notifications or associated domains on a bundle ID. Provisioning profiles created for the bundle ID before the change may need to be regenerated to carry the new entitlement.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The capability to enable and the bundle ID to enable it on.",
      {
        bundleIdId: nonEmptyString(bundleIdIdDescription),
        capabilityType: s.stringEnum("Capability to enable.", capabilityTypes),
        settings: capabilitySettingsInput,
      },
      { required: ["bundleIdId", "capabilityType"] },
    ),
    outputSchema: singleOutput("bundleIdCapability", bundleIdCapabilityResource, "The enabled capability."),
  }),
  defineProviderAction(service, {
    name: "update_bundle_id_capability",
    operationType: "destructive",
    description:
      "Replace the configuration of a capability that is already enabled on a bundle ID, for example the iCloud version or data protection level. Provide at least one of capabilityType or settings; the settings given replace the current ones.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The capability to reconfigure and its new configuration.",
      {
        bundleIdCapabilityId: nonEmptyString("App Store Connect identifier of the bundle ID capability."),
        capabilityType: s.stringEnum("Capability type to set.", capabilityTypes),
        settings: capabilitySettingsInput,
      },
      { required: ["bundleIdCapabilityId"] },
    ),
    outputSchema: singleOutput("bundleIdCapability", bundleIdCapabilityResource, "The reconfigured capability."),
  }),
  defineProviderAction(service, {
    name: "disable_bundle_id_capability",
    operationType: "destructive",
    description:
      "Disable a capability on a bundle ID and discard its configuration. Provisioning profiles that relied on the capability become invalid.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput(
      "bundleIdCapabilityId",
      "App Store Connect identifier of the bundle ID capability.",
      "Identifies the capability to disable.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the disabled capability."),
      "Confirmation that the capability was disabled.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_certificates",
    operationType: "read",
    description:
      "List the signing certificates of the team, including their base64 DER content, optionally filtered by type, display name, or serial number.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object("Filters for browsing certificates.", certificateFilterInputs, {
      optional: certificateFilterKeys,
    }),
    outputSchema: certificatePageOutput("A page of certificates."),
  }),
  defineProviderAction(service, {
    name: "get_certificate",
    operationType: "read",
    description: "Read one certificate by its App Store Connect identifier, including its base64 DER content.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("certificateId", certificateIdDescription, "Identifies the certificate to read."),
    outputSchema: singleOutput("certificate", certificateResource, "The requested certificate."),
  }),
  defineProviderAction(service, {
    name: "create_certificate",
    operationType: "write",
    description:
      "Issue a new signing certificate from a certificate signing request (CSR). Apple Pay and pass type certificates also take the merchant ID or pass type ID they belong to. Developer ID certificates for macOS can only be created in the Apple Developer website or Xcode, and Apple caps how many certificates of each type a team may hold.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The certificate signing request to submit.",
      {
        csrContent: nonEmptyString(
          "Certificate signing request in PEM format, as produced by Keychain Access or openssl, including the BEGIN and END lines.",
        ),
        certificateType: s.stringEnum("Kind of certificate to issue.", certificateTypes),
        merchantIdId: nonEmptyString(`${merchantIdIdDescription} Required for Apple Pay merchant certificates.`),
        passTypeIdId: nonEmptyString(`${passTypeIdIdDescription} Required for pass type ID certificates.`),
      },
      { required: ["csrContent", "certificateType"] },
    ),
    outputSchema: singleOutput(
      "certificate",
      certificateResource,
      "The issued certificate, with its base64 DER content.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_certificate",
    operationType: "destructive",
    description:
      "Activate or deactivate a certificate. App Store Connect only exposes the activation state, which applies to Apple Pay payment processing certificates; a deactivated certificate stops being used for payment processing until it is activated again.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The certificate to update and its new activation state.",
      {
        certificateId: nonEmptyString(certificateIdDescription),
        activated: s.boolean("Whether the certificate should be active."),
      },
      { required: ["certificateId", "activated"] },
    ),
    outputSchema: singleOutput("certificate", certificateResource, "The updated certificate."),
  }),
  defineProviderAction(service, {
    name: "revoke_certificate",
    operationType: "destructive",
    description:
      "Revoke a certificate that was lost, stolen, compromised, or is expiring. Revocation is permanent and cannot be undone: apps signed with the certificate can no longer be re-signed with it, every provisioning profile that contains it becomes invalid, and Developer ID or Apple Pay certificates may need Apple to restore service. Issue a replacement with create_certificate first when the certificate is still in use.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("certificateId", certificateIdDescription, "Identifies the certificate to revoke."),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the revoked certificate."),
      "Confirmation that the certificate was revoked.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_profiles",
    operationType: "read",
    description:
      "List the provisioning profiles of the team, including their base64 content, optionally filtered by name, profile type, or validity state.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "Filters for browsing provisioning profiles.",
      {
        name: nonEmptyString("Return only profiles with this exact name."),
        profileType: s.stringEnum("Return only profiles of this type.", profileTypes),
        profileState: s.stringEnum("Return only profiles in this state.", profileStates),
        sort: s.stringEnum("Sort order for the returned profiles.", [
          "name",
          "-name",
          "profileType",
          "-profileType",
          "profileState",
          "-profileState",
          "id",
          "-id",
        ]),
        ...paginationInputs,
      },
      { optional: ["name", "profileType", "profileState", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "profiles",
      profileResource,
      "Provisioning profiles returned for this page.",
      "A page of provisioning profiles.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description: "Read one provisioning profile by its App Store Connect identifier, including its base64 content.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("profileId", profileIdDescription, "Identifies the profile to read."),
    outputSchema: singleOutput("profile", profileResource, "The requested provisioning profile."),
  }),
  defineProviderAction(service, {
    name: "create_profile",
    operationType: "write",
    description:
      "Create a provisioning profile for one bundle ID from the given certificates and, for development and ad hoc profiles, the devices allowed to install the app. App Store and in-house profile types take no devices.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The provisioning profile to create.",
      {
        name: nonEmptyString("Profile name shown in the developer portal and in Xcode."),
        profileType: s.stringEnum("Distribution method and platform of the profile.", profileTypes),
        bundleIdId: nonEmptyString(bundleIdIdDescription),
        certificateIds: s.stringArray("Certificates to embed in the profile.", {
          minItems: 1,
          itemDescription: certificateIdDescription,
        }),
        deviceIds: s.stringArray("Devices the profile allows, for development and ad hoc profile types.", {
          minItems: 1,
          itemDescription: deviceIdDescription,
        }),
      },
      { required: ["name", "profileType", "bundleIdId", "certificateIds"] },
    ),
    outputSchema: singleOutput(
      "profile",
      profileResource,
      "The created provisioning profile, with its base64 content.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_profile",
    operationType: "destructive",
    description:
      "Delete a provisioning profile so it can no longer be downloaded or used to sign new builds. Create a replacement with create_profile when the bundle ID still needs one.",
    requiredScopes: [],
    providerPermissions: [...deleteProvisioningRoles],
    inputSchema: idInput("profileId", profileIdDescription, "Identifies the profile to delete."),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted profile."),
      "Confirmation that the provisioning profile was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_profile_certificates",
    operationType: "read",
    description: "List the certificates embedded in one provisioning profile.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: relatedListInput(
      "profileId",
      profileIdDescription,
      "Identifies the profile whose certificates to list.",
    ),
    outputSchema: certificatePageOutput("A page of certificates embedded in one profile."),
  }),
  defineProviderAction(service, {
    name: "list_profile_devices",
    operationType: "read",
    description: "List the devices a development or ad hoc provisioning profile allows.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: relatedListInput("profileId", profileIdDescription, "Identifies the profile whose devices to list."),
    outputSchema: pageOutput(
      "devices",
      deviceResource,
      "Devices returned for this page.",
      "A page of devices allowed by one profile.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_profile_bundle_id",
    operationType: "read",
    description: "Read the bundle ID a provisioning profile was created for.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("profileId", profileIdDescription, "Identifies the profile whose bundle ID to read."),
    outputSchema: singleOutput("bundleId", bundleIdResource, "The bundle ID of the profile."),
  }),

  defineProviderAction(service, {
    name: "list_devices",
    operationType: "read",
    description: "List the devices registered with the team, optionally filtered by name, platform, UDID, or status.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "Filters for browsing registered devices.",
      {
        name: nonEmptyString("Return only devices with this exact name."),
        platform: s.stringEnum("Return only devices for this platform.", bundleIdPlatforms),
        udid: nonEmptyString("Return only the device with this UDID."),
        status: s.stringEnum("Return only enabled or only disabled devices.", deviceStatuses),
        sort: s.stringEnum("Sort order for the returned devices.", [
          "name",
          "-name",
          "platform",
          "-platform",
          "udid",
          "-udid",
          "status",
          "-status",
          "id",
          "-id",
        ]),
        ...paginationInputs,
      },
      { optional: ["name", "platform", "udid", "status", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "devices",
      deviceResource,
      "Devices returned for this page.",
      "A page of registered devices.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_device",
    operationType: "read",
    description: "Read one registered device by its App Store Connect identifier.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("deviceId", deviceIdDescription, "Identifies the device to read."),
    outputSchema: singleOutput("device", deviceResource, "The requested device."),
  }),
  defineProviderAction(service, {
    name: "register_device",
    operationType: "write",
    description:
      "Register a device with the team so development and ad hoc profiles can include it. Apple limits how many devices a team registers per membership year, and registered devices can only be removed in the Apple Developer website; use update_device to disable one instead.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The device to register.",
      {
        name: nonEmptyString("Name to show for the device in the developer portal."),
        platform: s.stringEnum("Platform the device runs.", bundleIdPlatforms),
        udid: nonEmptyString("Unique device identifier (UDID) of the device, or the provisioning UDID of a Mac."),
      },
      { required: ["name", "platform", "udid"] },
    ),
    outputSchema: singleOutput("device", deviceResource, "The registered device."),
  }),
  defineProviderAction(service, {
    name: "update_device",
    operationType: "destructive",
    description:
      "Rename a registered device or change its status. Provide at least one of name or status. Disabling a device invalidates the development and ad hoc profiles that include it, while the device keeps counting toward the yearly device limit; re-enabling it keeps the same record.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The device to update and the attributes to change.",
      {
        deviceId: nonEmptyString(deviceIdDescription),
        name: nonEmptyString("New name for the device."),
        status: s.stringEnum("New status for the device.", deviceStatuses),
      },
      { required: ["deviceId"] },
    ),
    outputSchema: singleOutput("device", deviceResource, "The updated device."),
  }),

  defineProviderAction(service, {
    name: "list_merchant_ids",
    operationType: "read",
    description: "List the Apple Pay merchant IDs registered with the team, optionally filtered by name or identifier.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "Filters for browsing merchant IDs.",
      {
        name: nonEmptyString("Return only merchant IDs with this exact name."),
        identifier: nonEmptyString(
          "Return only the merchant ID with this exact identifier, such as merchant.com.example.shop.",
        ),
        sort: s.stringEnum("Sort order for the returned merchant IDs.", ["name", "-name", "identifier", "-identifier"]),
        ...paginationInputs,
      },
      { optional: ["name", "identifier", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "merchantIds",
      merchantIdResource,
      "Merchant IDs returned for this page.",
      "A page of merchant IDs.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_merchant_id",
    operationType: "read",
    description: "Read one Apple Pay merchant ID record by its App Store Connect identifier.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("merchantIdId", merchantIdIdDescription, "Identifies the merchant ID to read."),
    outputSchema: singleOutput("merchantId", merchantIdResource, "The requested merchant ID."),
  }),
  defineProviderAction(service, {
    name: "create_merchant_id",
    operationType: "write",
    description:
      "Register an Apple Pay merchant ID with the team. Payment processing and merchant identity certificates are issued for it afterwards with create_certificate.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The merchant ID to register.",
      {
        name: nonEmptyString("Display name for the merchant ID."),
        identifier: nonEmptyString(
          "Merchant identifier in reverse-DNS form starting with merchant., such as merchant.com.example.shop.",
        ),
      },
      { required: ["name", "identifier"] },
    ),
    outputSchema: singleOutput("merchantId", merchantIdResource, "The registered merchant ID."),
  }),
  defineProviderAction(service, {
    name: "update_merchant_id",
    operationType: "write",
    description: "Rename an Apple Pay merchant ID. The name is the only attribute App Store Connect lets you change.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The merchant ID to rename and its new name.",
      {
        merchantIdId: nonEmptyString(merchantIdIdDescription),
        name: nonEmptyString("New display name for the merchant ID."),
      },
      { required: ["merchantIdId", "name"] },
    ),
    outputSchema: singleOutput("merchantId", merchantIdResource, "The renamed merchant ID."),
  }),
  defineProviderAction(service, {
    name: "delete_merchant_id",
    operationType: "destructive",
    description:
      "Delete an Apple Pay merchant ID from the team. Apple Pay transactions and certificates that reference it stop working.",
    requiredScopes: [],
    providerPermissions: [...deleteProvisioningRoles],
    inputSchema: idInput("merchantIdId", merchantIdIdDescription, "Identifies the merchant ID to delete."),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted merchant ID."),
      "Confirmation that the merchant ID was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_merchant_id_certificates",
    operationType: "read",
    description:
      "List the Apple Pay certificates issued for one merchant ID, optionally filtered by type, display name, or serial number.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "Identifies the merchant ID and filters its certificates.",
      { merchantIdId: nonEmptyString(merchantIdIdDescription), ...certificateFilterInputs },
      { required: ["merchantIdId"] },
    ),
    outputSchema: certificatePageOutput("A page of certificates issued for one merchant ID."),
  }),

  defineProviderAction(service, {
    name: "list_pass_type_ids",
    operationType: "read",
    description: "List the Wallet pass type IDs registered with the team, optionally filtered by name or identifier.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "Filters for browsing pass type IDs.",
      {
        name: nonEmptyString("Return only pass type IDs with this exact name."),
        identifier: nonEmptyString(
          "Return only the pass type ID with this exact identifier, such as pass.com.example.ticket.",
        ),
        sort: s.stringEnum("Sort order for the returned pass type IDs.", [
          "name",
          "-name",
          "identifier",
          "-identifier",
          "id",
          "-id",
        ]),
        ...paginationInputs,
      },
      { optional: ["name", "identifier", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "passTypeIds",
      passTypeIdResource,
      "Pass type IDs returned for this page.",
      "A page of pass type IDs.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_pass_type_id",
    operationType: "read",
    description: "Read one Wallet pass type ID record by its App Store Connect identifier.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: idInput("passTypeIdId", passTypeIdIdDescription, "Identifies the pass type ID to read."),
    outputSchema: singleOutput("passTypeId", passTypeIdResource, "The requested pass type ID."),
  }),
  defineProviderAction(service, {
    name: "create_pass_type_id",
    operationType: "write",
    description:
      "Register a Wallet pass type ID with the team. Pass signing certificates are issued for it afterwards with create_certificate.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The pass type ID to register.",
      {
        name: nonEmptyString("Display name for the pass type ID."),
        identifier: nonEmptyString(
          "Pass type identifier in reverse-DNS form starting with pass., such as pass.com.example.ticket.",
        ),
      },
      { required: ["name", "identifier"] },
    ),
    outputSchema: singleOutput("passTypeId", passTypeIdResource, "The registered pass type ID."),
  }),
  defineProviderAction(service, {
    name: "update_pass_type_id",
    operationType: "write",
    description: "Rename a Wallet pass type ID. The name is the only attribute App Store Connect lets you change.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "The pass type ID to rename and its new name.",
      {
        passTypeIdId: nonEmptyString(passTypeIdIdDescription),
        name: nonEmptyString("New display name for the pass type ID."),
      },
      { required: ["passTypeIdId", "name"] },
    ),
    outputSchema: singleOutput("passTypeId", passTypeIdResource, "The renamed pass type ID."),
  }),
  defineProviderAction(service, {
    name: "delete_pass_type_id",
    operationType: "destructive",
    description:
      "Delete a Wallet pass type ID from the team. Passes signed for it can no longer be updated and its certificates stop working.",
    requiredScopes: [],
    providerPermissions: [...deleteProvisioningRoles],
    inputSchema: idInput("passTypeIdId", passTypeIdIdDescription, "Identifies the pass type ID to delete."),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted pass type ID."),
      "Confirmation that the pass type ID was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_pass_type_id_certificates",
    operationType: "read",
    description:
      "List the pass signing certificates issued for one pass type ID, optionally filtered by type, display name, or serial number.",
    requiredScopes: [],
    providerPermissions: [...manageProvisioningRoles],
    inputSchema: s.object(
      "Identifies the pass type ID and filters its certificates.",
      { passTypeIdId: nonEmptyString(passTypeIdIdDescription), ...certificateFilterInputs },
      { required: ["passTypeIdId"] },
    ),
    outputSchema: certificatePageOutput("A page of certificates issued for one pass type ID."),
  }),
];
