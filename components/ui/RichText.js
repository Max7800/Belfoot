"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { Bold, Italic, Heading2, List, ListOrdered, Link as LinkIcon, Undo, Redo } from "lucide-react";

// Éditeur riche du moteur : rendu automatique de tout champ `type: "richtext"`.
export default function RichText({ value, onChange }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    shouldRerenderOnTransaction: true,
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: { attributes: { class: "rich min-h-[160px] focus:outline-none" } },
  });

  // Recharge le contenu quand on passe à une autre entrée.
  useEffect(() => {
    if (editor && (value || "") !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return null;

  const Btn = ({ on, active, children }) => (
    <button type="button" onClick={on} className={`rounded px-2 py-1 ${active ? "bg-accent text-white" : "text-muted hover:text-content"}`}>{children}</button>
  );
  const setLink = () => {
    const url = prompt("URL du lien :");
    if (url === null) return;
    url ? editor.chain().focus().setLink({ href: url }).run() : editor.chain().focus().unsetLink().run();
  };

  return (
    <div className="rounded border border-line/10 bg-surface2">
      <div className="flex flex-wrap items-center gap-1 border-b border-line/10 p-1">
        <Btn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold className="h-4 w-4" /></Btn>
        <Btn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic className="h-4 w-4" /></Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}><Heading2 className="h-4 w-4" /></Btn>
        <Btn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List className="h-4 w-4" /></Btn>
        <Btn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered className="h-4 w-4" /></Btn>
        <Btn on={setLink} active={editor.isActive("link")}><LinkIcon className="h-4 w-4" /></Btn>
        <span className="mx-1 h-4 w-px bg-line/20" />
        <Btn on={() => editor.chain().focus().undo().run()}><Undo className="h-4 w-4" /></Btn>
        <Btn on={() => editor.chain().focus().redo().run()}><Redo className="h-4 w-4" /></Btn>
      </div>
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}
