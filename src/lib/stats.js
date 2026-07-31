// Tipp-statisztika számítás. A profit/hozam "egységben" (unit) értendő:
// alapból 1 egység tét tippenként, vagy a tipp `stake` mezője, ha meg van adva.
// Nyert tipp nyeresége: tét * (odds - 1); vesztes: -tét; érvénytelen/függő: 0.

function tipUnits(tip) {
  return tip.stake && tip.stake > 0 ? tip.stake : 1;
}

// Egy tipp eredménye egységben.
function tipProfit(tip) {
  const u = tipUnits(tip);
  if (tip.result === 'WON') {
    return tip.odds ? { staked: u, profit: u * (tip.odds - 1), settled: true } : { staked: u, profit: 0, settled: true, noOdds: true };
  }
  if (tip.result === 'LOST') {
    return { staked: u, profit: -u, settled: true };
  }
  return { staked: 0, profit: 0, settled: false }; // VOID / PENDING
}

// Összegzés egy tipp-listára.
function summarize(tips) {
  let won = 0, lost = 0, voided = 0, pending = 0;
  let staked = 0, profit = 0, oddsSum = 0, oddsCount = 0;

  for (const t of tips) {
    if (t.result === 'WON') won++;
    else if (t.result === 'LOST') lost++;
    else if (t.result === 'VOID') voided++;
    else pending++;

    const p = tipProfit(t);
    if (p.settled) { staked += p.staked; profit += p.profit; }
    if ((t.result === 'WON' || t.result === 'LOST') && t.odds) { oddsSum += t.odds; oddsCount++; }
  }

  const decided = won + lost;
  return {
    total: tips.length,
    won, lost, voided, pending, decided,
    winRate: decided > 0 ? won / decided : null,
    staked,
    profit,
    yield: staked > 0 ? profit / staked : null,
    avgOdds: oddsCount > 0 ? oddsSum / oddsCount : null,
  };
}

// Csoportosított összegzés. rows: { match, tip } elemek.
// keyFn(row) -> string vagy string[] (csapatnál kettő: hazai és vendég).
function groupSummarize(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    let keys = keyFn(r);
    if (!Array.isArray(keys)) keys = [keys];
    for (const k of keys) {
      if (k === null || k === undefined || k === '') continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r.tip);
    }
  }
  const groups = [];
  for (const [key, tips] of map) {
    groups.push(Object.assign({ key }, summarize(tips)));
  }
  return groups;
}

module.exports = { tipUnits, tipProfit, summarize, groupSummarize };
