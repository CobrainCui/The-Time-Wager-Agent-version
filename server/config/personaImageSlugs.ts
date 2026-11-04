/** 人格立绘上传文件名白名单（与前端 FATE_SKETCH_IMAGE_SLUG 值一致） */
export const PERSONA_IMAGE_SLUGS = [
  "Bridge",
  "Moment",
  "Navigator",
  "Planter",
  "Poet",
  "Wave",
] as const;

export type PersonaImageSlug = (typeof PERSONA_IMAGE_SLUGS)[number];

export function isAllowedPersonaImageId(id: string): boolean {
  return (PERSONA_IMAGE_SLUGS as readonly string[]).includes(id);
}
