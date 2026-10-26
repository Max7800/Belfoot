import "./globals.css";
import siteConfig from "@/config/site";
import { siteOrigin } from "@/lib/siteUrl";
import ThemeModeProvider from "@/components/ThemeModeProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

function hexToChannels(hex) {
  const h = (hex || "#1CA3DD").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// Métadonnées communes : adresse depuis lib/siteUrl.js, indexation selon
// siteConfig.seo.indexable (fermée tant que le site n'a pas son domaine).
export const metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  openGraph: { siteName: siteConfig.name, locale: "fr_BE", type: "website" },
  twitter: { card: "summary" },
  ...(siteConfig.seo?.indexable ? {} : { robots: { index: false, follow: false } }),
};

export default function RootLayout({ children }) {
  return (
    <html lang={siteConfig.locale} data-theme={siteConfig.theme.defaultMode} style={{ "--accent": hexToChannels(siteConfig.theme.accent) }}>
      <body>
        <ThemeModeProvider>
          <Navbar />
          <main className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-8">{children}</main>
          <Footer />
        </ThemeModeProvider>
      </body>
    </html>
  );
}
