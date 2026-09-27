"use client";

import { Quote } from "lucide-react";

function blocksFromBody(value = "") {
  const blocks = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    current.text = current.lines.join("\n").trim();
    delete current.lines;
    if (current.text) blocks.push(current);
    current = null;
  };
  String(value).split("\n").forEach((line) => {
    const quoted = /^>+\s?/.test(line);
    const type = quoted ? "quote" : "text";
    if (!current || current.type !== type) { flush(); current = { type, lines: [] }; }
    current.lines.push(quoted ? line.replace(/^>+\s?/, "") : line);
  });
  flush();
  return blocks;
}

export default function ForumPostBody({ body }) {
  return <div className="space-y-3 text-[15px] leading-7 text-slate-100">{blocksFromBody(body).map((block, index) => block.type === "quote" ? (
    <blockquote key={index} className="relative overflow-hidden rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-4 py-3 pl-11 text-sm leading-6 text-slate-300">
      <span className="absolute inset-y-0 left-0 w-1 bg-sky-400" />
      <Quote className="absolute left-4 top-3.5 h-4 w-4 text-sky-300" />
      <div className="whitespace-pre-wrap">{block.text}</div>
    </blockquote>
  ) : <div key={index} className="whitespace-pre-wrap break-words">{block.text}</div>)}</div>;
}
