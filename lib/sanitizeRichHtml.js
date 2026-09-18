import "server-only";
import sanitizeHtml from "sanitize-html";

// Allowlist volontairement alignée sur les fonctionnalités de l'éditeur Tiptap.
// Cette fonction reste serveur-only afin qu'un client ne puisse pas contourner
// le contrôle en modifiant le JavaScript dans son navigateur.
export function sanitizeRichHtml(value) {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value, {
    allowedTags: [
      "p", "br", "hr", "h2", "h3", "h4", "strong", "b", "em", "i", "s",
      "ul", "ol", "li", "blockquote", "code", "pre", "a",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}),
        },
      }),
    },
  });
}
