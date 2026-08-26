export const boxProviderScopes = {
  read: "root_readonly",
  write: "root_readwrite",
};

export const boxOAuthScopes: string[] = [boxProviderScopes.read, boxProviderScopes.write];
