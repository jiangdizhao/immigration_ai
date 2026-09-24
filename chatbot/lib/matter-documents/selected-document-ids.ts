import { z } from "zod";

export const selectedDocumentIdsSchema = z
  .array(z.string().uuid())
  .max(4)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Duplicate document IDs are not allowed."
  )
  .optional()
  .default([]);
