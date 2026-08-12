/**
 * Xero OAuth2 scopes (granular scope family). Apps created after 2 March 2026
 * only have access to the granular scopes listed here; the older broad scopes
 * such as `accounting.transactions.read` and `accounting.reports.read` are
 * deprecated for new apps and are NOT requested by this provider:
 * https://developer.xero.com/documentation/guides/oauth2/scopes
 */
/**
 * The `app.connections` scope is for client-credentials Custom Connection apps.
 * It is kept out of this provider's authorization-code request list. Requesting
 * it on a web-app authorize URL returned access_denied ("Requested wrong apps
 * scopes") in testing; GET /connections still works with a user access token.
 */
export const xeroConnectionsScope = "app.connections";
export const xeroSettingsReadScope = "accounting.settings.read";
export const xeroContactsReadScope = "accounting.contacts.read";
export const xeroInvoicesReadScope = "accounting.invoices.read";
export const xeroBankTransactionsReadScope = "accounting.banktransactions.read";
export const xeroProfitAndLossReadScope = "accounting.reports.profitandloss.read";
export const xeroBalanceSheetReadScope = "accounting.reports.balancesheet.read";
export const xeroContactsWriteScope = "accounting.contacts";
export const xeroInvoicesWriteScope = "accounting.invoices";
/** Required for a refresh token. Without it, Xero access lasts 30 minutes and then dies. */
export const xeroOfflineAccessScope = "offline_access";

/**
 * Read-only scopes: safe for an agent that should inspect the books without
 * modifying them. `app.connections` is intentionally not requested (see above)
 * even though the tenant resolution calls the Identity API connections endpoint.
 */
export const xeroReadOnlyScopes: string[] = [
  xeroSettingsReadScope,
  xeroContactsReadScope,
  xeroInvoicesReadScope,
  xeroBankTransactionsReadScope,
  xeroProfitAndLossReadScope,
  xeroBalanceSheetReadScope,
];

/** Read-write scopes needed by create/update actions such as creating invoices. */
export const xeroWriteScopes: string[] = [xeroContactsWriteScope, xeroInvoicesWriteScope];

/** Scopes declared on the OAuth app. `offline_access` is required so the runtime can refresh. */
export const xeroOAuthScopes: string[] = [...xeroReadOnlyScopes, ...xeroWriteScopes, xeroOfflineAccessScope];
