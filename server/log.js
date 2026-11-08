// Online games: when the host came back to a game (page refresh, "Resume"), their browser played the game again from
// the start and, in older versions, uploaded all the log lines again. The log of such a game is the real log, then the
// same lines again from the start (the turn counter goes back to 0), then maybe more. This removes the repeats.
//   rows: the log lines in order, each { turn, text, ... }
// A new run starts where the turn number goes down. Every run is a replay of the game from the start, so a run that is
// longer than the one before it (and starts with the same lines) is the more complete one: the longest consistent run wins.
export function cleanLog(rows) {
	const runs = [];
	let prev = -1;
	for (const r of rows) {
		if (!runs.length || Number(r.turn) < prev) runs.push([]);
		runs[runs.length - 1].push(r);
		prev = Number(r.turn);
	}
	if (runs.length < 2) return rows;
	const same = (a, b) => a.every((r, i) => r.text === b[i].text);
	let best = runs[0];
	for (const run of runs.slice(1)) {
		if (run.length >= best.length && same(best, run)) best = run;       // the replay plus what was played after it
		else if (run.length < best.length && same(run, best)) continue;     // only a part of the replay was uploaded
		else best = run;                                                    // different lines: trust the newest
	}
	return best;
}
