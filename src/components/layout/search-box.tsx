"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Suggestion = { slug: string; title: string; categoryName: string };

/**
 * Vyhľadávanie v hlavičke: obyčajný GET formulár na /mody (funguje bez JS),
 * s JS ponúka okamžité návrhy (combobox podľa WAI-ARIA).
 */
export function SearchBox({
  initial,
  labels,
}: {
  initial: string;
  labels: { label: string; placeholder: string; submit: string; searchAll: string };
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { items: Suggestion[] };
        setItems(data.items);
        setActive(-1);
      } catch {
        // Zrušená alebo zlyhaná požiadavka – návrhy sú iba doplnok
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [value]);

  const showList = open && items.length > 0;

  return (
    <form
      action="/mody"
      method="get"
      role="search"
      className="relative order-last flex h-9 w-full items-center rounded-[5px] border border-line bg-bg focus-within:border-amber md:order-none md:max-w-xl md:flex-1"
      onSubmit={(event) => {
        if (showList && active >= 0 && items[active]) {
          event.preventDefault();
          setOpen(false);
          router.push(`/mod/${items[active].slug}`);
        }
      }}
    >
      <label htmlFor="site-search" className="sr-only">
        {labels.label}
      </label>
      <Search size={16} strokeWidth={1.75} className="ml-3 shrink-0 text-muted" aria-hidden />
      <input
        id="site-search"
        name="q"
        type="search"
        value={value}
        maxLength={100}
        autoComplete="off"
        spellCheck={false}
        placeholder={labels.placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!showList) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(items.length - 1, i + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted"
      />
      <button type="submit" className="h-full border-l border-line px-3 text-xs font-semibold text-muted hover:text-text">
        {labels.submit}
      </button>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-10 z-50 overflow-hidden rounded-[5px] border border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
        >
          {items.map((item, index) => (
            <li
              key={item.slug}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                setOpen(false);
                router.push(`/mod/${item.slug}`);
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${index === active ? "bg-raised" : "hover:bg-raised"}`}
            >
              <span className="truncate">{item.title}</span>
              <span className="shrink-0 text-[11px] text-muted">{item.categoryName}</span>
            </li>
          ))}
          <li className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
            {labels.searchAll} „{value.trim()}“ ↵
          </li>
        </ul>
      )}
    </form>
  );
}
