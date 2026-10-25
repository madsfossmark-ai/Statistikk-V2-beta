/*
 * Statistikk V2 – live-kilde og visning for offentlig dashboard (spor C, Randaberg-statistikk #1).
 * Leser BARE stats_public.match_live (publiserte aggregater) med publishable/anon-nøkkel. Aldri rå hendelser.
 *
 * LiveKilde: første øyebliksbilde → Realtime (postgres_changes) → versjonskontroll per kamp →
 *            reconnect med backoff → polling-reserve. Gjenbrukbar for U20 (bare annen contextSlug).
 * Visning:   kamp, sett, stilling og spillere med 0–2-snitt først (mottak, angrep, serve, motstanders mottak),
 *            volum, «lavt volum», «serve uten I» og ekstern kilde (NVBF/CEV) som egen, merket statistikk.
 */
(function (root) {
  'use strict';

  function LiveKilde(opts) {
    const sb = opts.client, slug = opts.contextSlug, onData = opts.onData, onStatus = opts.onStatus || (() => {});
    const pollMs = opts.pollMs === undefined ? 15000 : opts.pollMs;
    const kamper = new Map();   // match_id → rad
    let kanal = null, poll = null, forsøk = 0, stoppet = false, gjenTimer = null;
    const tabell = () => sb.schema('stats_public').from('match_live');
    const send = () => onData([...kamper.values()].sort((a, b) => String(a.starts_at || '').localeCompare(String(b.starts_at || ''))));

    // Legg på én rad bare hvis den er nyere enn det vi har (version øker ved hver endring)
    function legg(rad) {
      if (!rad || !rad.match_id || rad.context_slug !== slug) return false;
      const har = kamper.get(rad.match_id);
      if (har && Number(har.version) >= Number(rad.version)) return false;
      kamper.set(rad.match_id, rad); return true;
    }
    async function øyeblikk() {
      const r = await tabell().select('*').eq('context_slug', slug);
      if (r.error) throw r.error;
      const ids = new Set(r.data.map((x) => x.match_id));
      for (const id of [...kamper.keys()]) if (!ids.has(id)) kamper.delete(id);   // avpublisert mens vi var borte
      r.data.forEach((x) => { const h = kamper.get(x.match_id); if (!h || Number(x.version) >= Number(h.version)) kamper.set(x.match_id, x); });
      send();
    }
    function koble() {
      if (stoppet) return;
      if (kanal && sb.removeChannel) sb.removeChannel(kanal);
      kanal = sb.channel('live-' + slug + '-' + Math.random().toString(36).slice(2, 7))
        .on('postgres_changes', { event: '*', schema: 'stats_public', table: 'match_live', filter: 'context_slug=eq.' + slug }, (p) => {
          if (p.eventType === 'DELETE') { const id = p.old && p.old.match_id; if (id && kamper.delete(id)) send(); return; }
          if (legg(p.new)) send();
        })
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') { forsøk = 0; onStatus('live'); øyeblikk().catch(() => onStatus('feil')); }
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
            if (stoppet) return;
            onStatus('kobler til');
            clearTimeout(gjenTimer);
            const vent = Math.min(30000, 1000 * Math.pow(2, forsøk++));
            gjenTimer = setTimeout(koble, vent);
          }
        });
    }
    return {
      async start() {
        await øyeblikk().catch(() => onStatus('feil'));
        if (sb.channel) koble();
        if (pollMs) poll = setInterval(() => { if (!root.document || !root.document.hidden) øyeblikk().catch(() => onStatus('feil')); }, pollMs);
        return this;
      },
      stopp() { stoppet = true; clearInterval(poll); clearTimeout(gjenTimer); if (kanal && sb.removeChannel) sb.removeChannel(kanal); },
      _legg: legg, _kamper: kamper,
    };
  }

  // ---------- Visning ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dec = (x) => (x == null || isNaN(x) ? '–' : Number(x).toFixed(2).replace('.', ','));
  const KAT = [['rec', 'Mottak'], ['att', 'Angrep'], ['srv', 'Serve']];
  const nivå = (v, kat) => { if (v == null) return ''; const [lo, hi] = kat === 'att' ? [1.1, 1.3] : kat === 'srv' ? [0.9, 1.1] : [1.2, 1.5]; return v < lo ? 'lo' : v <= hi ? 'mid' : 'hi'; };
  const STATUS = { 'pågår': 'Live', 'ferdig': 'Ferdig', 'kommende': 'Kommende' };

  function snittCelle(p, kat) {
    if (!p) return '<td class="n">–</td>';
    if (kat === 'srv' && p.comparable === false) return `<td class="n" title="Serve i spill er ikke ført – snittet er ikke sammenlignbart">–<small>${p.n} · uten I</small></td>`;
    return `<td class="n"><span class="snitt ${nivå(p.avg, kat)}">${dec(p.avg)}</span><small>${p.n}${p.low_volume ? ' · lavt volum' : ''}</small></td>`;
  }
  function lagTabell(lag, spillere) {
    const pr = {};
    spillere.filter((p) => p.team === lag && p.cat !== 'opp').forEach((p) => { (pr[p.jersey] || (pr[p.jersey] = { nr: p.jersey, navn: p.name }))[p.cat] = p; });
    const rader = Object.values(pr).sort((a, b) => (+a.nr || 99) - (+b.nr || 99));
    if (!rader.length) return '';
    return `<table><thead><tr><th>Spiller</th>${KAT.map(([, t]) => `<th class="n">${t} 0–2</th>`).join('')}</tr></thead><tbody>`
      + rader.map((r) => `<tr><td>#${esc(r.nr)} ${esc(r.navn || '')}</td>${KAT.map(([k]) => snittCelle(r[k], k)).join('')}</tr>`).join('') + '</tbody></table>';
  }
  function motstanderMottak(spillere) {
    const r = spillere.filter((p) => p.cat === 'opp').sort((a, b) => (+a.jersey || 99) - (+b.jersey || 99));
    if (!r.length) return '';
    return `<h4>${esc(r[0].team)} – mottak på vår serve (0–2)</h4><table><tbody>`
      + r.map((p) => `<tr><td>#${esc(p.jersey)} ${esc(p.name || '')}</td>${snittCelle(p, 'rec')}</tr>`).join('') + '</tbody></table>';
  }
  function kampKort(k) {
    const sett = (k.sets || []).map((s) => `<span>${s[0]}–${s[1]}</span>`).join('');
    const nå = k.current ? `<span class="naa">Sett ${k.current.set}: ${k.current.home}–${k.current.away}</span>` : '';
    const vunnet = (k.sets || []).reduce((a, s) => [a[0] + (s[0] > s[1] ? 1 : 0), a[1] + (s[1] > s[0] ? 1 : 0)], [0, 0]);
    const lag = [...new Set((k.players || []).filter((p) => p.cat !== 'opp').map((p) => p.team))];
    const ekstern = (k.external || []).map((x) => `<div class="ekstern">${esc(x.source)}-statistikk finnes for kampen (${x.final ? 'endelig' : 'foreløpig'}) – vises separat og regnes ikke om til 0–2.</div>`).join('');
    return `<article class="kamp" data-kamp="${esc(k.match_id)}"><header><span class="status s-${esc(k.status)}">${esc(STATUS[k.status] || k.status)}</span>
      <h3>${esc(k.home)} <b>${vunnet[0]}–${vunnet[1]}</b> ${esc(k.away)}</h3><div class="sett">${sett}${nå}</div></header>
      ${lag.map((l) => lagTabell(l, k.players || [])).join('')}${motstanderMottak(k.players || [])}
      ${(k.players || []).length ? '' : '<div class="tom">Ingen registreringer ennå.</div>'}${ekstern}</article>`;
  }

  const eksport = { LiveKilde, kampKort, dec, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = eksport; else root.StatsLive = eksport;
})(typeof window !== 'undefined' ? window : globalThis);
