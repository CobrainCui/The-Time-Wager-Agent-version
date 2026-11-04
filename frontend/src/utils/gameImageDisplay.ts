import { FATE_SKETCH_IMAGE_SLUG } from "../config/personaConfig";
import {
  DEVICE_PREVIEW_LANDSCAPE_SRC,
  DEVICE_PREVIEW_PORTRAIT_SRC,
  isDevicePreviewSession,
} from "../devicePreview/session";
import { publicAssetUrl } from "./publicAssetUrl";
import { BACKEND_URL } from "../socket";

const previewPortrait = (): ResolvedImage => ({
  src: DEVICE_PREVIEW_PORTRAIT_SRC,
  source: "default",
});

const previewLandscape = (): ResolvedImage => ({
  src: DEVICE_PREVIEW_LANDSCAPE_SRC,
  source: "default",
});

export type ImageSource = "custom" | "default";

export type ResolvedImage = {
  src: string;
  source: ImageSource;
};

export function getProjectImageDisplay(
  projectId: number,
  _projectName: string,
  projectImages: Record<number, number>,
  /** 单卡场景（如 ProjectCard）可只传当前 version，避免构造临时对象 */
  singleVersion?: number,
): ResolvedImage {
  if (isDevicePreviewSession()) return previewLandscape();
  const version = singleVersion ?? projectImages[projectId];
  if (version != null && version > 0) {
    return {
      src: `${BACKEND_URL}/uploads/${projectId}.jpg?v=${version}`,
      source: "custom",
    };
  }
  return {
    src: publicAssetUrl(`/images/projects/${projectId}.jpg?v=3`),
    source: "default",
  };
}

/** Bundled default era art uses ASCII filenames so Windows zip → Linux unzip stays stable. */
export const ERA_DEFAULT_IMAGE_FILE: Record<string, string> = {
  气候: "climate.jpg",
  科技: "tech.jpg",
  文化: "culture.jpg",
  健康: "health.jpg",
  心理: "mind.jpg",
};

export function getEraDefaultImageSrc(eraName: string): string {
  if (isDevicePreviewSession()) return DEVICE_PREVIEW_PORTRAIT_SRC;
  const file = ERA_DEFAULT_IMAGE_FILE[eraName];
  if (!file) {
    // Force onError → placeholder instead of showing the wrong theme art.
    return publicAssetUrl(`/images/eras/__missing__.jpg?v=2`);
  }
  return publicAssetUrl(`/images/eras/${file}?v=2`);
}

export function getEraImageDisplay(eraName: string, eraImages: Record<string, number>): ResolvedImage {
  if (isDevicePreviewSession()) return previewPortrait();
  const version = eraImages[eraName];
  if (version != null && version > 0) {
    return {
      src: `${BACKEND_URL}/uploads_eras/${encodeURIComponent(eraName)}.jpg?v=${version}`,
      source: "custom",
    };
  }
  return {
    src: getEraDefaultImageSrc(eraName),
    source: "default",
  };
}

export function getBuffCustomImageSrc(cardId: string, buffImages: Record<string, number>): string | null {
  const v = buffImages[cardId];
  if (v == null || v <= 0) return null;
  return `${BACKEND_URL}/uploads_buffs/${cardId}.jpg?v=${v}`;
}

export function hasBuffCustomImage(cardId: string, buffImages: Record<string, number>): boolean {
  const v = buffImages[cardId];
  return v != null && v > 0;
}

const BUFF_DEFAULT_VERSION = "2";

export function getBuffDefaultImageSrc(cardId: string): string {
  if (isDevicePreviewSession()) return DEVICE_PREVIEW_PORTRAIT_SRC;
  return publicAssetUrl(`/images/buffs/${cardId}.jpg?v=${BUFF_DEFAULT_VERSION}`);
}

export function getBuffImageDisplay(
  cardId: string,
  buffImages: Record<string, number>,
): ResolvedImage {
  if (isDevicePreviewSession()) return previewPortrait();
  if (hasBuffCustomImage(cardId, buffImages)) {
    return {
      src: getBuffCustomImageSrc(cardId, buffImages)!,
      source: "custom",
    };
  }
  return {
    src: getBuffDefaultImageSrc(cardId),
    source: "default",
  };
}

export function getPersonaImageSlug(personaName: string): string {
  return FATE_SKETCH_IMAGE_SLUG[personaName] ?? "Poet";
}

export function getPersonaDefaultImageSrc(slug: string): string {
  if (isDevicePreviewSession()) return DEVICE_PREVIEW_PORTRAIT_SRC;
  return publicAssetUrl(`/images/personas/${slug}.jpg?v=1`);
}

export function getPersonaImageDisplay(
  personaName: string,
  personaImages: Record<string, number>,
): ResolvedImage {
  if (isDevicePreviewSession()) return previewPortrait();
  const slug = getPersonaImageSlug(personaName);
  const version = personaImages[slug];
  if (version != null && version > 0) {
    return {
      src: `${BACKEND_URL}/uploads_personas/${slug}.jpg?v=${version}`,
      source: "custom",
    };
  }
  return {
    src: getPersonaDefaultImageSrc(slug),
    source: "default",
  };
}

export function hasPersonaCustomImage(slug: string, personaImages: Record<string, number>): boolean {
  const v = personaImages[slug];
  return v != null && v > 0;
}
