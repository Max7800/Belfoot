"use client";
import Dashboard from "./Dashboard";
import EntityManager from "./EntityManager";
import CollectionManager from "./CollectionManager";
import CategoriesManager from "./CategoriesManager";
import ContributionsQueue from "./ContributionsQueue";
import SystemStatusPanel from "./SystemStatusPanel";
import VotwSessionsPanel from "./VotwSessionsPanel";
import ForumModerationPanel from "./ForumModerationPanel";
import { ProfilesPanel, ReportsPanel, JobsPanel, SyncHistoryPanel, ProvidersPanel, SettingsInfo, LabelsPanel, TilesPanel, ClubSectionsPanel, HomePanel, BelgiansAbroadPanel, CompetitionHubPanel, NationalTeamsPanel, StatsSectionsPanel, ProposePanel, Placeholder } from "./panels";
import { FOOTBALL_ENTITIES } from "@/config/football-admin";
import { getCollection } from "@/config/collections";

export function panelComponent(key) {
  if (key === "dashboard") return { Comp: Dashboard, props: {} };
  if (getCollection(key)) return { Comp: CollectionManager, props: { collectionKey: key } };
  if (key === "categories") return { Comp: CategoriesManager, props: {} };
  if (key === "contributions") return { Comp: ContributionsQueue, props: {} };
  if (FOOTBALL_ENTITIES[key]) return { Comp: EntityManager, props: { spec: FOOTBALL_ENTITIES[key] } };

  const direct = {
    providers: ProvidersPanel, jobs: JobsPanel, "sync-history": SyncHistoryPanel,
    profiles: ProfilesPanel, reports: ReportsPanel,
  };
  if (direct[key]) return { Comp: direct[key], props: {} };
  if (key === "labels") return { Comp: LabelsPanel, props: {} };
  if (key === "tilesbg") return { Comp: TilesPanel, props: {} };
  if (key === "homepage") return { Comp: HomePanel, props: {} };
  if (key === "belgiansabroad") return { Comp: BelgiansAbroadPanel, props: {} };
  if (key === "competitionhub") return { Comp: CompetitionHubPanel, props: {} };
  if (key === "nationalteams") return { Comp: NationalTeamsPanel, props: {} };
  if (key === "clubpage") return { Comp: ClubSectionsPanel, props: {} };
  if (key === "statspage") return { Comp: StatsSectionsPanel, props: {} };
  if (key === "system-status") return { Comp: SystemStatusPanel, props: {} };
  if (key === "propose") return { Comp: ProposePanel, props: {} };
  if (key === "votw-sessions") return { Comp: VotwSessionsPanel, props: {} };
  if (key === "forum-moderation") return { Comp: ForumModerationPanel, props: {} };
  if (["config", "modules", "flags"].includes(key)) return { Comp: SettingsInfo, props: { which: key === "config" ? "site" : key } };
  return { Comp: Placeholder, props: { title: key } };
}
