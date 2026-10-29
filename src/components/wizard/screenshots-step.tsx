"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, LoaderCircle, Star, Trash2 } from "lucide-react";
import { deleteImageAction, reorderImagesAction, setPrimaryImageAction } from "@/app/actions/wizard";
import { FormAlert } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { IMAGE_EXTENSIONS } from "@/lib/upload-policy";

type Image = { id: string; isPrimary: boolean };

/** Správa screenshotov: viacnásobný upload, poradie ťahaním (aj tlačidlami pre klávesnicu), hlavná fotka. */
export function ScreenshotsStep({ t, modId, images }: { t: Dictionary; modId: string; images: Image[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState(images);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const w = t.wizard;

  // Po router.refresh() prídu nové props – zosynchronizujeme poradie
  const signature = images.map((i) => `${i.id}:${i.isPrimary}`).join(",");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setOrder(images);
  }

  async function upload(files: FileList | File[]) {
    const list = [...files];
    setErrors([]);
    setUploading({ done: 0, total: list.length });
    const failed: string[] = [];
    for (const [index, file] of list.entries()) {
      const form = new FormData();
      form.set("file", file);
      form.set("modId", modId);
      form.set("kind", "SCREENSHOT");
      try {
        const response = await fetch("/api/uploads/images", { method: "POST", body: form });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          const code = (body.error ?? "GENERIC") as keyof Dictionary["wizard"]["uploadErrors"];
          failed.push(`${file.name}: ${w.uploadErrors[code] ?? w.uploadErrors.GENERIC}`);
        }
      } catch {
        failed.push(`${file.name}: ${w.uploadErrors.NETWORK_ERROR}`);
      }
      setUploading({ done: index + 1, total: list.length });
    }
    setUploading(null);
    setErrors(failed);
    router.refresh();
  }

  function persist(next: Image[]) {
    setOrder(next);
    startTransition(async () => {
      await reorderImagesAction(modId, next.map((i) => i.id));
      router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    persist(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{w.screenshotsHint}</p>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length > 0) {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }
        }}
        className="flex flex-col items-center gap-2 rounded-[5px] border-2 border-dashed border-line px-4 py-6"
      >
        <button
          type="button"
          disabled={uploading !== null}
          onClick={() => input.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-[5px] bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-hover disabled:opacity-60"
        >
          {uploading ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />}
          {uploading ? `${uploading.done} / ${uploading.total}` : w.addScreenshots}
        </button>
        <span className="text-xs text-muted">{w.dropHere}</span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",")}
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {errors.length > 0 && (
        <FormAlert tone="error">
          <ul className="list-inside list-disc">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </FormAlert>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((image, index) => (
          <li
            key={image.id}
            draggable
            onDragStart={() => setDragId(image.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              if (dragId) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!dragId || dragId === image.id) return;
              e.preventDefault();
              const from = order.findIndex((i) => i.id === dragId);
              const next = [...order];
              const [item] = next.splice(from, 1);
              if (item) next.splice(index, 0, item);
              persist(next);
            }}
            className={`overflow-hidden rounded-[5px] border bg-surface ${image.isPrimary ? "border-amber" : "border-line"} ${dragId === image.id ? "opacity-50" : ""}`}
          >
            <div className="relative">
              <img src={`/api/media/${image.id}?variant=thumb`} alt="" className="aspect-video w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 grid size-7 cursor-grab place-items-center rounded-[3px] bg-black/60 text-white" aria-hidden>
                <GripVertical size={15} />
              </span>
              {image.isPrimary && <span className="led-tag absolute right-1.5 top-1.5">{w.primary}</span>}
            </div>
            <div className="flex items-center gap-1 p-1.5">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={w.moveUp} className="grid size-8 place-items-center rounded-[3px] text-muted hover:bg-raised disabled:opacity-30">
                <ArrowUp size={15} aria-hidden />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={w.moveDown} className="grid size-8 place-items-center rounded-[3px] text-muted hover:bg-raised disabled:opacity-30">
                <ArrowDown size={15} aria-hidden />
              </button>
              {!image.isPrimary && (
                <button
                  type="button"
                  onClick={() => startTransition(async () => { await setPrimaryImageAction(modId, image.id); router.refresh(); })}
                  className="inline-flex h-8 items-center gap-1 rounded-[3px] px-2 text-xs text-muted hover:bg-raised hover:text-text"
                >
                  <Star size={13} aria-hidden /> {w.setPrimary}
                </button>
              )}
              <button
                type="button"
                onClick={() => startTransition(async () => { await deleteImageAction(modId, image.id); router.refresh(); })}
                aria-label={w.deleteImage}
                className="ml-auto grid size-8 place-items-center rounded-[3px] text-muted hover:bg-alert-soft hover:text-alert"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
