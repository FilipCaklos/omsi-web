import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

const globalForMail = globalThis as unknown as { mailTransport?: Transporter };

function transport(): Transporter {
  if (!globalForMail.mailTransport) {
    const e = env();
    globalForMail.mailTransport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return globalForMail.mailTransport;
}

export type MailMessage = { to: string; subject: string; text: string; html: string };

export async function sendMail(message: MailMessage): Promise<void> {
  await transport().sendMail({
    from: env().MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: { "Auto-Submitted": "auto-generated" },
  });
}

/**
 * Odoslanie na pozadí – volajúci nečaká (rovnaký čas odpovede pre existujúce aj neexistujúce účty,
 * ochrana proti enumerácii emailov). Chyby sa logujú.
 */
export function sendMailInBackground(message: MailMessage): void {
  sendMail(message).catch((error: unknown) => {
    console.error("[mail] odoslanie zlyhalo:", message.subject, error instanceof Error ? error.message : error);
  });
}
