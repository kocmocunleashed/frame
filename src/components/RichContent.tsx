import type { ReactNode } from "react";
import type { RichNode } from "../../shared/content";
export function RichContent({ node }: { node: RichNode }): ReactNode {
  if (node.type === "text") {
    let content: ReactNode = node.text || "";
    for (const [i, mark] of (node.marks || []).entries()) {
      if (mark.type === "bold") content = <strong key={i}>{content}</strong>;
      if (mark.type === "italic") content = <em key={i}>{content}</em>;
      if (mark.type === "underline") content = <u key={i}>{content}</u>;
      if (mark.type === "strike") content = <s key={i}>{content}</s>;
      if (mark.type === "link" && mark.attrs?.href)
        content = (
          <a
            key={i}
            href={mark.attrs.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {content}
          </a>
        );
    }
    return content;
  }
  const content = node.content?.map((n, i) => <RichContent key={i} node={n} />);
  switch (node.type) {
    case "paragraph":
      return <p>{content?.length ? content : <br />}</p>;
    case "bulletList":
      return <ul>{content}</ul>;
    case "orderedList":
      return <ol start={node.attrs?.start}>{content}</ol>;
    case "listItem":
      return <li>{content}</li>;
    case "hardBreak":
      return <br />;
    default:
      return <>{content}</>;
  }
}
