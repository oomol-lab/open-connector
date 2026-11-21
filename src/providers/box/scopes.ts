export const boxProviderScopes = {
  read: "root_readonly",
  write: "root_readwrite",
  manageWebhook: "manage_webhook",
};

export const boxOAuthScopes: string[] = [
  boxProviderScopes.read,
  boxProviderScopes.write,
  boxProviderScopes.manageWebhook,
];
