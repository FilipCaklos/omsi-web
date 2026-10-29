import { getLocale } from "@/i18n/server";
import { suggestMods } from "@/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/search/suggest?q= – okamžité návrhy pre vyhľadávanie v hlavičke. */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const items = await suggestMods(await getLocale(), q);
  return Response.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60", Vary: "Cookie, Accept-Language" } },
  );
}
