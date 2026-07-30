export function chooseLowEnergyRow(
  rowEnergies,
  {
    minimumRow = 0,
    maximumRow = rowEnergies.length - 1,
    targetRow = maximumRow,
    distanceWeight = 0.18
  } = {}
) {
  if (!rowEnergies.length) return 0;
  const minimum = Math.max(0, Math.min(rowEnergies.length - 1, Math.round(minimumRow)));
  const maximum = Math.max(minimum, Math.min(rowEnergies.length - 1, Math.round(maximumRow)));
  const target = Math.max(minimum, Math.min(maximum, Math.round(targetRow)));
  const candidates = rowEnergies.slice(minimum, maximum + 1).filter(Number.isFinite);
  const sorted = [...candidates].sort((left, right) => left - right);
  const typicalEnergy = sorted.length
    ? sorted[Math.floor(sorted.length / 2)] || 1
    : 1;
  const range = Math.max(1, maximum - minimum);

  let winner = target;
  let winnerScore = Number.POSITIVE_INFINITY;
  for (let row = minimum; row <= maximum; row += 1) {
    const energy = Number.isFinite(rowEnergies[row])
      ? rowEnergies[row]
      : Number.POSITIVE_INFINITY;
    const distancePenalty =
      (Math.abs(target - row) / range) * typicalEnergy * distanceWeight;
    const score = energy + distancePenalty;
    if (score < winnerScore || (score === winnerScore && row > winner)) {
      winner = row;
      winnerScore = score;
    }
  }
  return winner;
}
