/** Next.js hook pri štarte servera – spustí plánovač úloh (iba Node.js runtime, nie počas buildu). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./server/jobs/scheduler");
  startScheduler();
}
