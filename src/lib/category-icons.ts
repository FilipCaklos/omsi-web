import {
  AppWindow,
  AudioLines,
  Boxes,
  Bus,
  FileAudio,
  Map,
  Package,
  Paintbrush,
  TramFront,
  type LucideIcon,
} from "lucide-react";

/** Allowlist ikon kategórií – v DB je uložený iba kľúč, nikdy nie SVG/HTML. */
export const CATEGORY_ICONS = {
  map: Map,
  bus: Bus,
  tram: TramFront,
  paintbrush: Paintbrush,
  announcements: FileAudio,
  objects: Boxes,
  scripts: AudioLines,
  tools: AppWindow,
} as const satisfies Record<string, LucideIcon>;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

export function categoryIcon(key: string): LucideIcon {
  return key in CATEGORY_ICONS ? CATEGORY_ICONS[key as CategoryIconKey] : Package;
}
