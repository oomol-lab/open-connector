import type { ProviderSetupLabels } from "../core/provider-setup.ts";

export interface DisplayText {
  label?: string;
  description?: string;
  placeholder?: string;
}

export interface ProviderTranslation {
  displayName?: string;
  description?: string;
  auth?: {
    api_key?: DisplayText & { fields?: Record<string, DisplayText> };
    custom_credential?: Pick<DisplayText, "label" | "description"> & { fields?: Record<string, DisplayText> };
    oauth2?: {
      fields?: Record<string, DisplayText>;
      steps?: string[];
      authorizationOptions?: Record<string, Pick<DisplayText, "label" | "description">>;
    };
  };
}

export interface CatalogTranslation {
  labels: ProviderSetupLabels;
  categories: Record<string, string>;
  providers: Record<string, ProviderTranslation>;
}
