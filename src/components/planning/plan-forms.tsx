"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { createDevlogAction } from "@/app/actions/devlog";
import { announcePlannedAction, savePlanAction, scheduleReleaseAction } from "@/app/actions/planning";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError, type FormState } from "@/lib/form-state";
import { IMAGE_EXTENSIONS } from "@/lib/upload-policy";

type Mode = "EXACT_DATE" | "WINDOW" | "TBA";
type Part = { label: string; percent: number };

function TopError({ t, state }: { t: Dictionary; state: FormState }) {
  if (state.status !== "error" || !state.error) return null;
  const code = state.fieldErrors ? Object.values(state.fieldErrors)[0] ?? state.error : state.error;
  return <FormAlert tone="error">{formatError(t, code, state.errorParams)}</FormAlert>;
}

export function PlanForm({
  t,
  modId,
  initial,
}: {
  t: Dictionary;
  modId: string;
  initial: { mode: Mode; releaseAt: string; windowYear: number; windowPart: string; noEtaQuestions: boolean; parts: Part[] };
}) {
  const [state, action] = useActionState(savePlanAction, INITIAL_FORM_STATE);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [parts, setParts] = useState<Part[]>(
    initial.parts.length > 0 ? initial.parts : t.studioPlan.defaultParts.split("|").map((label) => ({ label, percent: 0 })),
  );
  const p = t.studioPlan;
  const year = new Date().getFullYear();

  return (
    <form action={action} className="space-y-5" noValidate key={state.attempt}>
      <input type="hidden" name="modId" value={modId} />
      <input type="hidden" name="progress" value={JSON.stringify(parts.filter((x) => x.label.trim()))} />
      {state.status === "success" && <FormAlert tone="success">{p.saved}</FormAlert>}
      <TopError t={t} state={state} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold uppercase tracking-wide">{p.mode}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["EXACT_DATE", p.modeExact],
              ["WINDOW", p.modeWindow],
              ["TBA", p.modeTba],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 rounded-[5px] border border-line px-3 py-2 text-sm has-[:checked]:border-amber has-[:checked]:bg-amber-soft">
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-[var(--amber)]" />
              {label}
            </label>
          ))}
        </div>
        {mode === "EXACT_DATE" && (
          <label className="block max-w-xs space-y-1">
            <span className="block text-sm">{p.releaseAt}</span>
            <input type="datetime-local" name="releaseAt" defaultValue={state.values?.releaseAt ?? initial.releaseAt} className="h-10 w-full rounded-[5px] border border-line bg-bg px-2 font-mono text-sm" />
          </label>
        )}
        {mode === "WINDOW" && (
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1">
              <span className="block text-sm">{p.windowPart}</span>
              <select name="windowPart" defaultValue={state.values?.windowPart || initial.windowPart} className="h-10 rounded-[5px] border border-line bg-bg px-2 text-sm">
                {Object.entries(t.release.windowPart).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-sm">{p.windowYear}</span>
              <select name="windowYear" defaultValue={state.values?.windowYear || String(initial.windowYear)} className="h-10 rounded-[5px] border border-line bg-bg px-2 font-mono text-sm">
                {Array.from({ length: 6 }, (_, i) => year + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="noEtaQuestions" defaultChecked={state.values ? state.values.noEtaQuestions === "on" : initial.noEtaQuestions} className="size-4 accent-[var(--amber)]" />
          {p.noEtaQuestions}
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold uppercase tracking-wide">{p.progress}</legend>
        {parts.map((part, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_52px_32px] items-center gap-2">
            <input
              value={part.label}
              maxLength={40}
              aria-label={p.progressLabel}
              onChange={(e) => setParts((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              className="h-9 rounded-[5px] border border-line bg-bg px-2 text-sm"
            />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={part.percent}
              aria-label={`${part.label} %`}
              onChange={(e) => setParts((list) => list.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))}
              className="accent-[var(--amber)]"
            />
            <span className="text-right font-mono text-sm">{part.percent} %</span>
            <button type="button" onClick={() => setParts((list) => list.filter((_, j) => j !== i))} aria-label={t.wizard.remove} className="text-muted hover:text-alert">
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
        {parts.length < 12 && (
          <button type="button" onClick={() => setParts((list) => [...list, { label: "", percent: 0 }])} className="inline-flex items-center gap-1 text-sm text-amber hover:underline">
            <Plus size={14} aria-hidden /> {p.addPart}
          </button>
        )}
      </fieldset>

      <div className="sm:w-52">
        <SubmitButton>{p.save}</SubmitButton>
      </div>
    </form>
  );
}

export function AnnounceForm({ t, modId }: { t: Dictionary; modId: string }) {
  const [state, action] = useActionState(announcePlannedAction, INITIAL_FORM_STATE);
  if (state.status === "success") {
    return <FormAlert tone="success">{state.values?.outcome === "pending" ? t.studioPlan.announcedPending : t.studioPlan.announced}</FormAlert>;
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="modId" value={modId} />
      <p className="text-sm text-muted">{t.studioPlan.announceNote}</p>
      <TopError t={t} state={state} />
      <div className="sm:w-72">
        <SubmitButton>{t.studioPlan.announce}</SubmitButton>
      </div>
    </form>
  );
}

export function ScheduleForm({ t, modId, version }: { t: Dictionary; modId: string; version: string }) {
  const [state, action] = useActionState(scheduleReleaseAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="modId" value={modId} />
      <p className="text-sm text-muted">{t.studioPlan.scheduleNote.replace("{version}", version)}</p>
      <TopError t={t} state={state} />
      <div className="sm:w-72">
        <SubmitButton>{t.studioPlan.schedule}</SubmitButton>
      </div>
    </form>
  );
}

export function DevlogForm({ t, modId }: { t: Dictionary; modId: string }) {
  const [state, action] = useActionState(createDevlogAction, INITIAL_FORM_STATE);
  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const p = t.studioPlan;
  const field = (name: string) => (state.fieldErrors?.[name] ? formatError(t, state.fieldErrors[name], state.errorParams) : undefined);

  // Po úspešnom zverejnení vyčistíme vybrané fotky
  const [lastAttempt, setLastAttempt] = useState(state.attempt);
  if (state.attempt !== lastAttempt) {
    setLastAttempt(state.attempt);
    if (state.status === "success") setImages([]);
  }

  async function upload(files: FileList) {
    setUploading(true);
    setUploadError(null);
    for (const file of [...files].slice(0, 6 - images.length)) {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "DEVLOG");
      const response = await fetch("/api/uploads/images", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { id?: string; thumbUrl?: string; error?: string };
      if (response.ok && body.id && body.thumbUrl) setImages((list) => [...list, { id: body.id as string, url: body.thumbUrl as string }]);
      else {
        const code = (body.error ?? "GENERIC") as keyof Dictionary["wizard"]["uploadErrors"];
        setUploadError(t.wizard.uploadErrors[code] ?? t.wizard.uploadErrors.GENERIC);
      }
    }
    setUploading(false);
  }

  return (
    <form action={action} className="space-y-3" noValidate key={state.status === "success" ? state.attempt : "devlog"}>
      <input type="hidden" name="modId" value={modId} />
      {images.map((img) => (
        <input key={img.id} type="hidden" name="imageIds" value={img.id} />
      ))}
      {state.status === "success" && <FormAlert tone="success">{p.devlogPublished}</FormAlert>}
      {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error)}</FormAlert>}
      <TextField name="title" label={p.devlogTitle} maxLength={120} defaultValue={state.values?.title} error={field("title")} />
      <div className="space-y-1">
        <label htmlFor="devlog-body" className="block text-sm font-medium">{p.devlogBody}</label>
        <textarea id="devlog-body" name="body" rows={6} maxLength={20_000} defaultValue={state.values?.body} className={`w-full rounded-[5px] border bg-bg px-3 py-2 text-sm ${field("body") ? "border-alert" : "border-line"}`} />
        {field("body") && <p className="text-xs text-alert">{field("body")}</p>}
      </div>
      <div className="space-y-2">
        <span className="block text-sm font-medium">{p.devlogImages}</span>
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative">
              <img src={img.url} alt="" className="h-[68px] w-[120px] rounded-[3px] border border-line object-cover" />
              <button type="button" onClick={() => setImages((list) => list.filter((x) => x.id !== img.id))} aria-label={p.removeImage} className="absolute right-1 top-1 grid size-6 place-items-center rounded-[3px] bg-black/70 text-white">
                <X size={13} aria-hidden />
              </button>
            </div>
          ))}
          {images.length < 6 && (
            <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="grid h-[68px] w-[120px] place-items-center rounded-[3px] border-2 border-dashed border-line text-muted hover:border-amber hover:text-amber">
              {uploading ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <ImagePlus size={18} aria-hidden />}
            </button>
          )}
        </div>
        <input ref={input} type="file" multiple hidden accept={IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",")} onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
        {uploadError && <p className="text-xs text-alert">{uploadError}</p>}
      </div>
      <div className="sm:w-56">
        <SubmitButton>{p.publishDevlog}</SubmitButton>
      </div>
    </form>
  );
}
