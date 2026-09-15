"use client";
// Header 100% overlay : la bannière est décorative (aucun texte/logo intégré),
// tout le contenu est posé en HTML/CSS. Dynamique et réutilisable (aucune compé en dur).
export default function CompetitionHeader({ comp, seasonLabel, kicker }) {
  const banner = comp.banner_url;
  return (
    <div className="relative -mx-4 mb-6 overflow-hidden sm:mx-0 sm:rounded-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1730] to-[#123a6b]" />
      {banner && <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${banner})` }} />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
      <div className="relative flex items-center gap-5 px-5 py-8 sm:px-8 sm:py-12">
        {comp.logo_url && <img src={comp.logo_url} className="h-16 w-16 shrink-0 object-contain drop-shadow-lg sm:h-24 sm:w-24" alt="" />}
        <div className="min-w-0 border-l border-white/20 pl-5">
          {kicker && <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">{kicker}</div>}
          <h1 className="truncate text-3xl font-black leading-none text-white sm:text-5xl">{comp.name}</h1>
          <div className="mt-2 text-sm text-white/70">{[comp.ext?.country, seasonLabel].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
    </div>
  );
}
