"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Hourglass, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { attachFileAction, saveVersionAction } from "@/app/actions/wizard";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import type { AppLocale } from "@/i18n/config";
import { UploadError, uploadInChunks, type UploadProgress, type UploadStatus } from "@/lib/chunked-upload";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";
import { formatBytes, formatDuration } from "@/lib/format";
import { MOD_FILE_EXTENSIONS, fileExtension } from "@/lib/upload-policy";

export function VersionForm({ t, modId, initial }: { t: Dictionary; modId: string; initial: { version: string; changelog: string } }) {
  const [state, action] = useActionState(saveVersionAction, INITIAL_FORM_STATE);
  const values = { ...initial, ...state.values };
  const err = state.fieldErrors?.version ? formatError(t, state.fieldErrors.version) : undefined;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-start" noValidate key={state.attempt}>
      <input type="hidden" name="modId" value={modId} />
      <TextField name="version" label={t.wizard.version} defaultValue={values.version} maxLength={30} error={err} />
      <div className="space-y-1">
        <label htmlFor="field-changelog" className="block text-sm font-medium">{t.wizard.changelog}</label>
        <textarea id="field-changelog" name="changelog" rows={3} maxLength={10_000} defaultValue={values.changelog} className="w-full rounded-[5px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-amber" />
      </div>
      <div className="sm:mt-6 sm:w-32">
        <SubmitButton variant="secondary">{state.status === "success" ? `✓ ${t.wizard.saved}` : t.wizard.save}</SubmitButton>
      </div>
    </form>
  );
}

type PatchTarget = { id: string; label: string };

function AttachForm({
  t,
  modId,
  upload,
  patchTargets,
  hasMain,
  onDone,
}: {
  t: Dictionary;
  modId: string;
  upload: UploadStatus;
  patchTargets: PatchTarget[];
  hasMain: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"MAIN" | "PATCH" | "OPTIONAL">(hasMain ? "OPTIONAL" : "MAIN");
  const [state, action] = useActionState(async (prev: Parameters<typeof attachFileAction>[0], formData: FormData) => {
    const result = await attachFileAction(prev, formData);
    if (result.status === "success") {
      onDone();
      router.refresh();
    }
    return result;
  }, INITIAL_FORM_STATE);
  const w = t.wizard;
  const err = (name: string) => (state.fieldErrors?.[name] ? formatError(t, state.fieldErrors[name], state.errorParams) : undefined);
  const findings = upload.findings ?? [];

  return (
    <form action={action} className="space-y-3 rounded-[5px] border border-line bg-bg p-3" noValidate>
      <input type="hidden" name="modId" value={modId} />
      <input type="hidden" name="uploadId" value={upload.id} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {upload.scanStatus === "CLEAN" ? (
          <ShieldCheck size={16} className="text-signal" aria-hidden />
        ) : (
          <ShieldAlert size={16} className="text-amber" aria-hidden />
        )}
        <span className="font-semibold">{upload.filename}</span>
        <span className="font-mono text-xs text-muted">{upload.sha256}</span>
      </div>
      {findings.length > 0 && (
        <ul className="list-inside list-disc text-xs text-amber">
          {findings.map((f, i) => (
            <li key={i}>
              {t.findings[f.code as keyof Dictionary["findings"]] ?? f.code}
              {f.path && <code className="ml-1 font-mono text-muted">{f.path}</code>}
            </li>
          ))}
        </ul>
      )}
      {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error)}</FormAlert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="block text-sm font-medium">{w.fileKind}</span>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 w-full rounded-[5px] border border-line bg-surface px-2 text-sm">
            {!hasMain && <option value="MAIN">{t.modPage.fileKind.MAIN}</option>}
            {patchTargets.length > 0 && <option value="PATCH">{t.modPage.fileKind.PATCH}</option>}
            <option value="OPTIONAL">{t.modPage.fileKind.OPTIONAL}</option>
          </select>
        </label>
        <TextField
          name="displayName"
          label={w.displayName}
          defaultValue={kind === "MAIN" ? t.modPage.mainFile : upload.filename.replace(/\.[^.]+$/, "")}
          maxLength={120}
          error={err("displayName")}
          key={kind}
        />
      </div>
      {kind === "PATCH" && (
        <label className="block space-y-1">
          <span className="block text-sm font-medium">{w.patchFor}</span>
          <select name="patchForFileId" className="h-10 w-full rounded-[5px] border border-line bg-surface px-2 text-sm">
            {patchTargets.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {err("patchForFileId") && <span className="block text-xs text-alert">{err("patchForFileId")}</span>}
        </label>
      )}
      <TextField name="description" label={w.fileDescription} required={false} maxLength={500} />
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <TextField name="mirrorUrl" label={w.mirrorUrl} required={false} maxLength={500} error={err("mirrorUrl")} />
        <TextField name="mirrorLabel" label={w.mirrorLabel} required={false} maxLength={40} />
      </div>
      <div className="sm:w-52">
        <SubmitButton>{w.attach}</SubmitButton>
      </div>
    </form>
  );
}

/** Výber súboru → chunked upload s priebehom (MB/GB, MB/s, ETA) → kontrola → formulár na pripojenie k verzii. */
export function FileUploader({
  t,
  locale,
  modId,
  patchTargets,
  hasMain,
}: {
  t: Dictionary;
  locale: AppLocale;
  modId: string;
  patchTargets: PatchTarget[];
  hasMain: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadStatus | null>(null);
  const [error, setError] = useState<{ code: string; status?: UploadStatus } | null>(null);
  const [dragging, setDragging] = useState(false);
  const w = t.wizard;

  async function start(file: File) {
    setError(null);
    setResult(null);
    if (!(MOD_FILE_EXTENSIONS as readonly string[]).includes(fileExtension(file.name))) {
      setError({ code: "EXTENSION_NOT_ALLOWED" });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    try {
      const status = await uploadInChunks(file, { modId, signal: controller.signal, onProgress: setProgress });
      setResult(status);
    } catch (e) {
      setError(e instanceof UploadError ? { code: e.code, status: e.status } : { code: "NETWORK_ERROR" });
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  const busy = progress !== null;
  const percent = progress ? Math.floor((progress.uploadedBytes / Math.max(1, progress.totalBytes)) * 100) : 0;
  const uploadMessage = (code: string) => w.uploadErrors[code as keyof Dictionary["wizard"]["uploadErrors"]] ?? w.uploadErrors.GENERIC;

  return (
    <div className="space-y-3">
      {!busy && !result && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void start(file);
          }}
          className={`flex flex-col items-center gap-2 rounded-[5px] border-2 border-dashed px-4 py-8 text-center ${dragging ? "border-amber bg-amber-soft" : "border-line"}`}
        >
          <FileUp size={26} strokeWidth={1.5} className="text-muted" aria-hidden />
          <button type="button" onClick={() => input.current?.click()} className="h-10 rounded-[5px] bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-hover">
            {w.chooseFile}
          </button>
          <span className="text-xs text-muted">{w.dropHere}</span>
          <input
            ref={input}
            type="file"
            hidden
            accept={MOD_FILE_EXTENSIONS.map((e) => `.${e}`).join(",")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void start(file);
              e.target.value = "";
            }}
          />
          <span className="max-w-md text-[11px] text-muted">{w.retryHint}</span>
        </div>
      )}

      {busy && progress && (
        <div className="space-y-2 rounded-[5px] border border-line bg-bg p-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              {progress.phase === "scanning" && <Hourglass size={14} className="animate-pulse text-amber" aria-hidden />}
              {progress.phase === "scanning" ? w.scanning : `${w.uploading} ${percent} %`}
            </span>
            <button type="button" onClick={() => abort.current?.abort()} className="inline-flex items-center gap-1 text-xs text-muted hover:text-alert">
              <X size={13} aria-hidden /> {w.cancel}
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className={`h-full ${progress.phase === "scanning" ? "animate-pulse bg-signal" : "bg-amber"}`} style={{ width: `${progress.phase === "scanning" ? 100 : percent}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-4 font-mono text-[11.5px] text-muted">
            <span>
              {formatBytes(locale, progress.uploadedBytes)} / {formatBytes(locale, progress.totalBytes)}
            </span>
            {progress.bytesPerSecond > 0 && <span>{w.speed.replace("{speed}", formatBytes(locale, progress.bytesPerSecond))}</span>}
            {progress.etaSeconds !== null && <span>{w.eta.replace("{eta}", formatDuration(progress.etaSeconds))}</span>}
          </p>
        </div>
      )}

      {error && (
        <FormAlert tone="error">
          {uploadMessage(error.code)}
          {error.status?.findings && error.status.findings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs">
              {error.status.findings.map((f, i) => (
                <li key={i}>
                  {t.findings[f.code as keyof Dictionary["findings"]] ?? f.code}
                  {f.path && <code className="ml-1 font-mono">{f.path}</code>}
                </li>
              ))}
            </ul>
          )}
        </FormAlert>
      )}

      {result && <AttachForm t={t} modId={modId} upload={result} patchTargets={patchTargets} hasMain={hasMain} onDone={() => setResult(null)} />}
    </div>
  );
}
