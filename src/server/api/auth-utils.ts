/**
 * Deployment secrets (`OOMOL_CONNECT_ADMIN_TOKEN` / `OOMOL_CONNECT_RUNTIME_TOKEN`) are long-lived,
 * so the credential is compared in constant time instead of with `===`, which short-circuits on
 * the first differing character and leaks how much of the token an attacker already guessed. Stored
 * runtime tokens already get the same treatment through `timingSafeEqual` on their hashes.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
