import type { ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownPlugins = [remarkGfm];

function externalLink({ href, children, ...props }: ComponentPropsWithoutRef<"a">) {
  if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return <a {...props} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function TutorMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={markdownPlugins}
      skipHtml
      components={{
        a: externalLink,
        h1: ({ children: heading }) => <h3>{heading}</h3>,
        h2: ({ children: heading }) => <h3>{heading}</h3>,
        h3: ({ children: heading }) => <h3>{heading}</h3>,
        h4: ({ children: heading }) => <h4>{heading}</h4>,
        h5: ({ children: heading }) => <h4>{heading}</h4>,
        h6: ({ children: heading }) => <h4>{heading}</h4>,
        img: () => null,
      }}
    >
      {children}
    </Markdown>
  );
}
