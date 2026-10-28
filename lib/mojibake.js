// Réparation des noms « mojibake » : texte UTF-8 relu comme Latin-1 par la
// source (« M. CvetkoviÄ\u0087 » pour « M. Cvetković », « K. WÃ¤tjen » pour
// « K. Wätjen »). Constat du 26/10/2026 : 36 noms de joueurs ainsi reçus
// d'API-Football.
//
// Seules les séquences « octet de tête UTF-8 lu en Latin-1 (Â…Ñ) + octets de
// suite (U+0080–U+00BF) » formant de l'UTF-8 valide sont réparées, une à une :
// un nom correct (« Åberg », « Ñíguez ») ne contient pas de telle séquence, et
// un nom mélangé (« Ãlex Gómez ») n'est réparé que là où il est abîmé.
const SEQUENCE = /[ÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑ][\u0080-¿]+/g;

function asUtf8(sequence) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from([...sequence].map((char) => char.codePointAt(0))));
  } catch {
    return sequence;
  }
}

export function repairMojibake(value) {
  return typeof value === "string" ? value.replace(SEQUENCE, asUtf8) : value;
}

// Entités HTML laissées par la source dans les noms (« D. O&apos;Shea » :
// 28 joueurs et 2 transferts le 28/10/2026).
const ENTITIES = { "&apos;": "'", "&#39;": "'", "&quot;": "\"", "&amp;": "&", "&lt;": "<", "&gt;": ">" };
export function decodeEntities(value) {
  return typeof value === "string" ? value.replace(/&(apos|quot|amp|lt|gt|#39);/g, (entity) => ENTITIES[entity]) : value;
}

// Texte reçu d'une source : entités décodées, puis mojibake réparé.
export function repairText(value) {
  return repairMojibake(decodeEntities(value));
}
