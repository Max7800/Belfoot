"use client";
import ImageField from "@/components/ui/ImageField";
import GalleryField from "@/components/ui/GalleryField";
import RichText from "@/components/ui/RichText";
import CategoryField from "@/components/ui/CategoryField";

export default function FieldInput({ field, value, onChange, scope }) {
  const label = field.label ? <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{field.label}</label> : null;
  const box = "w-full rounded border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";
  switch (field.type) {
    case "textarea":
      return <div>{label}<textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} className={box} /></div>;
    case "richtext":
      return <div>{label}<RichText value={value} onChange={onChange} /></div>;
    case "category":
      return <div>{label}<CategoryField scope={field.scope || scope} value={value} onChange={onChange} /></div>;
    case "bool":
      return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{field.label}</label>;
    case "number":
      return <div>{label}<input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={box} /></div>;
    case "date":
      return <div>{label}<input type="date" value={(value || "").slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} className={box} /></div>;
    case "select":
      return <div>{label}<select value={value || ""} onChange={(e) => onChange(e.target.value)} className={box}><option value="">—</option>{(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
    case "image":
      return <div>{label}<ImageField value={value} onChange={onChange} /></div>;
    case "gallery":
      return <div>{label}<GalleryField value={value} onChange={onChange} /></div>;
    case "seo": {
      const v = value || {};
      return (
        <div className="rounded-lg border border-line/10 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">SEO (optionnel)</div>
          <input value={v.title || ""} onChange={(e) => onChange({ ...v, title: e.target.value })} placeholder="Titre SEO" className={box + " mb-2"} />
          <input value={v.description || ""} onChange={(e) => onChange({ ...v, description: e.target.value })} placeholder="Meta description" className={box} />
        </div>
      );
    }
    case "slug":
      return <div>{label}<input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="auto depuis le titre" className={box} /></div>;
    default:
      return <div>{label}<input value={value || ""} onChange={(e) => onChange(e.target.value)} className={box} /></div>;
  }
}
