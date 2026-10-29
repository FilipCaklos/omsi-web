"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Bell, BellOff, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toggleAuthorFollowAction, toggleFollowAction, type FollowState } from "@/app/actions/follow";

function Button({ following, labels }: { following: boolean; labels: { follow: string; unfollow: string } }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={following}
      className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-[5px] px-4 text-sm font-semibold disabled:opacity-70 ${
        following ? "border border-line bg-surface hover:bg-raised" : "bg-amber text-amber-ink hover:bg-amber-hover"
      }`}
    >
      {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : following ? <BellOff size={16} aria-hidden /> : <Bell size={16} aria-hidden />}
      {following ? labels.unfollow : labels.follow}
    </button>
  );
}

/** Sledovanie projektu – pri vydaní, novej verzii a devlogu príde upozornenie. Pri authorId sleduje autora. */
export function FollowButton({
  modId,
  authorId,
  initial,
  signedIn,
  signInHref,
  labels,
}: {
  modId?: string;
  authorId?: string;
  initial: { following: boolean; count: number };
  signedIn: boolean;
  signInHref: string;
  labels: { follow: string; unfollow: string; following: string; signIn: string; count: string };
}) {
  const [state, action] = useActionState<FollowState, FormData>(authorId ? toggleAuthorFollowAction : toggleFollowAction, initial);
  if (!signedIn) {
    return (
      <Link href={signInHref} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[5px] bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-hover">
        <Bell size={16} aria-hidden /> {labels.follow}
      </Link>
    );
  }
  return (
    <form action={action} className="space-y-1.5">
      {modId && <input type="hidden" name="modId" value={modId} />}
      {authorId && <input type="hidden" name="authorId" value={authorId} />}
      <Button following={state.following} labels={labels} />
      <p className="text-center font-mono text-[11px] text-muted" aria-live="polite">
        {state.following && `${labels.following} · `}
        {state.count} {labels.count}
      </p>
    </form>
  );
}
