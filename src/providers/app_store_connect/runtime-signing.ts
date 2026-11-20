import type { AppStoreConnectContext, AppStoreConnectHandlers } from "./runtime-helpers.ts";

import { optionalBoolean, pickOptionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  getResource,
  listPage,
  readAppStoreConnectId,
  readIdentifierList,
  readOptionalAppStoreConnectId,
  readOptionalResource,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  toOptionalOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const bundleIdLabel = "App Store Connect bundle ID";
const capabilityLabel = "App Store Connect bundle ID capability";
const certificateLabel = "App Store Connect certificate";
const profileLabel = "App Store Connect provisioning profile";
const deviceLabel = "App Store Connect device";
const merchantIdLabel = "App Store Connect merchant ID";
const passTypeIdLabel = "App Store Connect pass type ID";

export const appStoreConnectSigningHandlers: AppStoreConnectHandlers = {
  async list_bundle_ids(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/bundleIds",
      label: bundleIdLabel,
      query: {
        "filter[identifier]": pickOptionalString(input, "identifier"),
        "filter[name]": pickOptionalString(input, "name"),
        "filter[platform]": pickOptionalString(input, "platform"),
        "filter[seedId]": pickOptionalString(input, "seedId"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { bundleIds: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_bundle_id(input, context) {
    return {
      bundleId: await getResource(
        context,
        resourcePath("/v1/bundleIds", readAppStoreConnectId(input.bundleIdId, "bundleIdId")),
        bundleIdLabel,
      ),
    };
  },

  async create_bundle_id(input, context) {
    const bundleId = await createResource(context, {
      path: "/v1/bundleIds",
      type: "bundleIds",
      label: bundleIdLabel,
      attributes: {
        identifier: requiredInputString(input.identifier, "identifier"),
        name: requiredInputString(input.name, "name"),
        platform: requiredInputString(input.platform, "platform"),
        seedId: pickOptionalString(input, "seedId"),
      },
    });
    return { bundleId };
  },

  async update_bundle_id(input, context) {
    const bundleIdId = readAppStoreConnectId(input.bundleIdId, "bundleIdId");
    const bundleId = await updateResource(context, {
      path: resourcePath("/v1/bundleIds", bundleIdId),
      type: "bundleIds",
      id: bundleIdId,
      label: bundleIdLabel,
      attributes: { name: requiredInputString(input.name, "name") },
    });
    return { bundleId };
  },

  async delete_bundle_id(input, context) {
    const bundleIdId = readAppStoreConnectId(input.bundleIdId, "bundleIdId");
    await deleteResource(
      context,
      resourcePath("/v1/bundleIds", bundleIdId),
      "Deleting the App Store Connect bundle ID",
    );
    return { id: bundleIdId, deleted: true };
  },

  async list_bundle_id_profiles(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/bundleIds", readAppStoreConnectId(input.bundleIdId, "bundleIdId"), "profiles"),
      label: profileLabel,
    });
    return { profiles: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_bundle_id_app(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/bundleIds", readAppStoreConnectId(input.bundleIdId, "bundleIdId"), "app"),
    });
    return { app: readOptionalResource(payload, "App Store Connect app") };
  },

  async list_bundle_id_capabilities(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/bundleIds",
        readAppStoreConnectId(input.bundleIdId, "bundleIdId"),
        "bundleIdCapabilities",
      ),
      label: capabilityLabel,
    });
    return { bundleIdCapabilities: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async enable_bundle_id_capability(input, context) {
    const bundleIdCapability = await createResource(context, {
      path: "/v1/bundleIdCapabilities",
      type: "bundleIdCapabilities",
      label: capabilityLabel,
      attributes: {
        capabilityType: requiredInputString(input.capabilityType, "capabilityType"),
        settings: readCapabilitySettings(input.settings),
      },
      relationships: {
        bundleId: toOneLinkage("bundleIds", readAppStoreConnectId(input.bundleIdId, "bundleIdId")),
      },
    });
    return { bundleIdCapability };
  },

  async update_bundle_id_capability(input, context) {
    const bundleIdCapabilityId = readAppStoreConnectId(input.bundleIdCapabilityId, "bundleIdCapabilityId");
    const attributes = {
      capabilityType: pickOptionalString(input, "capabilityType"),
      settings: readCapabilitySettings(input.settings),
    };
    requireAnyAttribute(attributes, "Provide at least one of capabilityType or settings");
    const bundleIdCapability = await updateResource(context, {
      path: resourcePath("/v1/bundleIdCapabilities", bundleIdCapabilityId),
      type: "bundleIdCapabilities",
      id: bundleIdCapabilityId,
      label: capabilityLabel,
      attributes,
    });
    return { bundleIdCapability };
  },

  async disable_bundle_id_capability(input, context) {
    const bundleIdCapabilityId = readAppStoreConnectId(input.bundleIdCapabilityId, "bundleIdCapabilityId");
    await deleteResource(
      context,
      resourcePath("/v1/bundleIdCapabilities", bundleIdCapabilityId),
      "Disabling the App Store Connect bundle ID capability",
    );
    return { id: bundleIdCapabilityId, deleted: true };
  },

  async list_certificates(input, context) {
    return listCertificates(context, input, "/v1/certificates");
  },

  async get_certificate(input, context) {
    return {
      certificate: await getResource(
        context,
        resourcePath("/v1/certificates", readAppStoreConnectId(input.certificateId, "certificateId")),
        certificateLabel,
      ),
    };
  },

  async create_certificate(input, context) {
    const merchantId = toOptionalOneLinkage(
      "merchantIds",
      readOptionalAppStoreConnectId(input.merchantIdId, "merchantIdId"),
    );
    const passTypeId = toOptionalOneLinkage(
      "passTypeIds",
      readOptionalAppStoreConnectId(input.passTypeIdId, "passTypeIdId"),
    );
    const certificate = await createResource(context, {
      path: "/v1/certificates",
      type: "certificates",
      label: certificateLabel,
      attributes: {
        csrContent: requiredInputString(input.csrContent, "csrContent"),
        certificateType: requiredInputString(input.certificateType, "certificateType"),
      },
      relationships: merchantId || passTypeId ? { merchantId, passTypeId } : undefined,
    });
    return { certificate };
  },

  async update_certificate(input, context) {
    const certificateId = readAppStoreConnectId(input.certificateId, "certificateId");
    const activated = optionalBoolean(input.activated);
    if (activated === undefined) {
      throw new ProviderRequestError(400, "activated is required");
    }
    const certificate = await updateResource(context, {
      path: resourcePath("/v1/certificates", certificateId),
      type: "certificates",
      id: certificateId,
      label: certificateLabel,
      attributes: { activated },
    });
    return { certificate };
  },

  async revoke_certificate(input, context) {
    const certificateId = readAppStoreConnectId(input.certificateId, "certificateId");
    await deleteResource(
      context,
      resourcePath("/v1/certificates", certificateId),
      "Revoking the App Store Connect certificate",
    );
    return { id: certificateId, deleted: true };
  },

  async list_profiles(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/profiles",
      label: profileLabel,
      query: {
        "filter[name]": pickOptionalString(input, "name"),
        "filter[profileType]": pickOptionalString(input, "profileType"),
        "filter[profileState]": pickOptionalString(input, "profileState"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { profiles: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_profile(input, context) {
    return {
      profile: await getResource(
        context,
        resourcePath("/v1/profiles", readAppStoreConnectId(input.profileId, "profileId")),
        profileLabel,
      ),
    };
  },

  async create_profile(input, context) {
    const deviceIds = readStringList(input.deviceIds);
    const profile = await createResource(context, {
      path: "/v1/profiles",
      type: "profiles",
      label: profileLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        profileType: requiredInputString(input.profileType, "profileType"),
      },
      relationships: {
        bundleId: toOneLinkage("bundleIds", readAppStoreConnectId(input.bundleIdId, "bundleIdId")),
        certificates: toManyLinkage("certificates", readIdentifierList(input.certificateIds, "certificateIds")),
        devices: deviceIds?.length ? toManyLinkage("devices", readIdentifierList(deviceIds, "deviceIds")) : undefined,
      },
    });
    return { profile };
  },

  async delete_profile(input, context) {
    const profileId = readAppStoreConnectId(input.profileId, "profileId");
    await deleteResource(
      context,
      resourcePath("/v1/profiles", profileId),
      "Deleting the App Store Connect provisioning profile",
    );
    return { id: profileId, deleted: true };
  },

  async list_profile_certificates(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/profiles", readAppStoreConnectId(input.profileId, "profileId"), "certificates"),
      label: certificateLabel,
    });
    return { certificates: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_profile_devices(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/profiles", readAppStoreConnectId(input.profileId, "profileId"), "devices"),
      label: deviceLabel,
    });
    return { devices: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_profile_bundle_id(input, context) {
    return {
      bundleId: await getResource(
        context,
        resourcePath("/v1/profiles", readAppStoreConnectId(input.profileId, "profileId"), "bundleId"),
        bundleIdLabel,
      ),
    };
  },

  async list_devices(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/devices",
      label: deviceLabel,
      query: {
        "filter[name]": pickOptionalString(input, "name"),
        "filter[platform]": pickOptionalString(input, "platform"),
        "filter[udid]": pickOptionalString(input, "udid"),
        "filter[status]": pickOptionalString(input, "status"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { devices: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_device(input, context) {
    return {
      device: await getResource(
        context,
        resourcePath("/v1/devices", readAppStoreConnectId(input.deviceId, "deviceId")),
        deviceLabel,
      ),
    };
  },

  async register_device(input, context) {
    const device = await createResource(context, {
      path: "/v1/devices",
      type: "devices",
      label: deviceLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        platform: requiredInputString(input.platform, "platform"),
        udid: requiredInputString(input.udid, "udid"),
      },
    });
    return { device };
  },

  async update_device(input, context) {
    const deviceId = readAppStoreConnectId(input.deviceId, "deviceId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      status: pickOptionalString(input, "status"),
    };
    requireAnyAttribute(attributes, "Provide at least one of name or status");
    const device = await updateResource(context, {
      path: resourcePath("/v1/devices", deviceId),
      type: "devices",
      id: deviceId,
      label: deviceLabel,
      attributes,
    });
    return { device };
  },

  async list_merchant_ids(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/merchantIds",
      label: merchantIdLabel,
      query: {
        "filter[name]": pickOptionalString(input, "name"),
        "filter[identifier]": pickOptionalString(input, "identifier"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { merchantIds: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_merchant_id(input, context) {
    return {
      merchantId: await getResource(
        context,
        resourcePath("/v1/merchantIds", readAppStoreConnectId(input.merchantIdId, "merchantIdId")),
        merchantIdLabel,
      ),
    };
  },

  async create_merchant_id(input, context) {
    const merchantId = await createResource(context, {
      path: "/v1/merchantIds",
      type: "merchantIds",
      label: merchantIdLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        identifier: requiredInputString(input.identifier, "identifier"),
      },
    });
    return { merchantId };
  },

  async update_merchant_id(input, context) {
    const merchantIdId = readAppStoreConnectId(input.merchantIdId, "merchantIdId");
    const merchantId = await updateResource(context, {
      path: resourcePath("/v1/merchantIds", merchantIdId),
      type: "merchantIds",
      id: merchantIdId,
      label: merchantIdLabel,
      attributes: { name: requiredInputString(input.name, "name") },
    });
    return { merchantId };
  },

  async delete_merchant_id(input, context) {
    const merchantIdId = readAppStoreConnectId(input.merchantIdId, "merchantIdId");
    await deleteResource(
      context,
      resourcePath("/v1/merchantIds", merchantIdId),
      "Deleting the App Store Connect merchant ID",
    );
    return { id: merchantIdId, deleted: true };
  },

  async list_merchant_id_certificates(input, context) {
    return listCertificates(
      context,
      input,
      resourcePath("/v1/merchantIds", readAppStoreConnectId(input.merchantIdId, "merchantIdId"), "certificates"),
    );
  },

  async list_pass_type_ids(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/passTypeIds",
      label: passTypeIdLabel,
      query: {
        "filter[name]": pickOptionalString(input, "name"),
        "filter[identifier]": pickOptionalString(input, "identifier"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { passTypeIds: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_pass_type_id(input, context) {
    return {
      passTypeId: await getResource(
        context,
        resourcePath("/v1/passTypeIds", readAppStoreConnectId(input.passTypeIdId, "passTypeIdId")),
        passTypeIdLabel,
      ),
    };
  },

  async create_pass_type_id(input, context) {
    const passTypeId = await createResource(context, {
      path: "/v1/passTypeIds",
      type: "passTypeIds",
      label: passTypeIdLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        identifier: requiredInputString(input.identifier, "identifier"),
      },
    });
    return { passTypeId };
  },

  async update_pass_type_id(input, context) {
    const passTypeIdId = readAppStoreConnectId(input.passTypeIdId, "passTypeIdId");
    const passTypeId = await updateResource(context, {
      path: resourcePath("/v1/passTypeIds", passTypeIdId),
      type: "passTypeIds",
      id: passTypeIdId,
      label: passTypeIdLabel,
      attributes: { name: requiredInputString(input.name, "name") },
    });
    return { passTypeId };
  },

  async delete_pass_type_id(input, context) {
    const passTypeIdId = readAppStoreConnectId(input.passTypeIdId, "passTypeIdId");
    await deleteResource(
      context,
      resourcePath("/v1/passTypeIds", passTypeIdId),
      "Deleting the App Store Connect pass type ID",
    );
    return { id: passTypeIdId, deleted: true };
  },

  async list_pass_type_id_certificates(input, context) {
    return listCertificates(
      context,
      input,
      resourcePath("/v1/passTypeIds", readAppStoreConnectId(input.passTypeIdId, "passTypeIdId"), "certificates"),
    );
  },
};

async function listCertificates(context: AppStoreConnectContext, input: Record<string, unknown>, path: string) {
  const page = await listPage(context, input, {
    path,
    label: certificateLabel,
    query: {
      "filter[displayName]": pickOptionalString(input, "displayName"),
      "filter[certificateType]": pickOptionalString(input, "certificateType"),
      "filter[serialNumber]": pickOptionalString(input, "serialNumber"),
      "sort": pickOptionalString(input, "sort"),
    },
  });
  return { certificates: page.items, nextCursor: page.nextCursor, total: page.total };
}

function readCapabilitySettings(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
