import { saveSettingsAction, testDiscordWebhookAction } from "@/app/actions/admin";
import { AdminAlert, AdminTitle, buttonClass, inputClass, primaryButtonClass, type AdminSearchParams } from "@/components/admin/admin-ui";
import { getDictionary } from "@/i18n/server";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/format";
import { requirePagePermission } from "@/server/session";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({ searchParams }: { searchParams: AdminSearchParams }) {
  await requirePagePermission("settings:manage", "/admin/nastavenia");
  const [{ locale, t }, query, settings] = await Promise.all([getDictionary(), searchParams, getSettings()]);
  const s = t.admin.settings;
  const envMax = env().UPLOAD_MAX_FILE_BYTES;

  return (
    <>
      <AdminTitle>{t.admin.nav.settings}</AdminTitle>
      <AdminAlert t={t} params={query} okText={s.saved} />
      <form action={saveSettingsAction} className="max-w-xl space-y-4 rounded-[5px] border border-line bg-surface p-5 text-sm">
        <input type="hidden" name="back" value="/admin/nastavenia" />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="uploadsEnabled" defaultChecked={settings.uploadsEnabled} className="size-4 accent-[var(--amber)]" /> {s.uploadsEnabled}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="registrationEnabled" defaultChecked={settings.registrationEnabled} className="size-4 accent-[var(--amber)]" /> {s.registrationEnabled}
        </label>
        <label className="block space-y-1">
          <span className="block">{s.maxFileGb}</span>
          <input name="maxFileGb" type="number" step="0.5" min={0.5} max={envMax / 1024 ** 3} defaultValue={Math.round((settings.maxFileBytes / 1024 ** 3) * 10) / 10} className={`${inputClass} w-32 font-mono`} />
          <span className="block text-xs text-muted">{s.envMax.replace("{size}", formatBytes(locale, envMax))}</span>
        </label>
        <label className="block space-y-1">
          <span className="block">{s.maxActive}</span>
          <input name="maxActive" type="number" min={1} max={20} defaultValue={settings.maxActiveUploads} className={`${inputClass} w-24 font-mono`} />
        </label>
        <fieldset className="space-y-2 border-t border-line pt-4">
          <legend className="pt-4 font-semibold">{s.discordTitle}</legend>
          <p className="text-xs text-muted">{s.discordHint}</p>
          <input
            name="discordWebhookUrl"
            type="url"
            autoComplete="off"
            placeholder={settings.discordWebhookUrl ? s.discordSet : "https://discord.com/api/webhooks/…"}
            className={`${inputClass} w-full font-mono text-xs`}
          />
          {settings.discordWebhookUrl && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="discordWebhookRemove" className="accent-[var(--alert)]" /> {s.discordRemove}
            </label>
          )}
        </fieldset>
        <button type="submit" className={primaryButtonClass}>{s.save}</button>
      </form>
      {settings.discordWebhookUrl && (
        <form action={testDiscordWebhookAction} className="max-w-xl">
          <input type="hidden" name="back" value="/admin/nastavenia" />
          <button type="submit" className={buttonClass}>{s.discordTest}</button>
        </form>
      )}
      <p className="max-w-xl text-xs text-muted">
        {s.rss} <a href="/feed.xml" className="font-mono text-amber underline">/feed.xml</a>
      </p>
    </>
  );
}
