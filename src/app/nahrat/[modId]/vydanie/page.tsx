import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Images, Megaphone, MessageSquare, Newspaper, Trash2 } from "lucide-react";
import { deleteDevlogAction } from "@/app/actions/devlog";
import { cancelScheduleAction } from "@/app/actions/planning";
import { FormAlert } from "@/components/forms/fields";
import { SiteHeader } from "@/components/layout/site-header";
import { AnnounceForm, DevlogForm, PlanForm, ScheduleForm } from "@/components/planning/plan-forms";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { utcToLocalInput } from "@/lib/timezone";
import { PUBLIC_MOD_STATUSES } from "@/server/mods/access";
import { getWorkingVersion, loadEditableMod } from "@/server/mods/wizard";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.studioPlan.title, robots: { index: false } };
}

function Panel({ title, Icon, children }: { title: string; Icon: typeof Megaphone; children: React.ReactNode }) {
  return (
    <section className="rounded-[5px] border border-line bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
        <Icon size={16} strokeWidth={1.75} className="text-amber" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Štúdio pripravovaného vydania: plán dátumu, stav vývoja, ohlásenie, naplánované vydanie a devlogy. */
export default async function ReleasePlanningPage({ params }: { params: Promise<{ modId: string }> }) {
  const { modId } = await params;
  const user = await requirePageUser(`/nahrat/${modId}/vydanie`);
  const { locale, t } = await getDictionary();
  const editable = await loadEditableMod(user, modId);
  if (!editable) notFound();

  const [plan, working, scheduledVersion, devlogs] = await Promise.all([
    db().plannedRelease.findUnique({ where: { modId: editable.id }, include: { progress: { orderBy: { sortOrder: "asc" } } } }),
    getWorkingVersion(editable.id),
    db().modVersion.findFirst({ where: { modId: editable.id, status: { in: ["SCHEDULED", "PENDING_REVIEW"] }, scheduledAt: { not: null } }, select: { version: true, status: true, scheduledAt: true } }),
    db().devlog.findMany({ where: { modId: editable.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, createdAt: true, _count: { select: { comments: true, images: true } } } }),
  ]);
  const p = t.studioPlan;
  const notYetPublic = editable.currentVersionId === null && ["DRAFT", "CHANGES_REQUESTED"].includes(editable.status);
  const isPublic = PUBLIC_MOD_STATUSES.includes(editable.status);
  const releasedAlready = editable.currentVersionId !== null;

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1000px] space-y-5 px-4 py-6">
        <div className="space-y-1">
          <Link href={`/nahrat/${editable.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
            <ArrowLeft size={14} aria-hidden /> {t.wizard.title}
          </Link>
          <h1 className="text-2xl font-bold">
            {p.title}: {editable.title}
          </h1>
        </div>

        {!releasedAlready && (
          <Panel title={p.mode} Icon={CalendarClock}>
            <PlanForm
              t={t}
              modId={editable.id}
              initial={{
                mode: plan?.mode ?? "WINDOW",
                releaseAt: plan?.releaseAt ? utcToLocalInput(plan.releaseAt) : "",
                windowYear: plan?.windowYear ?? new Date().getFullYear(),
                windowPart: plan?.windowPart ?? "Q4",
                noEtaQuestions: plan?.noEtaQuestions ?? false,
                parts: plan?.progress.map((x) => ({ label: x.label, percent: x.percent })) ?? [],
              }}
            />
          </Panel>
        )}

        {!releasedAlready && (
          <Panel title={p.announce} Icon={Megaphone}>
            <div className="space-y-5">
              {notYetPublic && plan && <AnnounceForm t={t} modId={editable.id} />}
              {notYetPublic && !plan && <p className="text-sm text-muted">{t.auth.errors.NOT_PLANNED}</p>}
              {!notYetPublic && <FormAlert tone="success">{editable.status === "PENDING_REVIEW" ? p.announcedPending : p.announced}</FormAlert>}

              {scheduledVersion?.scheduledAt ? (
                <div className="space-y-2">
                  <FormAlert tone="success">{p.scheduled.replace("{date}", formatDateTime(locale, scheduledVersion.scheduledAt))}</FormAlert>
                  {scheduledVersion.status === "SCHEDULED" && (
                    <form action={cancelScheduleAction}>
                      <input type="hidden" name="modId" value={editable.id} />
                      <button type="submit" className="h-9 rounded-[5px] border border-line px-3 text-sm hover:bg-raised">{t.wizard.cancel}</button>
                    </form>
                  )}
                </div>
              ) : (
                working &&
                plan?.mode === "EXACT_DATE" && <ScheduleForm t={t} modId={editable.id} version={working.version} />
              )}

              <div className="border-t border-line pt-4">
                <p className="mb-2 text-sm text-muted">{p.releaseNowNote}</p>
                <Link href={`/nahrat/${editable.id}?krok=subory`} className="inline-flex h-10 items-center rounded-[5px] border border-amber/60 px-4 text-sm font-semibold hover:bg-amber-soft">
                  {p.releaseNow}
                </Link>
              </div>
            </div>
          </Panel>
        )}

        <Panel title={p.newDevlog} Icon={Newspaper}>
          {isPublic ? <DevlogForm t={t} modId={editable.id} /> : <p className="text-sm text-muted">{p.devlogNeedsPublic}</p>}
          {devlogs.length > 0 && (
            <ul className="mt-5 divide-y divide-line rounded-[5px] border border-line">
              {devlogs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Link href={`/mod/${editable.slug}#devlog-${d.id}`} className="min-w-0 flex-1 truncate hover:text-amber">{d.title}</Link>
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted">
                    {formatDateTime(locale, d.createdAt)}
                    <span className="inline-flex items-center gap-0.5"><Images size={11} aria-hidden />{d._count.images}</span>
                    <span className="inline-flex items-center gap-0.5"><MessageSquare size={11} aria-hidden />{d._count.comments}</span>
                  </span>
                  <form action={deleteDevlogAction}>
                    <input type="hidden" name="devlogId" value={d.id} />
                    <button type="submit" aria-label={t.planned.deleteDevlog} className="grid size-8 place-items-center rounded-[3px] text-muted hover:bg-alert-soft hover:text-alert">
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
    </>
  );
}
