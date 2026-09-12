import "./globals.css";
import siteConfig from "@/config/site";
import ThemeModeProvider from "@/components/ThemeModeProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

function hexToChannels(hex) {
  const h = (hex || "#1CA3DD").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export const metadata = {
  title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
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
