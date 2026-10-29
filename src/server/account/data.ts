import "server-only";
import { rm } from "node:fs/promises";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { storage, uploadTempPath } from "@/server/storage";

/**
 * Export osobných údajov (GDPR čl. 15 a 20) – všetko, čo o používateľovi vedieme, v strojovo čitateľnom JSON.
 * Heslo (hash), tokeny relácií ani interné ID iných používateľov sa neexportujú.
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const user = await db().user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      username: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      locale: true,
      bio: true,
      websiteUrl: true,
      youtubeUrl: true,
      discordUrl: true,
      donateUrl: true,
      emailNotify: true,
      createdAt: true,
      lastLoginAt: true,
      accounts: { select: { providerId: true, createdAt: true } },
      sessions: { select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true } },
      mods: { select: { slug: true, title: true, status: true, createdAt: true, publishedAt: true, downloadCount: true } },
      reviews: { select: { rating: true, body: true, createdAt: true, mod: { select: { slug: true } } } },
      comments: { select: { body: true, createdAt: true, mod: { select: { slug: true } }, devlog: { select: { title: true } } } },
      bugReports: { select: { title: true, description: true, status: true, createdAt: true, mod: { select: { slug: true } } } },
      bugReportComments: { select: { body: true, createdAt: true } },
      reportsFiled: { select: { reason: true, details: true, status: true, createdAt: true, mod: { select: { slug: true } } } },
      follows: { select: { createdAt: true, mod: { select: { slug: true } } } },
      followingAuthors: { select: { createdAt: true, author: { select: { username: true } } } },
      downloadHistory: { select: { lastDownloadAt: true, mod: { select: { slug: true } }, version: { select: { version: true } } } },
      notifications: { select: { type: true, data: true, createdAt: true, readAt: true } },
    },
  });
  return { exportedAt: new Date().toISOString(), format: "omsi-depo-export/1", ...user };
}

export type DeleteBlock = "STAFF_ROLE";

/** Zamestnanci portálu (moderátor, admin) musia najprv dostať nižšiu rolu – rozhodnutia moderácie ostávajú v histórii. */
export function accountDeletionBlock(role: string): DeleteBlock | null {
  return role === "MODERATOR" || role === "ADMIN" ? "STAFF_ROLE" : null;
}

/**
 * Natrvalo zmaže účet aj obsah: mody (vrátane súborov v úložisku), obrázky, recenzie, komentáre,
 * hlásenia, históriu a relácie. Prepočíta hodnotenia a počty sledujúcich dotknutých modov.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const [files, images, uploads, reviewed, followed] = await Promise.all([
    db().modFile.findMany({ where: { mod: { authorId: userId } }, select: { storageDriver: true, storageKey: true } }),
    db().mediaImage.findMany({ where: { OR: [{ ownerId: userId }, { mod: { authorId: userId } }] }, select: { storageDriver: true, storageKey: true, fullKey: true } }),
    db().uploadSession.findMany({ where: { userId }, select: { id: true, storageKey: true, storageDriver: true, resultFileId: true } }),
    db().review.findMany({ where: { userId }, select: { modId: true } }),
    db().follow.findMany({ where: { userId }, select: { modId: true } }),
  ]);

  await db().$transaction(async (tx) => {
    // Mody autora (kaskádovo verzie, súbory, devlogy, recenzie…) a potom samotný používateľ
    await tx.mod.deleteMany({ where: { authorId: userId } });
    await tx.devlog.deleteMany({ where: { authorId: userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  // Agregáty modov, ktoré používateľ hodnotil alebo sledoval
  const touched = [...new Set([...reviewed.map((r) => r.modId), ...followed.map((f) => f.modId)])];
  for (const modId of touched) {
    const [rating, followers] = await Promise.all([
      db().review.aggregate({ where: { modId, hiddenAt: null }, _avg: { rating: true }, _count: { _all: true } }),
      db().follow.count({ where: { modId } }),
    ]);
    await db().mod.updateMany({ where: { id: modId }, data: { ratingAvg: rating._avg.rating ?? 0, ratingCount: rating._count._all, followerCount: followers } });
  }

  // Súbory v úložisku až po úspešnom zmazaní z DB (chyba úložiska nesmie nechať účet napoly)
  const removals: Promise<unknown>[] = [
    ...files.map((f) => storage(f.storageDriver).delete(f.storageKey)),
    ...images.flatMap((i) => [storage(i.storageDriver).delete(i.storageKey), storage(i.storageDriver).delete(i.fullKey)]),
    ...uploads.flatMap((u) => [
      uploadTempPath(u.id).then((p) => rm(p, { force: true })),
      ...(u.storageKey && !u.resultFileId ? [storage(u.storageDriver ?? undefined).delete(u.storageKey)] : []),
    ]),
  ];
  await Promise.allSettled(removals);
  await audit({ action: "user.deleted", targetType: "user", targetId: userId });
}
