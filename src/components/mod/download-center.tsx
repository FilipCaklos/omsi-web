import { ExternalLink, Hourglass, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { formatBytes, formatDate, formatExtension, formatNumber } from "@/lib/format";
import type { CenterFile, DownloadCenter } from "@/server/mods/download-center";
import { ArchiveContents } from "./archive-contents";
import { CopyHash } from "./copy-hash";
import { DownloadButton, type DialogDependency, type DownloadLabels } from "./download-button";

type Props = {
  center: DownloadCenter;
  dependencies: DialogDependency[];
  requires4gb: boolean;
  locale: AppLocale;
  t: Dictionary;
};

function downloadLabels(t: Dictionary): DownloadLabels {
  const m = t.modPage;
  return {
    dialogTitle: m.dialogTitle,
    dialogBody: m.dialogBody,
    continueDownload: m.continueDownload,
    close: m.close,
    dlc: m.dlc,
    freeware: m.freeware,
    openSteam: m.openSteam,
    downloadDependency: m.downloadDependency,
    externalLink: m.externalLink,
    requires4gb: m.requires4gb,
    requires4gbHelp: m.requires4gbHelp,
  };
}

function Meta({ file, locale, t }: { file: CenterFile; locale: AppLocale; t: Dictionary }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11.5px] text-muted">
      <span className="text-text">v{file.version.replace(/^v/i, "")}</span>
      <span>{formatBytes(locale, file.sizeBytes)}</span>
      <span>{formatExtension(file.extension)}</span>
      {file.archiveEntryCount > 0 && (
        <span>
          {formatNumber(locale, file.archiveEntryCount)} {t.modPage.entries}
          {file.archiveUncompressedBytes !== null && ` · ${formatBytes(locale, file.archiveUncompressedBytes)} ${t.modPage.unpacked}`}
        </span>
      )}
      <span>{formatDate(locale, file.versionPublishedAt)}</span>
      <span>
        {formatNumber(locale, file.downloadCount)} {t.mod.downloads}
      </span>
    </p>
  );
}

function Integrity({ file, t }: { file: CenterFile; t: Dictionary }) {
  if (file.scanStatus !== "CLEAN") {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-soft px-2 py-1 text-xs font-medium text-amber">
        <Hourglass size={13} strokeWidth={2} aria-hidden />
        {t.modPage.awaitingInspection}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-signal-soft px-1.5 py-0.5 text-[11px] font-semibold text-signal">
        <ShieldCheck size={12} strokeWidth={2.25} aria-hidden />
        {t.modPage.verified}
      </span>
      <code className="min-w-0 truncate font-mono text-[11px] text-muted" title={file.sha256}>
        {file.sha256}
      </code>
      <CopyHash value={file.sha256} labels={{ copy: t.modPage.copy, copied: t.modPage.copied }} />
    </div>
  );
}

function Extras({ file, t }: { file: CenterFile; t: Dictionary }) {
  return (
    <>
      {file.archiveFormat !== "NONE" && file.archiveEntryCount > 0 && file.scanStatus === "CLEAN" && (
        <ArchiveContents
          fileId={file.id}
          labels={{
            show: t.modPage.showContents,
            installRoot: t.modPage.installRoot,
            installPrefix: t.modPage.installPrefix,
            installUnknown: t.modPage.installUnknown,
            truncated: t.modPage.truncated,
          }}
        />
      )}
      {file.mirrorUrl && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <a
            href={file.mirrorUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[3px] border border-line px-2 py-1 font-medium text-text hover:bg-raised"
          >
            <ExternalLink size={12} aria-hidden />
            {t.modPage.mirror}: {file.mirrorLabel ?? new URL(file.mirrorUrl).hostname}
          </a>
          <span>{t.modPage.mirrorNote}</span>
        </p>
      )}
    </>
  );
}

function FileRow({ file, props, emphasize }: { file: CenterFile; props: Props; emphasize?: boolean }) {
  const { t, locale } = props;
  return (
    <li className={`space-y-2 px-4 py-3 ${emphasize ? "bg-amber-soft/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {file.kind === "PATCH" && <Wrench size={14} strokeWidth={2} className="text-amber" aria-hidden />}
            {file.displayName}
          </p>
          {file.description && <p className="text-xs text-muted">{file.description}</p>}
          <Meta file={file} locale={locale} t={t} />
        </div>
        {file.scanStatus === "CLEAN" && (
          <DownloadButton
            fileId={file.id}
            label={t.modPage.download}
            variant="secondary"
            dependencies={file.kind === "PATCH" || file.kind === "OPTIONAL" ? [] : props.dependencies}
            requires4gb={false}
            labels={downloadLabels(t)}
          />
        )}
      </div>
      <Integrity file={file} t={t} />
      <Extras file={file} t={t} />
    </li>
  );
}

/** Panel „Súbory na stiahnutie“ – hneď pod hlavičkou detailu modu. */
export function DownloadCenterPanel(props: Props) {
  const { center, t, locale } = props;
  const main = center.main;

  if (!main && center.patches.length === 0 && center.optional.length === 0) {
    return <p className="rounded-[5px] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t.modPage.noFiles}</p>;
  }

  return (
    <div className="space-y-4">
      {main && (
        <div className="space-y-3 rounded-[5px] border border-amber/50 bg-surface p-4">
          {main.scanStatus === "CLEAN" ? (
            <DownloadButton
              fileId={main.id}
              variant="primary"
              dependencies={props.dependencies}
              requires4gb={props.requires4gb}
              labels={downloadLabels(t)}
              label={
                <span className="flex flex-wrap items-baseline justify-center gap-x-2">
                  {t.modPage.downloadMain}
                  <span className="font-mono text-[13px] font-semibold opacity-80">
                    ({formatBytes(locale, main.sizeBytes)} • {formatExtension(main.extension)})
                  </span>
                </span>
              }
            />
          ) : (
            <Integrity file={main} t={t} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{main.displayName}</p>
            <Meta file={main} locale={locale} t={t} />
          </div>
          {main.description && <p className="text-xs text-muted">{main.description}</p>}
          {main.scanStatus === "CLEAN" && <Integrity file={main} t={t} />}
          <Extras file={main} t={t} />
          {props.requires4gb && (
            <p className="flex items-start gap-2 rounded-[3px] border border-alert/40 bg-alert-soft px-3 py-2 text-xs">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-alert" aria-hidden />
              <span>
                <strong className="text-alert">{t.modPage.requires4gb}.</strong> {t.modPage.requires4gbHelp}
              </span>
            </p>
          )}
        </div>
      )}

      {center.patches.length > 0 && (
        <section aria-label={t.modPage.patchTitle} className="overflow-hidden rounded-[5px] border border-amber/40 bg-surface">
          <header className="border-b border-line px-4 py-2">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber">
              <Wrench size={15} strokeWidth={2} aria-hidden />
              {t.modPage.patchTitle}
            </h3>
            <p className="text-xs text-muted">{t.modPage.patchHint}</p>
          </header>
          <ul className="divide-y divide-line">
            {center.patches.map((file, index) => (
              <FileRow key={file.id} file={file} props={props} emphasize={index === 0} />
            ))}
          </ul>
        </section>
      )}

      {center.optional.length > 0 && (
        <section aria-label={t.modPage.optionalTitle} className="overflow-hidden rounded-[5px] border border-line bg-surface">
          <h3 className="border-b border-line px-4 py-2 text-sm font-bold uppercase tracking-wide">{t.modPage.optionalTitle}</h3>
          <ul className="divide-y divide-line">
            {center.optional.map((file) => (
              <FileRow key={file.id} file={file} props={props} />
            ))}
          </ul>
        </section>
      )}

      {center.oldVersions.length > 0 && (
        <details className="rounded-[5px] border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-2 text-sm font-bold uppercase tracking-wide text-muted hover:text-text">
            {t.modPage.oldVersionsTitle} ({center.oldVersions.length})
          </summary>
          {center.oldVersions.map((group) => (
            <div key={group.version} className="border-t border-line">
              <p className="bg-raised px-4 py-1.5 font-mono text-xs text-muted">
                v{group.version.replace(/^v/i, "")} · {formatDate(locale, group.publishedAt)}
              </p>
              <ul className="divide-y divide-line">
                {group.files.map((file) => (
                  <FileRow key={file.id} file={file} props={props} />
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
