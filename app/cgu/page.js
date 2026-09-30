import { buildMetadata } from "@/lib/seo";

// Base rédigée à faire relire (je ne suis pas juriste). [À COMPLÉTER] = juridiction.
export const metadata = buildMetadata({ title: "Conditions d'utilisation · Belfoot", description: "Conditions générales d'utilisation de Belfoot.", path: "/cgu" });

export default function CguPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4 text-sm leading-6 text-muted">
      <div>
        <h1 className="text-2xl font-black text-content">Conditions générales d&apos;utilisation</h1>
        <p className="mt-1 text-xs">Dernière mise à jour : [À COMPLÉTER]</p>
      </div>

      <section>
        <h2 className="mb-1 font-bold text-content">1. Objet</h2>
        <p>Les présentes conditions régissent l&apos;accès et l&apos;utilisation du site Belfoot. En utilisant le site, vous les acceptez.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">2. Le service</h2>
        <p>Belfoot propose de l&apos;information sur le football belge (résultats, classements, joueurs, mercato…) et un espace communautaire : forum « Le Noyau », votes (11 de la semaine, notes des Diables, Diable du match) et propositions de contenu.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">3. Compte</h2>
        <p>La création d&apos;un compte requiert des informations exactes. Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée depuis votre compte.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">4. Règles de la communauté</h2>
        <p>Le respect d&apos;autrui est la règle. Sont notamment interdits : les contenus illégaux, haineux, diffamatoires, harcelants ou pornographiques, le spam, la publicité non sollicitée et l&apos;usurpation d&apos;identité. Belfoot peut modérer, éditer ou supprimer tout contenu, et suspendre ou bannir tout compte, en cas de manquement.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">5. Contributions et contenus</h2>
        <p>Vous restez titulaire des droits sur ce que vous publiez, mais vous concédez à Belfoot une licence non exclusive et gratuite d&apos;affichage et de diffusion de ce contenu sur le site. Vous êtes seul responsable de ce que vous publiez et garantissez disposer des droits nécessaires.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">6. Données sportives</h2>
        <p>Les données sportives sont fournies par des tiers et des sources publiques, à titre informatif. Belfoot ne garantit ni leur exactitude, ni leur exhaustivité, ni leur disponibilité.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">7. Propriété intellectuelle</h2>
        <p>Le contenu éditorial de Belfoot est protégé. Les marques et logos affichés appartiennent à leurs titulaires respectifs.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">8. Disponibilité et responsabilité</h2>
        <p>Le service est fourni « en l&apos;état », sans garantie de disponibilité continue. Belfoot ne saurait être tenu responsable des interruptions, pertes de données ou dommages indirects liés à l&apos;utilisation du site.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">9. Modification des conditions</h2>
        <p>Belfoot peut modifier les présentes conditions. La version applicable est celle publiée sur cette page.</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">10. Droit applicable</h2>
        <p>Les présentes conditions sont régies par le droit belge. Tout litige relève des tribunaux compétents de [À COMPLÉTER : ressort / ville].</p>
      </section>
    </div>
  );
}
