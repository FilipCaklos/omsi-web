"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { deleteCommunityImageAction } from "@/app/actions/community-images";
import { FormAlert } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { formatError, isAuthErrorCode } from "@/lib/form-state";

export type CommunityImage = { id: string; width: number; height: number; caption: string | null; owner: string; canDelete: boolean };

/** Fotky z hry od hráčov: mriežka s popisom a nahrávanie (po schválení moderátorom sa zobrazia všetkým). */
export function CommunityImages({ t, modId, images, canUpload }: { t: Dictionary; modId: string; images: CommunityImage[]; canUpload: boolean }) {
  const c = t.community;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function upload(form: HTMLFormElement) {
    setBusy(true);
    setMessage(null);
    try {
      const data = new FormData(form);
      data.set("kind", "COMMUNITY");
      data.set("modId", modId);
      const response = await fetch("/api/uploads/images", { method: "POST", body: data });
      const body = (await response.json().catch(() => ({}))) as { error?: string; approvedAt?: string | null };
      if (!response.ok) {
        setMessage({ tone: "error", text: body.error && isAuthErrorCode(body.error, t) ? formatError(t, body.error) : c.failed });
        return;
      }
      form.reset();
      setMessage({ tone: "success", text: body.approvedAt ? c.published : c.pending });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {images.length === 0 ? (
        <p className="text-sm text-muted">{c.empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <li key={image.id} className="overflow-hidden rounded-[5px] border border-line bg-surface">
              <a href={`/api/media/${image.id}?variant=full`} target="_blank" rel="noopener">
                <img src={`/api/media/${image.id}?variant=thumb`} alt={image.caption ?? c.alt.replace("{owner}", image.owner)} width={640} height={360} loading="lazy" className="aspect-video w-full object-cover" />
              </a>
              <div className="flex items-start justify-between gap-2 px-2.5 py-2 text-xs">
                <p className="min-w-0">
                  {image.caption && <span className="block text-text">{image.caption}</span>}
                  <span className="text-muted">@{image.owner}</span>
                </p>
                {image.canDelete && (
                  <form action={deleteCommunityImageAction}>
                    <input type="hidden" name="imageId" value={image.id} />
                    <button type="submit" title={c.delete} className="text-muted hover:text-alert">
                      <Trash2 size={13} aria-hidden />
                      <span className="sr-only">{c.delete}</span>
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-[5px] border border-dashed border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void upload(event.currentTarget);
          }}
        >
          <label className="min-w-48 flex-1 space-y-1 text-xs">
            <span className="block font-medium">{c.file}</span>
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-xs file:mr-2 file:rounded-[5px] file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-text" />
          </label>
          <label className="min-w-48 flex-1 space-y-1 text-xs">
            <span className="block font-medium">{c.caption}</span>
            <input name="caption" maxLength={140} className="h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm" />
          </label>
          <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-amber px-3 text-sm font-semibold text-amber-ink hover:bg-amber-hover disabled:opacity-70">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />} {c.upload}
          </button>
          <p className="w-full text-[11px] text-muted">{c.hint}</p>
        </form>
      )}
      {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
    </div>
  );
}
