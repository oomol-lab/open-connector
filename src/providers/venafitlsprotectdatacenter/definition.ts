import type { ProviderDefinition } from "../../core/types.ts";

import { venafiTlsProtectDatacenterActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "venafitlsprotectdatacenter",
  displayName: "Venafi TLS Protect Datacenter",
  categories: ["Security", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "domain",
          label: "Domain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://tpp.example.com",
          description: "HTTPS origin of your TLS Protect Datacenter instance.",
        },
        {
          key: "clientId",
          label: "Client ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "websdk",
          description:
            "Client ID created under API > Integrations in TLS Protect Datacenter: https://docs.venafi.com/Docs/current/TopNav/Content/SDK/WebSDK/t-SDK-UsingOpenAPI.php",
        },
        {
          key: "username",
          label: "Username",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "API username",
          description: "TLS Protect Datacenter username authorized for the API integration.",
        },
        {
          key: "password",
          label: "Password",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Password",
          description: "Password for the TLS Protect Datacenter API username.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.cyberark.com/resources/product-datasheets/cyberark-certificate-manager-self-hosted",
  actions: venafiTlsProtectDatacenterActions,
};
