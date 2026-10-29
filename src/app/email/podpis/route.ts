import { renderKit } from "../kit";

export const dynamic = "force-dynamic";

/** GET /email/podpis – podpis s logom na skopírovanie do Gmailu. */
export function GET(request: Request): Response {
  return renderKit(request, "signature");
}
