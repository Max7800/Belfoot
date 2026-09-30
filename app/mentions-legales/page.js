import { buildMetadata } from "@/lib/seo";

// Base rédigée à faire relire (je ne suis pas juriste). Les [À COMPLÉTER] sont
// à remplir : éditeur, contact, adresse.
export const metadata = buildMetadata({ title: "Mentions légales · Belfoot", description: "Mentions légales du site Belfoot.", path: "/mentions-legales" });

export default function MentionsLegalesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4 text-sm leading-6 text-muted">
      <div>
        <h1 className="text-2xl font-black text-content">Mentions légales</h1>
        <p className="mt-1 text-xs">Dernière mise à jour : [À COMPLÉTER]</p>
      </div>

      <section>
        <h2 className="mb-1 font-bold text-content">Éditeur du site</h2>
        <p>
          Belfoot est édité par [À COMPLÉTER : nom / prénom ou raison sociale], [statut — particulier / indépendant / société],
          [adresse], Belgique.<br />
          Contact : [À COMPLÉTER : adresse e-mail].<br />
          Directeur de la publication : [À COMPLÉTER].
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Hébergement</h2>
        <p>
          Le site est hébergé par <strong>Vercel Inc.</strong>, 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis
          (vercel.com). La base de données et l&apos;authentification sont fournies par <strong>Supabase</strong> (supabase.com).
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Propriété intellectuelle</h2>
        <p>
          Le contenu éditorial de Belfoot (textes, analyses, mise en page) est protégé et ne peut être reproduit sans
          autorisation. Les données sportives (résultats, classements, effectifs, transferts) proviennent de fournisseurs
          tiers (dont API-Football / API-Sports) et de sources publiques ; elles sont fournies à titre informatif, sans
          garantie d&apos;exactitude. Les noms, logos et marques des clubs et compétitions restent la propriété de leurs
          titulaires respectifs.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Indépendance</h2>
        <p>
          Belfoot est un site indépendant, créé par des passionnés. Il n&apos;est affilié ni à l&apos;Union royale belge des
          sociétés de football-association (URBSFA / RBFA), ni à la Pro League, ni à aucun club ou compétition.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Contact</h2>
        <p>Pour toute question : [À COMPLÉTER : adresse e-mail].</p>
      </section>
    </div>
  );
}
