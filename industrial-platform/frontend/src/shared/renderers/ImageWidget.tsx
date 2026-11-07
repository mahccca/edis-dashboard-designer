import type { CSSProperties } from "react";
import type { RendererProps } from "../element-registry";
import styles from "./ImageWidget.module.css";

function asUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^(https?:|data:image\/)/i.test(t) || t.startsWith("/")) return t;
  return null;
}

export function ImageWidget({ node, spec, inputs }: RendererProps) {
  const props = { ...spec.defaults, ...(node.props ?? {}) } as Record<string, unknown>;
  const propSrc = typeof props.src === "string" ? props.src : "";
  const alt = typeof props.alt === "string" ? props.alt : "";
  const fit = props.objectFit === "cover" || props.objectFit === "fill" ? props.objectFit : "contain";
  const height = typeof props.height === "number" && props.height > 0 ? props.height : 160;

  const bound = inputs.src;
  const boundRaw = Array.isArray(bound?.value) && bound.value.length === 1 ? bound.value[0] : bound?.value;
  const fromBinding = bound && (bound.quality === "good" || bound.quality === "uncertain" || bound.quality === "stale")
    ? asUrl(boundRaw)
    : null;
  const src = fromBinding ?? asUrl(propSrc);

  const frameStyle: CSSProperties = { height };
  const imgStyle: CSSProperties = { objectFit: fit, height };

  return (
    <div className={styles.frame} style={frameStyle} data-renderer="builtin.image@1">
      {src ? (
        <img className={styles.img} style={imgStyle} src={src} alt={alt || "image"} />
      ) : (
        <div className={styles.placeholder}>آدرس تصویر تنظیم نشده</div>
      )}
    </div>
  );
}
