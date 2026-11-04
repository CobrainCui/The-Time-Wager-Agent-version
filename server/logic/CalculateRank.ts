export function calculateRanks(sortedInvestors: { invested: number }[]) {
  let lastValue = -1;
  let lastRank = 0;
  let skip = 0;

  return sortedInvestors.map((item, index) => {
    if (item.invested === lastValue) {
      skip++;
      return lastRank;
    } else {
      const rank = index + 1;
      lastValue = item.invested;
      lastRank = rank;
      skip = 0;
      return rank;
    }
  });
}
