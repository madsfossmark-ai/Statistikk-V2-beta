// Testside for poengmodus (V3 fase 3). Kjører ALLTID med falsk database i nettleseren:
// ingenting lagres i Supabase, ingen ekte kamper eller spillere. Last siden på nytt for å starte på nytt.
window.V2_CONFIG = { mainSlug: 'main', alltidDemo: true, poengmodus: true, demoData: 'full', analyse: false,
  main: { name: 'Poengtest (demo)', our: 'Randaberg', gender: 'kvinner', teams: ['Motlag'] }, locked: true };
