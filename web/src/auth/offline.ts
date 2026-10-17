import type { Profile } from "@fitness/shared";
import { ApiError } from "../api";

// When "who am I?" cannot be answered, decide whether to trust the profile this
// device remembers. A network failure or a server error means "can't tell", so the
// remembered person stays signed in; a 401 means the server said no, so they don't.
export function profileAfterFailure(error: unknown, remembered: Profile | undefined): Profile | null {
  const unreachable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
  return unreachable && remembered ? remembered : null;
}
