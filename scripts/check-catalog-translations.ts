import { untranslatedProviderServices, validateCatalogTranslations } from "../src/catalog-localization/validation.ts";
import { loadProviderSources } from "./provider-source.ts";

const providers = (await loadProviderSources()).map((source) => source.definition);
validateCatalogTranslations(providers);
console.log(
  JSON.stringify({ locale: "zh-CN", untranslatedServices: untranslatedProviderServices(providers) }, null, 2),
);
