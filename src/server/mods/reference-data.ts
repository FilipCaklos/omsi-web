import type { OperatorCountry, PrismaClient } from "@/generated/prisma/client";
import type { CategoryIconKey } from "@/lib/category-icons";

/**
 * Kanonické číselníky CZ/SK OMSI 2 komunity. `ensureReferenceData` ich idempotentne zapíše
 * (volá seed a prvé spustenie); administrátor ich potom spravuje v /admin.
 */

/** Spoločné polia podľa kategórie: značka/model vozidla, dopravca, poloha na mape (Mapa máp) */
export type Facet = "brand" | "operator" | "location";

type CategoryDef = {
  slug: string;
  sk: string;
  cs: string;
  icon: CategoryIconKey;
  descriptionSk: string;
  descriptionCs: string;
  subcategories: { slug: string; sk: string; cs: string }[];
  /** Ktoré filtre katalóg pri kategórii ponúka */
  facets: Facet[];
};

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "mapy", sk: "Mapy", cs: "Mapy", icon: "map", facets: ["location"],
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

type DefaultField = {
  key: string;
  sk: string;
  cs: string;
  hintSk?: string;
  hintCs?: string;
  type: "TEXT" | "NUMBER" | "SELECT" | "MULTISELECT" | "BOOLEAN";
  options?: { value: string; sk: string; cs: string }[];
  unit?: string;
  required?: boolean;
  filterable?: boolean;
};

const FLOOR_OPTIONS = [
  { value: "nizkopodlazny", sk: "Nízkopodlažný", cs: "Nízkopodlažní" },
  { value: "low-entry", sk: "Low-entry", cs: "Low-entry" },
  { value: "vysokopodlazny", sk: "Vysokopodlažný", cs: "Vysokopodlažní" },
];

/**
 * Predvolené vlastné polia kategórií (parametre modu). Seed ich iba doplní, ak chýbajú –
 * úpravy administrátora v /admin/kategorie ostávajú zachované.
 */
export const CATEGORY_FIELDS: Record<string, DefaultField[]> = {
  mapy: [
    { key: "mesto", sk: "Mesto / oblasť", cs: "Město / oblast", hintSk: "Napr. Bratislava, Pezinok – Modra, Žilinský kraj", hintCs: "Např. Brno, Ostrava – Havířov, Vysočina", type: "TEXT", required: true },
    {
      key: "krajina",
      sk: "Krajina",
      cs: "Země",
      type: "SELECT",
      required: true,
      filterable: true,
      options: [
        { value: "sk", sk: "Slovensko", cs: "Slovensko" },
        { value: "cz", sk: "Česko", cs: "Česko" },
        { value: "ine", sk: "Iná krajina", cs: "Jiná země" },
      ],
    },
    { key: "linky", sk: "Počet liniek", cs: "Počet linek", type: "NUMBER" },
    { key: "obdobie", sk: "Obdobie", cs: "Období", hintSk: "Napr. 2008–2012", hintCs: "Např. 2008–2012", type: "TEXT" },
    { key: "ai_premavka", sk: "AI premávka (autá, autobusy)", cs: "AI provoz (auta, autobusy)", type: "BOOLEAN", filterable: true },
    { key: "hof", sk: "Obsahuje HOF súbor", cs: "Obsahuje HOF soubor", type: "BOOLEAN", filterable: true },
  ],
  autobusy: [
    {
      key: "dlzka",
      sk: "Dĺžka",
      cs: "Délka",
      type: "SELECT",
      filterable: true,
      options: [
        { value: "midi", sk: "Mini / midi (do 10 m)", cs: "Mini / midi (do 10 m)" },
        { value: "solo", sk: "Sólo (12 m)", cs: "Sólo (12 m)" },
        { value: "trojnapravovy", sk: "Trojnápravový (13–15 m)", cs: "Třínápravový (13–15 m)" },
        { value: "klbovy", sk: "Kĺbový (18 m)", cs: "Kloubový (18 m)" },
      ],
    },
    { key: "podlaha", sk: "Podlaha", cs: "Podlaha", type: "SELECT", filterable: true, options: FLOOR_OPTIONS },
    {
      key: "pohon",
      sk: "Pohon",
      cs: "Pohon",
      type: "SELECT",
      filterable: true,
      options: [
        { value: "nafta", sk: "Nafta", cs: "Nafta" },
        { value: "cng", sk: "CNG", cs: "CNG" },
        { value: "elektro", sk: "Elektrobus", cs: "Elektrobus" },
        { value: "hybrid", sk: "Hybrid", cs: "Hybrid" },
      ],
    },
    {
      key: "prevodovka",
      sk: "Prevodovka",
      cs: "Převodovka",
      type: "SELECT",
      options: [
        { value: "automat", sk: "Automatická", cs: "Automatická" },
        { value: "manual", sk: "Manuálna", cs: "Manuální" },
      ],
    },
    { key: "roky_vyroby", sk: "Roky výroby", cs: "Roky výroby", hintSk: "Napr. 1990–2002", hintCs: "Např. 1990–2002", type: "TEXT" },
    { key: "repainty", sk: "Obsahuje repainty", cs: "Obsahuje repainty", type: "BOOLEAN", filterable: true },
  ],
  "trolejbusy-elektricky": [
    { key: "podlaha", sk: "Podlaha", cs: "Podlaha", type: "SELECT", filterable: true, options: FLOOR_OPTIONS },
    { key: "clanky", sk: "Počet článkov", cs: "Počet článků", type: "NUMBER" },
    { key: "roky_vyroby", sk: "Roky výroby", cs: "Roky výroby", hintSk: "Napr. 1990–2002", hintCs: "Např. 1990–2002", type: "TEXT" },
  ],
  repainty: [
    { key: "pre_vozidlo", sk: "Pre vozidlo (mod)", cs: "Pro vozidlo (mod)", hintSk: "Názov modu, pre ktorý je repaint, napr. Karosa B 732 od XY", hintCs: "Název modu, pro který je repaint, např. Karosa B 732 od XY", type: "TEXT", required: true },
    { key: "pocet", sk: "Počet náterov v balíku", cs: "Počet nátěrů v balíku", type: "NUMBER" },
    { key: "obdobie", sk: "Obdobie", cs: "Období", hintSk: "Napr. 1995–2005", hintCs: "Např. 1995–2005", type: "TEXT" },
    { key: "fiktivny", sk: "Fiktívny náter", cs: "Fiktivní nátěr", type: "BOOLEAN", filterable: true },
  ],
  "hof-hlasenia": [
    { key: "pre_mapu", sk: "Pre mapu", cs: "Pro mapu", hintSk: "Názov mapy, pre ktorú je HOF alebo hlásenie", hintCs: "Název mapy, pro kterou je HOF nebo hlášení", type: "TEXT", required: true },
    {
      key: "jazyk",
      sk: "Jazyk",
      cs: "Jazyk",
      type: "SELECT",
      filterable: true,
      options: [
        { value: "sk", sk: "Slovenčina", cs: "Slovenština" },
        { value: "cs", sk: "Čeština", cs: "Čeština" },
        { value: "ine", sk: "Iný", cs: "Jiný" },
      ],
    },
    { key: "linky", sk: "Počet liniek", cs: "Počet linek", type: "NUMBER" },
  ],
  "objekty-splines": [
    {
      key: "styl",
      sk: "Štýl",
      cs: "Styl",
      type: "SELECT",
      filterable: true,
      options: [
        { value: "sk", sk: "Slovenský", cs: "Slovenský" },
        { value: "cz", sk: "Český", cs: "Český" },
        { value: "univerzalny", sk: "Univerzálny", cs: "Univerzální" },
      ],
    },
    { key: "pocet", sk: "Počet objektov", cs: "Počet objektů", type: "NUMBER" },
  ],
  "skripty-zvuky": [
    { key: "pre_vozidlo", sk: "Pre vozidlo", cs: "Pro vozidlo", hintSk: "Nechaj prázdne, ak úprava funguje pre všetky vozidlá", hintCs: "Nech prázdné, pokud úprava funguje pro všechna vozidla", type: "TEXT" },
    { key: "prepisuje", sk: "Prepisuje pôvodné súbory vozidla", cs: "Přepisuje původní soubory vozidla", type: "BOOLEAN" },
  ],
  nastroje: [
    { key: "verzia", sk: "Verzia programu", cs: "Verze programu", type: "TEXT" },
    { key: "open_source", sk: "Otvorený zdrojový kód", cs: "Otevřený zdrojový kód", type: "BOOLEAN", filterable: true },
  ],
};

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

type Db = Pick<PrismaClient, "category" | "subcategory" | "categoryField" | "vehicleBrand" | "operator" | "steamDlc">;

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
    for (const [fieldIndex, field] of (CATEGORY_FIELDS[category.slug] ?? []).entries()) {
      await client.categoryField.upsert({
        where: { categoryId_key: { categoryId: row.id, key: field.key } },
        create: {
          categoryId: row.id,
          key: field.key,
          labelSk: field.sk,
          labelCs: field.cs,
          hintSk: field.hintSk ?? "",
          hintCs: field.hintCs ?? "",
          type: field.type,
          options: field.options ?? [],
          unit: field.unit ?? "",
          required: field.required ?? false,
          filterable: field.filterable ?? false,
          sortOrder: fieldIndex,
        },
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
export function categoryFacets(slug: string | null | undefined): Facet[] {
  return CATEGORIES.find((c) => c.slug === slug)?.facets ?? ["brand", "operator"];
}
