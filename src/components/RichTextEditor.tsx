import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Check,
  X,
} from "lucide-react";
import {
  plainRichText,
  richTextSchema,
  type RichNode,
} from "../../shared/content";
import type { FrameElement } from "../../shared/schema";
export default function RichTextEditor({
  el,
  scale,
  onCommit,
  onDone,
}: {
  el: FrameElement;
  scale: number;
  onCommit: (text: string, richText: RichNode) => void;
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    callbacks = useRef({ onCommit, onDone }),
    last = useRef(JSON.stringify(el.richText || plainRichText(el.text || ""))),
    [linkOpen, setLinkOpen] = useState(false),
    [link, setLink] = useState(""),
    [linkError, setLinkError] = useState(""),
    [, refresh] = useState(0);
  callbacks.current = { onCommit, onDone };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ["http", "https", "mailto", "tel"],
        },
      }),
    ],
    content: el.richText || plainRichText(el.text || ""),
    autofocus: "all",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Edit slide text",
        "aria-multiline": "true",
        class: "inline-text-editor rich-content",
      },
      handleKeyDown: (_, event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          flush();
          callbacks.current.onDone();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 450);
      refresh((n) => n + 1);
    },
    onSelectionUpdate: () => refresh((n) => n + 1),
  });
  function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (!editor) return;
    const richText = richTextSchema.parse(editor.getJSON()),
      encoded = JSON.stringify(richText);
    if (encoded !== last.current) {
      last.current = encoded;
      callbacks.current.onCommit(
        editor.getText({ blockSeparator: "\n" }),
        richText,
      );
    }
  }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        flush();
        callbacks.current.onDone();
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      flush();
    };
  }, [editor]);
  if (!editor) return <div>{el.text}</div>;
  const buttons = [
    {
      label: "Bold selection",
      mark: "bold",
      Icon: Bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic selection",
      mark: "italic",
      Icon: Italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Underline selection",
      mark: "underline",
      Icon: Underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: "Strike through selection",
      mark: "strike",
      Icon: Strikethrough,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Bulleted list",
      mark: "bulletList",
      Icon: List,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      mark: "orderedList",
      Icon: ListOrdered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];
  return (
    <div
      ref={root}
      className="rich-editor-root"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="rich-text-tools"
        role="toolbar"
        aria-label="Text selection formatting"
        style={{
          transform: "scale(" + 1 / scale + ")",
          transformOrigin: "left bottom",
        }}
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        {buttons.map(({ label, mark, Icon, run }) => (
          <button
            key={mark}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={editor.isActive(mark)}
            onClick={run}
          >
            <Icon size={16} />
          </button>
        ))}
        <button
          type="button"
          aria-label="Link selection"
          title="Link selection"
          aria-pressed={editor.isActive("link")}
          onClick={() => {
            setLink(editor.getAttributes("link").href || "https://");
            setLinkOpen(!linkOpen);
          }}
        >
          <LinkIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="Finish text editing"
          title="Finish text editing"
          onClick={() => {
            flush();
            onDone();
          }}
        >
          <Check size={17} />
        </button>
        {linkOpen && (
          <form
            className="rich-link-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) {
                const parsed = richTextSchema.safeParse({
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "link",
                          marks: [{ type: "link", attrs: { href: link } }],
                        },
                      ],
                    },
                  ],
                });
                if (!parsed.success) return;
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: link })
                  .run();
              } else editor.chain().focus().unsetLink().run();
              setLinkOpen(false);
            }}
          >
            <input
              aria-label="Link destination"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
            />
            <button aria-label="Apply link">
              <Check size={16} />
            </button>
            <button
              type="button"
              aria-label="Cancel link"
              onClick={() => setLinkOpen(false)}
            >
              <X size={16} />
            </button>
          </form>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
