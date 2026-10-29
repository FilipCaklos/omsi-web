import "server-only";
import type { CategoryField } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseOptions, type FieldDef } from "@/lib/category-fields";

export function toFieldDef(row: Pick<CategoryField, "key" | "labelSk" | "labelCs" | "hintSk" | "hintCs" | "type" | "options" | "unit" | "required" | "filterable">): FieldDef {
  return {
    key: row.key,
    labelSk: row.labelSk,
    labelCs: row.labelCs,
    hintSk: row.hintSk,
    hintCs: row.hintCs,
    type: row.type,
    options: parseOptions(row.options),
    unit: row.unit,
    required: row.required,
    filterable: row.filterable,
  };
}

/** Aktívne polia kategórie v poradí, ako ich nastavil administrátor. */
export async function getCategoryFields(categoryId: string): Promise<FieldDef[]> {
  const rows = await db().categoryField.findMany({
    where: { categoryId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toFieldDef);
}
