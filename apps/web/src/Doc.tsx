import { Marked } from "marked";
import { type MouseEvent, useEffect, useState } from "react";

export type DocName = "manual" | "changelog";

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ +/g, "-");

// Headings get ids so the manual's table of contents can jump to them.
const markdown = new Marked({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      return `<h${depth} id="${slug(text.replace(/<[^>]+>/g, ""))}">${text}</h${depth}>`;
    },
  },
});

// The files link to each other by repository paths. On the website they open the other document.
const LINKS: [RegExp, string][] = [
  [/\]\((\.\.\/)?CHANGELOG\.md\)/g, "](#changelog)"],
  [/\]\((docs\/)?manual\.md\)/g, "](#manual)"],
];

/** Renders docs/manual.md or CHANGELOG.md. Both are copied into the build and come from this repository only. */
export function Doc({ name, onOpen }: { name: DocName; onOpen: (doc: DocName) => void }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    void fetch(`/${name}.md`)
      .then((r) => r.text())
      .then((md) => setHtml(markdown.parse(LINKS.reduce((text, [from, to]) => text.replace(from, to), md)) as string));
  }, [name]);

  function follow(e: MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (href === "#manual" || href === "#changelog") {
      e.preventDefault();
      onOpen(href.slice(1) as DocName);
      window.scrollTo(0, 0);
    }
  }

  return (
    <article className="panel doc" onClick={follow} dangerouslySetInnerHTML={{ __html: html || "<p>Loading…</p>" }} />
  );
}
