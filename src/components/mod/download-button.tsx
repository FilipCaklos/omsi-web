"use client";

import { useRef } from "react";
import { Download, ExternalLink, Gamepad2, Package, TriangleAlert, X } from "lucide-react";

export type DialogDependency =
  | { kind: "STEAM_DLC"; name: string; url: string | null; note: string | null }
  | { kind: "INTERNAL_MOD"; slug: string; title: string; mainFileId: string | null; note: string | null }
  | { kind: "EXTERNAL_LINK"; label: string; url: string; note: string | null };

export type DownloadLabels = {
  dialogTitle: string;
  dialogBody: string;
  continueDownload: string;
  close: string;
  dlc: string;
  freeware: string;
  openSteam: string;
  downloadDependency: string;
  externalLink: string;
  requires4gb: string;
  requires4gbHelp: string;
};

/** Obyčajný POST formulár na /api/download → 303 → súbor. Funguje bez JavaScriptu. */
function DownloadForm({ fileId, className, children }: { fileId: string; className: string; children: React.ReactNode }) {
  return (
    <form method="post" action="/api/download" className="contents">
      <input type="hidden" name="fileId" value={fileId} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

/**
 * Tlačidlo Stiahnuť. Ak má mod povinné závislosti alebo vyžaduje 4GB Patch,
 * namiesto okamžitého stiahnutia otvorí okno so zoznamom závislostí a tlačidlom na 1 klik.
 */
export function DownloadButton({
  fileId,
  label,
  variant,
  dependencies,
  requires4gb,
  labels,
}: {
  fileId: string;
  label: React.ReactNode;
  variant: "primary" | "secondary";
  dependencies: DialogDependency[];
  requires4gb: boolean;
  labels: DownloadLabels;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const needsDialog = dependencies.length > 0 || requires4gb;
  const buttonClass =
    variant === "primary"
      ? "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[5px] bg-amber px-4 py-2 text-[15px] font-bold text-amber-ink hover:bg-amber-hover"
      : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[5px] border border-amber/60 px-3 text-sm font-semibold text-text hover:bg-amber-soft";

  if (!needsDialog) {
    return (
      <DownloadForm fileId={fileId} className={buttonClass}>
        <Download size={variant === "primary" ? 19 : 15} strokeWidth={2.25} aria-hidden />
        {label}
      </DownloadForm>
    );
  }

  const dlcs = dependencies.filter((d) => d.kind === "STEAM_DLC");
  const others = dependencies.filter((d) => d.kind !== "STEAM_DLC");

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => dialog.current?.showModal()}>
        <Download size={variant === "primary" ? 19 : 15} strokeWidth={2.25} aria-hidden />
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`dl-title-${fileId}`}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-[5px] border border-line bg-surface p-0 text-text backdrop:bg-black/60"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={`dl-title-${fileId}`} className="text-base font-bold">
              {labels.dialogTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">{labels.dialogBody}</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={labels.close} className="grid size-8 place-items-center rounded-[3px] text-muted hover:bg-raised hover:text-text">
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          {requires4gb && (
            <p className="flex items-start gap-2 rounded-[5px] border border-alert/40 bg-alert-soft px-3 py-2 text-sm">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-alert" aria-hidden />
              <span>
                <strong className="block text-alert">{labels.requires4gb}</strong>
                {labels.requires4gbHelp}
              </span>
            </p>
          )}

          {dlcs.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{labels.dlc}</h3>
              <ul className="divide-y divide-line rounded-[5px] border border-line">
                {dlcs.map((d) => (
                  <li key={d.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Gamepad2 size={16} strokeWidth={1.75} className="shrink-0 text-alert" aria-hidden />
                    <span className="flex-1">{d.name}</span>
                    {d.url && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
                        {labels.openSteam}
                        <ExternalLink size={12} aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{labels.freeware}</h3>
              <ul className="divide-y divide-line rounded-[5px] border border-line">
                {others.map((d) =>
                  d.kind === "INTERNAL_MOD" ? (
                    <li key={d.slug} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Package size={16} strokeWidth={1.75} className="shrink-0 text-alert" aria-hidden />
                      <a href={`/mod/${d.slug}`} className="flex-1 hover:text-amber">
                        {d.title}
                      </a>
                      {d.mainFileId && (
                        <DownloadForm fileId={d.mainFileId} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[5px] border border-line px-2.5 text-xs font-semibold hover:bg-raised">
                          <Download size={13} strokeWidth={2.25} aria-hidden />
                          {labels.downloadDependency}
                        </DownloadForm>
                      )}
                    </li>
                  ) : d.kind === "EXTERNAL_LINK" ? (
                    <li key={d.url} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <ExternalLink size={16} strokeWidth={1.75} className="shrink-0 text-alert" aria-hidden />
                      <span className="flex-1">{d.label}</span>
                      <a href={d.url} target="_blank" rel="nofollow noopener noreferrer" className="text-xs text-muted hover:text-text">
                        {labels.externalLink}
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={() => dialog.current?.close()} className="h-10 rounded-[5px] border border-line px-4 text-sm hover:bg-raised">
            {labels.close}
          </button>
          <DownloadForm fileId={fileId} className="inline-flex h-10 items-center gap-2 rounded-[5px] bg-amber px-4 text-sm font-bold text-amber-ink hover:bg-amber-hover">
            <Download size={16} strokeWidth={2.25} aria-hidden />
            {labels.continueDownload}
          </DownloadForm>
        </div>
      </dialog>
    </>
  );
}
