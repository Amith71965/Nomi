import { z } from "zod";

/**
 * SerpApi Google Shopping response, loosely typed: only the fields Nomi reads.
 * Everything is optional because listings vary; missing data stays missing.
 */
export const serpApiListingSchema = z.object({
  position: z.number().optional(),
  title: z.string().min(1),
  link: z.string().optional(),
  product_link: z.string().optional(),
  product_id: z.string().optional(),
  source: z.string().optional(),
  price: z.string().optional(),
  extracted_price: z.number().optional(),
  rating: z.number().optional(),
  reviews: z.number().optional(),
  thumbnail: z.string().optional(),
  delivery: z.string().optional(),
  second_hand_condition: z.string().optional(),
});
export type SerpApiListing = z.infer<typeof serpApiListingSchema>;

export const serpApiShoppingResponseSchema = z.object({
  search_metadata: z.object({ id: z.string().optional(), google_shopping_url: z.string().optional(), created_at: z.string().optional() }).optional(),
  shopping_results: z.array(z.unknown()).optional(),
  error: z.string().optional(),
});

/** Recorded listings for cached/fixture modes, grouped by item key. */
export const shoppingFixtureSchema = z.object({
  _note: z.string(),
  retrievedAt: z.string(),
  searches: z.record(z.string(), z.object({ searchUrl: z.string(), listings: z.array(serpApiListingSchema) })),
});
