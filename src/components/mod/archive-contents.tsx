"use client";

import { useState } from "react";
import { FileText, Folder, FolderOpen, LoaderCircle } from "lucide-react";

type Entry = { p: string; s: number; d?: 1 };
type Node = { name: string; size: number; children: Map<string, Node>; isDir: boolean };

function buildTree(entries: Entry[]): Node {
  const root: Node = { name: "", size: 0, children: new Map(), isDir: true };
  for (const entry of entries) {
    const parts = entry.p.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, index) => {
      const last = index === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, size: 0, children: new Map(), isDir: !last || entry.d === 1 };
        node.children.set(part, child);
      }
      if (last && entry.d !== 1) child.size = entry.s;
      if (!last) child.isDir = true;
      node = child;
    });
  }
  return root;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  const children = [...node.children.values()].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  if (!node.isDir) {
    return (
      <li className="flex items-center gap-1.5 py-0.5">
        <FileText size={13} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 pl-3 text-muted">{formatSize(node.size)}</span>
      </li>
    );
  }
  return (
    <li>
      <details open={depth < 1} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 py-0.5 hover:text-amber [&::-webkit-details-marker]:hidden">
          <Folder size={13} strokeWidth={1.75} className="shrink-0 text-amber group-open:hidden" aria-hidden />
          <FolderOpen size={13} strokeWidth={1.75} className="hidden shrink-0 text-amber group-open:block" aria-hidden />
          <span className="truncate font-semibold">{node.name}/</span>
          <span className="ml-auto pl-3 text-muted">{node.children.size}</span>
        </summary>
        <ul className="ml-3 border-l border-line pl-2">
          {children.map((child) => (
            <TreeNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** „Zobraziť obsah archívu“ – strom sa načíta až po rozkliknutí (stránka zostáva ľahká). */
export function ArchiveContents({
  fileId,
  labels,
}: {
  fileId: string;
  labels: { show: string; installRoot: string; installPrefix: string; installUnknown: string; truncated: string };
}) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [data, setData] = useState<{ tree: Node; installPrefix: string | null; truncated: boolean; count: number } | null>(null);

  async function load() {
    if (state !== "idle") return;
    setState("loading");
    try {
      const response = await fetch(`/api/files/${fileId}/entries`);
      if (!response.ok) throw new Error(String(response.status));
      const json = (await response.json()) as { entries: Entry[]; installPrefix: string | null; truncated: boolean };
      setData({ tree: buildTree(json.entries), installPrefix: json.installPrefix, truncated: json.truncated, count: json.entries.length });
      setState("ready");
    } catch {
      setState("error");
    }
  }

  const hint =
    data?.installPrefix === "" ? labels.installRoot
    : data?.installPrefix ? labels.installPrefix.replace("{prefix}", data.installPrefix.replace(/\/$/, ""))
    : labels.installUnknown;

  return (
    <details
      className="rounded-[5px] border border-line bg-bg"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) void load();
      }}
    >
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted hover:text-text">{labels.show}</summary>
      <div className="border-t border-line px-3 py-2">
        {state === "loading" && <LoaderCircle size={16} className="animate-spin text-muted" aria-hidden />}
        {state === "error" && <p className="text-xs text-alert">—</p>}
        {state === "ready" && data && (
          <>
            <p className="mb-2 rounded-[3px] bg-signal-soft px-2 py-1.5 text-xs text-text">{hint}</p>
            <ul className="scrollbar-thin max-h-80 overflow-auto font-mono text-[12px]">
              {[...data.tree.children.values()].map((node) => (
                <TreeNode key={node.name} node={node} depth={0} />
              ))}
            </ul>
            {data.truncated && <p className="mt-2 text-[11px] text-muted">{labels.truncated.replace("{count}", String(data.count))}</p>}
          </>
        )}
      </div>
    </details>
  );
}
