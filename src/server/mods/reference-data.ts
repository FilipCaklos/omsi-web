import type { OperatorCountry, PrismaClient } from "@/generated/prisma/client";
import type { CategoryIconKey } from "@/lib/category-icons";

/**
 * Kanonické číselníky CZ/SK OMSI 2 komunity. `ensureReferenceData` ich idempotentne zapíše
 * (volá seed a prvé spustenie); administrátor ich potom spravuje v /admin.
 */

type CategoryDef = {
  slug: string;
  sk: string;
  cs: string;
  icon: CategoryIconKey;
  descriptionSk: string;
  descriptionCs: string;
  subcategories: { slug: string; sk: string; cs: string }[];
  /** Ktoré filtre katalóg pri kategórii ponúka */
  facets: ("brand" | "operator")[];
};

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "mapy", sk: "Mapy", cs: "Mapy", icon: "map", facets: [],
    descriptionSk: "Reálne, poloreálne aj fiktívne mapy s linkami, cestovnými poriadkami a AI premávkou.",
    descriptionCs: "Reálné, poloreálné i fiktivní mapy s linkami, jízdními řády a AI provozem.",
    subcategories: [
      { slug: "realne-cz-sk", sk: "Reálne CZ/SK", cs: "Reálné CZ/SK" },
      { slug: "polorealne", sk: "Poloreálne", cs: "Poloreálné" },
      { slug: "fiktivne", sk: "Fiktívne", cs: "Fiktivní" },
      { slug: "zahranicne-upravy", sk: "Zahraničné úpravy", cs: "Zahraniční úpravy" },
    ],
  },
  {
    slug: "autobusy", sk: "Autobusy", cs: "Autobusy", icon: "bus", facets: ["brand"],
    descriptionSk: "Mestské, prímestské, diaľkové aj historické autobusy.",
    descriptionCs: "Městské, příměstské, dálkové i historické autobusy.",
    subcategories: [
      { slug: "mestske", sk: "Mestské", cs: "Městské" },
      { slug: "primestske-medzimestske", sk: "Prímestské / Medzimestské", cs: "Příměstské / Meziměstské" },
      { slug: "dialkove", sk: "Diaľkové", cs: "Dálkové" },
      { slug: "historicke", sk: "Historické", cs: "Historické" },
    ],
  },
  {
    slug: "trolejbusy-elektricky", sk: "Trolejbusy & Električky", cs: "Trolejbusy & Tramvaje", icon: "tram", facets: ["brand"],
    descriptionSk: "Trolejbusy a električky – Škoda, Tatra, ČKD, Solaris Trollino a ďalšie.",
    descriptionCs: "Trolejbusy a tramvaje – Škoda, Tatra, ČKD, Solaris Trollino a další.",
    subcategories: [
      { slug: "trolejbusy", sk: "Trolejbusy", cs: "Trolejbusy" },
      { slug: "elektricky", sk: "Električky", cs: "Tramvaje" },
    ],
  },
  {
    slug: "repainty", sk: "Repainty / Nátery", cs: "Repainty / Nátěry", icon: "paintbrush", facets: ["brand", "operator"],
    descriptionSk: "Nátery reálnych aj fiktívnych dopravcov podľa modelu vozidla.",
    descriptionCs: "Nátěry reálných i fiktivních dopravců podle modelu vozidla.",
    subcategories: [
      { slug: "autobusy", sk: "Autobusy", cs: "Autobusy" },
      { slug: "trolejbusy-elektricky", sk: "Trolejbusy & Električky", cs: "Trolejbusy & Tramvaje" },
    ],
  },
  {
    slug: "hof-hlasenia", sk: "HOF & Hlásenia", cs: "HOF & Hlášení", icon: "announcements", facets: ["operator"],
    descriptionSk: "HOF súbory pre BUSE a klasické IBIS, Bustec a audio balíky hlásení zastávok.",
    descriptionCs: "HOF soubory pro BUSE a klasický IBIS, Bustec a audio balíky hlášení zastávek.",
    subcategories: [
      { slug: "buse-hof", sk: "BUSE .hof", cs: "BUSE .hof" },
      { slug: "klasicke-hof", sk: "Klasické .hof", cs: "Klasické .hof" },
      { slug: "bustec", sk: "Bustec", cs: "Bustec" },
      { slug: "hlasenia", sk: "Audio hlásenia", cs: "Audio hlášení" },
    ],
  },
  {
    slug: "objekty-splines", sk: "Objekty & Splines", cs: "Objekty & Splines", icon: "objects", facets: [],
    descriptionSk: "Sceneryobjects, splines, terénne textúry, zastávkové označníky a budovy.",
    descriptionCs: "Sceneryobjects, splines, terénní textury, zastávkové označníky a budovy.",
    subcategories: [
      { slug: "sceneryobjects", sk: "Sceneryobjects", cs: "Sceneryobjects" },
      { slug: "splines", sk: "Splines", cs: "Splines" },
      { slug: "textury", sk: "Terénne textúry", cs: "Terénní textury" },
      { slug: "oznacniky", sk: "Zastávkové označníky", cs: "Zastávkové označníky" },
      { slug: "budovy", sk: "Budovy", cs: "Budovy" },
    ],
  },
  {
    slug: "skripty-zvuky", sk: "Skripty, Zvuky & Úpravy", cs: "Skripty, Zvuky & Úpravy", icon: "scripts", facets: ["brand"],
    descriptionSk: "Odbavovacie systémy, prevodovky, zvukové balíky motorov, fyzika a AI listy.",
    descriptionCs: "Odbavovací systémy, převodovky, zvukové balíky motorů, fyzika a AI listy.",
    subcategories: [
      { slug: "odbavovacie-systemy", sk: "Kasy & odbavovacie systémy", cs: "Pokladny & odbavovací systémy" },
      { slug: "prevodovky", sk: "Prevodovky", cs: "Převodovky" },
      { slug: "zvuky-motorov", sk: "Zvuky motorov", cs: "Zvuky motorů" },
      { slug: "fyzika", sk: "Fyzika", cs: "Fyzika" },
      { slug: "ai-listy", sk: "AI listy", cs: "AI listy" },
    ],
  },
  {
    slug: "nastroje", sk: "Programy & Nástroje", cs: "Programy & Nástroje", icon: "tools", facets: [],
    descriptionSk: "HOF Suite, OMSI MapTools, 4GB Patch – návody a nástroje, fonty.",
    descriptionCs: "HOF Suite, OMSI MapTools, 4GB Patch – návody a nástroje, fonty.",
    subcategories: [
      { slug: "editory", sk: "Editory & nástroje", cs: "Editory & nástroje" },
      { slug: "4gb-patch", sk: "4GB Patch", cs: "4GB Patch" },
      { slug: "fonty", sk: "Fonty", cs: "Fonty" },
    ],
  },
];

export const BRANDS: { slug: string; name: string }[] = [
  { slug: "karosa", name: "Karosa" },
  { slug: "irisbus-iveco", name: "Irisbus / Iveco" },
  { slug: "sor", name: "SOR" },
  { slug: "solaris", name: "Solaris" },
  { slug: "skoda", name: "Škoda" },
  { slug: "tedom", name: "Tedom" },
  { slug: "novoplan", name: "Novoplan" },
  { slug: "man", name: "MAN" },
  { slug: "mercedes-benz", name: "Mercedes-Benz" },
  { slug: "setra", name: "Setra" },
  { slug: "ikarus", name: "Ikarus" },
  { slug: "tatra", name: "Tatra" },
  { slug: "ckd", name: "ČKD" },
  { slug: "ine", name: "Iné" },
];

export const OPERATORS: { slug: string; name: string; city: string | null; country: OperatorCountry }[] = [
  { slug: "dpb", name: "DPB Bratislava", city: "Bratislava", country: "SK" },
  { slug: "dpmk", name: "DPMK Košice", city: "Košice", country: "SK" },
  { slug: "dpmz", name: "DPmŽ Žilina", city: "Žilina", country: "SK" },
  { slug: "sad-trencin", name: "SAD Trenčín", city: "Trenčín", country: "SK" },
  { slug: "sad", name: "SAD (ostatné)", city: null, country: "SK" },
  { slug: "dpp", name: "DPP Praha", city: "Praha", country: "CZ" },
  { slug: "dpmb", name: "DPMB Brno", city: "Brno", country: "CZ" },
  { slug: "dpmo", name: "DPMO Olomouc", city: "Olomouc", country: "CZ" },
  { slug: "csad", name: "ČSAD", city: null, country: "CZ" },
  { slug: "regiojet", name: "RegioJet", city: null, country: "CZ" },
  { slug: "arriva", name: "Arriva", city: null, country: "OTHER" },
  { slug: "fiktivne", name: "Fiktívne / Ostatné", city: null, country: "OTHER" },
];

/** Oficiálne platené DLC na Steame. Odkaz vedie na vyhľadávanie v obchode (ID sa menia s vydaniami). */
export const STEAM_DLCS: { slug: string; name: string }[] = [
  { slug: "hamburg", name: "OMSI 2 Add-on Hamburg Tag & Nacht" },
  { slug: "man-stadtbusfamilie", name: "OMSI 2 Add-on MAN Stadtbusfamilie" },
  { slug: "iveco-crossway-le", name: "OMSI 2 Add-on Iveco Crossway LE" },
  { slug: "man-new-lions-city", name: "OMSI 2 Add-on MAN New Lion's City" },
  { slug: "projekt-gladbeck", name: "OMSI 2 Add-on Projekt Gladbeck" },
  { slug: "citybus-o305", name: "OMSI 2 Add-on Citybus O305" },
  { slug: "three-generations", name: "OMSI 2 Add-on Three Generations" },
];

export function steamSearchUrl(name: string): string {
  return `https://store.steampowered.com/search/?term=${encodeURIComponent(name)}`;
}

type Db = Pick<PrismaClient, "category" | "subcategory" | "vehicleBrand" | "operator" | "steamDlc">;

/** Idempotentné doplnenie číselníkov (existujúce záznamy aktualizuje, nič nemaže). */
export async function ensureReferenceData(client: Db): Promise<void> {
  for (const [index, category] of CATEGORIES.entries()) {
    const row = await client.category.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        nameSk: category.sk,
        nameCs: category.cs,
        descriptionSk: category.descriptionSk,
        descriptionCs: category.descriptionCs,
        icon: category.icon,
        sortOrder: index,
      },
      update: { icon: category.icon },
    });
    for (const [subIndex, sub] of category.subcategories.entries()) {
      await client.subcategory.upsert({
        where: { categoryId_slug: { categoryId: row.id, slug: sub.slug } },
        create: { categoryId: row.id, slug: sub.slug, nameSk: sub.sk, nameCs: sub.cs, sortOrder: subIndex },
        update: {},
      });
    }
  }
  for (const [index, brand] of BRANDS.entries()) {
    await client.vehicleBrand.upsert({
      where: { slug: brand.slug },
      create: { ...brand, sortOrder: index },
      update: {},
    });
  }
  for (const [index, operator] of OPERATORS.entries()) {
    await client.operator.upsert({
      where: { slug: operator.slug },
      create: { ...operator, sortOrder: index },
      update: {},
    });
  }
  for (const dlc of STEAM_DLCS) {
    await client.steamDlc.upsert({
      where: { slug: dlc.slug },
      create: { slug: dlc.slug, name: dlc.name, storeUrl: steamSearchUrl(dlc.name) },
      update: {},
    });
  }
}

/** Fazety katalógu podľa slug kategórie. */
export function categoryFacets(slug: string | null | undefined): ("brand" | "operator")[] {
  return CATEGORIES.find((c) => c.slug === slug)?.facets ?? ["brand", "operator"];
}
