export const ebayApiBaseUrl = "https://api.ebay.com";
export const ebayIdentityUrl = "https://apiz.ebay.com/commerce/identity/v1/user/";
export const ebayIdentityScope = "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly";
export const ebayFulfillmentScope = "https://api.ebay.com/oauth/api_scope/sell.fulfillment";
export const ebayScopes: string[] = ["https://api.ebay.com/oauth/api_scope", ebayIdentityScope, ebayFulfillmentScope];
