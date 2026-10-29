"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveExtrasAction, searchDependencyModsAction, type ExtrasPayload } from "@/app/actions/wizard";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";

type CreditRole = ExtrasPayload["credits"][number]["role"];
type LicenseTerm = ExtrasPayload["licenseTerms"][number];

const inputClass = "h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm outline-none focus:border-amber";

export function ExtrasForm({
  t,
  modId,
  dlcs,
  initial,
}: {
  t: Dictionary;
  modId: string;
  dlcs: { id: string; name: string }[];
  initial: {
    dlcIds: string[];
    internal: { modId: string; title: string; required: boolean }[];
    external: { label: string; url: string; required: boolean }[];
    credits: { name: string; role: CreditRole; username: string }[];
    licenseTerms: LicenseTerm[];
    licenseNote: string;
  };
}) {
  const [state, action] = useActionState(saveExtrasAction, INITIAL_FORM_STATE);
  const [dlcIds, setDlcIds] = useState(initial.dlcIds);
  const [internal, setInternal] = useState(initial.internal);
  const [external, setExternal] = useState(initial.external);
  const [credits, setCredits] = useState(initial.credits);
  const [terms, setTerms] = useState(initial.licenseTerms);
  const [note, setNote] = useState(initial.licenseNote);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const w = t.wizard;

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => setResults(await searchDependencyModsAction(modId, query)), 200);
    return () => window.clearTimeout(timer);
  }, [query, modId]);

  const payload: ExtrasPayload = {
    dlcIds,
    internal: internal.map((d) => ({ modId: d.modId, required: d.required })),
    external: external.filter((d) => d.label.trim() || d.url.trim()),
    credits: credits
      .filter((c) => c.name.trim())
      .map((c) => ({ name: c.name, role: c.role, ...(c.username.trim() ? { username: c.username.trim() } : {}) })),
    licenseTerms: terms,
    licenseNote: note,
  };

  return (
    <form action={action} className="space-y-7" noValidate>
      <input type="hidden" name="modId" value={modId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state.status === "error" && state.error && <FormAlert tone="error">{formatError(t, state.error)}</FormAlert>}

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold uppercase tracking-wide">{w.dlcs}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {dlcs.map((d) => (
            <label key={d.id} className="flex items-center gap-2 rounded-[5px] border border-line px-3 py-2 text-sm has-[:checked]:border-alert has-[:checked]:bg-alert-soft">
              <input
                type="checkbox"
                checked={dlcIds.includes(d.id)}
                onChange={(e) => setDlcIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))}
                className="accent-[var(--alert)]"
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold uppercase tracking-wide">{w.internalDeps}</legend>
        <div className="relative">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={w.searchMods} className={inputClass} aria-label={w.searchMods} />
          {results.length > 0 && (
            <ul className="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-[5px] border border-line bg-surface shadow-lg">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!internal.some((d) => d.modId === r.id)) setInternal((list) => [...list, { modId: r.id, title: r.title, required: true }]);
                      setQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-raised"
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ul className="space-y-1">
          {internal.map((d) => (
            <li key={d.modId} className="flex items-center gap-3 rounded-[5px] border border-line px-3 py-1.5 text-sm">
              <span className="flex-1">{d.title}</span>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={d.required} onChange={(e) => setInternal((list) => list.map((x) => (x.modId === d.modId ? { ...x, required: e.target.checked } : x)))} className="accent-[var(--amber)]" />
                {w.required}
              </label>
              <button type="button" onClick={() => setInternal((list) => list.filter((x) => x.modId !== d.modId))} aria-label={w.remove} className="text-muted hover:text-alert">
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold uppercase tracking-wide">{w.externalDeps}</legend>
        {external.map((d, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-center">
            <input value={d.label} onChange={(e) => setExternal((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={w.externalLabel} aria-label={w.externalLabel} className={inputClass} maxLength={80} />
            <input value={d.url} onChange={(e) => setExternal((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" aria-label={w.externalUrl} className={inputClass} maxLength={500} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={d.required} onChange={(e) => setExternal((l) => l.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} className="accent-[var(--amber)]" />
              {w.required}
            </label>
            <button type="button" onClick={() => setExternal((l) => l.filter((_, j) => j !== i))} aria-label={w.remove} className="text-muted hover:text-alert">
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setExternal((l) => [...l, { label: "", url: "", required: true }])} className="inline-flex items-center gap-1 text-sm text-amber hover:underline">
          <Plus size={14} aria-hidden /> {w.add}
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold uppercase tracking-wide">{w.credits}</legend>
        {credits.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center">
            <input value={c.name} onChange={(e) => setCredits((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={w.creditName} aria-label={w.creditName} className={inputClass} maxLength={60} />
            <select value={c.role} onChange={(e) => setCredits((l) => l.map((x, j) => (j === i ? { ...x, role: e.target.value as CreditRole } : x)))} aria-label={w.creditRole} className={inputClass}>
              {Object.entries(t.creditRoles).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input value={c.username} onChange={(e) => setCredits((l) => l.map((x, j) => (j === i ? { ...x, username: e.target.value } : x)))} placeholder="@nick" aria-label="@" className={`${inputClass} font-mono`} maxLength={24} />
            <button type="button" onClick={() => setCredits((l) => l.filter((_, j) => j !== i))} aria-label={w.remove} className="text-muted hover:text-alert">
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setCredits((l) => [...l, { name: "", role: "MODEL", username: "" }])} className="inline-flex items-center gap-1 text-sm text-amber hover:underline">
          <Plus size={14} aria-hidden /> {w.add}
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold uppercase tracking-wide">{w.license}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(t.licenseTerms) as LicenseTerm[]).map((term) => (
            <label key={term} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={terms.includes(term)} onChange={(e) => setTerms((l) => (e.target.checked ? [...l, term] : l.filter((x) => x !== term)))} className="accent-[var(--amber)]" />
              {t.licenseTerms[term]}
            </label>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-sm">{w.licenseNote}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-[5px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-amber" />
        </label>
      </fieldset>

      <div className="sm:w-60">
        <SubmitButton>{w.saveContinue}</SubmitButton>
      </div>
    </form>
  );
}
