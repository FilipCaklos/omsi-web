import "server-only";
import { db } from "@/lib/db";
import { announceMod, type AnnouncementKind } from "@/server/integrations/discord";
import { notify } from "@/server/notifications";

/**
 * Mod je verejne vonku (vydaný, nová verzia alebo ohlásený projekt):
 * oznámenie do Discord kanála a pri novom mode/projekte upozornenie sledujúcim autora.
 */
export async function onModAnnounced(modId: string, kind: AnnouncementKind): Promise<void> {
  await announceMod(modId, kind);
  if (kind === "NEW_VERSION") return;
  const mod = await db().mod.findUnique({
    where: { id: modId },
    select: { slug: true, title: true, authorId: true, author: { select: { name: true } }, follows: { select: { userId: true } } },
  });
  if (!mod) return;
  // Kto už sleduje samotný projekt, dostane jeho vlastné upozornenie (MOD_RELEASED) – nie dvakrát
  const alreadyFollowing = new Set(mod.follows.map((f) => f.userId));
  const followers = await db().authorFollow.findMany({ where: { authorId: mod.authorId }, select: { followerId: true } });
  await notify(
    followers
      .filter((f) => !alreadyFollowing.has(f.followerId))
      .map((f) => ({ userId: f.followerId, type: "AUTHOR_NEW_MOD" as const, modId, link: `/mod/${mod.slug}`, data: { modTitle: mod.title, author: mod.author.name } })),
  );
}
