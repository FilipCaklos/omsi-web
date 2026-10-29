"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Image = { id: string; width: number; height: number };

/** Galéria screenshotov: náhľady 16:9, kliknutie otvorí plnú verziu v natívnom <dialog>. */
export function Gallery({ images, title, labels }: { images: Image[]; title: string; labels: { close: string; previous: string; next: string } }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const current = images[index];
  if (images.length === 0 || !current) return null;

  const open = (i: number) => {
    setIndex(i);
    dialog.current?.showModal();
  };
  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => open(0)} className="block w-full overflow-hidden rounded-[5px] border border-line">
        <img
          src={`/api/media/${images[0]?.id}?variant=full`}
          alt={`${title} – 1`}
          width={images[0]?.width}
          height={images[0]?.height}
          className="aspect-video w-full object-cover"
        />
      </button>
      {images.length > 1 && (
        <ul className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          {images.slice(1).map((image, i) => (
            <li key={image.id} className="shrink-0">
              <button type="button" onClick={() => open(i + 1)} className="block overflow-hidden rounded-[3px] border border-line hover:border-amber">
                <img src={`/api/media/${image.id}?variant=thumb`} alt={`${title} – ${i + 2}`} width={160} height={90} loading="lazy" className="h-[68px] w-[120px] object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialog}
        className="m-auto max-h-[94vh] w-[min(1400px,96vw)] bg-transparent p-0 backdrop:bg-black/85"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") step(1);
          if (event.key === "ArrowLeft") step(-1);
        }}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="relative">
          <img src={`/api/media/${current.id}?variant=full`} alt={`${title} – ${index + 1}`} className="max-h-[90vh] w-full object-contain" />
          <p className="absolute left-2 top-2 rounded-[3px] bg-black/70 px-2 py-0.5 font-mono text-xs text-white">
            {index + 1} / {images.length}
          </p>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={labels.close} className="absolute right-2 top-2 grid size-9 place-items-center rounded-[3px] bg-black/70 text-white hover:bg-black">
            <X size={18} aria-hidden />
          </button>
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label={labels.previous} className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-[3px] bg-black/70 text-white hover:bg-black">
                <ChevronLeft size={20} aria-hidden />
              </button>
              <button type="button" onClick={() => step(1)} aria-label={labels.next} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-[3px] bg-black/70 text-white hover:bg-black">
                <ChevronRight size={20} aria-hidden />
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
