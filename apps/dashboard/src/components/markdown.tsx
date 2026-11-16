import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown rendered to elements, never to HTML strings: the text can come from an incident, and an incident is
 * untrusted. A document's own title becomes a section heading, because the screen already has its h1.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ h1: "h2", h2: "h3", h3: "h4" }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
