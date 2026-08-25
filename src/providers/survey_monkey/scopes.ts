export const surveyMonkeyConnectorScopes: Record<string, string> = {
  usersRead: "survey_monkey.users.read",
  surveysRead: "survey_monkey.surveys.read",
  surveysWrite: "survey_monkey.surveys.write",
  responsesRead: "survey_monkey.responses.read",
  responseDetailsRead: "survey_monkey.response_details.read",
  collectorsRead: "survey_monkey.collectors.read",
  collectorsWrite: "survey_monkey.collectors.write",
  contactsRead: "survey_monkey.contacts.read",
  contactsWrite: "survey_monkey.contacts.write",
  webhooksRead: "survey_monkey.webhooks.read",
  webhooksWrite: "survey_monkey.webhooks.write",
} as const;

export const surveyMonkeyProviderScopes = {
  usersRead: "users_read",
  surveysRead: "surveys_read",
  surveysWrite: "surveys_write",
  responsesRead: "responses_read",
  responseDetailsRead: "responses_read_detail",
  collectorsRead: "collectors_read",
  collectorsWrite: "collectors_write",
  contactsRead: "contacts_read",
  contactsWrite: "contacts_write",
  webhooksRead: "webhooks_read",
  webhooksWrite: "webhooks_write",
} as const;

const surveyMonkeyScopeMappings = [
  [surveyMonkeyProviderScopes.usersRead, surveyMonkeyConnectorScopes.usersRead],
  [surveyMonkeyProviderScopes.surveysRead, surveyMonkeyConnectorScopes.surveysRead],
  [surveyMonkeyProviderScopes.surveysWrite, surveyMonkeyConnectorScopes.surveysWrite],
  [surveyMonkeyProviderScopes.responsesRead, surveyMonkeyConnectorScopes.responsesRead],
  [surveyMonkeyProviderScopes.responseDetailsRead, surveyMonkeyConnectorScopes.responseDetailsRead],
  [surveyMonkeyProviderScopes.collectorsRead, surveyMonkeyConnectorScopes.collectorsRead],
  [surveyMonkeyProviderScopes.collectorsWrite, surveyMonkeyConnectorScopes.collectorsWrite],
  [surveyMonkeyProviderScopes.contactsRead, surveyMonkeyConnectorScopes.contactsRead],
  [surveyMonkeyProviderScopes.contactsWrite, surveyMonkeyConnectorScopes.contactsWrite],
  [surveyMonkeyProviderScopes.webhooksRead, surveyMonkeyConnectorScopes.webhooksRead],
  [surveyMonkeyProviderScopes.webhooksWrite, surveyMonkeyConnectorScopes.webhooksWrite],
] as const;

export function mapSurveyMonkeyProviderScopes(providerScopes: readonly string[]): string[] {
  const granted = new Set(providerScopes);
  return surveyMonkeyScopeMappings
    .filter(([providerScope]) => granted.has(providerScope))
    .map(([, connectorScope]) => connectorScope);
}
