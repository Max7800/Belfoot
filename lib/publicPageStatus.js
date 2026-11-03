// État de chargement partagé entre calendrier et classement.
export function publicPageStatus({ competitionsLoading, loading, cid, seasonOwner, error, unpublished, competitionCount }) {
  if (competitionsLoading || loading || (cid && seasonOwner !== cid)) return "loading";
  if (error) return "error";
  if (unpublished) return "unpublished";
  if (!competitionCount) return "empty";
  return cid ? "ready" : "loading";
}
