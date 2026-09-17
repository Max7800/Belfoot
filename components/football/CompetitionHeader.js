"use client";
// Header overlay : bannière décorative, contenu dynamique. Générique (aucune compé en dur).
const FLAG = { Belgium: "🇧🇪", France: "🇫🇷", England: "🏴", Spain: "🇪🇸", Italy: "🇮🇹", Germany: "🇩🇪", Netherlands: "🇳🇱", Portugal: "🇵🇹" };
export default function CompetitionHeader({ comp, seasonLabel, kicker }) {
  const banner = comp.banner_url || "/competition-banner.png";
  const flagUrl = comp.ext?.country_flag;
  const flagEmoji = FLAG[comp.ext?.country];
  const title = comp.header_title?.trim() || comp.name;
  const automaticSubtitle = [comp.ext?.country, seasonLabel].filter(Boolean).join(" · ");
  const subtitle = comp.header_subtitle?.trim() || automaticSubtitle;
  return (
    <div className="relative -mx-4 mb-6 overflow-hidden sm:mx-0 sm:rounded-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1730] to-[#123a6b]" />
      {banner && <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${banner})` }} />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
      <div className="relative flex items-center gap-5 px-5 py-8 sm:px-8 sm:py-12">
        {comp.logo_url && <img src={comp.logo_url} className="h-20 w-20 shrink-0 object-contain drop-shadow-xl sm:h-28 sm:w-28" alt="" />}
        <div className="min-w-0 border-l border-white/20 pl-5">
          {kicker && <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">{kicker}</div>}
          <h1 className="truncate text-3xl font-black leading-none text-white sm:text-5xl">{title}</h1>
          <div className="mt-2 h-[3px] w-24 overflow-hidden rounded-full"><div className="flex h-full opacity-80"><span className="flex-1 bg-black" /><span className="flex-1 bg-yellow-400" /><span className="flex-1 bg-red-600" /></div></div>
          {subtitle && <div className="mt-2 flex items-center gap-2 text-sm text-white/75">
            {flagUrl ? <img src={flagUrl} className="h-4 w-6 rounded-sm object-cover shadow" alt="" /> : flagEmoji ? <span className="text-base">{flagEmoji}</span> : null}
            {subtitle}
          </div>}
        </div>
      </div>
    </div>
  );
}
