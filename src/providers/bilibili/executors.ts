import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";
import type { ProviderActionHandlerSubset, ProviderActionHandlers } from "../provider-executors.ts";
import type { BilibiliActionContext, BilibiliActionHandler } from "./runtime.ts";

import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import { combineProviderActionHandlers, defineProviderExecutors } from "../provider-executors.ts";
import { readTransitFileInput } from "../provider-files.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputNumber,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { bilibiliArticleActionHandlers } from "./articles.ts";
import {
  assertAnyInputField,
  bilibiliApiRequest,
  bilibiliOAuthRefreshTokenUrl,
  createBilibiliContext,
  readBilibiliReplyIncrement,
  readBilibiliSigningMaterial,
  requestBilibiliOAuthToken,
} from "./runtime.ts";
import { uploadBilibiliCover, uploadBilibiliVideo } from "./upload.ts";

const service = "bilibili";

const bilibiliAccountActionHandlers: ProviderActionHandlerSubset<"bilibili", BilibiliActionHandler> = {
  async get_user_info(_input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, { path: "/user/account/info", label: "Bilibili user info" }),
      "Bilibili user info",
    );
    return compactObject({
      name: optionalString(data.name),
      face: optionalString(data.face),
      openid: optionalString(data.openid),
    });
  },

  async get_user_union_id(_input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        method: "POST",
        path: "/user/account/union_id",
        label: "Bilibili user union id",
      }),
      "Bilibili user union id",
    );
    return compactObject({ unionId: optionalString(data.union_id) });
  },

  async get_user_scopes(_input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, { path: "/user/account/scopes", label: "Bilibili user scopes" }),
      "Bilibili user scopes",
    );
    return compactObject({
      openid: optionalString(data.openid),
      scopes: optionalStringArray(data.scopes) ?? [],
    });
  },

  async get_user_stat(_input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, { path: "/data/user/stat", label: "Bilibili user stat" }),
      "Bilibili user stat",
    );
    return compactObject({
      following: optionalNumber(data.following),
      follower: optionalNumber(data.follower),
      arcPassedTotal: optionalNumber(data.arc_passed_total),
    });
  },

  async list_archive_types(_input, context) {
    const data = await bilibiliApiRequest(context, { path: "/archive/type/list", label: "Bilibili archive type list" });
    return { types: looseArray(data) };
  },

  async upload_video(input, context) {
    const title = requiredInputString(input.title, "title");
    const tid = requiredInputNumber(input.tid, "tid");
    const tag = requiredInputString(input.tag, "tag");
    const copyright = requiredInputNumber(input.copyright, "copyright");
    const source = optionalString(input.source);
    if (copyright === 2 && !source) {
      throw providerInputError("source is required when copyright is 2 (reposted content).");
    }

    const video = await readTransitFileInput(input.file, context);
    const coverInput = input.cover === undefined ? undefined : await readTransitFileInput(input.cover, context);
    const coverUrl = coverInput ? await uploadBilibiliCover(context, coverInput.file) : undefined;
    const uploadToken = await uploadBilibiliVideo(context, video.file);

    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        method: "POST",
        path: "/archive/add-by-utoken",
        query: { upload_token: uploadToken },
        body: compactObject({
          title,
          tid,
          tag,
          copyright,
          cover: coverUrl,
          desc: optionalString(input.desc),
          no_reprint: optionalBoolean(input.noReprint) === true ? 1 : 0,
          source,
        }),
        label: "Bilibili archive submit",
      }),
      "Bilibili archive submit",
    );
    return compactObject({
      resourceId: requiredString(data.resource_id, "resource_id", providerResponseError),
      coverUrl,
    });
  },

  async list_archives(input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/archive/viewlist",
        query: {
          pn: String(optionalNumber(input.pn) ?? 1),
          ps: String(optionalNumber(input.ps) ?? 20),
          status: optionalString(input.status),
        },
        label: "Bilibili archive list",
      }),
      "Bilibili archive list",
    );
    const page = optionalRecord(data.page);
    return {
      archives: looseArray(data.list).map(normalizeBilibiliArchive),
      page: compactObject({
        pn: optionalNumber(page?.pn),
        ps: optionalNumber(page?.ps),
        total: optionalNumber(page?.total),
      }),
    };
  },

  async get_archive(input, context) {
    const resourceId = requiredInputString(input.resourceId, "resourceId");
    const data = await bilibiliApiRequest(context, {
      path: "/archive/view",
      query: { resource_id: resourceId },
      label: "Bilibili archive view",
    });
    return normalizeBilibiliArchive(data);
  },

  async edit_archive(input, context) {
    const resourceId = requiredInputString(input.resourceId, "resourceId");
    assertAnyInputField(input, ["title", "tid", "coverUrl", "desc", "noReprint"]);
    // Bilibili replaces every descriptive field on edit, so unchanged fields
    // are refilled from the current archive before submitting.
    const current = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/archive/view",
        query: { resource_id: resourceId },
        label: "Bilibili archive view",
      }),
      "Bilibili archive view",
    );
    const title = optionalString(input.title) ?? optionalString(current.title);
    const tid = optionalNumber(input.tid) ?? optionalNumber(current.tid);
    if (!title || tid === undefined) {
      throw providerInputError("title and tid are required when the current archive does not provide them.");
    }
    const noReprint = optionalBoolean(input.noReprint);
    await bilibiliApiRequest(context, {
      method: "POST",
      path: "/archive/edit",
      body: compactObject({
        resource_id: resourceId,
        title,
        tid,
        cover: optionalString(input.coverUrl) ?? optionalString(current.cover),
        desc: optionalString(input.desc) ?? optionalString(current.desc),
        no_reprint: noReprint === undefined ? optionalNumber(current.no_reprint) : noReprint ? 1 : 0,
      }),
      label: "Bilibili archive edit",
    });
    return { resourceId };
  },

  async delete_archive(input, context) {
    const resourceId = requiredInputString(input.resourceId, "resourceId");
    await bilibiliApiRequest(context, {
      method: "POST",
      path: "/archive/delete",
      body: { resource_id: resourceId },
      label: "Bilibili archive delete",
    });
    return { resourceId, deleted: true };
  },

  async get_archive_stat(input, context) {
    const resourceId = requiredInputString(input.resourceId, "resourceId");
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/data/arc/stat",
        query: { resource_id: resourceId },
        label: "Bilibili archive stat",
      }),
      "Bilibili archive stat",
    );
    return compactObject({
      title: optionalString(data.title),
      ptime: optionalNumber(data.ptime),
      view: optionalNumber(data.view),
      danmaku: optionalNumber(data.danmaku),
      reply: optionalNumber(data.reply),
      favorite: optionalNumber(data.favorite),
      coin: optionalNumber(data.coin),
      share: optionalNumber(data.share),
      like: optionalNumber(data.like),
    });
  },

  async get_archive_inc_stats(_input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, { path: "/data/arc/inc-stats", label: "Bilibili archive incremental stats" }),
      "Bilibili archive incremental stats",
    );
    return compactObject({
      incClick: optionalNumber(data.inc_click),
      incDanmaku: optionalNumber(data.inc_dm),
      incReply: readBilibiliReplyIncrement(data),
      incFavorite: optionalNumber(data.inc_fav),
      incCoin: optionalNumber(data.inc_coin),
      incShare: optionalNumber(data.inc_share),
      incLike: optionalNumber(data.inc_like),
      incElec: optionalNumber(data.inc_elec),
    });
  },
};

function normalizeBilibiliArchive(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const review = optionalRecord(record.addit_info);
  const video = optionalRecord(record.video_info);
  return compactObject({
    resourceId: optionalString(record.resource_id),
    title: optionalString(record.title),
    cover: optionalString(record.cover),
    tid: optionalNumber(record.tid),
    tag: optionalString(record.tag),
    desc: optionalString(record.desc),
    copyright: optionalNumber(record.copyright),
    noReprint: optionalNumber(record.no_reprint),
    state: optionalNumber(review?.state),
    stateDesc: optionalString(review?.state_desc),
    rejectReason: optionalString(review?.reject_reason),
    ctime: optionalNumber(record.ctime),
    ptime: optionalNumber(record.ptime),
    video:
      video === undefined
        ? undefined
        : compactObject({
            cid: optionalNumber(video.cid),
            filename: optionalString(video.filename),
            duration: optionalNumber(video.duration),
            shareUrl: optionalString(video.share_url),
            iframeUrl: optionalString(video.iframe_url),
          }),
  });
}

export const bilibiliActionHandlers: ProviderActionHandlers<"bilibili", BilibiliActionHandler> =
  combineProviderActionHandlers(service, bilibiliAccountActionHandlers, bilibiliArticleActionHandlers);

export const executors: ProviderExecutors = defineProviderExecutors<BilibiliActionContext>({
  service,
  handlers: bilibiliActionHandlers,
  // Both API hosts are hardcoded literals: member.bilibili.com and openupos.bilivideo.com.
  skipDnsValidation: true,
  createContext: createBilibiliContext,
});

export const oauth: ProviderOAuthRuntime = {
  async exchangeCode(input) {
    return requestBilibiliOAuthToken({
      url: input.tokenUrl,
      fields: {
        client_id: input.clientConfig.clientId,
        client_secret: input.clientConfig.clientSecret,
        grant_type: "authorization_code",
        code: input.code,
      },
      fetcher: input.fetcher,
      signal: input.signal,
      createError: input.createError,
    });
  },
  async refreshAccessToken(input) {
    return requestBilibiliOAuthToken({
      url: bilibiliOAuthRefreshTokenUrl,
      fields: {
        client_id: input.clientConfig.clientId,
        client_secret: input.clientConfig.clientSecret,
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
      },
      fetcher: input.fetcher,
      createError: input.createError,
    });
  },
};

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const signing = readBilibiliSigningMaterial(input.metadata);
    if (!signing) {
      return;
    }
    const data = requiredResponseRecord(
      await bilibiliApiRequest(
        { accessToken: input.accessToken, clientId: signing.clientId, appSecret: signing.appSecret, fetcher, signal },
        { path: "/user/account/info", label: "Bilibili credential validation" },
      ),
      "Bilibili credential validation",
    );
    const openid = optionalString(data.openid);
    return {
      profile: {
        accountId: openid ?? "bilibili:oauth2",
        displayName: optionalString(data.name) ?? openid ?? "Bilibili OAuth Credential",
        grantedScopes: optionalStringArray(input.metadata.scopes) ?? [],
      },
    };
  },
};
