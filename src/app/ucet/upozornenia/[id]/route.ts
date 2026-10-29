import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeRedirectPath } from "@/lib/validation/auth";
import { getUserForHeaders } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Otvorenie upozornenia: označí ho ako prečítané a presmeruje na cieľ (iba vlastné, iba relatívne odkazy). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const base = new URL(request.url);
  const user = await getUserForHeaders(request.headers);
  if (!user) return NextResponse.redirect(new URL(`/prihlasenie?next=${encodeURIComponent("/ucet/upozornenia")}`, base), 303);
  if (!/^[a-z0-9]{10,40}$/.test(id)) return NextResponse.redirect(new URL("/ucet/upozornenia", base), 303);

  const notification = await db().notification.findFirst({ where: { id, userId: user.id }, select: { id: true, link: true, readAt: true } });
  if (!notification) return NextResponse.redirect(new URL("/ucet/upozornenia", base), 303);
  if (!notification.readAt) await db().notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  return NextResponse.redirect(new URL(safeRedirectPath(notification.link, "/ucet/upozornenia"), base), 303);
}
