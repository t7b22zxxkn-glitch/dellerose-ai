import "server-only"

import type { BrandBlueprint } from "@/lib/types/domain"

export function buildBrandBlueprintPromptContext(
  blueprint: BrandBlueprint | null | undefined
): string {
  if (!blueprint) {
    return "Brand Blueprint ikke sat endnu."
  }

  return `
Niche: ${blueprint.niche}
Audience: ${blueprint.audience}
Brand tone: ${blueprint.brandTone}
Personality traits: ${blueprint.personalityTraits.join(", ")}
Content pillars:
${blueprint.contentPillars
  .map((pillar, index) => `${index + 1}. ${pillar.title} — ${pillar.description}`)
  .join("\n")}
Elevator pitch: ${blueprint.elevatorPitch}
Bio short: ${blueprint.bioShort}
`.trim()
}
