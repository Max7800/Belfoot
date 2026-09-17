// Déclaration des entités football pour l'admin générique (EntityManager).
export const FOOTBALL_ENTITIES = {
  competitions: {
    table: "competitions", title: "Compétitions", singular: "Compétition", orderBy: "position", hasSource: true, slugFrom: "name",
    fields: [
      { key: "name", label: "Nom", type: "text" },
      { key: "position", label: "Ordre (0 = en premier)", type: "number" },
      { key: "slug", label: "Slug (auto si vide)", type: "text" },
      { key: "provider", label: "Provider (ex. thesportsdb)", type: "text" },
      { key: "external_id", label: "ID ligue chez le provider", type: "text" },
      { key: "logo_url", label: "Logo", type: "image" },
      { key: "banner_url", label: "Bannière (décor, sans texte)", type: "image" },
      { key: "header_title", label: "Titre du bandeau (vide = nom)", type: "text" },
      { key: "header_subtitle", label: "Sous-titre du bandeau (vide = pays · saison)", type: "text" },
      { key: "public_visible", label: "Visible dans les pages publiques", type: "bool" },
      { key: "zones", label: "Zones de classement", type: "zones" },
      { key: "rating_min", label: "Note : min. apparitions", type: "number" },
      { key: "competition_type", label: "Type", type: "select", options: ["league", "cup"] },
    ],
  },
  seasons: {
    table: "seasons", title: "Saisons", singular: "Saison", orderBy: "label",
    fields: [
      { key: "competition_id", label: "Compétition", type: "relation", table: "competitions", labelCol: "name" },
      { key: "label", label: "Libellé (ex. 2026-2027)", type: "text" },
      { key: "zones_by_phase", label: "Zones par phase", type: "phaseZones" },
    ],
  },
  clubs: {
    table: "clubs", title: "Clubs", singular: "Club", orderBy: "name", hasSource: true, search: true,
    fields: [
      { key: "name", label: "Nom", type: "text" },
      { key: "short_name", label: "Abréviation", type: "text" },
      { key: "city", label: "Ville", type: "text" },
      { key: "logo_url", label: "Logo", type: "image" },
      { key: "team_type", label: "Type d'équipe", type: "select", options: ["first_team", "reserve", "u23", "women"] },
      { key: "parent_club_id", label: "Club parent (réserve/U23)", type: "relation", table: "clubs", labelCol: "name" },
    ],
  },
  players: {
    table: "players", title: "Joueurs", singular: "Joueur", orderBy: "name", hasSource: true, search: true, groupBy: { field: "club_id", relTable: "clubs", relLabel: "name" },
    fields: [
      { key: "name", label: "Nom", type: "text" },
      { key: "club_id", label: "Club actuel", type: "relation", table: "clubs", labelCol: "name" },
      { key: "position", label: "Poste", type: "select", options: ["GK", "DEF", "MID", "FWD"] },
      { key: "number", label: "N°", type: "number" },
      { key: "age", label: "Âge", type: "number" },
      { key: "nationality", label: "Nationalité", type: "text" },
      { key: "country", label: "Pays du championnat", type: "text" },
      { key: "competition", label: "Championnat", type: "text" },
      { key: "photo_url", label: "Photo", type: "image" },
      { key: "active", label: "Actif", type: "bool" },
      { key: "tracked", label: "Suivi Belfoot", type: "bool" },
    ],
  },
  coaches: {
    table: "coaches", title: "Entraîneurs", singular: "Entraîneur", orderBy: "name",
    fields: [
      { key: "name", label: "Nom", type: "text" },
      { key: "club_id", label: "Club", type: "relation", table: "clubs", labelCol: "name" },
      { key: "photo_url", label: "Photo", type: "image" },
    ],
  },
  matches: {
    table: "matches", title: "Matchs", singular: "Match", orderBy: "kickoff", orderAsc: false, hasSource: true,
    fields: [
      { key: "competition_id", label: "Compétition", type: "relation", table: "competitions", labelCol: "name" },
      { key: "season_id", label: "Saison", type: "relation", table: "seasons", labelCol: "label" },
      { key: "matchday", label: "Journée", type: "number" },
      { key: "home_club_id", label: "Domicile", type: "relation", table: "clubs", labelCol: "name" },
      { key: "away_club_id", label: "Extérieur", type: "relation", table: "clubs", labelCol: "name" },
      { key: "home_score", label: "Score domicile", type: "number" },
      { key: "away_score", label: "Score extérieur", type: "number" },
      { key: "status", label: "Statut", type: "select", options: ["scheduled", "live", "finished", "postponed"] },
      { key: "minute", label: "Minute", type: "number" },
      { key: "kickoff", label: "Coup d'envoi", type: "datetime" },
    ],
  },
  events: {
    table: "match_events", title: "Événements de match", singular: "Événement", orderBy: "minute", orderAsc: true,
    fields: [
      { key: "match_id", label: "Match", type: "relation", table: "matches", labelCol: "id" },
      { key: "minute", label: "Minute", type: "number" },
      { key: "type", label: "Type", type: "select", options: ["goal", "assist", "yellow", "red", "sub"] },
      { key: "player_id", label: "Joueur", type: "relation", table: "players", labelCol: "name" },
      { key: "club_id", label: "Club", type: "relation", table: "clubs", labelCol: "name" },
    ],
  },
};
