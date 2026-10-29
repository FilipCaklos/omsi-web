import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/legal/legal-page";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("terms");
}

export default function TermsPage() {
  return <LegalPage name="terms" />;
}
