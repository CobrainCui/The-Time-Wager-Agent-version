import React, { useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import { adminApiUrl, adminAuthHeaders } from "./adminFetch";
import { ALL_PROJECTS } from "../config/projects";
import { AUCTION_CARDS_BY_ROUND, BUFF_CARD_DEFS } from "../config/buffCards";
import { BuffCardArt } from "../components/BuffCardArt";
import { ImageLightbox } from "../components/ImageLightbox";
import {
  getEraImageDisplay,
  getEraDefaultImageSrc,
  getProjectImageDisplay,
  getBuffImageDisplay,
  getBuffDefaultImageSrc,
  hasBuffCustomImage,
  getPersonaImageDisplay,
  getPersonaDefaultImageSrc,
  hasPersonaCustomImage,
  type ResolvedImage,
} from "../utils/gameImageDisplay";
import { FATE_SKETCH_CONFIG, FATE_SKETCH_IMAGE_SLUG } from "../config/personaConfig";
import { useImageWithFallback } from "../hooks/useImageWithFallback";

const ALL_AUCTION_BUFF_IDS = Array.from(
  new Set(Object.values(AUCTION_CARDS_BY_ROUND).flat().map((c) => c.id)),
);

const ERA_NAMES = ["气候", "科技", "文化", "健康", "心理"];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type SectionId = "era" | "buff" | "project" | "persona";

interface Props {
  projectImages: Record<number, number>;
  eraImages: Record<string, number>;
  buffImages: Record<string, number>;
  personaImages: Record<string, number>;
  onProjectImageVersion: (id: number, version: number) => void;
  onEraImageVersion: (eraName: string, version: number) => void;
  onBuffImageVersion: (cardId: string, version: number) => void;
  onPersonaImageVersion: (slug: string, version: number) => void;
  onBack: () => void;
}

const badgeStyle = (color: string): React.CSSProperties => ({
  position: "absolute",
  top: "0.35rem",
  right: "0.35rem",
  fontSize: uiRem(0.6),
  fontWeight: 700,
  padding: "0.15rem 0.45rem",
  borderRadius: "9999px",
  background: color,
  color: "#0a0a0a",
  zIndex: 2,
  pointerEvents: "none",
});

const RasterPreview: React.FC<{
  display: ResolvedImage;
  alt: string;
  aspectRatio: string;
  onZoom: (src: string) => void;
  badgeLabel: string;
  badgeColor: string;
  /** 自定义图加载失败时回退（通常为 /images/... 默认图） */
  defaultFallbackSrc: string;
}> = ({ display, alt, aspectRatio, onZoom, badgeLabel, badgeColor, defaultFallbackSrc }) => {
  const fallback = display.source === "custom" ? defaultFallbackSrc : null;
  const img = useImageWithFallback(display.src, fallback);
  const showCustomFailed = img.usingFallback && display.source === "custom";
  const label = img.showPlaceholder
    ? "默认图缺失"
    : showCustomFailed
      ? "已回退默认"
      : badgeLabel;
  const badge = img.showPlaceholder || showCustomFailed ? "rgba(239,68,68,0.9)" : badgeColor;

  if (img.showPlaceholder) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio,
          borderRadius: "0.5rem",
          border: "1px dashed rgba(239,68,68,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem",
          color: "var(--color-text-muted)",
          fontSize: uiRem(0.72),
          textAlign: "center",
          background: "rgba(0,0,0,0.35)",
        }}
      >
        请确认管理子域已部署含 images/ 的 dist
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`放大预览：${alt}`}
      onClick={() => onZoom(img.src)}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio,
        borderRadius: "0.5rem",
        overflow: "hidden",
        cursor: "zoom-in",
        border: "1px solid rgba(255,255,255,0.12)",
        padding: 0,
        background: "rgba(0,0,0,0.35)",
        display: "block",
      }}
    >
      <span style={badgeStyle(badge)}>{label}</span>
      <img
        src={img.src}
        alt={alt}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        onError={img.onError}
      />
    </button>
  );
};

/** 项目封面回退用 default（与 era 不同路径） */
const ProjectRasterPreview: React.FC<{
  projectId: number;
  projectName: string;
  projectImages: Record<number, number>;
  onZoom: (src: string) => void;
}> = ({ projectId, projectName, projectImages, onZoom }) => {
  const display = getProjectImageDisplay(projectId, projectName, projectImages);
  const fallbackSrc = getProjectImageDisplay(projectId, projectName, {}, 0).src;
  const fallback = display.source === "custom" ? fallbackSrc : null;
  const img = useImageWithFallback(display.src, fallback);
  const showCustomFailed = img.usingFallback && display.source === "custom";
  const badgeLabel = showCustomFailed
    ? "加载失败"
    : display.source === "custom"
      ? "自定义"
      : "默认";
  const badgeColor = showCustomFailed
    ? "rgba(239,68,68,0.9)"
    : display.source === "custom"
      ? "rgba(251,191,36,0.9)"
      : "rgba(148,163,184,0.85)";

  if (img.showPlaceholder) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "16/9",
          borderRadius: "0.5rem",
          border: "1px dashed rgba(239,68,68,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem",
          color: "var(--color-text-muted)",
          fontSize: uiRem(0.72),
          textAlign: "center",
          background: "rgba(0,0,0,0.35)",
        }}
      >
        请确认管理子域已部署含 images/ 的 dist
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`放大预览：${projectName}`}
      onClick={() => onZoom(img.src)}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        borderRadius: "0.5rem",
        overflow: "hidden",
        cursor: "zoom-in",
        border: "1px solid rgba(255,255,255,0.12)",
        padding: 0,
        background: "rgba(0,0,0,0.35)",
        display: "block",
      }}
    >
      <span style={badgeStyle(badgeColor)}>{badgeLabel}</span>
      <img
        src={img.src}
        alt={projectName}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        onError={img.onError}
      />
    </button>
  );
};

const PERSONA_ENTRIES = Object.entries(FATE_SKETCH_CONFIG).map(([name, cfg]) => ({
  name: cfg.name,
  slug: FATE_SKETCH_IMAGE_SLUG[name] ?? "Poet",
}));

export const AdminImageManager: React.FC<Props> = ({
  projectImages,
  eraImages,
  buffImages,
  personaImages,
  onProjectImageVersion,
  onEraImageVersion,
  onBuffImageVersion,
  onPersonaImageVersion,
  onBack,
}) => {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; fallbackSrc?: string } | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [buffLoadFailed, setBuffLoadFailed] = useState<Record<string, boolean>>({});
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    era: null,
    buff: null,
    project: null,
    persona: null,
  });

  const busy = uploadingKey !== null;

  const scrollToSection = (id: SectionId) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDeleteImage = async (
    id: number | string,
    type: "project" | "era" | "buff" | "persona",
    itemKey: string,
  ) => {
    if (busy) return;
    if (!window.confirm("确定要删除这张自定义图片吗？删除后将恢复为玩家端默认展示。")) return;
    const path =
      type === "era"
        ? "delete-era-image"
        : type === "buff"
          ? "delete-buff-image"
          : type === "persona"
            ? "delete-persona-image"
            : "delete-image";
    setUploadingKey(`delete-${itemKey}`);
    try {
      const res = await fetch(adminApiUrl(`/api/${path}`), {
        method: "POST",
        headers: { ...adminAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: String(id) }),
      });
      if (res.status === 401) alert("未授权：请重新登录管理后台");
      else if (!res.ok) alert("删除失败");
      else {
        const data = (await res.json().catch(() => null)) as { timestamp?: number } | null;
        const ts = data?.timestamp ?? 0;
        if (type === "buff") {
          onBuffImageVersion(String(id), ts);
          setBuffLoadFailed((prev) => ({ ...prev, [String(id)]: false }));
        }
        if (type === "era") onEraImageVersion(String(id), ts);
        if (type === "project") onProjectImageVersion(Number(id), ts);
        if (type === "persona") onPersonaImageVersion(String(id), ts);
      }
    } catch (err) {
      console.error("Delete failed", err);
      alert("删除失败，请检查网络后重试");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleImageUpload = (
    id: string | number,
    type: "project" | "era" | "buff" | "persona",
    itemKey: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || busy) return;

    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件（JPG、PNG 等）");
      input.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(`图片过大，请使用小于 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 的文件`);
      input.value = "";
      return;
    }

    setUploadingKey(`upload-${itemKey}`);
    const reader = new FileReader();
    reader.onerror = () => {
      alert("无法读取文件");
      setUploadingKey(null);
      input.value = "";
    };
    reader.onload = (ev) => {
      if (typeof ev.target?.result !== "string") {
        setUploadingKey(null);
        return;
      }
      const img = new Image();
      img.onerror = () => {
        alert("图片格式无效");
        setUploadingKey(null);
        input.value = "";
      };
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            setUploadingKey(null);
            input.value = "";
            return;
          }
          const formData = new FormData();
          formData.append("id", id.toString());
          formData.append("image", blob, `${id}.jpg`);

          try {
            const res = await fetch(
              adminApiUrl(
                `/api/${
                  type === "era"
                    ? "upload-era-image"
                    : type === "buff"
                      ? "upload-buff-image"
                      : type === "persona"
                        ? "upload-persona-image"
                        : "upload-image"
                }`,
              ),
              {
                method: "POST",
                headers: adminAuthHeaders(),
                body: formData,
              },
            );
            if (res.status === 401) alert("未授权：请重新登录管理后台");
            else if (!res.ok) alert("上传失败！");
            else {
              const data = (await res.json().catch(() => null)) as { timestamp?: number } | null;
              const ts = data?.timestamp ?? Date.now();
              if (type === "buff") {
                onBuffImageVersion(String(id), ts);
                setBuffLoadFailed((prev) => ({ ...prev, [String(id)]: false }));
              }
              if (type === "era") onEraImageVersion(String(id), ts);
              if (type === "project") onProjectImageVersion(Number(id), ts);
              if (type === "persona") onPersonaImageVersion(String(id), ts);
            }
          } catch (err) {
            console.error(err);
            alert("上传出错，请检查网络后重试");
          } finally {
            setUploadingKey(null);
            input.value = "";
          }
        }, "image/jpeg", 0.6);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const triggerUpload = (key: string) => {
    if (busy) return;
    uploadInputRefs.current[key]?.click();
  };

  return (
    <div className="admin-image-manager" style={{ minHeight: "100vh", background: "#070b14", color: "white", padding: "2rem 1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} disabled={busy} style={{ marginBottom: "0.75rem" }}>
            ← 返回房间列表
          </button>
          <h1 style={{ fontSize: "2rem", fontWeight: 900, color: "#fbbf24", marginBottom: "0.25rem" }}>
            图片资源管理
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.9) }}>
            预览与玩家端一致；点击缩略图可放大。单张不超过 8MB。
          </p>
        </div>
      </div>

      <nav className="admin-image-manager__section-nav" aria-label="资源分类">
        {(
          [
            ["era", "时代图片"],
            ["buff", "道具卡面"],
            ["project", "项目图片"],
            ["persona", "人格立绘"],
          ] as [SectionId, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className="btn btn-ghost btn-sm" onClick={() => scrollToSection(id)}>
            {label}
          </button>
        ))}
      </nav>

      {busy && (
        <div
          role="status"
          style={{
            marginBottom: "1rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(59,130,246,0.12)",
            border: "1px solid rgba(59,130,246,0.35)",
            color: "#93c5fd",
            fontSize: uiRem(0.85),
          }}
        >
          处理中，请稍候…
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
        <section ref={(el) => { sectionRefs.current.era = el; }}>
          <h2 style={{ fontSize: uiRem(1.05), color: "#60a5fa", marginBottom: "1rem" }} id="admin-images-era">
            时代图片（竖版 2:3）
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "1rem" }}>
            {ERA_NAMES.map((eraName) => {
              const display = getEraImageDisplay(eraName, eraImages);
              const key = `era-${eraName}`;
              const itemBusy = uploadingKey === `upload-${key}` || uploadingKey === `delete-${key}`;
              return (
                <div
                  key={eraName}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "0.75rem",
                    padding: "0.75rem",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ fontSize: uiRem(0.8), fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" }}>
                    {eraName}
                  </div>
                  <RasterPreview
                    display={display}
                    alt={eraName}
                    aspectRatio="2/3"
                    defaultFallbackSrc={getEraDefaultImageSrc(eraName)}
                    onZoom={(src) => setLightbox({ src, alt: eraName })}
                    badgeLabel={display.source === "custom" ? "自定义" : "默认"}
                    badgeColor={display.source === "custom" ? "rgba(251,191,36,0.9)" : "rgba(148,163,184,0.85)"}
                  />
                  <input
                    ref={(el) => {
                      uploadInputRefs.current[key] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleImageUpload(eraName, "era", key, e)}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-full"
                      disabled={busy}
                      onClick={() => triggerUpload(key)}
                    >
                      {itemBusy ? "处理中…" : "更换图片"}
                    </button>
                    {display.source === "custom" && (
                      <button
                        type="button"
                        className="admin-delete-btn"
                        disabled={busy}
                        onClick={() => handleDeleteImage(eraName, "era", key)}
                      >
                        删除自定义
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section ref={(el) => { sectionRefs.current.buff = el; }}>
          <h2 style={{ fontSize: uiRem(1.05), color: "#c084fc", marginBottom: "1rem" }} id="admin-images-buff">
            拍卖道具卡面（竖版 3:4）
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "1rem" }}>
            {ALL_AUCTION_BUFF_IDS.map((cardId) => {
              const def = BUFF_CARD_DEFS[cardId];
              const custom = hasBuffCustomImage(cardId, buffImages);
              const display = getBuffImageDisplay(cardId, buffImages);
              const loadFailed = buffLoadFailed[cardId];
              const key = `buff-${cardId}`;
              const itemBusy = uploadingKey === `upload-${key}` || uploadingKey === `delete-${key}`;
              const badgeLabel =
                loadFailed && custom
                  ? "加载失败"
                  : custom
                    ? "自定义"
                    : loadFailed
                      ? "缺失"
                      : "默认";
              const badgeColor =
                loadFailed && custom
                  ? "rgba(239,68,68,0.9)"
                  : custom
                    ? "rgba(251,191,36,0.9)"
                    : loadFailed
                      ? "rgba(239,68,68,0.75)"
                      : "rgba(34,197,94,0.85)";

              return (
                <div
                  key={cardId}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "0.75rem",
                    padding: "0.75rem",
                    border: "1px solid rgba(168,85,247,0.2)",
                  }}
                >
                  <div
                    style={{
                      fontSize: uiRem(0.75),
                      fontWeight: 700,
                      textAlign: "center",
                      color: def?.color || "#d8b4fe",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {def?.name || cardId}
                  </div>
                  <div style={{ position: "relative" }}>
                    <span style={badgeStyle(badgeColor)}>{badgeLabel}</span>
                    {!loadFailed ? (
                      <button
                        type="button"
                        aria-label={`放大预览：${def?.name || cardId}`}
                        onClick={() =>
                          setLightbox({
                            src: display.src,
                            alt: def?.name || cardId,
                            fallbackSrc:
                              display.source === "custom" ? getBuffDefaultImageSrc(cardId) : undefined,
                          })
                        }
                        style={{
                          display: "block",
                          width: "100%",
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          cursor: "zoom-in",
                        }}
                      >
                        <BuffCardArt cardId={cardId} buffImages={buffImages} compact />
                      </button>
                    ) : (
                      <BuffCardArt
                        cardId={cardId}
                        buffImages={buffImages}
                        compact
                        onImageBroken={() => setBuffLoadFailed((prev) => ({ ...prev, [cardId]: true }))}
                      />
                    )}
                  </div>
                  <input
                    ref={(el) => {
                      uploadInputRefs.current[key] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleImageUpload(cardId, "buff", key, e)}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-full"
                      disabled={busy}
                      onClick={() => triggerUpload(key)}
                    >
                      {itemBusy ? "处理中…" : "更换图片"}
                    </button>
                    {custom && (
                      <button
                        type="button"
                        className="admin-delete-btn"
                        disabled={busy}
                        onClick={() => handleDeleteImage(cardId, "buff", key)}
                      >
                        删除自定义
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section ref={(el) => { sectionRefs.current.project = el; }}>
          <h2 style={{ fontSize: uiRem(1.05), color: "#fbbf24", marginBottom: "1rem" }} id="admin-images-project">
            项目图片（横版 16:9）
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
            {ALL_PROJECTS.map((p) => {
              const display = getProjectImageDisplay(p.id, p.name, projectImages);
              const key = `project-${p.id}`;
              const itemBusy = uploadingKey === `upload-${key}` || uploadingKey === `delete-${key}`;
              return (
                <div
                  key={p.id}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "0.75rem",
                    padding: "0.75rem",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontSize: uiRem(0.75),
                      color: "var(--color-text-secondary)",
                      textAlign: "center",
                      marginBottom: "0.5rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={p.name}
                  >
                    [{p.era}] {p.name}
                  </div>
                  <ProjectRasterPreview
                    projectId={p.id}
                    projectName={p.name}
                    projectImages={projectImages}
                    onZoom={(src) => setLightbox({ src, alt: p.name })}
                  />
                  <input
                    ref={(el) => {
                      uploadInputRefs.current[key] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleImageUpload(p.id, "project", key, e)}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-full"
                      disabled={busy}
                      onClick={() => triggerUpload(key)}
                    >
                      {itemBusy ? "处理中…" : "更换图片"}
                    </button>
                    {display.source === "custom" && (
                      <button
                        type="button"
                        className="admin-delete-btn"
                        disabled={busy}
                        onClick={() => handleDeleteImage(p.id, "project", key)}
                      >
                        删除自定义
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section ref={(el) => { sectionRefs.current.persona = el; }}>
          <h2 style={{ fontSize: uiRem(1.05), color: "#d8b4fe", marginBottom: "1rem" }} id="admin-images-persona">
            人格立绘（竖版 2:3）
          </h2>
          <p style={{ fontSize: uiRem(0.8), color: "var(--color-text-muted)", marginBottom: "1rem" }}>
            终局页主立绘与「色彩」弹窗使用；未上传时默认采用站点内 /images/personas 立绘。
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "1rem" }}>
            {PERSONA_ENTRIES.map(({ name, slug }) => {
              const display = getPersonaImageDisplay(name, personaImages);
              const key = `persona-${slug}`;
              const itemBusy = uploadingKey === `upload-${key}` || uploadingKey === `delete-${key}`;
              const hasCustom = hasPersonaCustomImage(slug, personaImages);
              return (
                <div
                  key={slug}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "0.75rem",
                    padding: "0.75rem",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ fontSize: uiRem(0.75), fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" }}>
                    {name}
                  </div>
                  <RasterPreview
                    display={display}
                    alt={name}
                    aspectRatio="2/3"
                    defaultFallbackSrc={getPersonaDefaultImageSrc(slug)}
                    onZoom={(src) => setLightbox({ src, alt: name })}
                    badgeLabel={display.source === "custom" ? "自定义" : "默认"}
                    badgeColor={display.source === "custom" ? "rgba(251,191,36,0.9)" : "rgba(148,163,184,0.85)"}
                  />
                  <input
                    ref={(el) => {
                      uploadInputRefs.current[key] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleImageUpload(slug, "persona", key, e)}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-full"
                      disabled={busy}
                      onClick={() => triggerUpload(key)}
                    >
                      {itemBusy ? "处理中…" : "更换图片"}
                    </button>
                    {hasCustom && (
                      <button
                        type="button"
                        className="admin-delete-btn"
                        disabled={busy}
                        onClick={() => handleDeleteImage(slug, "persona", key)}
                      >
                        删除自定义
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          fallbackSrc={lightbox.fallbackSrc}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};
