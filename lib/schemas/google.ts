import { z } from "zod";

/** Shapes of Google OAuth responses. Anything else is a provider error. */

export const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(""),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});
export type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

export const googleTokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
});
export type GoogleUserInfo = z.infer<typeof googleUserInfoSchema>;

/** Signed OAuth state payload (before signature). */
export const oauthStatePayloadSchema = z.object({
  u: z.uuid(),
  n: z.string().min(16),
  t: z.number().int().positive(),
  p: z.enum(["google_calendar"]),
});
export type OAuthStatePayload = z.infer<typeof oauthStatePayloadSchema>;
