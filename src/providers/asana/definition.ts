import type { ProviderDefinition } from "../../core/types.ts";

import { asanaAttachmentActions } from "./actions-attachments.ts";
import { asanaCustomFieldActions } from "./actions-custom-fields.ts";
import { asanaProjectSectionActions } from "./actions-projects.ts";
import { asanaStoryTagActions } from "./actions-stories-tags.ts";
import { asanaTaskActions } from "./actions-tasks.ts";
import { asanaTeamActions } from "./actions-teams.ts";
import { asanaUserActions } from "./actions-users.ts";
import { asanaWorkspaceActions } from "./actions-workspaces.ts";
import { asanaOAuthScopes } from "./scopes.ts";

const service = "asana";
const asanaAuthorizationUrl = "https://app.asana.com/-/oauth_authorize";
const asanaTokenUrl = "https://app.asana.com/-/oauth_token";

export const provider: ProviderDefinition = {
  service,
  displayName: "Asana",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: asanaAuthorizationUrl,
      tokenUrl: asanaTokenUrl,
      scopes: asanaOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: {
        method: "S256",
      },
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "asana_pat",
      description:
        "Asana personal access token used with the Authorization Bearer header. Get it from the Asana developer console at https://app.asana.com/0/my-apps.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://asana.com",
  iconUrl: "/provider-icons/asana.svg",
  actions: [
    ...asanaWorkspaceActions,
    ...asanaUserActions,
    ...asanaTeamActions,
    ...asanaProjectSectionActions,
    ...asanaTaskActions,
    ...asanaStoryTagActions,
    ...asanaCustomFieldActions,
    ...asanaAttachmentActions,
  ],
};
