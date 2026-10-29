import type { Element, Root } from "hast";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/**
 * Prísny allowlist pre používateľský Markdown (popisy modov, devlogy, recenzie, hlásenia chýb).
 * Surové HTML sa vôbec neparsuje (remark-rehype bez allowDangerousHtml) a výsledok ešte prejde rehype-sanitize:
 * žiadne <script>, <iframe>, <style>, on* atribúty, žiadne javascript:/data: odkazy.
 * YouTube ukážky sa vkladajú iba cez pole „youtubeVideoId“ na youtube-nocookie.com (mimo Markdownu).
 */
const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    "p", "br", "hr", "strong", "em", "del", "code", "pre", "blockquote",
    "ul", "ol", "li", "h2", "h3", "h4", "a", "table", "thead", "tbody", "tr", "th", "td", "input",
  ],
  attributes: {
    a: ["href", "title"],
    code: [["className", /^language-[a-z0-9-]+$/]],
    input: [["type", "checkbox"], ["disabled", true], "checked"],
    th: [["align", "left", "center", "right"]],
    td: [["align", "left", "center", "right"]],
    li: [["className", "task-list-item"]],
    ul: [["className", "contains-task-list"]],
    ol: ["start"],
  },
  protocols: { href: ["http", "https", "mailto"] },
  strip: ["script", "style", "iframe", "object", "embed"],
  clobberPrefix: "md-",
};

/** Nadpis h1 by súperil s titulkom stránky – pred sanitizáciou ho zmeníme na h2. */
function rehypeDemoteH1() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "h1") node.tagName = "h2";
    });
  };
}

/** Externé odkazy (po sanitizácii): nová karta, bez referrera, nofollow pre používateľský obsah. */
function rehypeSafeLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = String(node.properties.href ?? "");
      if (/^https?:\/\//i.test(href)) {
        node.properties.target = "_blank";
        node.properties.rel = ["nofollow", "ugc", "noopener", "noreferrer"];
      }
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeDemoteH1)
  .use(rehypeSanitize, schema)
  .use(rehypeSafeLinks)
  .use(rehypeStringify);

export const MARKDOWN_MAX_LENGTH = 50_000;

export function renderMarkdown(markdown: string): string {
  const input = markdown.slice(0, MARKDOWN_MAX_LENGTH).replace(/\r\n?/g, "\n");
  return String(processor.processSync(input));
}

/** ID YouTube videa z odkazu (youtube.com/watch?v=, youtu.be/, /shorts/, /embed/) alebo null. */
export function parseYoutubeId(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
