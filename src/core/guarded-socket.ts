import type { ResolvedAddress } from "./guarded-fetch.ts";
import type { LookupFunction } from "node:net";

/**
 * Build a `node:net` lookup that answers only with addresses the shared egress
 * policy already screened through `resolveGuardedEgressTarget`.
 *
 * Raw TCP transports (IMAP, SMTP, SSH) pass it to `net.connect` or `tls.connect`
 * so the socket reaches exactly the validated addresses: resolving the hostname
 * a second time would let a DNS record switch to an internal address between
 * the policy check and the connection.
 */
export function createPinnedLookup(addresses: ResolvedAddress[]): LookupFunction {
  return ((_hostname, options, callback) => {
    if (typeof options === "object" && options.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  }) as LookupFunction;
}
