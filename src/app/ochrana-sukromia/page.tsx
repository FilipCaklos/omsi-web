import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/legal/legal-page";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("privacy");
}

export default function PrivacyPage() {
  return <LegalPage name="privacy" />;
}
