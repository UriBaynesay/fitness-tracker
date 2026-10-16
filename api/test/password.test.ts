import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../src/auth/password.js";

describe("password hashing", () => {
  it("produces a salted argon2id hash that verifies only the right password", async () => {
    const hash = await hashPassword("a long enough password");
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    // The library lists the parameters in its own order, so check each on its own.
    expect(hash).toContain("m=19456");
    expect(hash).toContain("t=2");
    expect(hash).toContain("p=1");
    expect(await verifyPassword(hash, "a long enough password")).toBe(true);
    expect(await verifyPassword(hash, "a different password")).toBe(false);
    // Same input, different salt: hashes must not repeat.
    expect(await hashPassword("a long enough password")).not.toBe(hash);
  });

  it("treats a malformed stored hash as a failed login, not an exception", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });

  it("runs the dummy verification without throwing", async () => {
    await expect(verifyAgainstDummy("anything")).resolves.toBeUndefined();
  });
});
