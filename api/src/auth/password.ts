import argon2 from "argon2";

// OWASP's minimum argon2id configuration (19 MiB, 2 passes, 1 lane): strong enough
// for a login form, light enough for a small VPS shared with other apps. The
// parameters are stored inside each hash, so they can be raised later without
// invalidating existing passwords.
const options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Login for an unknown email still pays for one argon2 verification, so response
// time does not reveal whether the account exists.
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-account-password");
  await verifyPassword(await dummyHash, password);
}
