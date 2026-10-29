import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleX, Hourglass, ShieldCheck, Trash2 } from "lucide-react";
import { removeFileAction } from "@/app/actions/wizard";
import { FormAlert } from "@/components/forms/fields";
import { SiteHeader } from "@/components/layout/site-header";
import { BasicsForm } from "@/components/wizard/basics-form";
import { DetailsForm } from "@/components/wizard/details-form";
import { readAttributes } from "@/lib/category-fields";
import { getCategoryFields } from "@/server/mods/category-fields";
import { categoryFacets } from "@/server/mods/reference-data";
import { ExtrasForm } from "@/components/wizard/extras-form";
import { FileUploader, VersionForm } from "@/components/wizard/files-step";
import { ScreenshotsStep } from "@/components/wizard/screenshots-step";
import { SubmitForm } from "@/components/wizard/submit-form";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatBytes, formatExtension } from "@/lib/format";
import { can } from "@/lib/rbac";
import { checkVersionReadiness } from "@/server/mods/publish";
import { getReference } from "@/server/mods/reference";
import { getPendingVersion, getWorkingVersion, isWizardStep, loadEditableMod, type WizardStep } from "@/server/mods/wizard";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ modId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.wizard.title, robots: { index: false } };
}

export default async function WizardPage({ params, searchParams }: Props) {
  const { modId } = await params;
  const query = await searchParams;
  const user = await requirePageUser(`/nahrat/${modId}`);
  const { locale, t } = await getDictionary();
  const editable = await loadEditableMod(user, modId);
  if (!editable) notFound();

  const step: WizardStep = isWizardStep(query.krok) ? query.krok : "zaklad";
  const mod = await db().mod.findUniqueOrThrow({
    where: { id: editable.id },
    include: {
      category: { select: { slug: true } },
      brands: { select: { brandId: true } },
      operators: { select: { operatorId: true } },
      images: { where: { kind: "SCREENSHOT" }, orderBy: { sortOrder: "asc" }, select: { id: true, isPrimary: true } },
      dependencies: { orderBy: { sortOrder: "asc" }, include: { targetMod: { select: { id: true, title: true } } } },
      credits: { orderBy: { sortOrder: "asc" }, include: { user: { select: { username: true } } } },
    },
  });
  const [working, pending, reference] = await Promise.all([getWorkingVersion(mod.id), getPendingVersion(mod.id), getReference(locale)]);
  const workingFiles = working
    ? await db().modFile.findMany({
        where: { versionId: working.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, kind: true, displayName: true, originalFilename: true, extension: true, sizeBytes: true, sha256: true, scanStatus: true },
      })
    : [];
  const done: Partial<Record<WizardStep, boolean>> = {
    zaklad: true,
    popis: mod.description.length > 0,
    subory: workingFiles.length > 0 || mod.currentVersionId !== null,
    screenshoty: mod.images.length > 0,
    // Licencia má predvolené hodnoty – krok je hotový, až keď autor niečo doplní
    doplnky: mod.dependencies.length > 0 || mod.credits.length > 1 || mod.licenseNote !== null,
  };

  let body: React.ReactNode;
  if (step === "zaklad") {
    body = (
      <BasicsForm
        t={t}
        categories={reference.categories}
        modId={mod.id}
        initial={{ title: mod.title, summary: mod.summary, categoryId: mod.categoryId, subcategoryId: mod.subcategoryId ?? "" }}
      />
    );
  } else if (step === "popis") {
    const facets = categoryFacets(mod.category.slug);
    body = (
      <DetailsForm
        t={t}
        locale={locale}
        modId={mod.id}
        brands={reference.brands}
        operators={reference.operators}
        fields={await getCategoryFields(mod.categoryId)}
        facets={{ brand: facets.includes("brand"), operator: facets.includes("operator") }}
        initial={{
          attributes: readAttributes(mod.attributes),
          description: mod.description,
          vehicleModel: mod.vehicleModel ?? "",
          tags: mod.tags.join(", "),
          youtube: mod.youtubeVideoId ? `https://www.youtube.com/watch?v=${mod.youtubeVideoId}` : "",
          requires4gb: mod.requires4GbPatch,
          openOmsi: mod.openOmsi,
          brandIds: mod.brands.map((b) => b.brandId),
          operatorIds: mod.operators.map((o) => o.operatorId),
        }}
      />
    );
  } else if (step === "subory") {
    const patchTargets = await db().modFile.findMany({
      where: { modId: mod.id, kind: { in: ["MAIN", "OLD_VERSION"] }, OR: [{ version: { status: "PUBLISHED" } }, ...(working ? [{ versionId: working.id }] : [])] },
      orderBy: { createdAt: "desc" },
      select: { id: true, displayName: true, version: { select: { version: true } } },
    });
    body = !working ? (
      <FormAlert tone="error">
        {pending ? `${t.studio.versionStatus.PENDING_REVIEW}: v${pending.version}` : t.auth.errors.NOT_EDITABLE}
        {!pending && mod.currentVersionId && (
          <Link href="/ucet/mody" className="ml-2 underline">{t.modPage.newVersion}</Link>
        )}
      </FormAlert>
    ) : (
      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide">{t.wizard.versionTitle}</h2>
          <VersionForm t={t} modId={mod.id} initial={{ version: working.version, changelog: working.changelog }} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide">{t.wizard.files}</h2>
          {workingFiles.length === 0 ? (
            <p className="text-sm text-muted">{t.wizard.noFilesYet}</p>
          ) : (
            <ul className="divide-y divide-line rounded-[5px] border border-line">
              {workingFiles.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  {file.scanStatus === "CLEAN" ? (
                    <ShieldCheck size={16} className="shrink-0 text-signal" aria-label={t.modPage.verified} />
                  ) : (
                    <Hourglass size={16} className="shrink-0 text-amber" aria-label={t.modPage.awaitingInspection} />
                  )}
                  <span className="led-tag">{t.modPage.fileKind[file.kind]}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {file.displayName} <span className="text-muted">({file.originalFilename})</span>
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {formatBytes(locale, file.sizeBytes)} {formatExtension(file.extension)}
                  </span>
                  <form action={removeFileAction}>
                    <input type="hidden" name="modId" value={mod.id} />
                    <input type="hidden" name="fileId" value={file.id} />
                    <button type="submit" aria-label={t.wizard.remove} className="grid size-8 place-items-center rounded-[3px] text-muted hover:bg-alert-soft hover:text-alert">
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide">{t.wizard.addFile}</h2>
          <FileUploader
            t={t}
            locale={locale}
            modId={mod.id}
            hasMain={workingFiles.some((f) => f.kind === "MAIN")}
            patchTargets={patchTargets.map((p) => ({ id: p.id, label: `${p.displayName} (v${p.version.version})` }))}
          />
        </section>
        <Link href={`/nahrat/${mod.id}?krok=screenshoty`} className="inline-flex h-10 items-center rounded-[5px] bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-hover">
          {t.wizard.saveContinue}
        </Link>
      </div>
    );
  } else if (step === "screenshoty") {
    body = (
      <div className="space-y-5">
        <ScreenshotsStep t={t} modId={mod.id} images={mod.images} />
        <Link href={`/nahrat/${mod.id}?krok=doplnky`} className="inline-flex h-10 items-center rounded-[5px] bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-hover">
          {t.wizard.saveContinue}
        </Link>
      </div>
    );
  } else if (step === "doplnky") {
    body = (
      <ExtrasForm
        t={t}
        modId={mod.id}
        dlcs={reference.dlcs}
        initial={{
          dlcIds: mod.dependencies.flatMap((d) => (d.kind === "STEAM_DLC" && d.steamDlcId ? [d.steamDlcId] : [])),
          internal: mod.dependencies.flatMap((d) => (d.kind === "INTERNAL_MOD" && d.targetMod ? [{ modId: d.targetMod.id, title: d.targetMod.title, required: d.required }] : [])),
          external: mod.dependencies.flatMap((d) => (d.kind === "EXTERNAL_LINK" && d.externalUrl ? [{ label: d.externalLabel ?? "", url: d.externalUrl, required: d.required }] : [])),
          credits: mod.credits.map((c) => ({ name: c.name, role: c.role, username: c.user?.username ?? "" })),
          licenseTerms: mod.licenseTerms,
          licenseNote: mod.licenseNote ?? "",
        }}
      />
    );
  } else {
    const outcome = query.hotovo;
    const issues = working ? await checkVersionReadiness(mod.id, working.id) : [];
    const checks = [
      { label: t.wizard.checkSummary, ok: !issues.includes("SUMMARY_LENGTH") },
      { label: t.wizard.checkParameters, ok: !issues.includes("ATTRIBUTES_MISSING") },
      { label: t.wizard.checkMain, ok: !issues.includes("NO_MAIN_FILE") },
      { label: t.wizard.checkScreenshot, ok: !issues.includes("NO_SCREENSHOT") },
      { label: t.wizard.checkScan, ok: !issues.includes("FILE_REJECTED") },
    ];
    body =
      outcome === "zverejnene" || outcome === "schvalovanie" ? (
        <div className="space-y-4">
          <FormAlert tone="success">{outcome === "zverejnene" ? t.wizard.submittedPublished : t.wizard.submittedReview}</FormAlert>
          <Link href={`/mod/${mod.slug}`} className="inline-flex h-10 items-center rounded-[5px] bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-hover">
            {t.wizard.viewMod}
          </Link>
        </div>
      ) : !working ? (
        <FormAlert tone="error">{pending ? `${t.studio.versionStatus.PENDING_REVIEW}: v${pending.version}` : t.auth.errors.NOT_EDITABLE}</FormAlert>
      ) : (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">{t.wizard.checklist}</h2>
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  {c.ok ? <CircleCheck size={16} className="text-signal" aria-hidden /> : <CircleX size={16} className="text-alert" aria-hidden />}
                  {c.label}
                </li>
              ))}
            </ul>
          </section>
          <SubmitForm t={t} modId={mod.id} verified={can(user.role, "mod:publish-without-review")} disabled={issues.length > 0} />
        </div>
      );
  }

  return (
    <>
      <SiteHeader />
      <WizardShell t={t} modId={mod.id} current={step} title={mod.title} done={done}>
        {body}
      </WizardShell>
    </>
  );
}
