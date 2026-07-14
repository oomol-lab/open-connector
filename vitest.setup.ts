import { setDefaultGuardedFetchDnsLookup } from "./src/core/guarded-fetch.ts";

// Unit tests must never depend on real DNS resolution: disable the module
// default (node:dns) lookup used by guarded provider fetches. Guard-specific
// tests inject their own lookup through createGuardedFetch({ lookup }).
setDefaultGuardedFetchDnsLookup(null);
