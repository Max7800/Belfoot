// Une note API égale à zéro correspond à une note indisponible.
export function performanceDisplay(performance = {}) {
  const minutes = performance.minutes == null ? null : Number(performance.minutes);
  const rating = performance.rating == null ? null : Number(performance.rating);
  return {
    minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : null,
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
  };
}
