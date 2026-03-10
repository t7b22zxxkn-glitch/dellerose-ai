import { z } from "zod"

export const generateIdeasInputSchema = z.object({
  ideasPerPillar: z.number().int().min(3).max(5).default(3),
})
