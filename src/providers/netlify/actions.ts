import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "netlify";

export type NetlifyActionName =
  | "get_current_user"
  | "list_accounts"
  | "get_account"
  | "list_sites"
  | "get_site"
  | "list_site_deploys"
  | "get_deploy"
  | "cancel_deploy"
  | "lock_deploy"
  | "unlock_deploy"
  | "create_site_build"
  | "create_site_deploy_from_zip_url"
  | "upload_deploy_file_from_url"
  | "upload_deploy_function_from_zip_url"
  | "get_build"
  | "notify_build_start"
  | "list_site_forms"
  | "list_submissions"
  | "delete_submission";

interface NetlifyActionSource {
  name: NetlifyActionName;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const emptyInputSchema = s.object({}, { description: "Netlify action input." });

const paginationFields = {
  page: s.integer({ minimum: 1, description: "The page of results to return." }),
  perPage: s.integer({ minimum: 1, description: "How many results to return per page." }),
};

const siteIdField = s.string({ minLength: 1, description: "The Netlify site ID or site name." });
const accountIdField = s.string({ minLength: 1, description: "The Netlify account ID." });
const deployIdField = s.string({ minLength: 1, description: "The Netlify deploy ID." });
const buildIdField = s.string({ minLength: 1, description: "The Netlify build ID." });
const formIdField = s.string({ minLength: 1, description: "The Netlify form ID." });

const listSitesInputSchema = s.object(
  {
    ...paginationFields,
    name: s.string({ minLength: 1, description: "Only return sites whose name matches this value." }),
    filter: s.stringEnum(["all", "owner", "guest"], { description: "Which Netlify sites to include in the result." }),
  },
  { description: "Input parameters for listing Netlify sites." },
);

const siteInputSchema = s.object(
  {
    siteId: siteIdField,
  },
  { required: ["siteId"], description: "Input parameters for a Netlify site request." },
);

const accountInputSchema = s.object(
  {
    accountId: accountIdField,
  },
  { required: ["accountId"], description: "Input parameters for a Netlify account request." },
);

const deployInputSchema = s.object(
  {
    deployId: deployIdField,
  },
  { required: ["deployId"], description: "Input parameters for a Netlify deploy request." },
);

const listSiteDeploysInputSchema = s.object(
  {
    siteId: siteIdField,
    ...paginationFields,
  },
  { required: ["siteId"], description: "Input parameters for listing Netlify deploys for a site." },
);

const createSiteBuildInputSchema = s.object(
  {
    siteId: siteIdField,
    branch: s.string({ minLength: 1, description: "The branch to build. Omit this for a production deploy." }),
    clearCache: s.boolean({ description: "Whether Netlify should clear the build cache before building." }),
    image: s.string({ minLength: 1, description: "The Netlify build image tag to use." }),
    templateId: s.string({ minLength: 1, description: "The Netlify build template ID to use." }),
    title: s.string({ minLength: 1, description: "The title to attach to the build." }),
  },
  { required: ["siteId"], description: "Input parameters for starting a Netlify site build." },
);

const createSiteDeployFromZipUrlInputSchema = s.object(
  {
    siteId: siteIdField,
    zipUrl: s.url(
      "The public HTTP or HTTPS URL of a zip file containing the site files. For local files, upload the file with oo file upload and pass its downloadUrl.",
    ),
    title: s.string({ minLength: 1, description: "The title to attach to the deploy." }),
  },
  {
    required: ["siteId", "zipUrl"],
    description: "Input parameters for creating a Netlify deploy from a zip file URL.",
  },
);

const uploadDeployFileFromUrlInputSchema = s.object(
  {
    deployId: deployIdField,
    path: s.string({ minLength: 1, description: "The deploy-relative file path to upload, such as index.html." }),
    fileUrl: s.url(
      "The public HTTP or HTTPS URL whose bytes should be uploaded. For local files, upload the file with oo file upload and pass its downloadUrl.",
    ),
  },
  {
    required: ["deployId", "path", "fileUrl"],
    description: "Input parameters for uploading one file into an existing Netlify deploy from a file URL.",
  },
);

const uploadDeployFunctionFromZipUrlInputSchema = s.object(
  {
    deployId: deployIdField,
    name: s.string({ minLength: 1, description: "The Netlify function name." }),
    zipUrl: s.url(
      "The public HTTP or HTTPS URL of the zipped function bundle. For local files, upload the file with oo file upload and pass its downloadUrl.",
    ),
    runtime: s.string({ minLength: 1, description: "The Netlify function runtime." }),
    invocationMode: s.string({ minLength: 1, description: "The Netlify function invocation mode." }),
    timeout: s.integer({ minimum: 1, description: "The function timeout in seconds." }),
    retryCount: s.integer({ minimum: 0, description: "The Netlify retry count header value to send." }),
  },
  {
    required: ["deployId", "name", "zipUrl"],
    description: "Input parameters for uploading one Netlify function bundle from a zip file URL.",
  },
);

const buildInputSchema = s.object(
  {
    buildId: buildIdField,
  },
  { required: ["buildId"], description: "Input parameters for retrieving a Netlify build." },
);

const listSiteFormsInputSchema = s.object(
  {
    siteId: siteIdField,
  },
  { required: ["siteId"], description: "Input parameters for listing Netlify forms for a site." },
);

const listSubmissionsInputSchema = s.object(
  {
    siteId: siteIdField,
    formId: formIdField,
    ...paginationFields,
  },
  { description: "Input parameters for listing Netlify form submissions." },
);

const netlifyUserSchema = s.looseObject({
  id: s.nullable(s.string({ description: "The Netlify user ID, or null when Netlify does not return one." })),
  uid: s.nullable(s.string({ description: "The Netlify user UID, or null when Netlify does not return one." })),
  full_name: s.nullable(s.string({ description: "The user's full name, or null when it is not set." })),
  avatar_url: s.nullable(s.string({ description: "The user's avatar URL, or null when it is not set." })),
  email: s.nullable(s.string({ description: "The user's email address, or null when it is not set." })),
  site_count: s.nullable(
    s.integer({ description: "The number of sites associated with the user, or null when unknown." }),
  ),
  created_at: s.nullable(s.string({ description: "The timestamp when the user was created, or null." })),
  last_login: s.nullable(s.string({ description: "The timestamp when the user last logged in, or null." })),
  login_providers: s.nullable(
    s.array(s.string({ description: "A provider." }), {
      description: "The login providers connected to the user, or null.",
    }),
  ),
});

const netlifyAccountSchema = s.looseObject({
  id: s.string({ description: "The Netlify account ID." }),
  name: s.string({ description: "The Netlify account display name." }),
  slug: s.string({ description: "The Netlify account slug." }),
  type: s.string({ description: "The Netlify account type." }),
  type_name: s.string({ description: "The human-readable Netlify account type name." }),
  billing_email: s.string({ description: "The billing email address for the account." }),
  owner_ids: s.array(s.string({ description: "A user ID." }), {
    description: "The Netlify user IDs that own the account.",
  }),
  created_at: s.string({ description: "The timestamp when the account was created." }),
  updated_at: s.string({ description: "The timestamp when the account was last updated." }),
});

const netlifyDeploySchema = s.looseObject({
  id: s.string({ description: "The Netlify deploy ID." }),
  site_id: s.string({ description: "The Netlify site ID for this deploy." }),
  user_id: s.string({ description: "The Netlify user ID that created the deploy." }),
  build_id: s.string({ description: "The Netlify build ID associated with the deploy." }),
  state: s.string({ description: "The deploy state reported by Netlify." }),
  name: s.string({ description: "The site name for this deploy." }),
  url: s.string({ description: "The primary URL for this deploy." }),
  ssl_url: s.string({ description: "The HTTPS URL for this deploy." }),
  admin_url: s.string({ description: "The Netlify admin URL for this deploy." }),
  deploy_url: s.string({ description: "The unique deploy URL." }),
  deploy_ssl_url: s.string({ description: "The unique HTTPS deploy URL." }),
  screenshot_url: s.string({ description: "The screenshot URL for this deploy." }),
  draft: s.boolean({ description: "Whether this deploy is a draft deploy." }),
  branch: s.string({ description: "The Git branch used for this deploy." }),
  commit_ref: s.string({ description: "The commit reference used for this deploy." }),
  commit_url: s.string({ description: "The commit URL used for this deploy." }),
  skipped: s.boolean({ description: "Whether Netlify skipped this deploy." }),
  created_at: s.string({ description: "The timestamp when the deploy was created." }),
  updated_at: s.string({ description: "The timestamp when the deploy was last updated." }),
  published_at: s.string({ description: "The timestamp when the deploy was published." }),
  title: s.string({ description: "The deploy title." }),
  context: s.string({ description: "The deploy context such as production or deploy-preview." }),
  locked: s.boolean({ description: "Whether the deploy is locked." }),
  review_url: s.string({ description: "The deploy review URL." }),
  framework: s.string({ description: "The framework detected for this deploy." }),
  error_message: s.string({ description: "The deploy error message when Netlify returns one." }),
});

const netlifySiteSchema = s.looseObject({
  id: s.string({ description: "The Netlify site ID." }),
  state: s.string({ description: "The site state reported by Netlify." }),
  plan: s.string({ description: "The site plan." }),
  name: s.string({ description: "The Netlify site name." }),
  custom_domain: s.string({ description: "The custom domain configured for the site." }),
  domain_aliases: s.array(s.string({ description: "A domain." }), {
    description: "The domain aliases configured for the site.",
  }),
  url: s.string({ description: "The primary site URL." }),
  ssl_url: s.string({ description: "The HTTPS site URL." }),
  admin_url: s.string({ description: "The Netlify admin URL for the site." }),
  screenshot_url: s.string({ description: "The screenshot URL for the site." }),
  created_at: s.string({ description: "The timestamp when the site was created." }),
  updated_at: s.string({ description: "The timestamp when the site was last updated." }),
  user_id: s.string({ description: "The Netlify user ID that owns the site." }),
  ssl: s.boolean({ description: "Whether SSL is enabled for the site." }),
  force_ssl: s.boolean({ description: "Whether HTTP requests are redirected to HTTPS." }),
  managed_dns: s.boolean({ description: "Whether Netlify manages DNS for the site." }),
  deploy_url: s.string({ description: "The latest unique deploy URL for the site." }),
  published_deploy: netlifyDeploySchema,
  account_id: s.string({ description: "The Netlify account ID that owns the site." }),
  account_name: s.string({ description: "The Netlify account display name that owns the site." }),
  account_slug: s.string({ description: "The Netlify account slug that owns the site." }),
  git_provider: s.string({ description: "The Git provider connected to the site." }),
  deploy_hook: s.string({ description: "The default deploy hook URL for the site." }),
  build_image: s.string({ description: "The build image configured for the site." }),
  functions_region: s.string({ description: "The functions region configured for the site." }),
});

const netlifyBuildSchema = s.looseObject({
  id: s.string({ description: "The Netlify build ID." }),
  deploy_id: s.string({ description: "The deploy ID associated with the build." }),
  sha: s.string({ description: "The commit SHA associated with the build." }),
  done: s.boolean({ description: "Whether the build is complete." }),
  error: s.string({ description: "The build error message when Netlify returns one." }),
  created_at: s.string({ description: "The timestamp when the build was created." }),
});

const netlifyFileSchema = s.looseObject({
  id: s.string({ description: "The Netlify file ID." }),
  path: s.string({ description: "The deploy-relative file path." }),
  sha: s.string({ description: "The SHA digest Netlify reports for the file." }),
  mime_type: s.string({ description: "The MIME type Netlify reports for the file." }),
  size: s.integer({ description: "The file size in bytes." }),
});

const netlifyFunctionSchema = s.looseObject({
  id: s.string({ description: "The Netlify function ID." }),
  name: s.string({ description: "The Netlify function name." }),
  sha: s.string({ description: "The SHA digest Netlify reports for the function bundle." }),
  region: s.string({ description: "The Netlify function region." }),
});

const netlifyFormSchema = s.looseObject({
  id: s.string({ description: "The Netlify form ID." }),
  site_id: s.string({ description: "The Netlify site ID that owns the form." }),
  name: s.string({ description: "The form name." }),
  paths: s.array(s.string({ description: "A path." }), { description: "The paths where the form appears." }),
  submission_count: s.integer({ description: "The number of submissions Netlify reports for the form." }),
  fields: s.array(s.looseObject({}, { description: "A Netlify form field." }), {
    description: "The form fields returned by Netlify.",
  }),
  created_at: s.string({ description: "The timestamp when the form was created." }),
});

const netlifySubmissionSchema = s.looseObject({
  id: s.string({ description: "The Netlify submission ID." }),
  number: s.integer({ description: "The form-local submission number." }),
  email: s.string({ description: "The submitter email address." }),
  name: s.string({ description: "The submitter name." }),
  first_name: s.string({ description: "The submitter first name." }),
  last_name: s.string({ description: "The submitter last name." }),
  company: s.string({ description: "The submitter company." }),
  summary: s.string({ description: "The submission summary." }),
  body: s.string({ description: "The submission body." }),
  data: s.looseObject({}, { description: "The raw form field values submitted to Netlify." }),
  created_at: s.string({ description: "The timestamp when the submission was created." }),
  site_url: s.string({ description: "The site URL associated with the submission." }),
});

const emptySuccessOutputSchema = s.object(
  {
    success: s.boolean({ description: "Whether the Netlify request completed successfully." }),
  },
  { required: ["success"], description: "The result of a successful Netlify request." },
);

const currentUserOutputSchema = s.object(
  {
    user: netlifyUserSchema,
  },
  { required: ["user"], description: "The normalized Netlify current user response." },
);

const accountsOutputSchema = s.object(
  {
    accounts: s.array(netlifyAccountSchema, { description: "The Netlify accounts returned by the request." }),
    count: s.integer({ minimum: 0, description: "The number of Netlify accounts returned by the request." }),
  },
  { required: ["accounts", "count"], description: "The normalized Netlify accounts list." },
);

const accountOutputSchema = s.object(
  {
    account: netlifyAccountSchema,
  },
  { required: ["account"], description: "The normalized Netlify account response." },
);

const sitesOutputSchema = s.object(
  {
    sites: s.array(netlifySiteSchema, { description: "The Netlify sites returned by the request." }),
    count: s.integer({ minimum: 0, description: "The number of Netlify sites returned by the request." }),
  },
  { required: ["sites", "count"], description: "The normalized Netlify sites list." },
);

const siteOutputSchema = s.object(
  {
    site: netlifySiteSchema,
  },
  { required: ["site"], description: "The normalized Netlify site response." },
);

const deploysOutputSchema = s.object(
  {
    deploys: s.array(netlifyDeploySchema, { description: "The Netlify deploys returned by the request." }),
    count: s.integer({ minimum: 0, description: "The number of Netlify deploys returned by the request." }),
  },
  { required: ["deploys", "count"], description: "The normalized Netlify deploys list." },
);

const deployOutputSchema = s.object(
  {
    deploy: netlifyDeploySchema,
  },
  { required: ["deploy"], description: "The normalized Netlify deploy response." },
);

const buildOutputSchema = s.object(
  {
    build: netlifyBuildSchema,
  },
  { required: ["build"], description: "The normalized Netlify build response." },
);

const fileOutputSchema = s.object(
  {
    file: netlifyFileSchema,
  },
  { required: ["file"], description: "The normalized Netlify deploy file response." },
);

const functionOutputSchema = s.object(
  {
    function: netlifyFunctionSchema,
  },
  { required: ["function"], description: "The normalized Netlify function response." },
);

const formsOutputSchema = s.object(
  {
    forms: s.array(netlifyFormSchema, { description: "The Netlify forms returned by the request." }),
    count: s.integer({ minimum: 0, description: "The number of Netlify forms returned by the request." }),
  },
  { required: ["forms", "count"], description: "The normalized Netlify forms list." },
);

const submissionsOutputSchema = s.object(
  {
    submissions: s.array(netlifySubmissionSchema, {
      description: "The Netlify form submissions returned by the request.",
    }),
    count: s.integer({ minimum: 0, description: "The number of Netlify submissions returned by the request." }),
  },
  { required: ["submissions", "count"], description: "The normalized Netlify submissions list." },
);

const netlifyReadScope = "netlify.read";
const netlifySiteWriteScope = "netlify.site.write";
const netlifyDeployWriteScope = "netlify.deploy.write";
const netlifyFormWriteScope = "netlify.form.write";

const actionSources: readonly NetlifyActionSource[] = [
  {
    name: "get_current_user",
    description: "Retrieve the Netlify user associated with the connected credential.",
    requiredScopes: [netlifyReadScope],
    inputSchema: emptyInputSchema,
    outputSchema: currentUserOutputSchema,
  },
  {
    name: "list_accounts",
    description: "List Netlify accounts accessible to the connected credential.",
    requiredScopes: [netlifyReadScope],
    inputSchema: emptyInputSchema,
    outputSchema: accountsOutputSchema,
  },
  {
    name: "get_account",
    description:
      "Retrieve one Netlify account membership, including billing and capability fields returned by Netlify.",
    requiredScopes: [netlifyReadScope],
    inputSchema: accountInputSchema,
    outputSchema: accountOutputSchema,
  },
  {
    name: "list_sites",
    description: "List Netlify sites accessible to the connected credential.",
    requiredScopes: [netlifyReadScope],
    inputSchema: listSitesInputSchema,
    outputSchema: sitesOutputSchema,
  },
  {
    name: "get_site",
    description: "Retrieve one Netlify site by site ID or name.",
    requiredScopes: [netlifyReadScope],
    inputSchema: siteInputSchema,
    outputSchema: siteOutputSchema,
  },
  {
    name: "list_site_deploys",
    description: "List deploys for one Netlify site.",
    requiredScopes: [netlifyReadScope],
    inputSchema: listSiteDeploysInputSchema,
    outputSchema: deploysOutputSchema,
  },
  {
    name: "get_deploy",
    description: "Retrieve one Netlify deploy by deploy ID.",
    requiredScopes: [netlifyReadScope],
    inputSchema: deployInputSchema,
    outputSchema: deployOutputSchema,
  },
  {
    name: "cancel_deploy",
    description: "Cancel one Netlify deploy by deploy ID.",
    requiredScopes: [netlifyDeployWriteScope],
    inputSchema: deployInputSchema,
    outputSchema: deployOutputSchema,
  },
  {
    name: "lock_deploy",
    description: "Lock one Netlify deploy by deploy ID.",
    requiredScopes: [netlifyDeployWriteScope],
    inputSchema: deployInputSchema,
    outputSchema: deployOutputSchema,
  },
  {
    name: "unlock_deploy",
    description: "Unlock one Netlify deploy by deploy ID.",
    requiredScopes: [netlifyDeployWriteScope],
    inputSchema: deployInputSchema,
    outputSchema: deployOutputSchema,
  },
  {
    name: "create_site_build",
    description: "Start a Netlify build for one site without uploading binary files.",
    requiredScopes: [netlifySiteWriteScope],
    inputSchema: createSiteBuildInputSchema,
    outputSchema: buildOutputSchema,
  },
  {
    name: "create_site_deploy_from_zip_url",
    description: "Create a Netlify site deploy by downloading a public zip file URL and uploading it to Netlify.",
    requiredScopes: [netlifyDeployWriteScope],
    inputSchema: createSiteDeployFromZipUrlInputSchema,
    outputSchema: deployOutputSchema,
  },
  {
    name: "upload_deploy_file_from_url",
    description: "Upload one file into an existing Netlify deploy by downloading a public file URL first.",
    requiredScopes: [netlifyDeployWriteScope],
    inputSchema: uploadDeployFileFromUrlInputSchema,
    outputSchema: fileOutputSchema,
  },
  {
    name: "upload_deploy_function_from_zip_url",
    description:
      "Upload one Netlify function bundle into an existing deploy by downloading a public zip file URL first.",
    requiredScopes: [netlifyDeployWriteScope],
    inputSchema: uploadDeployFunctionFromZipUrlInputSchema,
    outputSchema: functionOutputSchema,
  },
  {
    name: "get_build",
    description: "Retrieve one Netlify build by build ID.",
    requiredScopes: [netlifyReadScope],
    inputSchema: buildInputSchema,
    outputSchema: buildOutputSchema,
  },
  {
    name: "notify_build_start",
    description: "Notify Netlify that one build has started.",
    requiredScopes: [netlifySiteWriteScope],
    inputSchema: buildInputSchema,
    outputSchema: emptySuccessOutputSchema,
  },
  {
    name: "list_site_forms",
    description: "List forms detected for one Netlify site.",
    requiredScopes: [netlifyReadScope],
    inputSchema: listSiteFormsInputSchema,
    outputSchema: formsOutputSchema,
  },
  {
    name: "list_submissions",
    description: "List Netlify form submissions by site or by form.",
    requiredScopes: [netlifyReadScope],
    inputSchema: listSubmissionsInputSchema,
    outputSchema: submissionsOutputSchema,
  },
  {
    name: "delete_submission",
    description: "Delete one Netlify form submission by submission ID.",
    requiredScopes: [netlifyFormWriteScope],
    inputSchema: s.object(
      {
        submissionId: s.string({ minLength: 1, description: "The Netlify form submission ID." }),
      },
      { required: ["submissionId"], description: "Input parameters for deleting one Netlify form submission." },
    ),
    outputSchema: emptySuccessOutputSchema,
  },
];

export const netlifyActions: ActionDefinition[] = actionSources.map((action) =>
  defineProviderAction(service, {
    ...action,
    providerPermissions: action.requiredScopes,
  }),
);

export const netlifyConnectorScopes: readonly string[] = [];
