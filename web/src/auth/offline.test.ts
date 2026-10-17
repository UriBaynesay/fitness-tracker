import { describe, expect, it } from "vitest";
import type { Profile } from "@fitness/shared";
import { ApiError } from "../api";
import { profileAfterFailure } from "./offline";

const profile: Profile = { id: "p", email: "a@b.c", displayName: null, language: "en", weightUnit: "kg" };

describe("profileAfterFailure", () => {
  it("keeps the remembered person signed in when the network is down", () => {
    expect(profileAfterFailure(new ApiError(0, "network"), profile)).toBe(profile);
  });

  it("and when the server is erroring", () => {
    expect(profileAfterFailure(new ApiError(502, "generic"), profile)).toBe(profile);
  });

  it("signs out on a real 401", () => {
    expect(profileAfterFailure(new ApiError(401, "unauthorized"), profile)).toBeNull();
  });

  it("has nobody to keep when nothing was remembered", () => {
    expect(profileAfterFailure(new ApiError(0, "network"), undefined)).toBeNull();
  });

  it("ignores unexpected errors", () => {
    expect(profileAfterFailure(new Error("boom"), profile)).toBeNull();
  });
});
