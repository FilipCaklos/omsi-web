import type { Metadata } from "next";
import { FormAlert } from "@/components/forms/fields";
import { SiteHeader } from "@/components/layout/site-header";
import { BasicsForm } from "@/components/wizard/basics-form";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { getDictionary } from "@/i18n/server";
import { getReference } from "@/server/mods/reference";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.wizard.title, robots: { index: false } };
}

/** Krok 1 novej modifikácie – po uložení vznikne koncept a wizard pokračuje na /nahrat/[id]. */
export default async function NewModPage() {
  const user = await requirePageUser("/nahrat");
  const { locale, t } = await getDictionary();
  const reference = await getReference(locale);

  return (
    <>
      <SiteHeader />
      <WizardShell t={t} modId={null} current="zaklad" title={t.wizard.title} done={{}}>
        {user.emailVerified ? (
          <BasicsForm t={t} categories={reference.categories} modId={null} initial={{ title: "", summary: "", categoryId: "", subcategoryId: "" }} />
        ) : (
          <FormAlert tone="error">{t.wizard.uploadErrors.EMAIL_NOT_VERIFIED}</FormAlert>
        )}
      </WizardShell>
    </>
  );
}
