import { z } from "zod";

export const languageSchema = z.enum(["en", "he"]);
export type Language = z.infer<typeof languageSchema>;

export const weightUnitSchema = z.enum(["kg", "lb"]);
export type WeightUnit = z.infer<typeof weightUnitSchema>;

export const PASSWORD_MIN_LENGTH = 10;
// Upper bound stops a multi-megabyte "password" from being fed to argon2.
export const PASSWORD_MAX_LENGTH = 128;

// Normalise before validating so "  Me@Example.COM " and "me@example.com" are one account.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  displayName: z.string().trim().min(1).max(80).optional(),
  language: languageSchema.default("en"),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;
// What a client sends, before server-side defaults (language) are applied.
export type RegisterInput = z.input<typeof registerBodySchema>;

// Login deliberately does not enforce the register-time minimum: it must accept
// whatever the account was created with, and say nothing about password rules.
export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const profileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  language: languageSchema,
  weightUnit: weightUnitSchema,
});
export type Profile = z.infer<typeof profileSchema>;

// Settings screen: language and unit, plus the display name. null clears the name.
export const updateMeBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
    language: languageSchema.optional(),
    weightUnit: weightUnitSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field is required" });
export type UpdateMeInput = z.infer<typeof updateMeBodySchema>;

// Deleting an account asks for the password again, so a stolen session alone cannot do it.
export const deleteAccountBodySchema = z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });
export type DeleteAccountInput = z.infer<typeof deleteAccountBodySchema>;

export const profileResponseSchema = z.object({ profile: profileSchema });
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
