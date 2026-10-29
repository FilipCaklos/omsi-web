import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

export function SectionHeading({
  id,
  title,
  Icon,
  href,
  linkLabel,
  children,
}: {
  id: string;
  title: string;
  Icon: LucideIcon;
  href?: string;
  linkLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2">
      <h2 id={id} className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-wide">
        <Icon size={17} strokeWidth={1.75} className="text-amber" aria-hidden />
        {title}
      </h2>
      <div className="flex items-center gap-3">
        {children}
        {href && linkLabel && (
          <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-muted hover:text-text">
            {linkLabel}
            <ChevronRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[5px] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>
  );
}
