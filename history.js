function saveSeasonResult(state) {
  const history = loadHistory();

  const winners = state.rounds.flatMap(r =>
    r.groups.flatMap(g =>
      g.matches.filter(m => m.winner).map(m => m.winner)
    )
  );

  history.push({
    season: state.season,
    winners
  });

  saveHistory(history);
}
