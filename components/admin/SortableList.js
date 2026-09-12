"use client";
import { useState } from "react";

// Glisser-déposer simple (HTML5 natif) pour réordonner une liste. v1 : pas de
// page builder, juste un réordonnancement persisté via onReorder(nextItems).
export default function SortableList({ items, getId, onReorder, children }) {
  const [from, setFrom] = useState(null);
  return (
    <>
      {items.map((it, i) => (
        <div
          key={getId(it)}
          draggable
          onDragStart={() => setFrom(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (from === null || from === i) return;
            const next = [...items];
            const [moved] = next.splice(from, 1);
            next.splice(i, 0, moved);
            setFrom(null);
            onReorder(next);
          }}
        >
          {children(it, i)}
        </div>
      ))}
    </>
  );
}
