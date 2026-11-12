import type { ProviderDefinition } from "../../core/types.ts";

import { sftpActions } from "./actions.ts";

export const nodeOnly = true;

export const provider: ProviderDefinition = {
  service: "sftp",
  displayName: "SFTP",
  description:
    "Unavailable on Cloudflare Workers. List, inspect, download, upload, move and delete files on any SSH server that offers the SFTP subsystem.",
  categories: ["Storage", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "host",
          label: "Host",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "sftp.example.com",
          description:
            "The SSH server hostname or IPv4 address, without a scheme or port. Private targets require a self-hosted runtime with OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK enabled.",
        },
        {
          key: "port",
          label: "Port",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "22",
          description: "The SSH port. Defaults to 22.",
        },
        {
          key: "username",
          label: "Username",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "deploy",
          description: "The SSH account name.",
        },
        {
          key: "password",
          label: "Password",
          inputType: "password",
          required: false,
          secret: true,
          description: "The account password. Provide a password, a private key, or both.",
        },
        {
          key: "privateKey",
          label: "Private Key",
          inputType: "textarea",
          required: false,
          secret: true,
          placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----",
          description:
            "A PEM or OpenSSH private key authorized for the account. Prefer a dedicated key that only this connection uses.",
        },
        {
          key: "passphrase",
          label: "Private Key Passphrase",
          inputType: "password",
          required: false,
          secret: true,
          description: "The passphrase protecting the private key, when it is encrypted.",
        },
        {
          key: "hostKeyFingerprint",
          label: "Host Key Fingerprint",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "SHA256:abc123...",
          description:
            "The server's SHA256 host key fingerprint, as printed by ssh-keygen -lf or shown on first ssh login. When left empty, the key the server presents while the connection is saved is recorded and required from then on; reconnect after the server's host key changes.",
        },
      ],
      testAction: {
        actionName: "list_directory",
        input: { path: "." },
      },
    },
  ],
  homepageUrl: "https://datatracker.ietf.org/doc/html/draft-ietf-secsh-filexfer-02",
  actions: sftpActions,
};
