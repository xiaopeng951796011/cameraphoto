"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as exifr from "exifr";
import styles from "./page.module.css";

type FrameText = {
  maker: string;
  model: string;
  lens: string;
  focal: string;
  aperture: string;
  shutter: string;
  iso: string;
  date: string;
};

const emptyText: FrameText = {
  maker: "LEICA",
  model: "M11",
  lens: "Summilux 35mm",
  focal: "35mm",
  aperture: "f/1.4",
  shutter: "1/250s",
  iso: "ISO 200",
  date: "2026.06.10"
};

const textFields: Array<{ key: keyof FrameText; label: string }> = [
  { key: "maker", label: "品牌" },
  { key: "model", label: "型号" },
  { key: "lens", label: "镜头" },
  { key: "focal", label: "焦距" },
  { key: "aperture", label: "光圈" },
  { key: "shutter", label: "快门" },
  { key: "iso", label: "ISO" },
  { key: "date", label: "日期" }
];

function formatFocal(value: unknown) {
  const focal = numericExifValue(value);
  return focal ? `${trimNumber(focal)}mm` : "";
}

function formatAperture(value: unknown) {
  const aperture = numericExifValue(value);
  return aperture ? `f/${trimNumber(aperture)}` : "";
}

function formatIso(value: unknown) {
  if (!value) return "";
  return `ISO ${value}`;
}

function formatShutter(value: unknown) {
  const shutter = numericExifValue(value);
  if (!shutter) return "";
  if (shutter >= 1) return `${trimNumber(shutter)}s`;
  return `1/${Math.round(1 / shutter)}s`;
}

function formatDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join(".");
  }

  const raw = clean(value);
  const match = raw.match(/^(\d{4})[:.-](\d{2})[:.-](\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "";
}

function numericExifValue(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "valueOf" in value) {
    const numeric = Number(value.valueOf());
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function exifText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => clean(item) || String(item)).join(" ");
  if (typeof value === "number") return String(value);
  return clean(value);
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function isIphonePhoto(tags: Record<string, unknown>) {
  const make = exifText(tags.Make).toLowerCase();
  const model = exifText(tags.Model).toLowerCase();
  return make.includes("apple") || model.includes("iphone");
}

function inferIphoneFocal(tags: Record<string, unknown>) {
  if (!isIphonePhoto(tags)) return "";

  const focal = numericExifValue(tags.FocalLength);
  const zoom = numericExifValue(tags.DigitalZoomRatio);
  const lens = `${exifText(tags.LensModel)} ${exifText(tags.LensSpecification)}`.toLowerCase();
  const model = exifText(tags.Model).toLowerCase();

  if (zoom >= 1.7 && zoom < 2.5) return "48mm";
  if (zoom >= 2.5 && zoom < 4.5) return "77mm";
  if (zoom >= 4.5) return "120mm";

  if (includesAny(lens, ["ultra", "超广角"])) return "13mm";
  if (includesAny(lens, ["tele", "长焦", "tetraprism", "periscope", "5x", "120mm"])) {
    if (includesAny(model, ["15 pro max", "16 pro", "16 pro max"]) || includesAny(lens, ["5x", "120mm"])) {
      return "120mm";
    }
    return "77mm";
  }

  if (focal >= 1.3 && focal <= 2.8) return "13mm";

  if (focal >= 4.5 && focal <= 7.4) {
    return includesAny(model, ["14 pro", "15 pro", "16 pro", "iphone 15", "iphone 16"]) ? "24mm" : "26mm";
  }

  if (focal >= 8 && focal <= 12) {
    if (includesAny(model, ["15 pro max", "16 pro", "16 pro max"])) return "120mm";
    if (includesAny(lens, ["main", "wide", "48mm", "2x"])) return "48mm";
    return "77mm";
  }

  return "";
}

function getDisplayFocal(tags: Record<string, unknown>) {
  return (
    formatFocal(tags.FocalLengthIn35mmFilm) ||
    formatFocal(tags.FocalLengthIn35mmFormat) ||
    inferIphoneFocal(tags) ||
    formatFocal(tags.FocalLength)
  );
}

function getExifText(tags: Record<string, unknown>): FrameText {
  return {
    maker: clean(tags.Make) || emptyText.maker,
    model: clean(tags.Model) || emptyText.model,
    lens: clean(tags.LensModel) || clean(tags.Lens) || emptyText.lens,
    focal: getDisplayFocal(tags) || emptyText.focal,
    aperture: formatAperture(tags.FNumber) || formatAperture(tags.ApertureValue) || emptyText.aperture,
    shutter: formatShutter(tags.ExposureTime) || formatShutter(tags.ShutterSpeedValue) || emptyText.shutter,
    iso: formatIso(tags.ISO) || formatIso(tags.PhotographicSensitivity) || emptyText.iso,
    date: formatDate(tags.DateTimeOriginal) || formatDate(tags.CreateDate) || formatDate(tags.ModifyDate) || emptyText.date
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontWeight: number,
  fontSize: number,
  minFontSize: number
) {
  let nextFontSize = fontSize;
  ctx.font = `${fontWeight} ${nextFontSize}px -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial`;

  while (ctx.measureText(text).width > maxWidth && nextFontSize > minFontSize) {
    nextFontSize -= 1;
    ctx.font = `${fontWeight} ${nextFontSize}px -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial`;
  }

  if (ctx.measureText(text).width <= maxWidth) {
    return { text, fontSize: nextFontSize };
  }

  const ellipsis = "...";
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}${ellipsis}`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }

  return { text: `${trimmed}${ellipsis}`, fontSize: nextFontSize };
}

function getBrandDotColor(maker: string) {
  const brand = maker.toLowerCase();
  if (brand.includes("leica")) return "#111111";
  if (brand.includes("sony")) return "#3f3f3f";
  if (brand.includes("canon")) return "#b8b8b8";
  if (brand.includes("fujifilm") || brand.includes("fuji")) return "#777777";
  return "#555555";
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [frameText, setFrameText] = useState<FrameText>(emptyText);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState("");
  const [imageVersion, setImageVersion] = useState(0);

  const detailsLine = useMemo(
    () => [frameText.focal, frameText.aperture, frameText.shutter, frameText.iso].filter(Boolean).join(" · "),
    [frameText]
  );

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const exportWidth = 1800;
    const imageAreaWidth = 1460;
    const outerPadding = 170;
    const photoTop = 150;
    const captionTopGap = 70;
    const captionHeight = 210;

    const imageAspect = image ? image.naturalHeight / image.naturalWidth : 0.72;
    const imageAreaHeight = Math.round(imageAreaWidth * Math.min(Math.max(imageAspect, 0.56), 1.32));
    const exportHeight = photoTop + imageAreaHeight + captionTopGap + captionHeight + 120;

    canvas.width = exportWidth;
    canvas.height = exportHeight;

    ctx.fillStyle = "#fbfbfa";
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    const photoX = outerPadding;
    const photoY = photoTop;
    const photoW = exportWidth - outerPadding * 2;
    const photoH = imageAreaHeight;
    const radius = 44;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    roundRect(ctx, photoX, photoY, photoW, photoH, radius);
    ctx.fillStyle = "#f0f0ee";
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, photoX, photoY, photoW, photoH, radius);
    ctx.clip();
    if (image) {
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      const targetRatio = photoW / photoH;
      let sx = 0;
      let sy = 0;
      let sw = image.naturalWidth;
      let sh = image.naturalHeight;

      if (sourceRatio > targetRatio) {
        sw = image.naturalHeight * targetRatio;
        sx = (image.naturalWidth - sw) / 2;
      } else {
        sh = image.naturalWidth / targetRatio;
        sy = (image.naturalHeight - sh) / 2;
      }
      ctx.drawImage(image, sx, sy, sw, sh, photoX, photoY, photoW, photoH);
    } else {
      ctx.fillStyle = "#ededeb";
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.fillStyle = "#8a8a84";
      ctx.font = "500 48px -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Upload a photo", exportWidth / 2, photoY + photoH / 2);
    }
    ctx.restore();

    const captionY = photoY + photoH + captionTopGap;
    const centerX = exportWidth / 2;
    const brand = frameText.maker.toUpperCase();
    const title = [brand, frameText.model].filter(Boolean).join("  ");

    ctx.fillStyle = "#111111";
    ctx.textBaseline = "middle";
    const iconRadius = 10;
    const iconGap = 18;
    const maxTitleGroupWidth = exportWidth * 0.7;
    const maxTextWidth = maxTitleGroupWidth - iconRadius * 2 - iconGap;
    const fittedTitle = fitTextToWidth(ctx, title, maxTextWidth, 600, 42, 32);
    const textWidth = ctx.measureText(fittedTitle.text).width;
    const titleGroupWidth = iconRadius * 2 + iconGap + textWidth;
    const titleGroupX = centerX - titleGroupWidth / 2;
    const iconX = titleGroupX + iconRadius;
    const iconY = captionY + 36;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
    ctx.fillStyle = getBrandDotColor(frameText.maker);
    ctx.fill();

    ctx.fillStyle = "#111111";
    ctx.font = `600 ${fittedTitle.fontSize}px -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial`;
    ctx.textAlign = "left";
    ctx.fillText(fittedTitle.text, titleGroupX + iconRadius * 2 + iconGap, iconY + 1);

    ctx.font = "500 30px -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial";
    ctx.fillStyle = "#666666";
    ctx.textAlign = "center";
    ctx.fillText(detailsLine, centerX, captionY + 92);

    ctx.font = "400 28px -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial";
    ctx.fillStyle = "#999999";
    ctx.fillText(frameText.date, centerX, captionY + 140);
  }, [detailsLine, frameText, image]);

  useEffect(() => {
    drawFrame();
  }, [drawFrame]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReading(true);
    setError("");
    setFileName(file.name);

    const objectUrl = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setImageVersion((current) => current + 1);
      URL.revokeObjectURL(objectUrl);
    };
    nextImage.onerror = () => {
      setError("照片读取失败，请换一张图片试试。");
      URL.revokeObjectURL(objectUrl);
    };
    nextImage.src = objectUrl;

    try {
      const tags = await exifr.parse(file, {
        translateValues: false,
        tiff: true,
        exif: true,
        gps: false,
        xmp: false,
        icc: false
      });
      if (tags) {
        console.log("EXIF tags", tags);
        console.log("EXIF focal debug", {
          FocalLength: tags.FocalLength,
          FocalLengthIn35mmFilm: tags.FocalLengthIn35mmFilm,
          FocalLengthIn35mmFormat: (tags as Record<string, unknown>).FocalLengthIn35mmFormat,
          LensModel: tags.LensModel,
          LensSpecification: tags.LensSpecification,
          DigitalZoomRatio: tags.DigitalZoomRatio,
          Make: tags.Make,
          Model: tags.Model
        });
        setFrameText(getExifText(tags as Record<string, unknown>));
      }
    } catch {
      setError("没有读到完整 EXIF，已保留可手动修改的默认文字。");
    } finally {
      setIsReading(false);
    }
  };

  const updateText = (key: keyof FrameText, value: string) => {
    setFrameText((current) => ({ ...current, [key]: value }));
  };

  const downloadPng = () => {
    drawFrame();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    const baseName = fileName.replace(/\.[^.]+$/, "") || "photo-frame";
    link.download = `${baseName}-frame.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <h1>PHOTO FRAME</h1>
          <p className={styles.subtitle}>Create clean and professional photography presentation frames.</p>
        </div>
        <button className={styles.uploadButton} onClick={() => fileInputRef.current?.click()}>
          上传照片
        </button>
        <input ref={fileInputRef} className={styles.fileInput} type="file" accept="image/*" onChange={handleFile} />
      </section>

      <section className={styles.workspace}>
        <div className={styles.previewPanel}>
          <canvas key={imageVersion} ref={canvasRef} className={styles.canvas} aria-label="摄影相框预览" />
        </div>

        <aside className={styles.editor}>
          <div className={styles.editorHeader}>
            <div>
              <p className={styles.kicker}>Metadata</p>
              <h2>文字微调</h2>
            </div>
            <button className={styles.downloadButton} onClick={downloadPng}>
              下载 PNG
            </button>
          </div>

          <div className={styles.status}>
            {isReading ? "正在读取 EXIF..." : fileName || "上传照片后会自动填入相机信息"}
            {error ? <span>{error}</span> : null}
          </div>

          <div className={styles.formGrid}>
            {textFields.map((field) => (
              <label key={field.key} className={styles.field}>
                <span>{field.label}</span>
                <input value={frameText[field.key]} onChange={(event) => updateText(field.key, event.target.value)} />
              </label>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
