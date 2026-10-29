import { describe, expect, it } from "vitest";
import { parseYoutubeId, renderMarkdown } from "@/server/markdown";

describe("sanitizácia Markdownu", () => {
  it("bežné formátovanie a tabuľky (GFM)", () => {
    const html = renderMarkdown("## Inštalácia\n\n**Rozbaľ** do `OMSI 2`.\n\n| Linka | Trasa |\n|---|---|\n| 21 | Štrbské Pleso |");
    expect(html).toContain("<h2>Inštalácia</h2>");
    expect(html).toContain("<strong>Rozbaľ</strong>");
    expect(html).toContain("<table>");
  });

  it.each([
    ["<script>alert(1)</script>", "<script"],
    ['<img src=x onerror="alert(1)">', "onerror"],
    ['<iframe src="https://evil.example"></iframe>', "<iframe"],
    ["[klik](javascript:alert(1))", "javascript:"],
    ["[klik](data:text/html;base64,PHNjcmlwdD4=)", "data:"],
    ["![x](https://evil.example/track.png)", "<img"],
    ['<a href="https://x" onclick="steal()">x</a>', "onclick"],
    ["<style>body{display:none}</style>", "<style"],
  ])("odstráni %s", (input, forbidden) => {
    expect(renderMarkdown(input).toLowerCase()).not.toContain(forbidden);
  });

  it("externé odkazy dostanú nofollow ugc noopener a h1 sa zmení na h2", () => {
    const html = renderMarkdown("# Nadpis\n\n[Mega mirror](https://mega.nz/file/abc)");
    expect(html).toContain('<h2>Nadpis</h2>');
    expect(html).toContain('rel="nofollow ugc noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("YouTube ID z rôznych tvarov odkazu", () => {
    expect(parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYoutubeId("javascript:alert(1)")).toBeNull();
  });
});
