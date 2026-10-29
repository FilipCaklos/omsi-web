import { describe, expect, it } from "vitest";
import {
  attributeSearchTerms,
  formatAttribute,
  missingRequired,
  parseAttributeFilters,
  parseAttributeForm,
  parseOptionLines,
  readAttributes,
  type FieldDef,
} from "@/lib/category-fields";

const base = { hintSk: "", hintCs: "", unit: "", options: [], required: false, filterable: false };
const FIELDS: FieldDef[] = [
  { ...base, key: "mesto", labelSk: "Mesto", labelCs: "Město", type: "TEXT", required: true },
  {
    ...base,
    key: "krajina",
    labelSk: "Krajina",
    labelCs: "Země",
    type: "SELECT",
    filterable: true,
    options: [
      { value: "sk", sk: "Slovensko", cs: "Slovensko" },
      { value: "cz", sk: "Česko", cs: "Česko" },
    ],
  },
  { ...base, key: "linky", labelSk: "Počet liniek", labelCs: "Počet linek", type: "NUMBER", unit: "ks" },
  {
    ...base,
    key: "pohon",
    labelSk: "Pohon",
    labelCs: "Pohon",
    type: "MULTISELECT",
    filterable: true,
    options: [
      { value: "nafta", sk: "Nafta", cs: "Nafta" },
      { value: "cng", sk: "CNG", cs: "CNG" },
    ],
  },
  { ...base, key: "ai", labelSk: "AI premávka", labelCs: "AI provoz", type: "BOOLEAN", filterable: true },
];

function form(values: Record<string, string | string[]>) {
  return {
    get: (name: string) => {
      const v = values[name];
      return Array.isArray(v) ? v[0] : v;
    },
    getAll: (name: string) => {
      const v = values[name];
      return v === undefined ? [] : Array.isArray(v) ? v : [v];
    },
  };
}

describe("parametre kategórie – formulár", () => {
  it("prevedie hodnoty na správne typy a nevyplnené vynechá", () => {
    const { values, errors } = parseAttributeForm(
      FIELDS,
      form({ attr_mesto: "  Pezinok   –  Modra ", attr_krajina: "sk", attr_linky: "6,5", attr_pohon: ["cng", "nafta"], attr_ai: "on" }),
    );
    expect(errors).toEqual({});
    // MULTISELECT v poradí možností, nie kliknutí
    expect(values).toEqual({ mesto: "Pezinok – Modra", krajina: "sk", linky: 6.5, pohon: ["nafta", "cng"], ai: true });
  });

  it("povinné pole a neplatné hodnoty vrátia chybu", () => {
    const { errors } = parseAttributeForm(FIELDS, form({ attr_krajina: "pl", attr_linky: "veľa", attr_pohon: ["benzin"] }));
    expect(errors).toEqual({ mesto: "ATTRIBUTE_REQUIRED", krajina: "ATTRIBUTE_INVALID", linky: "ATTRIBUTE_INVALID", pohon: "ATTRIBUTE_INVALID" });
  });

  it("chýbajúce povinné polia pred odoslaním", () => {
    expect(missingRequired(FIELDS, { krajina: "sk" })).toEqual(["mesto"]);
    expect(missingRequired(FIELDS, { mesto: "Žilina" })).toEqual([]);
  });

  it("z DB prečíta iba platné kľúče a typy", () => {
    expect(readAttributes({ mesto: "Žilina", "zlý kľúč": "x", linky: 4, pohon: ["cng"], vnorene: { a: 1 } })).toEqual({ mesto: "Žilina", linky: 4, pohon: ["cng"] });
    expect(readAttributes(null)).toEqual({});
  });
});

describe("parametre kategórie – zobrazenie a vyhľadávanie", () => {
  it("formátuje hodnoty podľa jazyka", () => {
    const [mesto, krajina, linky, pohon, ai] = FIELDS as [FieldDef, FieldDef, FieldDef, FieldDef, FieldDef];
    expect(formatAttribute(mesto, "Žilina", "sk", "Áno")).toBe("Žilina");
    expect(formatAttribute(krajina, "cz", "cs", "Ano")).toBe("Česko");
    expect(formatAttribute(linky, 1200, "sk", "Áno")).toBe("1 200 ks");
    expect(formatAttribute(pohon, ["nafta", "cng"], "sk", "Áno")).toBe("Nafta, CNG");
    expect(formatAttribute(ai, true, "cs", "Ano")).toBe("Ano");
    expect(formatAttribute(ai, undefined, "sk", "Áno")).toBeNull();
  });

  it("do vyhľadávania pridá text a názvy možností", () => {
    expect(attributeSearchTerms(FIELDS, { mesto: "Žilina", krajina: "sk", pohon: ["cng"] })).toEqual(["Žilina", "Slovensko", "Slovensko", "CNG", "CNG"]);
  });

  it("filtre z URL prijmú iba filtrovateľné polia a známe hodnoty", () => {
    expect(parseAttributeFilters(FIELDS, { p_krajina: "sk", p_pohon: "cng", p_ai: "1", p_mesto: "Žilina", p_linky: "4" })).toEqual({
      krajina: "sk",
      pohon: ["cng"],
      ai: true,
    });
    expect(parseAttributeFilters(FIELDS, { p_krajina: "' OR 1=1 --", p_ai: "0" })).toEqual({});
  });
});

describe("možnosti v administrácii", () => {
  it("doplní hodnotu z názvu a zachová existujúcu", () => {
    expect(parseOptionLines("sk | Slovensko | Slovensko\nKĺbový (18 m) | Kloubový (18 m)\n\nCNG")).toEqual({
      options: [
        { value: "sk", sk: "Slovensko", cs: "Slovensko" },
        { value: "klbovy-18-m", sk: "Kĺbový (18 m)", cs: "Kloubový (18 m)" },
        { value: "cng", sk: "CNG", cs: "CNG" },
      ],
    });
  });

  it("odmietne duplicitné alebo neplatné hodnoty", () => {
    expect(parseOptionLines("Nafta\nnafta | Nafta 2 | Nafta 2")).toEqual({ error: "OPTIONS_INVALID" });
    expect(parseOptionLines("Zlá Hodnota | A | B")).toEqual({ error: "OPTIONS_INVALID" });
  });
});
