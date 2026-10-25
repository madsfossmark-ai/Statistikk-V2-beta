/* Falsk Supabase-klient for live-dashboardet (bare ?demo=1 og tester). Syntetiske data, ingen nett. */
(function (root) {
  'use strict';
  function klient(start) {
    const rader = (start || [{
      match_id: 'demo-1', context_slug: 'beta', home: 'Randaberg', away: 'Testlag', starts_at: '2026-10-26T17:00:00Z', status: 'pågår', version: 1,
      sets: [[25, 20]], current: { set: 2, home: 8, away: 6 }, external: null,
      players: [
        { team: 'Randaberg', jersey: '1', name: 'Beta Spiller 1', cat: 'rec', n: 4, n0: 1, n1: 1, n2: 2, avg: 1.25, comparable: true, low_volume: true, source: 'egen' },
        { team: 'Randaberg', jersey: '2', name: 'Beta Spiller 2', cat: 'att', n: 4, n0: 1, n1: 1, n2: 1, nb: 1, avg: 0.75, comparable: true, low_volume: true, source: 'egen' },
        { team: 'Randaberg', jersey: '3', name: 'Beta Spiller 3', cat: 'srv', n: 3, ne: 1, ni: 1, nf: 1, avg: 1.0, comparable: true, low_volume: false, source: 'egen' },
        { team: 'Testlag', jersey: '7', name: 'Test Sju', cat: 'opp', n: 5, n0: 1, n1: 2, n2: 2, avg: 1.2, comparable: true, low_volume: false, source: 'egen' }],
    }]).map((r) => JSON.parse(JSON.stringify(r)));
    const lyttere = [];
    const api = {
      rader,
      schema() { return { from() { const f = []; const b = { select() { return b; }, eq(k, v) { f.push([k, v]); return b; }, then(ok) { return Promise.resolve({ data: JSON.parse(JSON.stringify(rader.filter((r) => f.every(([k, v]) => r[k] === v)))), error: null }).then(ok); } }; return b; } }; },
      channel() { const k = { on(_t, _f, cb) { k.cb = cb; return k; }, subscribe(s) { k.s = s; lyttere.push(k); setTimeout(() => s('SUBSCRIBED'), 0); return k; } }; return k; },
      removeChannel(k) { const i = lyttere.indexOf(k); if (i >= 0) lyttere.splice(i, 1); },
      // Testhjelpere: endre/slett en rad og send Realtime-hendelse, eller bryt forbindelsen
      oppdater(id, endring) { const r = rader.find((x) => x.match_id === id); Object.assign(r, endring); r.version++; lyttere.forEach((k) => k.cb({ eventType: 'UPDATE', new: JSON.parse(JSON.stringify(r)) })); },
      gammel(id, endring) { const r = JSON.parse(JSON.stringify(rader.find((x) => x.match_id === id))); Object.assign(r, endring); lyttere.forEach((k) => k.cb({ eventType: 'UPDATE', new: r })); },
      avpubliser(id) { const i = rader.findIndex((x) => x.match_id === id); rader.splice(i, 1); lyttere.forEach((k) => k.cb({ eventType: 'DELETE', old: { match_id: id } })); },
      brudd() { lyttere.slice().forEach((k) => k.s('CHANNEL_ERROR')); },
    };
    return api;
  }
  const eksport = { klient };
  if (typeof module !== 'undefined' && module.exports) module.exports = eksport; else root.StatsLiveFake = eksport;
})(typeof window !== 'undefined' ? window : globalThis);
