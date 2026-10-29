import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd, absoluteUrl, breadcrumbList } from "@/components/seo/json-ld";

describe("štruktúrované dáta", () => {
  it("text z databázy nemôže ukončiť <script>", () => {
    const html = renderToStaticMarkup(JsonLd({ data: { name: "</script><script>alert(1)</script>" } }));
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\u003c/script>");
  });

  it("navigačná cesta má absolútne adresy a poradie", () => {
    expect(absoluteUrl("https://omsidepo.eu", "/mod/test")).toBe("https://omsidepo.eu/mod/test");
    const crumbs = breadcrumbList("https://omsidepo.eu", [
      { name: "Katalóg", path: "/mody" },
      { name: "Mapy", path: "/mody?kategoria=mapy" },
    ]);
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Katalóg", item: "https://omsidepo.eu/mody" },
      { "@type": "ListItem", position: 2, name: "Mapy", item: "https://omsidepo.eu/mody?kategoria=mapy" },
    ]);
  });
});
