import { renderKit } from "../kit";

export const dynamic = "force-dynamic";

/** GET /email/list – grafická šablóna emailu (hlavička s logom, text, podpis) do Gmailu. */
export function GET(request: Request): Response {
  return renderKit(request, "letter");
}
