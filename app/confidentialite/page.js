import { buildMetadata } from "@/lib/seo";

// Base RGPD à faire relire (je ne suis pas juriste). [À COMPLÉTER] = éditeur, contact, âge minimum.
export const metadata = buildMetadata({ title: "Politique de confidentialité · Belfoot", description: "Comment Belfoot traite vos données personnelles (RGPD).", path: "/confidentialite" });

export default function ConfidentialitePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4 text-sm leading-6 text-muted">
      <div>
        <h1 className="text-2xl font-black text-content">Politique de confidentialité</h1>
        <p className="mt-1 text-xs">Dernière mise à jour : [À COMPLÉTER]</p>
      </div>

      <p>
        Belfoot respecte votre vie privée et traite vos données conformément au Règlement général sur la protection des
        données (RGPD) et à la loi belge. Cette page explique quelles données nous collectons, pourquoi, et quels sont vos droits.
      </p>

      <section>
        <h2 className="mb-1 font-bold text-content">Responsable du traitement</h2>
        <p>[À COMPLÉTER : éditeur du site] — contact : [À COMPLÉTER : adresse e-mail].</p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Données collectées</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>À l&apos;inscription</strong> : adresse e-mail et pseudonyme.</li>
          <li><strong>À l&apos;usage</strong> : vos contributions (propositions, corrections), vos votes (11 de la semaine, notes des Diables, Diable du match), vos sujets et messages sur le forum, vos signalements.</li>
          <li><strong>Techniques</strong> : données de session nécessaires à l&apos;authentification ; votre préférence de thème (clair/sombre), stockée localement dans votre navigateur.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Finalités et bases légales</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Gérer votre compte et vous permettre de participer — <em>exécution du service / consentement</em>.</li>
          <li>Faire vivre la communauté (forum, votes, contributions) — <em>exécution du service</em>.</li>
          <li>Modérer les contenus, assurer la sécurité et prévenir les abus — <em>intérêt légitime</em>.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Destinataires et hébergement</h2>
        <p>
          Vos données sont hébergées par Supabase (base de données, authentification) et Vercel (hébergement du site).
          Elles ne sont ni vendues, ni cédées à des fins publicitaires. Ces prestataires pouvant héberger des données hors de
          l&apos;Union européenne, des garanties appropriées (clauses contractuelles types) encadrent ces transferts.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Durée de conservation</h2>
        <p>
          Les données de votre compte sont conservées tant que celui-ci existe. Les contenus que vous publiez publiquement
          (messages, votes) peuvent être conservés à des fins d&apos;archive et de continuité de la communauté. Vous pouvez
          demander la suppression de votre compte et de vos données à tout moment.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Cookies et stockage local</h2>
        <p>
          Belfoot n&apos;utilise que des cookies/stockage strictement nécessaires au fonctionnement (session
          d&apos;authentification) et conserve votre préférence de thème dans votre navigateur. <strong>Aucun cookie
          publicitaire ni traceur tiers</strong> n&apos;est utilisé.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et
          de portabilité de vos données. Pour les exercer : [À COMPLÉTER : adresse e-mail]. Vous pouvez également introduire une
          réclamation auprès de l&apos;Autorité de protection des données (APD), Rue de la Presse 35, 1000 Bruxelles —
          autoriteprotectiondonnees.be.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold text-content">Mineurs</h2>
        <p>L&apos;inscription et la participation sont réservées aux personnes âgées d&apos;au moins [À COMPLÉTER : 13 ou 16] ans.</p>
      </section>
    </div>
  );
}
