// Aquarium : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoDex sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoDex.
// Elle tourne dans le bac à sable de NeoDex, avec ses outils d'interface (ctx.host) et seulement les autorisations de son plugin.json.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Aquarium</span><span class=\"hint\" id=\"aqInfo\"></span><div class=\"agNav\"><select class=\"f gSel\" id=\"aqTank\" title=\"Bassin\"></select><button class=\"btn px\" id=\"aqFeed\">NOURRIR</button><button class=\"btn px\" id=\"aqClean\">NETTOYER</button><button class=\"btn main px\" id=\"aqCash\" title=\"Les pièces des visiteurs vont dans ta bourse de Pêche\">ENCAISSER</button></div></div>\n      <div class=\"gameBox g169\"><canvas id=\"aqCanvas\" width=\"480\" height=\"270\"></canvas></div>\n      <div class=\"aqPanel\" id=\"aqPanel\"></div>\n      <div class=\"hint\">Chaque poisson pêché dans Pêche arrive vivant dans le vivier : mets-le dans un bassin de son eau. Nourris, nettoie et décore : les poissons heureux grandissent, ont des petits et attirent des visiteurs. Clique sur les pourboires tombés par terre, et sur le bocal pour encaisser. Fais glisser les décors sur le sable. Sauvegardé et synchronisé.</div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.gameBox{display:grid;place-items:center;padding:10px;background:#05010b;box-shadow:0 0 0 3px var(--line2)}
.aqPanel{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;align-items:start}
.aqCol{max-height:440px;overflow:auto;gap:6px}
.aqRow{display:flex;align-items:center;gap:8px;padding:4px;cursor:var(--cp,pointer)}
.aqRow.on{background:var(--btnh)}
.aqRow{flex-wrap:wrap}
.aqRow img{width:56px;image-rendering:pixelated}
.aqRow span{flex:1 1 120px;min-width:0}
.aqShop{text-align:left;white-space:normal;height:auto;line-height:1.3;padding:6px 10px}
.gameBox canvas{width:min(100%,1152px);aspect-ratio:384/144;image-rendering:pixelated;cursor:var(--cp,pointer)}
.gameBox.tall canvas{width:auto;height:min(720px,72vh);aspect-ratio:240/320}
.aqGoal{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;padding:4px 0}
.aqBar{grid-column:1;height:6px;background:var(--line2)}
.aqBar i{display:block;height:100%;background:#ffd84a}
.aqGoal .btn{grid-row:1/3;grid-column:2}
.aqDex{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:4px}
.aqDex img{width:100%;image-rendering:pixelated}
.aqWide{grid-column:1/-1;max-height:none}
.aqMuseum{width:100%;image-rendering:pixelated;cursor:var(--cp,pointer)}
.aqTabs,.aqGive{display:flex;flex-wrap:wrap;gap:6px}
.aqTabs .btn,.aqGive .btn{height:32px;font-size:13px;padding:0 8px}
.gSel{width:auto;font-size:14px;padding:6px 10px;margin-right:8px}
.gameBox.g169 canvas{aspect-ratio:480/270;width:min(100%,calc((100vh - 250px) * 1.777))}
`;  // le style de ce plugin (il utilise les variables du thème de NeoDex)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoDex pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "aquaApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await gf.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const gf = { read: n => neo.pluginFolder("neodex.peche", 'read', n), write: (n, d) => neo.pluginFolder("neodex.peche", 'write', n, d) };  // la sauvegarde est dans le dossier de la Pêche
  const LEGACY_GAMES = {"top":["fish","aquarium"],"best":"^$"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await gf.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; gf.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
  // les trophées de NeoDex (3.4.8 et plus) : succès et records déclarés dans plugin.json ; sur un NeoDex plus ancien, rien ne se passe
  const trophy = id => { ctx.games?.unlock(id).catch(() => {}); };
  const trophyRecord = (id, v) => { if (v != null && Number.isFinite(+v)) ctx.games?.record(id, +v).catch(() => {}); };
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* NeoDex games, part 5: Pêche. 7 places, 128 species drawn by code in pixel art, day / night and weather, rods and baits, a collection.
   The whole game (money, gear, places, collection, clock) is saved in games.fish, so it follows you between PCs. */

/* name | places | time (J day, A dawn & dusk, N night, * any) | weather (* any, P rain or storm, S clear, N snow) | rarity 1-5 | size cm | shape | back, belly, fins | pattern | baits it likes */
const FI_DATA = `Gardon|E|*|*|1|12-30|f|8a9,dde,c55|-|pv
Rotengle|E|J|*|1|12-28|f|8a6,eed,e44|-|pv
Ablette|ER|J|*|1|8-18|f|9ab,eef,ccd|h|pa
Perche commune|EL|J|*|2|15-45|f|7a4,ed9,e63|s|vl
Tanche|E|A|*|2|20-60|f|564,9a5,453|-|v
Brème|ER|*|*|2|30-70|h|776,cc9,554|-|pv
Carpe commune|E|*|*|2|35-90|h|875,db8,a64|-|pv
Carpe miroir|E|N|*|3|40-100|h|986,ec9,b75|d|pv
Carpe koï|E|J|S|4|40-90|h|f84,fff,f84|m|p
Carassin doré|E|J|*|2|10-30|h|ea3,fd8,e83|-|p
Poisson-chat|E|N|*|2|20-45|w|443,776,332|-|va
Brochet|ELR|A|*|3|50-120|g|6a5,dd9,797|d|l
Sandre|EL|N|*|3|40-90|g|796,dda,575|b|l
Black-bass|E|J|S|3|25-60|f|5a4,dd9,464|h|l
Silure glane|ER|N|P|4|100-250|w|554,aa9,443|m|vk
Pseudorasbora|E|J|*|1|5-10|f|aa9,eed,887|h|pa
Bouvière|E|J|S|2|5-9|h|9ab,fcd,e6a|-|p
Amour blanc|E|J|S|3|50-120|g|8a8,ddd,797|-|p
Carpe céleste|E|N|S|5|80-130|h|7cf,fff,f6e|n|p
Truite fario|RL|A|*|2|20-60|f|875,ec9,c74|d|va
Truite arc-en-ciel|RL|J|*|2|25-70|f|797,eee,e7a|h|vl
Ombre commun|R|J|*|3|25-50|f|889,ddd,a6c|d|a
Chevesne|R|J|*|1|20-60|f|788,ddd,e85|-|pva
Barbeau|R|*|*|2|25-80|w|974,dc9,b64|-|va
Goujon|R|J|*|1|8-15|f|998,ddd,887|d|va
Vairon|R|J|*|1|5-10|f|675,ec8,e44|-|pa
Hotu|R|J|*|1|25-45|f|889,eee,e66|-|p
Vandoise|R|J|*|1|15-30|f|8ab,eef,ddd|-|pa
Spirlin|R|J|S|2|8-13|f|897,eed,e75|h|a
Loche franche|R|N|*|2|8-12|l|986,dc9,764|d|va
Chabot|R|N|*|2|10-15|w|875,cb9,764|m|v
Anguille|REC|N|P|3|50-120|l|564,cc9,453|-|va
Saumon atlantique|R|A|P|4|60-120|f|79a,eee,9ab|d|lc
Esturgeon|R|N|*|4|100-250|g|776,dcb,665|h|lk
Lamproie|R|N|P|3|40-90|l|776,aa9,665|m|v
Aspe|R|J|*|3|40-80|g|889,eee,c88|-|l
Brochet fantôme|R|N|P|5|120-160|g|cdf,fff,9bf|n|l
Omble chevalier|L|A|*|3|25-60|f|687,f84,f84|d|vl
Corégone|L|J|*|2|30-60|f|99a,eee,aab|-|a
Cristivomer|L|N|*|3|50-100|f|575,ddc,686|d|lk
Ombre arctique|L|J|S|3|30-50|f|778,ddd,b8d|d|a
Lotte de rivière|L|N|*|3|30-70|w|775,cc9,664|m|v
Truite dorée|L|J|S|4|25-50|f|fc4,fe9,f84|h|a
Vendace|L|J|*|1|15-25|f|9ab,eef,bbc|-|a
Épinoche|LE|J|*|1|4-8|f|786,e66,998|s|a
Truite marbrée|L|A|P|4|50-100|f|796,ddc,797|m|l
Perche soleil|LE|J|S|2|10-20|h|5a8,fb4,e83|h|v
Saumon de fontaine|L|A|*|2|20-40|f|575,f95,e63|d|v
Huchon|L|N|N|4|60-120|g|877,edc,b77|d|l
Ide mélanote|L|J|*|2|25-50|f|888,eee,e66|-|pa
Truite fardée|L|J|*|3|30-60|f|887,ecb,e55|d|v
Dragon des cimes|L|A|N|5|90-150|g|8df,fff,fd7|n|lg
Bar|C|A|*|2|30-80|f|9ab,eee,889|-|lc
Dorade royale|C|J|S|2|25-60|h|aab,eee,fc5|-|c
Maquereau|C|J|*|1|20-40|f|486,eee,9ab|s|lc
Sardine|C|J|*|1|12-20|f|68a,eef,9ab|d|c
Anchois|C|J|*|1|8-15|f|79a,eef,aab|h|c
Mulet|C|*|*|1|30-60|f|889,ddd,888|h|p
Lieu jaune|C|A|*|2|40-90|f|775,ddb,fc5|h|l
Cabillaud|C|N|*|3|50-120|f|897,eed,796|d|kv
Merlan|C|J|*|1|25-45|f|998,eee,887|-|c
Sole|C|N|*|2|25-50|p|875,edc,654|d|v
Turbot|C|N|*|3|40-80|p|776,ddc,665|d|k
Plie|C|J|*|2|25-50|p|875,edc,e64|d|v
Raie bouclée|C|N|*|3|50-100|y|987,edc,765|d|k
Rouget-barbet|C|J|*|2|15-30|f|e75,fdc,ea8|-|v
Congre|C|N|P|3|80-200|l|667,bbb,556|-|k
Saint-pierre|C|*|*|3|30-60|h|998,ddc,776|d|c
Grondin perlon|C|J|*|2|25-60|f|e66,fcc,59c|-|c
Vieille|C|J|S|1|25-50|f|8a5,ec8,9b6|d|c
Baudroie|C|N|*|4|50-150|a|875,cb9,654|m|k
Thon rouge|C|J|S|4|100-250|f|335,ccd,eb4|-|lk
Espadon|C|A|*|4|150-300|e|557,ccd,446|-|k
Léviathan d'argent|C|N|P|5|200-400|e|cdf,fff,8bf|n|k
Poisson-clown|T|J|*|2|6-11|f|f72,fff,f72|b|c
Chirurgien bleu|T|J|*|2|15-30|h|35d,36d,fd3|-|c
Poisson-ange royal|T|J|S|3|15-25|h|e93,fd5,47c|s|c
Poisson-papillon|T|J|*|1|10-20|h|fd5,fff,333|s|c
Poisson-perroquet|T|J|*|2|30-70|f|3c9,7ec,f6c|m|c
Baliste picasso|T|J|*|3|15-30|h|ecb,fff,47c|h|c
Mérou géant|T|*|*|4|100-250|f|775,cb9,554|d|k
Barracuda|T|J|*|3|60-150|g|99a,eee,778|s|l
Poisson-lion|T|A|*|3|20-38|h|e75,fdc,e75|s|c
Murène javanaise|T|N|*|3|80-250|l|9a5,cc8,775|d|k
Hippocampe|T|J|S|3|8-20|x|fd5,fe9,eb4|-|c
Raie manta|T|J|S|4|200-500|y|334,eee,223|-|c
Poisson-coffre|T|J|*|2|15-35|r|fe4,ffb,333|d|c
Poisson-globe|T|N|*|2|15-40|r|cb8,fff,987|d|c
Napoléon|T|J|*|4|80-200|h|3a8,8dc,36a|m|k
Idole des Maures|T|J|*|2|15-25|h|fe6,fff,222|b|c
Demoiselle bleue|T|J|*|1|5-10|f|36f,47f,fd4|-|c
Labre nettoyeur|T|J|*|1|8-14|g|ccd,fff,36d|h|c
Requin à pointes noires|T|A|*|4|100-180|s|889,eee,222|-|k
Coryphène|T|J|S|3|60-150|f|5c6,fe5,3a8|d|l
Carangue géante|T|A|*|3|60-170|h|99a,ddd,666|-|l
Dragon de corail|T|N|*|5|30-50|x|f8c,fdf,8fd|n|c
Morue polaire|B|*|*|1|15-35|f|889,ddd,778|-|c
Flétan du Groenland|B|N|*|3|60-120|p|445,ccc,334|-|k
Omble arctique|B|J|*|2|30-70|f|577,f85,f85|d|v
Poisson des glaces|B|N|N|3|25-50|f|cdf,fff,bcd|-|c
Capelan|B|J|*|1|12-20|f|8ab,eef,9ab|-|c
Lompe|B|J|*|2|30-50|r|8a6,dc8,675|d|c
Loup atlantique|B|N|*|3|60-120|l|778,bbb,556|b|k
Requin du Groenland|B|N|N|4|250-500|s|556,aaa,445|-|k
Sébaste|B|A|*|2|25-50|f|e65,fcb,d54|-|c
Hareng|B|J|*|1|20-35|f|79a,eef,9ab|-|c
Églefin|B|J|*|2|30-60|f|889,eee,666|-|c
Chimère arctique|B|N|*|3|40-90|g|bbc,eee,99a|-|k
Grenadier|B|N|*|2|40-80|g|889,bbb,778|-|k
Saumon rouge|B|A|*|3|50-80|f|e44,fbb,575|-|l
Plie arctique|B|J|*|1|20-40|p|887,edd,765|d|v
Léviathan des glaces|B|N|N|5|300-600|s|cef,fff,9cf|n|k
Poisson-lanterne|A|*|*|1|5-15|f|335,446,7ff|n|g
Poisson-hache|A|*|*|2|5-12|h|aab,ccd,7ff|n|g
Grandgousier|A|*|*|3|40-80|l|222,333,f6e|n|g
Baudroie abyssale|A|*|*|3|10-40|a|332,443,7fd|n|g
Dragon noir|A|*|*|3|20-40|l|112,223,f5f|n|g
Poisson-vipère|A|*|*|2|20-35|g|445,556,7df|n|g
Calmar géant|A|N|*|4|300-1200|c|e66,fbb,e66|-|k
Cœlacanthe|A|*|*|4|100-200|f|459,8ab,9cd|d|k
Régalec|A|*|P|4|300-800|l|ccd,eee,f45|-|k
Poisson-ogre|A|*|*|2|10-16|a|432,543,ccc|-|g
Chimère abyssale|A|*|*|2|50-100|g|99a,bbc,778|-|k
Requin-lutin|A|*|*|4|200-400|s|eaa,fcc,c88|-|k
Poisson-tripode|A|*|*|2|20-35|g|776,998,665|-|g
Pieuvre Dumbo|A|*|*|3|10-30|c|f9b,fcd,f9b|-|g
Kraken|A|N|P|5|800-1500|c|a34,e78,f6a|n|k
Poisson-NeoDex|A|N|*|5|50-80|f|e1c,fff,7fe|n|g
Vairon|ER|J|*|1|6-12|f|9a8,dde,c66|-|pa
Goujon|R|J|*|1|8-15|g|987,cca,ba6|-|pa
Épinoche|EL|J|*|1|4-8|f|7a5,cd9,e63|-|pv
Truite arc-en-ciel|RL|J|S|3|25-70|f|8a9,fdd,f5a|-|pa
Omble chevalier|L|A|*|3|25-60|f|576,fb8,f64|-|pa
Silure géant|EL|N|*|4|100-250|l|665,aa8,886|-|k
Esturgeon|RL|*|*|4|100-300|g|678,ccd,99a|d|g
Maquereau|C|J|*|1|20-40|f|58c,cde,9bd|-|pa
Sardine|CT|J|*|1|12-22|f|7ac,eef,bce|-|pa
Bar commun|C|A|*|2|30-90|f|99a,dde,aab|-|pv
Dorade royale|CT|J|*|2|25-60|h|9aa,eed,fc4|-|pv
Rouget barbet|CT|J|*|2|15-35|f|e66,fcb,f87|-|pv
Raie pastenague|C|*|*|3|40-150|r|987,ddb,765|-|g
Poisson-clown|T|J|S|2|6-12|h|f84,fff,fa4|s|pa
Poisson-ange royal|T|J|*|3|15-40|y|48f,fd4,4cf|s|pa
Poisson-perroquet|T|J|*|3|30-80|h|4cb,fa6,6df|-|pv
Raie manta|T|*|*|4|200-500|x|445,eee,667|-|g
Thon rouge|CT|*|*|4|100-250|f|358,cde,a44|-|k
Espadon|CT|A|S|4|150-350|e|568,dde,445|-|k
Phoque-poisson givré|B|*|N|3|40-90|h|9bd,eef,cff|-|g
Morue arctique|B|*|*|2|40-100|g|987,eed,775|-|pv
Lompe des glaces|B|N|*|3|10-30|h|9ac,def,6bd|-|pv
Anguille lanterne|A|N|*|3|40-120|l|235,5f9,4fa|n|k
Baudroie fantôme|A|N|*|4|40-120|c|333,a6c,f9f|n|k
Poisson-hache cristal|A|*|*|3|8-20|y|79c,cff,9ef|n|pv
Vieux brochet|L|A|*|5|150-190|g|575,cc8,797|d|l
Carpe-lune|E|N|*|5|110-150|h|cce,fff,eec|n|p
Roi des glaces|B|N|N|5|400-700|s|9bd,eff,cdf|n|k`;
const FI_SPOTS = {
  E: {name: 'Étang des saules', price: 0, water: ['#3d6e7a', '#244a58', '#102632'], sky: 1, shore: 'wood', decor: 'saules', weather: {clair: 4, nuageux: 3, pluie: 2, orage: .5, brouillard: 1}},
  R: {name: 'Rivière claire', price: 600, water: ['#4a8a96', '#2b6070', '#14343f'], shore: 'wood', decor: 'collines', flow: true, weather: {clair: 4, nuageux: 3, pluie: 2.5, orage: .6, brouillard: 1}},
  L: {name: 'Lac de montagne', price: 1800, water: ['#4a7aa8', '#2b5080', '#142a4a'], shore: 'wood', decor: 'montagnes', weather: {clair: 4, nuageux: 3, pluie: 1.5, neige: 1.5, brouillard: 1}},
  C: {name: 'Côte rocheuse', price: 3500, water: ['#3a7f9c', '#215672', '#0e2c40'], shore: 'rock', decor: 'falaises', weather: {clair: 3, nuageux: 3, pluie: 2.5, orage: 1.2, brouillard: 1}},
  T: {name: 'Lagon tropical', price: 8000, water: ['#4fd8cc', '#24a0ae', '#0e5c72'], shore: 'wood', decor: 'palmiers', weather: {clair: 6, nuageux: 2, pluie: 1.5, orage: .6}},
  B: {name: 'Banquise', price: 14000, water: ['#6a9cbc', '#3d6c92', '#1c3856'], shore: 'ice', decor: 'icebergs', weather: {clair: 3, nuageux: 2, neige: 4, brouillard: 1.5}},
  A: {name: 'Abysses', price: 30000, water: ['#16205a', '#0b1236', '#04061a'], shore: 'boat', decor: 'large', dark: true, weather: {clair: 4, nuageux: 2, pluie: 2, orage: 1.2}},
};
const FI_RODS = [
  {name: 'Canne en bambou', price: 0, str: 1, reel: 1, luck: 0},
  {name: 'Canne en fibre', price: 400, str: 1.3, reel: 1.15, luck: .06},
  {name: 'Canne en carbone', price: 1800, str: 1.7, reel: 1.3, luck: .12},
  {name: 'Canne de compétition', price: 6000, str: 2.2, reel: 1.5, luck: .2},
  {name: 'Canne stellaire', price: 18000, str: 3, reel: 1.8, luck: .32},
];
const FI_BAITS = {  // pack = how many casts you get for the price; bread is free
  p: {name: 'Pain', price: 0, pack: 0, wait: 1},
  v: {name: 'Vers de terre', price: 30, pack: 20, wait: .8},
  a: {name: 'Asticots', price: 40, pack: 20, wait: .75},
  c: {name: 'Crevettes', price: 80, pack: 15, wait: .8},
  l: {name: 'Leurre', price: 150, pack: 25, wait: .9},
  k: {name: 'Calamar', price: 250, pack: 10, wait: .85},
  g: {name: 'Appât lumineux', price: 600, pack: 10, wait: .7},
};
const FI_RARITY = [null, ['Commun', '#c9bdf0', 100, 12], ['Peu commun', '#8ee8a0', 45, 35], ['Rare', '#7fe0ee', 15, 100], ['Épique', '#ff5ad9', 4.5, 380], ['Légendaire', '#ffd07a', 1.2, 1800]];  // label, colour, weight, base price
const FI_TIMES = {J: 'le jour', A: 'à l\'aube et au crépuscule', N: 'la nuit', '*': 'à toute heure'};
const FI_WEATHER = {'*': '', P: 'sous la pluie', S: 'par beau temps', N: 'quand il neige'};
const hex3 = h => '#' + [...h].map(c => c + c).join('');
const FISH = FI_DATA.trim().split('\n').map((line, id) => {
  const [name, spots, time, weather, rar, size, shape, cols, pattern, likes] = line.split('|'), [min, max] = size.split('-').map(Number), [back, belly, fin] = cols.split(',').map(hex3);
  return {id, name, spots, time, weather, rarity: +rar, min, max, shape, back, belly, fin, pattern, likes};
});
console.assert(FISH.length >= 100 && FISH.every(f => f.spots && f.max >= f.min && FI_RARITY[f.rarity]), 'FISH: 100+ well-formed species');
console.assert(Object.keys(FI_SPOTS).every(s => [...'JAN'].every(t => FISH.some(f => f.spots.includes(s) && f.rarity < 5 && f.weather === '*' && (f.time === '*' || f.time.includes(t))))), 'FISH: every place has something to catch at every hour');

/* ---------- species drawn by code: a body outline per shape, fins, shading, pattern and eye; cached as small canvases ---------- */
const mixc = (a, b, k) => { const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const FI_SEAHORSE = ['....bbb.....', '...bbebb....', '..bbbbbbbb..', '...bbbb.....', '....bbbf....', '....bbbff...', '...bbbbff...', '...bbbbbf...', '...bbbbbf...', '....bbbbf...', '....bbbb....', '.....bbb....', '.....bbb....', '......bb....', '......bbb...', '.......bb...', '.....b.bb...', '.....bbb....', '......b.....', '............', '............', '............'];
const fiArtCache = new Map();
function fiArt(f, silhouette) {
  const k = f.id + (silhouette ? 's' : ''); if (fiArtCache.has(k)) return fiArtCache.get(k);
  const D = {f: [26, 11], g: [32, 8], h: [22, 17], l: [36, 7], p: [24, 15], y: [30, 22], r: [18, 15], s: [38, 13], e: [40, 13], a: [24, 15], w: [32, 9], x: [12, 22], c: [30, 15]}[f.shape];
  const [W, H] = D, m = Array.from({length: H}, () => Array(W).fill(''));  // '' empty, b body, f fin, e eye, w white, k dark, g glow
  const rnd = seeded(f.id * 977 + 13), cy = (H - 1) / 2, set = (x, y, v, over) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && (over || !m[y][x])) m[y][x] = v; };
  const side = 'fghseawr'.includes(f.shape);
  if (side) {
    const P = {f: [.55, .3, .2], g: [.5, .32, .2], h: [.48, .22, .22], s: [.42, .2, .18], e: [.45, .25, .22], a: [.78, .28, .2], w: [.62, .32, .18], r: [.5, .45, .12]}[f.shape];
    const [c, ped, tailK] = P, bill = f.shape === 'e' ? 9 : 0, x0 = Math.round(W * tailK), x1 = W - 1 - bill, hb = (H - 3) / 2;
    const hh = t => hb * Math.max(ped * (1 - t), Math.sqrt(Math.max(0, 1 - ((t - c) / (t < c ? c : 1 - c)) ** 2)));
    for (let x = x0; x <= x1; x++) { const t = (x - x0) / (x1 - x0), h = hh(t), top = f.shape === 'w' && t > .6 ? cy - h * .7 : cy - h; for (let y = Math.ceil(top - .3); y <= cy + h + .3; y++) set(x, y, 'b'); }
    for (let x = 0; x < x0; x++) {  // tail fin
      const u = (x0 - x) / x0, reach = hb * ped + u * hb * (f.shape === 'r' ? .6 : .95);
      for (let y = 0; y < H; y++) {
        const dy = y - cy, ad = Math.abs(dy);
        if (ad > reach) continue;
        if ('fgse'.includes(f.shape) && u > .45 && ad < (u - .45) * hb * 1.8) continue;  // forked
        if (f.shape === 's' && dy > 0 && u > .55) continue;  // shark: longer upper lobe
        set(x, y, 'f');
      }
    }
    const dorsal = f.shape === 'e' ? [.25, .7, hb * 1.1] : f.shape === 's' ? [.42, .58, hb * .9] : f.shape === 'h' ? [.2, .7, hb * .35] : [.35, .6, hb * .55];
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0); if (t < dorsal[0] || t > dorsal[1]) continue;
      const k = (t - dorsal[0]) / (dorsal[1] - dorsal[0]), hgt = dorsal[2] * (f.shape === 's' || f.shape === 'e' ? (1 - k) : Math.sin(k * Math.PI)), top = Math.ceil(cy - hh(t));
      for (let y = 1; y <= hgt; y++) set(x, top - y, 'f');
      if (t > .3 && t < .45) for (let y = 1; y <= hgt * .5 + 1; y++) set(x, Math.floor(cy + hh(t)) + y, 'f');  // anal fin
    }
    const px0 = x0 + (x1 - x0) * .68;
    for (let i = 0; i < 3; i++) set(px0 - i, cy + 1 + i * .6, 'f', true);  // pectoral fin
    const ex = x0 + (x1 - x0) * (f.shape === 'a' ? .9 : .86), ey = cy - hh(.86) * .35;
    if (f.shape === 'a') { for (let i = 0; i < 6; i++) set(ex - i * .6, ey - 3 - i * .4 - (i > 3 ? (i - 3) : 0), 'k', true); set(ex - 3, ey - 6, 'g', true); set(x1, cy + 1, 'w', true); set(x1 - 2, cy + 1, 'w', true); }
    if (f.shape === 'w') for (let i = 1; i < 5; i++) { set(x1 + 1 - i * .2, cy + i * .5, 'k', true); set(x1 - i, cy + 1 + i * .4, 'k', true); }
    if (bill) for (let x = x1 + 1; x < W; x++) set(x, cy - .5, 'k');
    if (H >= 10) for (let y = cy - hh(.75) * .6; y <= cy + hh(.75) * .6; y++) set(x0 + (x1 - x0) * .75, y, 'k', true);  // gill
    set(ex, ey, 'e', true); if (H >= 13) { set(ex + 1, ey, 'e', true); set(ex, ey + 1, 'e', true); set(ex + 1, ey + 1, 'e', true); }
    set(x1, cy + (f.shape === 'w' ? 0 : .5), 'k', true);
  } else if (f.shape === 'l') {  // eel: a thick wavy line
    for (let x = 0; x < W; x++) { const t = x / (W - 1), yc = cy + Math.sin(t * Math.PI * 2) * 1.2, th = 2.2 * Math.min(1, t * 4, (1 - t) * 6 + .3); for (let y = Math.ceil(yc - th); y <= yc + th; y++) set(x, y, 'b'); if (t < .6) { set(x, yc - th - 1, 'f'); set(x, yc + th + 1, 'f'); } }
    set(W - 4, cy - 1 + Math.sin(Math.PI * 2 * (W - 4) / (W - 1)) * 1.2, 'e', true); set(W - 1, cy, 'k', true);
  } else if (f.shape === 'p') {  // flatfish, seen from above
    for (let y = 0; y < H; y++) for (let x = 4; x < W; x++) { const v = ((x - 14) / 10) ** 2 + ((y - cy) / (H / 2)) ** 2; if (v <= .7) set(x, y, 'b'); else if (v <= 1) set(x, y, 'f'); }
    for (let x = 0; x < 5; x++) for (let y = cy - (5 - x) * .6 - 1; y <= cy + (5 - x) * .6 + 1; y++) set(x, y, 'f');
    set(20, cy - 2, 'e', true); set(21, cy, 'e', true);
  } else if (f.shape === 'y') {  // ray: a diamond and a long tail
    for (let y = 0; y < H; y++) for (let x = 8; x < W; x++) { const v = Math.abs(x - 19) / 11 + Math.abs(y - cy) / (H / 2); if (v <= 1 && !(x > 26 && Math.abs(y - cy) > 4)) set(x, y, 'b'); }
    for (let x = 0; x < 9; x++) set(x, cy, 'f');
    set(25, cy - 2, 'e', true); set(25, cy + 2, 'e', true);
  } else if (f.shape === 'x') {
    FI_SEAHORSE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') set(x, y, ch === 'e' ? 'e' : ch); }));
  } else if (f.shape === 'c') {  // squid / octopus: mantle on the left, tentacles to the right
    for (let x = 0; x < 16; x++) { const h = 1 + x * .32; for (let y = Math.ceil(cy - h); y <= cy + h; y++) set(x + 1, y, 'b'); }
    for (let y = cy - 4; y <= cy + 4; y++) set(0, y, 'f'); for (let y = cy - 3; y <= cy + 3; y++) set(1, y, 'f');
    for (let x = 16; x < 20; x++) for (let y = cy - 4; y <= cy + 4; y++) set(x, y, 'b');
    for (let i = 0; i < 6; i++) { const y0 = cy - 3.5 + i * 1.4, len = 8 + (i * 7) % 5; for (let x = 0; x < len; x++) set(20 + x, y0 + Math.sin(x / 2 + i) * 1.2 + (i - 2.5) * x * .08, 'b'); }
    set(17, cy - 2, 'e', true);
  }
  // colours: back / belly with dithering, highlight on top, pattern, then a dark outline around everything
  const out = document.createElement('canvas'); out.width = W + 2; out.height = H + 2;
  const g = out.getContext('2d'), line = mixc(f.back, '#05010b', .72), dark = mixc(f.back, '#05010b', .35), light = mixc(f.back, '#ffffff', .35);
  const dots = new Set(); for (let i = 0; i < W * H / 14; i++) dots.add(Math.floor(rnd() * W) + ',' + Math.floor(rnd() * H));
  for (let x = 0; x < W; x++) {
    let top = -1, bot = -1; for (let y = 0; y < H; y++) if (m[y][x] === 'b') { if (top < 0) top = y; bot = y; }
    for (let y = 0; y < H; y++) {
      const v = m[y][x]; if (!v) continue;
      let c = f.fin;
      if (v === 'b') {
        const k = bot > top ? (y - top) / (bot - top) : 0;
        c = k < .45 ? f.back : k > .65 ? f.belly : (x + y) % 2 ? f.back : f.belly;
        if (y === top) c = light;
        const p = f.pattern;
        if (p === 's' && x % 5 < 2 && k < .8) c = dark;
        if (p === 'b' && x % 7 < 2) c = f.belly;
        if (p === 'h' && Math.abs(y - (top + bot) / 2) < .8) c = f.fin;
        if ((p === 'd' || p === 'n') && dots.has(x + ',' + y) && k > .1) c = p === 'n' ? f.fin : dark;
        if (p === 'm' && (Math.sin(x * .9 + f.id) + Math.cos(y * 1.3 + f.id * 2)) > 1.1) c = f.fin;
        if (p === 'n' && Math.abs(y - (top + bot) / 2) < .6) c = f.fin;
      }
      if (v === 'e') c = '#0b031c'; if (v === 'w') c = '#ffffff'; if (v === 'k') c = line; if (v === 'g') c = '#ffffaa';
      g.fillStyle = silhouette ? '#1c1238' : c; g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  if (!silhouette) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y][x] === 'e' && (x === 0 || m[y][x - 1] !== 'e') && (y === 0 || m[y - 1][x] !== 'e') && H >= 13) { g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, 1, 1); }
  const img = g.getImageData(0, 0, W + 2, H + 2), d = img.data, filled = i => d[i * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < H + 2; y++) for (let x = 0; x < W + 2; x++) { const i = y * (W + 2) + x; if (filled(i)) continue; if ((x > 0 && filled(i - 1)) || (x < W + 1 && filled(i + 1)) || (y > 0 && filled(i - W - 2)) || (y < H + 1 && filled(i + W + 2))) edge.push([x, y]); }
  g.fillStyle = silhouette ? '#0b031c' : line; for (const [x, y] of edge) g.fillRect(x, y, 1, 1);
  fiArtCache.set(k, out); return out;
}
const fiUrlCache = new Map();
const fiArtUrl = (f, s, scale = 3) => { const key = f.id + ',' + !!s + ',' + scale; if (fiUrlCache.has(key)) return fiUrlCache.get(key); const a = fiArt(f, s), c = document.createElement('canvas'); c.width = a.width * scale; c.height = a.height * scale; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(a, 0, 0, c.width, c.height); fiUrlCache.set(key, c.toDataURL()); return fiUrlCache.get(key); };

/* ---------- the save ---------- */
let fi = null;
const fiSave = () => gstore('fish', {money: 0, rod: 0, baits: {}, bait: 'p', spots: ['E'], spot: 'E', dex: {}, clock: 8 * 60, weather: 'clair', wUntil: 11 * 60, total: 0, earned: 0, best: null, xp: 0, streak: 0, perfect: 0, chests: 0, quests: null});
const fiHour = () => (fiSave().clock / 60) % 24;
const fiPhase = h => h >= 5 && h < 8 ? 'A' : h >= 8 && h < 18 ? 'J' : h >= 18 && h < 21 ? 'A' : 'N';
const fiPhaseName = h => h >= 5 && h < 8 ? 'Aube' : h >= 8 && h < 18 ? 'Jour' : h >= 18 && h < 21 ? 'Crépuscule' : 'Nuit';
const FI_WNAMES = {clair: 'Ciel clair', nuageux: 'Nuageux', pluie: 'Pluie', orage: 'Orage', brouillard: 'Brouillard', neige: 'Neige'};
function fiNewWeather() {
  const s = fiSave(), opts = Object.entries(FI_SPOTS[s.spot].weather); let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
  s.weather = opts.find(o => (r -= o[1]) < 0)[0]; s.wUntil = s.clock + 120 + Math.floor(Math.random() * 240);
}
const fiWeatherOk = (f, w) => f.weather === '*' || (f.weather === 'P' && (w === 'pluie' || w === 'orage')) || (f.weather === 'S' && w === 'clair') || (f.weather === 'N' && w === 'neige');
const fiTimeOk = (f, h) => f.time === '*' || f.time.includes(fiPhase(h));
function fiPick(power) {  // which fish bites: place, hour, weather, bait, rod and how far you cast
  const s = fiSave(), h = fiHour(), rod = FI_RODS[s.rod];
  const pool = FISH.filter(f => f.spots.includes(s.spot) && fiTimeOk(f, h) && fiWeatherOk(f, s.weather) && (f.rarity < 5 || s.rod >= 3));
  const ws = pool.map(f => FI_RARITY[f.rarity][2] * (f.likes.includes(s.bait) ? 2.6 : 1) * (f.rarity >= 3 ? (1 + (rod.luck + fiLevel().luck) * f.rarity) * (.6 + power * .8) : 1));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  return pool[ws.findIndex(w => (r -= w) < 0)] || pool[0];
}
// angler level from the experience: each level reels a little faster and brings a little more luck with the rare fish
const fiLevel = (xp = fiSave().xp || 0) => { const lv = Math.floor(Math.sqrt(xp / 60)) + 1, cur = 60 * (lv - 1) ** 2, next = 60 * lv ** 2; return {lv, k: (xp - cur) / (next - cur), reel: Math.min(.4, (lv - 1) * .02), luck: Math.min(.3, (lv - 1) * .015)}; };
// three challenges a day (the same all day), rewarded in coins and experience
const FI_QUESTS = [
  ['catch', n => 'Pêcher ' + n + ' poissons', [5, 8, 12]], ['rare', n => 'Pêcher ' + n + ' poisson' + (n > 1 ? 's' : '') + ' rare' + (n > 1 ? 's' : '') + ' ou mieux', [1, 2]],
  ['perfect', n => 'Réussir ' + n + ' ferrages parfaits', [3, 5]], ['big', n => 'Pêcher ' + n + ' poisson' + (n > 1 ? 's' : '') + ' presque à la taille maximale de son espèce', [1, 2]],
  ['new', n => 'Découvrir ' + n + ' nouvelle' + (n > 1 ? 's' : '') + ' espèce' + (n > 1 ? 's' : ''), [1, 2]], ['streak', n => 'Faire une série de ' + n + ' prises sans en rater', [4, 6]],
  ['night', n => 'Pêcher ' + n + ' poissons la nuit', [3, 5]], ['chest', () => 'Remonter un coffre au trésor', [1]],
];
function fiQuests() {
  const s = fiSave(), d = new Date(), day = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  if (s.quests?.day !== day) {
    const r = seeded(day.split('-').reduce((a, x) => a * 41 + +x, 7)), kinds = [...FI_QUESTS].sort(() => r() - .5).slice(0, 3);
    s.quests = {day, list: kinds.map(([kind, , ns]) => { const n = ns[Math.floor(r() * ns.length)]; return {kind, n, got: 0, done: false, coins: Math.round((60 + n * 35) * (1 + 'ERLCTBA'.indexOf(s.spots.at(-1)) * .4) / 10) * 10, xp: 40 + n * 15}; })};
  }
  return s.quests;
}
const fiQuestText = q => FI_QUESTS.find(x => x[0] === q.kind)[1](q.n);
function fiQuestEvent(kind, amount = 1, value) {  // something happened: the matching challenges advance
  const s = fiSave();
  for (const q of fiQuests().list) {
    if (q.done || q.kind !== kind) continue;
    q.got = kind === 'streak' ? Math.max(q.got, value) : q.got + amount;
    if (q.got >= q.n) { q.done = true; s.money += q.coins; s.xp = (s.xp || 0) + q.xp; fi.questMsg = {text: 'DÉFI RÉUSSI : ' + fiQuestText(q) + ' · +' + q.coins + ' pièces', t: 240}; sfx('launch'); }
  }
}
const fiValue = (f, cm) => Math.max(1, Math.round(FI_RARITY[f.rarity][3] * (.6 + .8 * (cm - f.min) / Math.max(1, f.max - f.min)) * (1 + 'ERLCTBA'.indexOf(f.spots[0]) * .25)));


const fmtAway = s => s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.floor(s / 3600) + ' h ' + String(Math.round(s % 3600 / 60)).padStart(2, '0') : Math.floor(s / 86400) + ' j ' + Math.floor(s % 86400 / 3600) + ' h';

/* ---------- jeu "Aquarium": keep alive the fish caught in Pêche. Every catch also goes, alive, to the holding pool (the first visit brings one
   of each species already in the collection). Tanks of 5 waters (fresh, sea, tropical, polar, abyss) hold the fish of their places; they get
   hungry and the water gets dirty, also while NeoDex is closed. Fed fish grow, pairs of adults in a happy tank have young (sometimes of a rare colour).
   Visitors walk past the glass, stop in front of the finest fish and leave tips; the ticket money goes to the Pêche purse, which also pays for
   the tanks, filters, feeders and decorations (dragged anywhere on the sand). A species log per water and challenges give rewards; each tank
   earns up to 3 stars. Saved in games.aquarium (synced). ---------- */
const AQA = {W: 480, H: 270, TOP: 18, GL: 8, GR: 472, SAND: 204, GB: 236,
  waters: {douce: ['Eau douce', 'ERL', 'E'], mer: ['Mer', 'C', 'C'], tropical: ['Tropical', 'T', 'T'], polaire: ['Polaire', 'B', 'B'], abysses: ['Abysses', 'A', 'A']},  // name, places, colours of
  sizes: [['Petit', 6, 0], ['Moyen', 10, 900], ['Grand', 16, 3500]],  // name, places, price to get to it
  decor: {plante: ['Plante', 120], rocher: ['Rocher', 150], corail: ['Corail', 250], amphore: ['Amphore', 300], chateau: ['Château', 400], arche: ['Arche de pierre', 450], coffre: ['Coffre', 500], bulleur: ['Bulleur', 650], epave: ['Épave', 900],
    souche: ['Vieille souche', 0, 'douce'], phare: ['Petit phare', 0, 'mer'], tiki: ['Statue tiki', 0, 'tropical'], igloo: ['Igloo', 0, 'polaire'], cheminee: ['Cheminée des abysses', 0, 'abysses']},  // the last ones: won with the log (half of a water)
  mult: {douce: 1, mer: 2, tropical: 3, polaire: 4, abysses: 6},
  sandCol: {douce: '#8c7a52', mer: '#d6c48c', tropical: '#efe0b4', polaire: '#a8b8c8', abysses: '#2c2840'},
  maxDecor: 6,
  tankPrice: n => [0, 600, 2500, 7000, 16000, 35000][n] ?? 35000 * 2 ** (n - 5),
};
const aqNewTank = water => ({water, size: 0, filter: false, feeder: false, decor: [], food: 100, dirt: 0, fish: [], shape: 'rect', plants: []});
const aqSave = () => gstore('aquarium', {tanks: [aqNewTank('douce')], pool: [], cash: 0, last: Date.now(), gift: false, earned: 0, visitors: 0, seq: 1});
function aqFix(s) {  // older saves (and the one Pêche creates): decorations get a place on the sand, the new counters appear
  for (const t of s.tanks) t.decor = t.decor.map((d, i) => typeof d === 'string' ? {k: d, x: AQA.GL + 14 + i * 74} : d).filter(d => AQ_DECOR[d.k]);
  for (const t of s.tanks) { t.shape ??= 'rect'; t.plants ??= []; }
  s.museum ??= {}; s.likes ??= {}; s.wall ??= null;
  s.dex ??= {}; s.dexT ??= {}; s.goals ??= {}; s.unlock ??= {}; s.news ??= []; s.births ??= 0; s.tips ??= 0;
}
const aqFish = f => FISH[f.id];
const aqFits = (fish, tank) => [...aqFish(fish).spots].some(p => AQA.waters[tank.water][1].includes(p));
const aqNeedSize = fish => fish.cm > 120 ? 2 : fish.cm > 60 ? 1 : 0;  // a big fish needs a big tank
const aqVal = f => fiValue(aqFish(f), f.cm) * (f.v ? 3 : 1);  // a rare colour is worth three times more
const aqAdult = f => { const sp = aqFish(f); return f.cm >= sp.min + (sp.max - sp.min) * .4; };
const aqWaterFish = w => FISH.filter(f => [...f.spots].some(p => AQA.waters[w][1].includes(p)));
const aqDexOf = (s, w) => aqWaterFish(w).filter(f => s.dex[f.id]).length;
// how happy a fish is, 0-100: fed, clean water, decorations, not crowded
function aqHappy(t) {
  const crowd = t.fish.length > AQA.sizes[t.size][1] * .8 ? -10 : 0;
  return Math.max(0, Math.min(100, 50 + (t.food > 30 ? 20 : t.food > 0 ? 0 : -35) + (t.dirt < 40 ? 15 : t.dirt < 75 ? 0 : -25) + Math.min(4, t.decor.length + (t.plants || []).filter(p => p.g >= .5).length) * 5 + aqShape(t)[4].joy + crowd));
}
// stars of a tank: happy, well filled, varied, decorated
function aqStars(t) {
  const n = t.fish.length, cap = AQA.sizes[t.size][1], joy = aqHappy(t), kinds = new Set(t.fish.map(f => f.id)).size, rare = t.fish.some(f => aqFish(f).rarity >= 3);
  return joy >= 90 && n >= cap * .75 && kinds >= 4 && rare && t.decor.length + (t.plants || []).length >= 3 ? 3 : joy >= 75 && n >= cap * .5 && kinds >= 2 && t.decor.length + (t.plants || []).length >= 2 ? 2 : joy >= 55 && n >= 3 ? 1 : 0;
}
// ticket money an hour: what the fish are worth (rarity, size, place, colour), times how happy they are, +15 % a star
const aqIncome = t => t.fish.reduce((a, f) => a + aqVal(f) * .08, 0) * aqHappy(t) / 100 * (1 + .15 * aqStars(t)) * (.8 + .4 * aqAppeal(t));
// a species seen in a tank for the first time goes in the log: coins, and at a quarter, half and all of a water, a reward
function aqDexAdd(s, f) {
  if (s.dex[f.id]) return 0;
  const sp = aqFish(f); s.dex[f.id] = 1; let coins = FI_RARITY[sp.rarity][3]; s.news.push('Nouvelle espèce au carnet : ' + sp.name + ' · +' + coins + ' pièces');
  for (const w of Object.keys(AQA.waters)) {
    const all = aqWaterFish(w); if (!all.includes(sp)) continue;
    const k = aqDexOf(s, w) / all.length, tier = k >= 1 ? 3 : k >= .5 ? 2 : k >= .25 ? 1 : 0;
    while ((s.dexT[w] || 0) < tier) {
      const n = s.dexT[w] = (s.dexT[w] || 0) + 1, name = AQA.waters[w][0];
      if (n === 2) { const d = Object.keys(AQA.decor).find(d => AQA.decor[d][2] === w); s.unlock[d] = 1; s.news.push('Carnet ' + name + ' à moitié : décor « ' + AQA.decor[d][0] + ' » gagné !'); }
      else { const c = (n === 1 ? 300 : 3000) * AQA.mult[w]; coins += c; s.news.push('Carnet ' + name + (n === 1 ? ' au quart' : ' complet') + ' : +' + c + ' pièces'); }
    }
  }
  return coins;
}
// time passes: hunger, dirt, growth, young and visitors, hour by hour (also for the time spent away); returns the coins won by the log
function aqStep(s, hours, r = Math.random) {
  let h = Math.max(0, hours), coins = 0;
  while (h > 0) {
    const d = Math.min(1, h); h -= d;
    for (const t of s.tanks) {
      const joy = aqHappy(t), fed = t.food > 30;
      s.cash += aqIncome(t) * d; s.visitors += t.fish.length * d * joy / 25 * aqShape(t)[4].vis;
      if (t.feeder) t.food = Math.max(t.food, 60); else t.food = Math.max(0, t.food - 8 * d);
      t.dirt = Math.min(100, t.dirt + (t.filter ? 1.5 : 5) * d * (.4 + t.fish.length / AQA.sizes[t.size][1]) * aqCleanK(t));
      if (fed) for (const f of t.fish) { const sp = aqFish(f), lim = Math.min(sp.max, [60, 120, 1e9][t.size]); if (f.cm < lim) f.cm = Math.min(lim, f.cm + (sp.max - sp.min) / 480 * d); }  // 20 days from smallest to biggest
      t.plants ??= []; const herbs = t.fish.filter(f => aqDiet(aqFish(f)) === 'herb').length;
      for (const p of t.plants) p.g = Math.max(.15, Math.min(1, p.g + d * (.025 * (1 - t.dirt / 120) - .006 * herbs)));  // two days to grow, less with plant eaters
      for (const f of t.fish.filter(f => aqDiet(aqFish(f)) === 'pred' && aqAdult(f))) {  // a hunter eats a fish three times smaller, much more often when hungry
        const prey = aqPrey(t, f); if (!prey.length || !t.fish.includes(f) || r() >= (t.food > 30 ? .01 : .06) * d) continue;
        const p = prey[Math.floor(r() * prey.length)]; t.fish.splice(t.fish.indexOf(p), 1); f.cm = Math.min(aqFish(f).max, f.cm * 1.02); s.eaten = (s.eaten || 0) + 1;
        s.news?.push('Dans le bassin ' + AQA.waters[t.water][0].toLowerCase() + ', ' + aqFish(f).name + ' a mangé ' + aqFish(p).name + ' : sépare-les ou nourris-le');
      }
      if (joy >= 70 && t.fish.length < AQA.sizes[t.size][1]) {
        const n = {}; for (const f of t.fish) if (aqAdult(f)) n[f.id] = (n[f.id] || 0) + 1;
        const pairs = Object.keys(n).filter(id => n[id] >= 2);
        if (pairs.length && r() < .02 * d * pairs.length) {
          const id = +pairs[Math.floor(r() * pairs.length)], baby = {id, cm: FISH[id].min, k: s.seq++, v: r() < .08 ? 1 : 0, born: 1};
          t.fish.push(baby); s.births++; coins += aqDexAdd(s, baby);
          s.news.push('Naissance : un petit ' + FISH[id].name + (baby.v ? ' de couleur rare !' : ' dans le bassin ' + AQA.waters[t.water][0].toLowerCase()));
        }
      }
    }
  }
  if (s.museum) { const n = Object.keys(s.museum).length; s.cash += aqMuseumHour(s) * hours; s.visitors += n * .3 * hours; }  // the museum brings people and coins too
  return coins;
}
function aqTick(now = Date.now()) { const s = aqSave(), h = (now - s.last) / 3.6e6; s.last = now; fiSave().money += aqStep(s, h); }
const aqNews = () => { for (const m of aqSave().news.splice(0, 6)) toast(m); aqSave().news.length = 0; };
// Pêche: a fish that is landed is also kept alive in the holding pool
const aqKeep = (id, cm) => { const s = aqSave(); s.pool.push({id, cm, k: s.seq++}); if (s.pool.length > 60) s.pool.shift(); };
// challenges, in order; three at a time
const aqMax = (s, fn) => Math.max(0, ...s.tanks.map(fn));
const aqAll = s => s.tanks.flatMap(t => t.fish);
const AQ_GOALS = [
  ['p3', 'Mettre 3 poissons dans un même bassin', s => [aqMax(s, t => t.fish.length), 3], 100],
  ['dec2', 'Poser 2 décors dans un bassin', s => [aqMax(s, t => t.decor.length), 2], 150],
  ['joy80', 'Avoir un bassin à 80 de joie', s => [aqMax(s, aqHappy), 80], 200],
  ['vis100', 'Accueillir 100 visiteurs', s => [Math.floor(s.visitors), 100], 250],
  ['star1', 'Gagner une étoile pour un bassin', s => [aqMax(s, aqStars), 1], 250],
  ['tip10', 'Ramasser 10 pourboires', s => [s.tips, 10], 300],
  ['dex10', 'Avoir 10 espèces au carnet', s => [Object.keys(s.dex).length, 10], 400],
  ['tank2', 'Ouvrir un deuxième bassin', s => [s.tanks.length, 2], 400],
  ['star2', 'Un bassin à 2 étoiles', s => [aqMax(s, aqStars), 2], 600],
  ['birth', 'Une naissance dans un bassin', s => [s.births, 1], 600],
  ['rare3', 'Trois poissons rares (ou mieux) dans tes bassins', s => [aqAll(s).filter(f => aqFish(f).rarity >= 3).length, 3], 800],
  ['dex25', 'Avoir 25 espèces au carnet', s => [Object.keys(s.dex).length, 25], 1200],
  ['earn5k', 'Encaisser 5 000 pièces', s => [Math.floor(s.earned), 5000], 1500],
  ['star3', 'Un bassin à 3 étoiles', s => [aqMax(s, aqStars), 3], 2000],
  ['shiny', 'Un poisson de couleur rare', s => [aqAll(s).filter(f => f.v).length, 1], 2500],
  ['big', 'Un grand bassin plein', s => [s.tanks.some(t => t.size === 2 && t.fish.length >= 16) ? 1 : 0, 1], 3000],
  ['waters', 'Un bassin de chaque eau', s => [new Set(s.tanks.map(t => t.water)).size, 5], 4000],
  ['dex60', 'Avoir 60 espèces au carnet', s => [Object.keys(s.dex).length, 60], 6000],
];
const aqGoals = s => AQ_GOALS.filter(([id]) => !s.goals[id]).slice(0, 3);
const aqGoalKey = s => aqGoals(s).map(([id, , fn]) => { const [c, n] = fn(s); return id + (c >= n); }).join();  // the page is rebuilt when a challenge can be claimed

/* ---------- 1.4: the shape of a tank, living plants, the ecosystem, visitors with tastes, the museum ---------- */
const AQ_SHAPES = {  // name, price, the water inside the glass {L, R, T, r: rounded corners}, what it does
  rect: ['Rectangle', 0, {L: 8, R: 472, T: 18}, 'La forme de départ.', {vis: 1, joy: 0, decor: 0}],
  rond: ['Arrondi', 800, {L: 30, R: 450, T: 26, r: 40}, 'Coins arrondis et ambiance douce : joie +5, les enfants adorent.', {vis: 1.1, joy: 5, decor: 0}],
  colonne: ['Colonne', 1200, {L: 150, R: 330, T: 18}, 'Haut et étroit : visiteurs +15 %, les photographes adorent, 2 décors de moins.', {vis: 1.15, joy: 0, decor: -2}],
  panorama: ['Panoramique', 2000, {L: 8, R: 472, T: 70}, 'Large et bas : visiteurs +25 %, 2 décors de plus, les rêveurs adorent.', {vis: 1.25, joy: 0, decor: 2}],
};
const aqShape = t => AQ_SHAPES[t.shape] || AQ_SHAPES.rect;
const aqGeo = t => aqShape(t)[2];
const aqMaxDecor = t => AQA.maxDecor + aqShape(t)[4].decor;
function aqClampTank(t) { const {L, R} = aqGeo(t); for (const d of [...t.decor, ...(t.plants || [])]) { const w = (AQ_DECOR[d.k] || AQ_PLANTS[d.k])[AQ_DECOR[d.k] ? 0 : 2]; d.x = Math.max(L, Math.min(R - w, d.x)); } }
// living plants: they grow when the water is clean, clean it in return, and the plant eaters nibble them
const AQ_PLANTS = {herbe: ['Herbe aquatique', 150, 16, 24], fougere: ['Fougère d\'eau', 250, 22, 26], ruban: ['Grande algue', 400, 14, 74]};  // name, price, width, full height
const AQ_PLANT_COL = {douce: ['#2f8a4a', '#6fd07a'], mer: ['#5a7a2a', '#a8c45a'], tropical: ['#2fa07a', '#8ff0c0'], polaire: ['#3a7a6a', '#9ad0c0'], abysses: ['#3a2a6a', '#ff5ad9']};
const AQ_MAX_PLANTS = 6;
function aqPlantDraw(g, p, water, t) {
  const [dark, light] = AQ_PLANT_COL[water], b = AQB(), [, , w, h] = AQ_PLANTS[p.k], H = Math.max(4, Math.round(h * p.g)), x0 = Math.round(p.x), k = p.x * 7 % 6;
  if (p.k === 'herbe') for (let i = 0; i < 4 + Math.round(p.g * 4); i++) { const bx = x0 + 1 + (i * 5) % w, bh = Math.round(H * (.55 + ((i * 37) % 10) / 22)); for (let y = 0; y < bh; y += 1) px(g, y > bh * .6 ? light : dark, bx + Math.round(Math.sin(t / 50 + i + y / 7 + k) * y / 10), b - y, 1, 1); }
  if (p.k === 'fougere') for (let i = 0; i < 3 + Math.round(p.g * 5); i++) { const a = -1.3 + i / (2 + p.g * 5) * 2.6, len = H * (.6 + (i % 3) * .2); for (let j = 0; j < len; j += 2) { const sx = Math.round(x0 + w / 2 + Math.sin(a) * j + Math.sin(t / 60 + i) * j / 14), sy = Math.round(b - Math.cos(a) * j); px(g, j > len * .5 ? light : dark, sx, sy, 2, 2); if (j % 4 === 0 && j) px(g, dark, sx + (a < 0 ? -2 : 2), sy + 1, 2, 1); } }
  if (p.k === 'ruban') for (let i = 0; i < 3; i++) { const bh = Math.round(H * (.7 + i * .15)); for (let y = 0; y < bh; y += 2) { const sx = Math.round(x0 + 3 + i * 4 + Math.sin(t / 45 + i * 2 + y / 12 + k) * y / 9); px(g, (y >> 2) % 3 ? dark : light, sx, b - y, 3, 2); if (y % 14 === 6 && p.g > .5) px(g, light, sx + 3, b - y - 1, 2, 2); } }
  if (water === 'abysses' && p.g > .4 && t % 120 < 60) px(g, light, x0 + w / 2, b - H, 2, 2);  // abyss plants glow at the tip
}
// who eats what: the big hunters eat the small fish, the plant eaters nibble the plants, the bottom cleaners keep the water clean
const aqDiet = sp => (sp.likes.includes('k') || sp.likes.includes('l')) && sp.max >= 60 ? 'pred' : /nettoyeur|Loche|Poisson-chat|Plie|Sole|Grondin/.test(sp.name) ? 'clean' : sp.likes.includes('p') ? 'herb' : '';
const AQ_DIETS = {pred: 'prédateur', clean: 'nettoyeur', herb: 'mange les plantes', '': ''};
const aqPrey = (t, f) => t.fish.filter(p => p !== f && p.cm < f.cm * .35 && aqDiet(aqFish(p)) !== 'pred');
function aqCleanK(t) {  // how much slower the water gets dirty: plants (up to 60 %) and cleaners (up to 45 %)
  const plants = (t.plants || []).reduce((a, p) => a + p.g, 0), cleaners = t.fish.filter(f => aqDiet(aqFish(f)) === 'clean').length;
  return (1 - Math.min(.6, plants * .12)) * (1 - Math.min(.45, cleaners * .15));
}
function aqEco(t) {  // what the page tells about the life of this tank
  const out = [], preds = t.fish.filter(f => aqDiet(aqFish(f)) === 'pred' && aqAdult(f)), herbs = t.fish.filter(f => aqDiet(aqFish(f)) === 'herb').length, clean = Math.round((1 - aqCleanK(t)) * 100);
  for (const f of preds) { const prey = aqPrey(t, f); if (prey.length) out.push('Attention : ' + aqFish(f).name + ' peut manger ' + [...new Set(prey.map(p => aqFish(p).name))].slice(0, 3).join(', ') + (t.food > 30 ? ' (moins s\'il est nourri)' : ' (il a faim !)')); }
  if (clean) out.push('Plantes et nettoyeurs : l\'eau se salit ' + clean + ' % moins vite');
  if (herbs && (t.plants || []).length) out.push(herbs + ' poisson' + (herbs > 1 ? 's mangent' : ' mange') + ' les plantes' + ((t.plants || []).some(p => p.g < .3) ? ' : elles ont du mal à pousser' : ''));
  return out;
}
// visitors: each one has a taste; the finest fish for it decides whether it is happy
const aqSat = h => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)), mx = Math.max(...c); return mx ? (mx - Math.min(...c)) / mx : 0; };
const AQ_KINDS = {
  enfant: ['Enfant', 'les poissons colorés', (f, t) => { const sp = aqFish(f); return Math.min(1, (aqSat(sp.back) + aqSat(sp.fin) + aqSat(sp.belly)) / 2.2 + (sp.pattern !== '-' ? .15 : 0) + (f.v ? .3 : 0) + (t.shape === 'rond' ? .15 : 0)); }],
  savant: ['Savant', 'les espèces rares', f => Math.min(1, (aqFish(f).rarity - 1) / 3.2 + (f.v ? .2 : 0))],
  photo: ['Photographe', 'les très gros poissons', (f, t) => Math.min(1, f.cm / 140 + (t.shape === 'colonne' ? .15 : 0))],
  reveur: ['Rêveur', 'les bassins pleins de plantes et de décors', (f, t) => Math.min(1, ((t.plants || []).reduce((a, p) => a + p.g, 0) + t.decor.length * .5) / 5 + (t.shape === 'panorama' ? .15 : 0))],
};
const aqLike = (t, k) => t.fish.length ? Math.max(...t.fish.map(f => AQ_KINDS[k][2](f, t))) : 0;
const aqAppeal = t => Object.keys(AQ_KINDS).reduce((a, k) => a + aqLike(t, k), 0) / 4;
// the museum: one fish of each species, room after room
const AQ_ROOMS = [['douce', 'Salle de l\'étang', '#2a3a2a'], ['mer', 'Galerie de la mer', '#22324a'], ['tropical', 'Serre tropicale', '#2a4a3a'], ['polaire', 'Salle polaire', '#3a4a5a'], ['abysses', 'Salle des abysses', '#141024'], ['legende', 'Salle des légendes', '#4a3a1a']];
const aqRoomFish = k => k === 'legende' ? FISH.filter(f => f.rarity === 5) : aqWaterFish(k).filter(f => f.rarity < 5);
const aqRoomHave = (s, i) => aqRoomFish(AQ_ROOMS[i][0]).filter(f => s.museum[f.id]).length;
const aqRoomNeed = i => Math.min(8, aqRoomFish(AQ_ROOMS[i][0]).length);
function aqRoomsOpen(s) {  // the water rooms open one after the other (8 gifts in the last one), the legends' room once three are open
  let n = 1; while (n < 5 && aqRoomHave(s, n - 1) >= aqRoomNeed(n - 1)) n++;
  return [...Array(n).keys(), ...(n >= 3 ? [5] : [])];
}
const aqMuseumHour = s => Object.keys(s.museum).reduce((a, id) => a + .4 * Math.sqrt(FI_RARITY[FISH[id]?.rarity || 1][3]), 0);
const aqCanGive = (s, f) => !s.museum[f.id] && aqRoomsOpen(s).some(i => aqRoomFish(AQ_ROOMS[i][0]).includes(aqFish(f)));
function aqGive(f) {
  const s = aqSave(), before = aqRoomsOpen(s), sp = aqFish(f);
  if (!aqCanGive(s, f)) return false;
  s.pool.splice(s.pool.indexOf(f), 1); s.museum[f.id] = {cm: f.cm, v: f.v || 0, at: Date.now()};
  s.news.push('Merci pour ce don : ' + sp.name + ' entre au musée !');
  for (const i of aqRoomsOpen(s)) if (aqRoomFish(AQ_ROOMS[i][0]).includes(sp) && aqRoomHave(s, i) === aqRoomFish(AQ_ROOMS[i][0]).length) { const c = i === 5 ? 10000 : 1500 * AQA.mult[AQ_ROOMS[i][0]]; fiSave().money += c; s.news.push(AQ_ROOMS[i][1] + ' complète ! +' + c + ' pièces'); }
  for (const i of aqRoomsOpen(s)) if (!before.includes(i)) { fiSave().money += 300 * (i + 1); s.news.push('Le musée ouvre une nouvelle salle : ' + AQ_ROOMS[i][1] + ' · +' + 300 * (i + 1) + ' pièces'); }
  return true;
}
const pxFont = (g, text, x, y, color, size = 8, align = 'left') => { g.font = size + 'px "Press Start 2P", monospace'; g.textAlign = align; g.fillStyle = '#05010b'; g.fillText(text, x + 1, y + 1); g.fillStyle = color; g.fillText(text, x, y); g.textAlign = 'left'; };
function aqMuseumDraw(cv, i) {  // a hall of the museum: its wall, a plaque, and one lit case per species (a shadow until given)
  const s = aqSave(), [k, name, wall] = AQ_ROOMS[i], list = aqRoomFish(k), cols = 12, CW = 38, CH = 32, rows = Math.ceil(list.length / cols), W = 480, H = 52 + rows * CH + 14;
  cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  px(g, wall, 0, 0, W, H); for (let x = 0; x < W; x += 40) px(g, mixc(wall, '#000000', .25), x, 0, 3, H);  // pillars
  px(g, mixc(wall, '#ffffff', .12), 0, 40, W, 2); px(g, mixc(wall, '#000000', .45), 0, H - 10, W, 10);
  px(g, '#8a6a2a', W / 2 - 110, 8, 220, 24); px(g, '#d0a84a', W / 2 - 108, 10, 216, 20);
  pxFont(g, name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), W / 2, 24, '#3a2a10', 7, 'center');
  const water = k === 'legende' ? ['#4a3a1a', '#2a1a08'] : FI_SPOTS[AQA.waters[k][2]].water;
  cv.__cases = list.map((f, j) => {
    const x = 6 + (j % cols) * CW + 1, y = 48 + Math.floor(j / cols) * CH, have = s.museum[f.id];
    px(g, '#0b0716', x - 1, y - 1, CW - 2, CH - 4); px(g, have ? water[1] : mixc(water[1], '#000000', .55), x, y, CW - 4, CH - 6); px(g, '#ffffff22', x, y, CW - 4, 1);
    const a = fiArt(f, !have), sc = Math.min(1, (CW - 8) / a.width, (CH - 10) / a.height), w = Math.max(1, Math.round(a.width * sc)), h = Math.max(1, Math.round(a.height * sc));
    g.globalAlpha = have ? 1 : .35; g.drawImage(a, Math.round(x + (CW - 4 - w) / 2), Math.round(y + (CH - 6 - h) / 2), w, h); g.globalAlpha = 1;
    if (have) px(g, '#ffd84a', x + 2, y + CH - 9, 3, 1);
    return {f, x, y, w: CW - 4, h: CH - 6};
  });
  cv.onclick = e => { const b = cv.getBoundingClientRect(), mx = (e.clientX - b.left) * W / b.width, my = (e.clientY - b.top) * H / b.height, c = cv.__cases.find(c => mx >= c.x && mx < c.x + c.w && my >= c.y && my < c.y + c.h); if (c) toast(s.museum[c.f.id] ? c.f.name + ' · ' + FI_RARITY[c.f.rarity][0] + ' · donné à ' + Math.round(s.museum[c.f.id].cm) + ' cm' : 'Espèce encore inconnue du musée'); };
}
function aqMuseumCard(s) {
  const card = el('div', 'sysCard px aqCol aqWide'), open = aqRoomsOpen(s), tabs = el('div', 'row aqTabs');
  if (!open.includes(aq.room ?? 0)) aq.room = 0;
  AQ_ROOMS.forEach(([k, name], i) => { const b = el('button', 'btn px' + (aq.room === i ? ' main' : ''), open.includes(i) ? name + ' ' + aqRoomHave(s, i) + '/' + aqRoomFish(k).length : '🔒 ' + name); b.disabled = !open.includes(i); b.onclick = () => { aq.room = i; aqUi(); }; tabs.append(b); });
  const cv = el('canvas', 'aqMuseum'); aqMuseumDraw(cv, aq.room || 0);
  const next = [0, 1, 2, 3, 4].find(i => !open.includes(i)), give = el('div', 'aqGive'), can = s.pool.filter(f => aqCanGive(s, f)).filter((f, j, a) => a.findIndex(x => x.id === f.id) === j);
  for (const f of can) { const b = el('button', 'btn px main', 'DONNER : ' + aqFish(f).name); b.onclick = () => { if (aqGive(f)) { sfx('launch'); aqNews(); saveGames(); aqUi(); } }; give.append(b); }
  card.append(el('b', '', 'Musée · ' + Object.keys(s.museum).length + ' espèces données · ' + aqMuseumHour(s).toFixed(1).replace('.', ',') + ' pièces / h'),
    el('small', 'hint', 'Donne au musée un poisson du vivier de chaque espèce : il y reste pour toujours, rapporte des visiteurs et des pièces chaque heure. ' + (next != null ? 'Prochaine salle (' + AQ_ROOMS[next][1] + ') : ' + aqRoomNeed(next - 1) + ' dons dans la salle d\'avant.' : 'Toutes les salles sont ouvertes.') + (open.includes(5) ? '' : ' La salle des légendes ouvre avec la troisième salle.')),
    tabs, cv, can.length ? el('small', 'hint', 'Dans ton vivier, ces espèces manquent au musée :') : el('small', 'hint', 'Aucun poisson du vivier ne manque au musée pour l\'instant : va pêcher !'), give);
  return card;
}
function aqTankCard(s, tank, money) {  // the shape, the living plants, the life of the tank and what the visitors think of it
  const card = el('div', 'sysCard px aqCol'), [sn, , , sabout] = aqShape(tank), btn = (label, price, ok, then, why) => { const b = el('button', 'btn px aqShop', label + (ok ? ' · ' + price : why ? ' · ' + why : '')); b.disabled = !ok || money < price; b.onclick = () => aqBuy(price, then); return b; };
  card.append(el('b', '', 'Aménagement · forme ' + sn.toLowerCase()), el('small', 'hint', sabout));
  for (const [k, [name, price, , about]] of Object.entries(AQ_SHAPES)) if (k !== (tank.shape || 'rect')) card.append(btn('Forme : ' + name.toLowerCase() + ' · ' + about, price, true, () => { tank.shape = k; aqClampTank(tank); aq.swim = {}; }));
  const pl = tank.plants || [], place = k => () => { const {L, R} = aqGeo(tank), w = AQ_PLANTS[k][2]; (tank.plants ??= []).push({k, x: L + 6 + Math.floor(Math.random() * Math.max(1, R - L - w - 12)), g: .2}); };
  card.append(el('small', 'hint', 'Plantes vivantes (' + pl.length + '/' + AQ_MAX_PLANTS + ') : elles poussent quand l\'eau est propre et nettoient l\'eau en retour. Fais-les glisser sur le sable.'));
  for (const p of pl) { const row = el('div', 'aqRow'), rm = el('button', 'btn px', 'ARRACHER'); rm.onclick = () => { pl.splice(pl.indexOf(p), 1); saveGames(); aqUi(); }; row.append(el('span', '', AQ_PLANTS[p.k][0] + ' · ' + Math.round(p.g * 100) + ' % de sa taille'), rm); card.append(row); }
  for (const [k, [name, price]] of Object.entries(AQ_PLANTS)) card.append(btn('Planter : ' + name.toLowerCase(), price, pl.length < AQ_MAX_PLANTS, place(k), AQ_MAX_PLANTS + ' au plus'));
  const eco = aqEco(tank); card.append(el('b', '', 'Vie du bassin')); card.append(...(eco.length ? eco : ['Rien à signaler : tout le monde vit en paix.']).map(t => el('small', 'hint', t)));
  card.append(el('b', '', 'Ce que pensent les visiteurs'));
  for (const [k, [name, likes]] of Object.entries(AQ_KINDS)) { const v = aqLike(tank, k), [ok, all] = s.likes[k] || [0, 0]; card.append(el('small', 'hint', name + ' (aime ' + likes + ') : ' + (v >= .75 ? 'ravi' : v >= .45 ? 'content' : v > 0 ? 'déçu' : 'rien à voir') + (all ? ' · ' + Math.round(ok / all * 100) + ' % de visiteurs heureux' : ''))); }
  const wall = el('button', 'btn px' + (s.wall === s.tanks.indexOf(tank) ? '' : ' main'), s.wall === s.tanks.indexOf(tank) ? 'C\'EST LE FOND D\'ÉCRAN' : 'CHOISIR POUR LE FOND D\'ÉCRAN');
  wall.onclick = () => { s.wall = s.tanks.indexOf(tank); saveGames(); aqWallSave(); toast('Ce bassin sera le fond d\'écran du thème Aquarium'); aqUi(); };
  card.append(el('small', 'hint', 'Avec le thème Aquarium (Paramètres > Apparence), ce bassin et ses poissons deviennent le fond de NeoDex.'), wall);
  return card;
}
// the wallpaper of the Aquarium theme: the chosen tank without its visitors, and its fish apart (the theme makes them swim); kept on this device only (local-…)
function aqWallData() {
  const s = aqSave(), i = s.wall != null && s.tanks[s.wall] ? s.wall : s.tanks.reduce((b, t, j) => aqStars(t) * 100 + t.fish.length > aqStars(s.tanks[b]) * 100 + s.tanks[b].fish.length ? j : b, 0), tank = s.tanks[i];
  const keep = {g: aq.g, tank: aq.tank}, big = document.createElement('canvas'); big.width = AQA.W; big.height = AQA.H;
  aq.g = big.getContext('2d'); aq.tank = i; aq.wallMode = true;
  try { aqDraw(); } finally { aq.g = keep.g; aq.tank = keep.tank; aq.wallMode = false; }
  const {GL, GR, TOP, GB} = AQA, Z = 4, sc = document.createElement('canvas'); sc.width = (GR - GL) * Z; sc.height = (GB - TOP) * Z;
  const g = sc.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(big, GL, TOP, GR - GL, GB - TOP, 0, 0, sc.width, sc.height);
  const out = {'aq-scene': sc.toDataURL('image/png')};
  [...tank.fish].sort((a, b) => aqVal(b) - aqVal(a)).slice(0, 8).forEach((f, j) => {
    const a = aqArt(f), z = 3 * aqScale(f), c = document.createElement('canvas'); c.width = a.width * z; c.height = a.height * z; const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false;
    if (j >= 4) { cg.translate(c.width, 0); cg.scale(-1, 1); }  // the last four swim to the left
    cg.drawImage(a, 0, 0, c.width, c.height); out['aq-f' + (j + 1)] = c.toDataURL('image/png');
  });
  for (let j = Math.min(8, tank.fish.length); j < 8; j++) out['aq-f' + (j + 1)] = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';  // fewer fish: an empty picture, so the theme shows none of its own
  return out;
}
let aqWallT = 0;
function aqWallSave() { try { const d = aqWallData(); aqWallT = Date.now(); return folder.write('local-fond', d).catch(() => {}); } catch (e) { console.error(e); } }

let aq = null;
const aqTank = () => aqSave().tanks[Math.min(aq?.tank || 0, aqSave().tanks.length - 1)];
function aqOpen() {
  const s = aqSave(), away = (Date.now() - s.last) / 1000, c0 = s.cash; aqFix(s);
  if (!s.gift) {  // a first visit: one of each species already caught
    s.gift = true; const fs = fiSave();
    for (const id of Object.keys(fs.dex)) aqKeep(+id, fs.dex[id].best);
  }
  aqTick();
  if (away > 600 && s.cash - c0 >= 1) toast('Pendant ton absence (' + fmtAway(away) + '), les visiteurs ont laissé ' + Math.floor(s.cash - c0) + ' pièces à la caisse');
  aqNews();
  aq ??= {raf: 0, g: $('aqCanvas').getContext('2d'), tick: 0, tank: 0, swim: {}, bubbles: [], flakes: [], parts: [], vis: [], tips: [], pops: [], bg: {}, sel: null, drag: null};
  aq.mode = 'play'; saveGames(); aqUi(); if (Date.now() - aqWallT > 6e5) setTimeout(aqWallSave, 3000); gameLoop(aq, 'neodex:aquarium', aqUpdate, aqDraw);
}
const aqTip = () => Math.max(1, Math.round(aqSave().tanks.reduce((a, t) => a + aqIncome(t), 0) / 10));
function aqSpawn() {  // a visitor comes in, and walks to one of the finest fish
  const t = aqTank(), kind = Object.keys(AQ_KINDS)[Math.floor(Math.random() * 4)], taste = f => AQ_KINDS[kind][2](f, t), dir = Math.random() < .5 ? 1 : -1, best = [...t.fish].sort((a, b) => taste(b) - taste(a)).slice(0, 2), f = best[Math.floor(Math.random() * best.length)], sw = f && aq.swim[f.k];
  aq.vis.push({x: dir > 0 ? -14 : AQA.W + 14, dir, sp: .25 + Math.random() * .25, tx: Math.max(30, Math.min(AQA.W - 70, sw ? sw.x : 40 + Math.random() * 380)), child: kind === 'enfant', look: {enfant: Math.floor(Math.random() * 4), savant: 1, photo: 0, reveur: 3}[kind], kind, sat: f ? taste(f) : 0, step: 0, stop: 0, seen: false, heart: 0});
}
function aqUpdate() {
  if (aq.tick % 600 === 0) { aqTick(); aqNews(); aqUi(true); if (aq.tick % 3600 === 0) saveGames(); }
  const tank = aqTank(), {W, SAND} = AQA, {L: GL, R: GR, T: TOP} = aqGeo(tank), joy = aqHappy(tank), stars = aqStars(tank);
  if (Math.random() < .06) aq.bubbles.push({x: GL + 12 + Math.random() * (GR - GL - 24), y: SAND, v: .3 + Math.random() * .4});
  for (const d of tank.decor) {
    if (d.k === 'bulleur' && aq.tick % 9 === 0) aq.bubbles.push({x: d.x + 4 + Math.random() * 3, y: SAND - 4, v: .7 + Math.random() * .5});
    if (d.k === 'cheminee' && aq.tick % 5 === 0) aq.parts.push({x: d.x + 9, y: SAND - 32, vx: (Math.random() - .5) * .2, vy: -.35, life: 140, c: Math.random() < .3 ? '#ff9a4a' : '#3a3046'});
  }
  for (const p of tank.plants || []) if (p.g > .6 && aq.tick % 70 === Math.round(p.x) % 70) aq.bubbles.push({x: p.x + AQ_PLANTS[p.k][2] / 2, y: AQB() - AQ_PLANTS[p.k][3] * p.g, v: .4});  // grown plants give oxygen
  if (aq.tick % 36000 === 0 && aq.tick) aqWallSave();
  for (const b of aq.bubbles) b.y -= b.v; aq.bubbles = aq.bubbles.filter(b => b.y > TOP + 4);
  for (const p of aq.parts) { p.x += p.vx; p.y += p.vy; p.life--; } aq.parts = aq.parts.filter(p => p.life > 0 && p.y > TOP);
  for (const f of aq.flakes) f.y += f.y < SAND - 2 ? .35 : 0; if (aq.tick % 4 === 0) aq.flakes = aq.flakes.filter(f => ++f.t < 300);
  // each fish swims towards a target, and to the food when there is some
  for (const f of tank.fish) {
    const sw = aq.swim[f.k] ??= {x: GL + 40 + Math.random() * (GR - GL - 80), y: TOP + 30 + Math.random() * (SAND - TOP - 60), tx: 0, ty: 0, dir: 1, wait: 0};
    if (!sw.food || !aq.flakes.includes(sw.food)) { const near = aq.flakes.filter(fl => Math.abs(fl.x - sw.x) < 200); sw.food = near.length ? near[Math.floor(Math.random() * near.length)] : null; sw.sp ??= .6 + Math.random() * .6; sw.off = (Math.random() - .5) * 10; }
    const food = sw.food;
    if (food) { sw.tx = food.x + sw.off; sw.ty = food.y; if (Math.hypot(food.x - sw.x, food.y - sw.y) < 6) { aq.flakes.splice(aq.flakes.indexOf(food), 1); sw.food = null; sw.wait = 0; } }
    else if (--sw.wait <= 0 || Math.hypot(sw.tx - sw.x, sw.ty - sw.y) < 3) { sw.tx = GL + 30 + Math.random() * (GR - GL - 60); sw.ty = TOP + 24 + Math.random() * (SAND - TOP - 50); sw.wait = 200 + Math.random() * 300; }
    const sp = (food ? .9 * (sw.sp || 1) : .35) * (joy < 30 ? .5 : 1), dx = sw.tx - sw.x, dy = sw.ty - sw.y, d = Math.hypot(dx, dy) || 1;
    sw.x += dx / d * Math.min(sp, d); sw.y += dy / d * Math.min(sp * .6, d); if (Math.abs(dx) > 2) sw.dir = dx > 0 ? 1 : -1;
  }
  // visitors: more of them when the fish are many and happy; they stop, love it (a heart) and sometimes leave a tip on the floor
  if (tank.fish.length && aq.vis.length < 3 + Math.min(4, tank.fish.length / 2) && Math.random() < .004 * (.4 + joy / 100) * (1 + stars * .5) * aqShape(tank)[4].vis * (.6 + aqAppeal(tank) * .8)) aqSpawn();
  for (const v of aq.vis) {
    if (v.heart) v.heart--; if (v.sad) v.sad--;
    if (v.stop > 0) { if (--v.stop === 50) { const ok = joy >= 50 && v.sat >= .45, L = (aqSave().likes[v.kind || 'enfant'] ??= [0, 0]); L[1]++; if (ok) { L[0]++; v.heart = 60; if (Math.random() < .15 + v.sat * .5 + stars * .1) aq.tips.push({x: v.x + 8 * v.dir, y: AQA.H - 30, vy: -1.5, t: 0, m: .5 + v.sat}); } else v.sad = 60; } continue; }
    v.x += v.sp * v.dir; v.step++;
    if (!v.seen && Math.abs(v.x - v.tx) < 1) { v.seen = true; v.stop = 120 + Math.floor(Math.random() * 240); }
  }
  aq.vis = aq.vis.filter(v => v.x > -20 && v.x < W + 20);
  for (const c of aq.tips) { c.t++; if (c.vy || c.y < AQA.H - 6) { c.y += c.vy; c.vy += .2; if (c.y >= AQA.H - 6) { c.y = AQA.H - 6; c.vy = 0; } } }
  aq.tips = aq.tips.filter(c => c.t < 900);
  for (const p of aq.pops) p.t++; aq.pops = aq.pops.filter(p => p.t < 50);
}
/* ---------- drawing: everything in pixels, a painted tank behind glass ---------- */
const aqEll = (g, c, cx, cy, rx, ry, top = false) => { for (let dy = -ry; dy <= (top ? 0 : ry); dy++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + .5)) ** 2))); px(g, c, cx - w, cy + dy, 2 * w + 1, 1); } };
const AQB = () => AQA.SAND + 3;  // where the decorations stand
const AQ_DECOR = {  // [width, height, draw]: little pixel decorations, standing on the sand (x: left edge)
  plante: [18, 34, (g, x, t) => { for (let i = 0; i < 4; i++) for (let y = 0; y < 24 + i * 4; y += 2) { const sx = Math.round(Math.sin((y + t / 8 + i * 9) / 7) * (y / 12)); px(g, i % 2 ? '#2f8a4a' : '#5fd08a', x + 2 + i * 4 + sx, AQB() - y, 2, 2); if (y % 8 === 4) px(g, '#9ff0b0', x + 2 + i * 4 + sx + (i % 2 ? -2 : 2), AQB() - y, 2, 1); } }],
  rocher: [30, 18, (g, x) => { const b = AQB(); aqEll(g, '#3a3448', x + 15, b - 2, 15, 9, true); aqEll(g, '#5a5470', x + 13, b - 3, 12, 8, true); aqEll(g, '#8f8fa8', x + 11, b - 7, 6, 3, true); px(g, '#b8b8d0', x + 8, b - 10, 4, 1); px(g, '#2a2436', x + 22, b - 4, 5, 2); }],
  corail: [26, 30, (g, x) => { const b = AQB(); for (const [a, h, c, s] of [[2, 18, '#ff7a8a', '#c04a5a'], [8, 28, '#ff5ad9', '#b02a9a'], [15, 14, '#ffa07a', '#c0603a'], [20, 22, '#ff7a8a', '#c04a5a']]) { px(g, s, x + a + 1, b - h, 2, h); px(g, c, x + a, b - h, 2, h); px(g, c, x + a - 3, b - h + 5, 3, 2); px(g, c, x + a - 3, b - h + 2, 2, 3); px(g, c, x + a + 2, b - h + 10, 3, 2); px(g, c, x + a + 3, b - h + 7, 2, 3); px(g, '#ffe0f0', x + a, b - h, 1, 1); } }],
  amphore: [16, 24, (g, x) => { const b = AQB(); aqEll(g, '#8a4a2a', x + 8, b - 9, 7, 9); aqEll(g, '#c0703a', x + 7, b - 10, 5, 7); px(g, '#8a4a2a', x + 5, b - 22, 6, 4); px(g, '#c0703a', x + 6, b - 22, 4, 1); px(g, '#e8a070', x + 4, b - 13, 2, 4); px(g, '#5a2a1a', x + 3, b - 8, 10, 1); }],
  chateau: [32, 40, (g, x, t) => { const b = AQB(); px(g, '#6a5a48', x, b - 30, 32, 30); px(g, '#a08a70', x + 1, b - 30, 28, 29); for (let i = 0; i < 4; i++) { px(g, '#a08a70', x + 1 + i * 8, b - 35, 5, 5); px(g, '#c8b090', x + 1 + i * 8, b - 35, 5, 1); } px(g, '#8a7458', x + 9, b - 40, 14, 10); px(g, '#a08a70', x + 10, b - 40, 12, 9); px(g, '#3a2a1a', x + 12, b - 14, 8, 14); px(g, '#2a1a0a', x + 13, b - 13, 6, 13); px(g, '#3a2a1a', x + 5, b - 24, 4, 5); px(g, '#3a2a1a', x + 23, b - 24, 4, 5); px(g, '#c8b090', x + 1, b - 30, 28, 1); if (t % 300 < 40) px(g, '#ffd07a', x + 14, b - 36, 2, 2); }],
  arche: [46, 36, (g, x) => { const b = AQB(); px(g, '#4a4458', x, b - 30, 10, 30); px(g, '#4a4458', x + 36, b - 30, 10, 30); px(g, '#6a6478', x + 1, b - 30, 7, 30); px(g, '#6a6478', x + 37, b - 30, 7, 30); for (let i = 0; i < 46; i++) { const y = Math.round(Math.sin(i / 45 * Math.PI) * 7); px(g, '#4a4458', x + i, b - 36 - y, 1, 9); px(g, '#7a7488', x + i, b - 36 - y, 1, 2); } px(g, '#3f9a5a', x + 4, b - 34, 2, 6); px(g, '#3f9a5a', x + 30, b - 41, 2, 5); }],
  coffre: [24, 18, (g, x, t) => { const b = AQB(), open = t % 360 < 120 ? 0 : t % 360 < 140 ? (t % 360 - 120) / 4 : 5; px(g, '#5a3010', x, b - 12, 24, 12); px(g, '#8a5020', x + 1, b - 11, 22, 10); px(g, '#ffd07a', x, b - 8, 24, 2); px(g, '#ffd07a', x + 10, b - 10, 4, 5); px(g, '#5a3010', x, b - 17 - open, 24, 5); px(g, '#a06a30', x + 1, b - 16 - open, 22, 3); if (open) { px(g, '#ffd84a', x + 3, b - 13, 18, 2); if (t % 20 < 10) px(g, '#ffffff', x + 6 + t % 12, b - 14, 1, 1); } }],
  bulleur: [12, 10, (g, x) => { const b = AQB(); aqEll(g, '#3a3448', x + 6, b - 2, 6, 4, true); aqEll(g, '#6a6478', x + 6, b - 3, 4, 2, true); px(g, '#1a1426', x + 5, b - 6, 3, 1); }],
  epave: [58, 50, (g, x) => { const b = AQB(); for (let i = 0; i < 58; i++) { const h = 12 + Math.round(Math.sin(i / 57 * Math.PI) * 4); px(g, '#4a2a10', x + i, b - h, 1, h); px(g, '#7a5030', x + i, b - h, 1, 2); } px(g, '#6a4020', x + 8, b - 22, 32, 6); px(g, '#8a6040', x + 8, b - 22, 32, 1); px(g, '#4a2a10', x + 32, b - 50, 3, 30); px(g, '#4a2a10', x + 24, b - 44, 18, 2); px(g, '#cfc8b0', x + 35, b - 46, 12, 9); px(g, '#a8a090', x + 35, b - 40, 12, 2); for (const hx of [10, 24, 46]) px(g, '#130a20', x + hx, b - 10, 5, 5); px(g, '#3f9a5a', x + 4, b - 18, 2, 7); }],
  souche: [38, 26, (g, x) => { const b = AQB(); px(g, '#4a3220', x + 8, b - 22, 22, 22); px(g, '#6a4a30', x + 10, b - 22, 16, 22); aqEll(g, '#8a6a40', x + 19, b - 22, 11, 2); aqEll(g, '#b08a5a', x + 19, b - 22, 6, 1); for (const [a, l] of [[0, 9], [30, 8], [5, 5], [27, 6]]) px(g, '#4a3220', x + a, b - 4, l, 4); px(g, '#3f9a5a', x + 12, b - 26, 2, 4); px(g, '#5fd08a', x + 24, b - 25, 3, 3); }],
  phare: [16, 46, (g, x, t) => { const b = AQB(); aqEll(g, '#5a5470', x + 8, b - 2, 8, 4, true); for (let y = 6; y < 38; y++) { const w = 5 - Math.floor((y - 6) / 12); px(g, Math.floor(y / 6) % 2 ? '#f0f0f8' : '#e04a4a', x + 8 - w, b - y, 2 * w, 1); } px(g, '#2a2436', x + 4, b - 42, 8, 4); px(g, t % 120 < 60 ? '#ffe48a' : '#6a6050', x + 5, b - 41, 6, 2); px(g, '#2a2436', x + 5, b - 46, 6, 4); }],
  tiki: [16, 32, (g, x) => { const b = AQB(); px(g, '#5a3a20', x + 2, b - 30, 12, 30); px(g, '#8a5a30', x + 3, b - 30, 10, 30); px(g, '#2a1408', x + 4, b - 24, 3, 3); px(g, '#2a1408', x + 9, b - 24, 3, 3); px(g, '#ffd07a', x + 5, b - 23, 1, 1); px(g, '#ffd07a', x + 10, b - 23, 1, 1); px(g, '#2a1408', x + 5, b - 16, 6, 3); px(g, '#e8e0d0', x + 6, b - 15, 4, 1); px(g, '#3f9a5a', x, b - 34, 16, 4); px(g, '#5fd08a', x + 2, b - 36, 4, 2); px(g, '#5fd08a', x + 10, b - 36, 4, 2); }],
  igloo: [34, 22, (g, x) => { const b = AQB(); aqEll(g, '#9ab8d0', x + 17, b, 17, 20, true); aqEll(g, '#e8f4ff', x + 16, b - 1, 15, 18, true); for (let r = 1; r < 4; r++) px(g, '#b8d0e4', x + 3, b - r * 5, 28, 1); px(g, '#4a6a8a', x + 12, b - 9, 10, 9); px(g, '#203450', x + 13, b - 8, 8, 8); }],
  cheminee: [20, 34, (g, x, t) => { const b = AQB(); for (let y = 0; y < 30; y++) { const w = 9 - Math.floor(y / 6); px(g, '#2a2436', x + 10 - w, b - y, 2 * w, 1); px(g, '#3a3448', x + 10 - w + 1, b - y, 3, 1); } px(g, t % 40 < 20 ? '#ff9a4a' : '#ff6a2a', x + 8, b - 32, 4, 3); px(g, '#ffe48a', x + 9, b - 31, 2, 1); }],
};
function aqBg(w) {  // the still parts of a tank of this water (cached): deep water in dithered bands, far scenery, sand
  if (aq.bg[w]) return aq.bg[w];
  const c = document.createElement('canvas'), {W, H, TOP, SAND, GB} = AQA; c.width = W; c.height = H;
  const g = c.getContext('2d'), col = FI_SPOTS[AQA.waters[w][2]].water, r = seeded(w.length * 991 + 7);
  const grad = k => k < .5 ? mixc(col[0], col[1], k * 2) : mixc(col[1], col[2], (k - .5) * 2), N = 12;
  for (let y = TOP; y < GB; y++) {
    const k = (y - TOP) / (GB - TOP) * (N - 1), lo = Math.floor(k), fr = k - lo;
    px(g, grad(lo / (N - 1)), 0, y, W, 1);
    if (fr > .6) { g.fillStyle = grad(Math.min(1, (lo + 1) / (N - 1))); for (let x = (y + (fr > .8 ? 0 : 1)) % 2; x < W; x += fr > .8 ? 1 + (y % 2) : 2) g.fillRect(x, y, 1, 1); }
  }
  const far = mixc(col[1], col[2], .55), far2 = mixc(col[1], col[2], .3);
  if (w === 'douce') {  // reeds and a sunken log
    for (let i = 0; i < 46; i++) { const x = Math.floor(r() * W), h = 40 + Math.floor(r() * 90); px(g, i % 3 ? far : far2, x, SAND - h, 2, h); if (r() < .4) px(g, far, x - 2, SAND - h + 10, 2, 8); }
    aqEll(g, far2, 330, SAND - 6, 60, 8, true); aqEll(g, far, 270, SAND - 6, 9, 9);
  } else if (w === 'mer') {  // rock arches far away
    for (let i = 0; i < 7; i++) { const x = 20 + i * 70 + Math.floor(r() * 30), rx = 28 + Math.floor(r() * 26), ry = 30 + Math.floor(r() * 50); aqEll(g, i % 2 ? far : far2, x, SAND, rx, ry, true); }
    aqEll(g, mixc(far, col[0], .2), 250, SAND - 40, 14, 12);
  } else if (w === 'tropical') {  // a reef of soft colours
    for (let i = 0; i < 16; i++) { const x = Math.floor(r() * W), h = 20 + Math.floor(r() * 60), c2 = mixc(far2, ['#ff7a8a', '#ffa07a', '#c08aff', '#7fe0ee'][i % 4], .35); for (let j = 0; j < 5; j++) px(g, c2, x + j * 4 - 8, SAND - h + Math.abs(j - 2) * 8, 3, h); aqEll(g, c2, x, SAND, 14, 10, true); }
  } else if (w === 'polaire') {  // a wall of ice
    let y = TOP + 60; for (let x = 0; x < W; x += 4) { y = Math.max(TOP + 30, Math.min(TOP + 110, y + Math.floor(r() * 21) - 10)); px(g, mixc('#cfe8f4', far2, .45), x, y, 4, SAND - y); px(g, mixc('#ffffff', far2, .25), x, y, 4, 2); if (r() < .15) px(g, mixc('#ffffff', far2, .5), x + 1, y + 6, 1, 20 + Math.floor(r() * 30)); }
    for (let i = 0; i < 5; i++) { const x = 30 + i * 100, w2 = 30 + Math.floor(r() * 30); px(g, '#e8f4ff', x, TOP, w2, 5); px(g, '#b8d0e4', x + 4, TOP + 5, w2 - 8, 4); }
  } else {  // abyss: dark spires
    for (let i = 0; i < 12; i++) { const x = Math.floor(r() * W), h = 40 + Math.floor(r() * 110); for (let y = 0; y < h; y++) px(g, i % 2 ? far : '#06081c', x - Math.round((h - y) / 8), SAND - y, Math.max(2, Math.round((h - y) / 4)), 1); }
  }
  const sand = AQA.sandCol[w], dark = mixc(sand, '#000000', .3), light = mixc(sand, '#ffffff', .25);
  for (let x = 0; x < W; x += 2) { const top = SAND + Math.round(Math.sin(x / 37) * 2 + Math.sin(x / 13)); px(g, sand, x, top, 2, GB - top); px(g, light, x, top, 2, 1); }
  for (let y = SAND + 8; y < GB; y += 2) for (let x = (y / 2) % 2 * 2; x < W; x += 4 + (y > SAND + 20 ? 0 : 2)) px(g, dark, x, y, 1, 1);
  for (let i = 0; i < 70; i++) { const x = Math.floor(r() * W), y = SAND + 5 + Math.floor(r() * (GB - SAND - 6)); px(g, [dark, light, mixc(sand, '#6a5a48', .5)][i % 3], x, y, 2 + (i % 3), 2); }
  return aq.bg[w] = c;
}
const aqArtCache = new Map();
const aqArt = f => {  // a rare colour: the same fish, colours turned
  const a = fiArt(aqFish(f)); if (!f.v) return a;
  if (!aqArtCache.has(f.id)) { const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const g = c.getContext('2d'); g.filter = 'hue-rotate(150deg) saturate(1.5) brightness(1.1)'; g.drawImage(a, 0, 0); aqArtCache.set(f.id, c); }
  return aqArtCache.get(f.id);
};
const aqScale = f => f.cm >= 50 ? 2 : 1;  // big fish are drawn twice as big
const AQ_STAR = ['...#...', '..###..', '#######', '.#####.', '.##.##.', '##...##'];
const AQ_HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
function aqVisitor(g, v, rim) {  // seen from behind, a dark shape against the glass, lit at its edges by the tank
  const h = v.child ? 50 : 72, r = v.child ? 6 : 7, sh = v.child ? 10 : 15, x = Math.round(v.x), bob = v.stop ? 0 : Math.floor(v.step / 10) % 2, top = AQA.H - h + bob, body = '#0a0612';
  const shape = (c, dx, dy) => {
    for (let y = top + 2 * r + 1; y < AQA.H; y++) { const w = Math.min(sh, sh - 6 + (y - top - 2 * r) * 2); px(g, c, x - w + dx, y + dy, 2 * w, 1); }
    aqEll(g, c, x + dx, top + r + dy, r, r); px(g, c, x - 2 + dx, top + 2 * r - 1 + dy, 4, 3);  // the neck
    if (v.look === 1) { px(g, c, x - r - 2 + dx, top + 2 + dy, 2 * r + 5, 2); px(g, c, x - r + 1 + dx, top - 2 + dy, 2 * r - 1, 4); }  // a hat
    if (v.look === 2) px(g, c, x - 1 + dx, top + 2 * r - 2 + dy, 3, 10);  // a ponytail
    if (v.look === 3) { aqEll(g, c, x - r + 1 + dx, top + 1 + dy, 3, 3); aqEll(g, c, x + r - 1 + dx, top + 1 + dy, 3, 3); }  // buns
  };
  shape(rim, 0, -1); shape(mixc(rim, body, .5), -1, 0); shape(mixc(rim, body, .5), 1, 0); shape(body, 0, 0);
  if (v.sad) sprite(g, ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'], x - 2, top - 12, {'#': '#c9bdf0'});
  if (v.kind === 'photo' && v.stop) { px(g, '#0a0612', x - 5, top - 9, 10, 7); px(g, rim, x - 5, top - 10, 10, 1); px(g, '#3a3448', x - 1, top - 7, 3, 3); if (v.heart > 50) px(g, '#ffffff', x - 2, top - 8, 4, 4); }
  if (v.heart) { const k = 60 - v.heart; sprite(g, AQ_HEART, x - 3, top - 12 - Math.floor(k / 4), {'#': k > 45 && k % 4 < 2 ? '#ff9ae9' : '#ff5ad9'}); }
}
function aqDraw() {
  const g = aq.g, t = aq.tick, tank = aqTank(), {W, H, TOP, SAND, GL, GR, GB} = AQA, col = FI_SPOTS[AQA.waters[tank.water][2]].water, dark = tank.water === 'abysses';
  g.imageSmoothingEnabled = false;
  g.drawImage(aqBg(tank.water), 0, 0);
  g.save(); g.beginPath(); g.rect(GL, TOP, GR - GL, GB - TOP); g.clip();
  if (!dark) for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${tank.water === 'tropical' ? .07 : .045})`; g.beginPath(); const x = (i * 97 + t / 6) % (W + 100) - 50; g.moveTo(x, TOP); g.lineTo(x + 26, TOP); g.lineTo(x - 34, SAND); g.lineTo(x - 50, SAND); g.fill(); }  // light rays
  const weed = {douce: ['#2f7a4a', '#3a8f5c'], mer: ['#5a7a3a', '#6f8f4a'], tropical: ['#3fa07a', '#ff7a9a'], polaire: ['#5a7a8a', '#6a8a9a'], abysses: ['#3a2a5a', '#ff5ad9']}[tank.water];
  for (let i = 0; i < 11; i++) { const bx = GL + 10 + i * 42 + (i % 3) * 7, len = 16 + (i * 11) % 26; for (let j = 0; j < len; j += 2) px(g, mixc(weed[0], col[2], j / len * .4 + .1), bx + Math.round(Math.sin(t / 40 + i + j / 6) * (1 + j / 12)), SAND + 2 - j, 2, 2); if (dark) px(g, t % 90 < 45 ? weed[1] : '#ff9ae9', bx + Math.round(Math.sin(t / 40 + i + len / 6) * (1 + len / 12)), SAND + 2 - len, 2, 2); }
  if (!dark) for (let i = 0; i < 34; i++) { const x = (i * 53 + Math.round(Math.sin(t / 60 + i) * 6)) % W, y = SAND + 4 + (i * 7) % 26; g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x, y, 3 + i % 3, 1); }  // light on the sand
  for (const p of tank.plants || []) { aqPlantDraw(g, p, tank.water, t); if (aq.drag?.d === p) { const [, , w, h] = AQ_PLANTS[p.k]; g.strokeStyle = '#ffd07a'; g.strokeRect(Math.round(p.x) - 1.5, AQB() - h * p.g - 1.5, w + 3, h * p.g + 3); } }
  for (const d of tank.decor) { AQ_DECOR[d.k][2](g, Math.round(d.x), t); if (aq.drag?.d === d) { g.strokeStyle = '#ffd07a'; g.strokeRect(Math.round(d.x) - 1.5, AQB() - AQ_DECOR[d.k][1] - 1.5, AQ_DECOR[d.k][0] + 3, AQ_DECOR[d.k][1] + 3); } }
  for (const f of aq.wallMode ? [] : aq.flakes) px(g, '#e8b070', f.x, f.y, 2, 2);
  for (const f of aq.wallMode ? [] : tank.fish) {
    const sw = aq.swim[f.k]; if (!sw) continue;
    const art = aqArt(f), sc = aqScale(f), w = art.width * sc, h = art.height * sc, bob = Math.sin((t + f.k * 40) / 20) * 1.5;
    g.save(); g.translate(Math.round(sw.x), Math.round(sw.y + bob)); if (sw.dir < 0) g.scale(-1, 1);
    g.drawImage(art, -Math.round(w / 2), -Math.round(h / 2), w, h); g.restore();
    if (f.v && t % 50 < 6) px(g, '#ffffff', sw.x + Math.sin(t) * w / 3, sw.y - h / 2, 1, 1);
    if (aq.sel === f.k) { g.strokeStyle = '#ffd07a'; g.strokeRect(Math.round(sw.x - w / 2) - 2.5, Math.round(sw.y - h / 2) - 2.5, w + 5, h + 5); }
  }
  for (const b of aq.wallMode ? [] : aq.bubbles) { const x = Math.round(b.x + Math.sin(b.y / 9) * 2), s = b.v > .9 ? 3 : 2; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x, Math.round(b.y), s, 1); g.fillRect(x, Math.round(b.y) + s, s, 1); g.fillRect(x - 1, Math.round(b.y) + 1, 1, s - 1); g.fillRect(x + s, Math.round(b.y) + 1, 1, s - 1); }
  for (const p of aq.parts) px(g, p.c, p.x, p.y, 2, 2);
  if (dark || tank.water === 'polaire') for (let i = 0; i < 40; i++) { const x = (i * 97 + t * .08 * (i % 3 + 1)) % W, y = TOP + (i * 53 + t * .12) % (GB - TOP); px(g, dark ? (i % 7 ? '#5a6a9a' : '#7fe0ee') : '#e8f4ff', x, y, 1, 1); }  // marine snow
  if (tank.dirt > 30) { g.fillStyle = `rgba(90,110,40,${(tank.dirt - 30) / 170})`; g.fillRect(0, 0, W, GB); }  // the water goes green
  if (tank.dirt > 55) { const r = seeded(7); for (let i = 0; i < (tank.dirt - 55) * 1.2; i++) { const side = i % 3, x = side === 0 ? GL + r() * 14 : side === 1 ? GR - r() * 14 : GL + r() * (GR - GL), y = side === 2 ? TOP + r() * 10 : TOP + r() * (GB - TOP); px(g, i % 2 ? '#4a6a2a' : '#6a8a3a', x, y, 2 + (i % 3), 2); } }  // algae on the glass
  for (let x = GL; x < GR; x += 4) px(g, mixc(col[0], '#ffffff', .35), x, TOP + (Math.sin(x / 20 + t / 30) > .3 ? 1 : 0), 4, 1);  // the water's surface
  g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.moveTo(GL + 40, TOP); g.lineTo(GL + 70, TOP); g.lineTo(GL + 10, GB); g.lineTo(GL - 20, GB); g.fill(); g.beginPath(); g.moveTo(GL + 84, TOP); g.lineTo(GL + 92, TOP); g.lineTo(GL + 32, GB); g.lineTo(GL + 24, GB); g.fill();  // reflections on the glass
  g.restore();
  if (aq.wallMode) return;
  { const {L, R, T, r} = aqGeo(tank), wall = '#1c1528', rimC = '#2e2440';  // the glass of a shaped tank
    if (L > GL) { px(g, wall, GL, TOP, L - GL, GB - TOP); px(g, rimC, L - 2, T, 2, GB - T); }
    if (R < GR) { px(g, wall, R, TOP, GR - R, GB - TOP); px(g, rimC, R, T, 2, GB - T); }
    if (T > TOP) { px(g, wall, GL, TOP, GR - GL, T - TOP); px(g, rimC, L, T - 2, R - L, 2); for (let x = L; x < R; x += 4) px(g, mixc(col[0], '#ffffff', .35), x, T + (Math.sin(x / 20 + t / 30) > .3 ? 1 : 0), 4, 1); }
    if (r) for (let y = 0; y < r; y++) { const w = Math.round(r - Math.sqrt(r * r - (r - y) ** 2)); for (const [x0, y0] of [[L, T + y], [R - w, T + y], [L, GB - 1 - y], [R - w, GB - 1 - y]]) px(g, wall, x0, y0, w, 1); px(g, rimC, L + w - 1, T + y, 1, 1); px(g, rimC, R - w, T + y, 1, 1); px(g, rimC, L + w - 1, GB - 1 - y, 1, 1); px(g, rimC, R - w, GB - 1 - y, 1, 1); } }
  // the frame, the room and its floor
  px(g, '#1c1528', 0, 0, GL, GB + 6); px(g, '#1c1528', GR, 0, W - GR, GB + 6); px(g, '#2e2440', GL - 2, TOP, 2, GB - TOP); px(g, '#2e2440', GR, TOP, 2, GB - TOP);
  px(g, '#100b1a', 0, GB + 6, W, H - GB - 6); px(g, '#2e2440', 0, GB, W, 6); px(g, '#4a3c60', 0, GB, W, 1); for (const x of [3, W - 5]) for (const y of [TOP + 4, GB - 6]) px(g, '#6a5a80', x, y, 2, 2);
  g.fillStyle = `rgba(${parseInt(col[0].substr(1, 2), 16)},${parseInt(col[0].substr(3, 2), 16)},${parseInt(col[0].substr(5, 2), 16)},.14)`; g.fillRect(0, GB + 6, W, 10);  // the tank's glow on the floor
  // the tip jar
  const s = aqSave(), jx = W - 34, jy = H - 24, full = Math.min(1, s.cash / (aqIncome(tank) * 6 + 60));
  px(g, '#9fd8e8', jx, jy, 20, 22); px(g, '#1a2a3a', jx + 1, jy + 1, 18, 20); px(g, '#ffd84a', jx + 1, jy + 21 - Math.round(full * 18), 18, Math.round(full * 18)); for (let i = 0; i < full * 12; i++) px(g, '#c0902a', jx + 2 + (i * 5) % 15, jy + 20 - (i * 7) % Math.max(1, Math.round(full * 18)), 2, 1);
  px(g, '#c8e8f0', jx + 2, jy + 2, 1, 14); px(g, '#6a5a80', jx - 1, jy - 2, 22, 3);
  g.font = '6px "Press Start 2P", monospace'; g.textAlign = 'center'; g.fillStyle = '#ffd84a'; g.fillText(String(Math.floor(s.cash)), jx + 10, jy - 5); g.textAlign = 'left';
  for (const c of aq.tips) { if (c.t > 780 && c.t % 10 < 5) continue; const w = [5, 3, 1, 3][Math.floor(t / 8) % 4]; px(g, '#c0902a', c.x - Math.floor(w / 2), c.y, w, 5); px(g, '#ffd84a', c.x - Math.floor(w / 2), c.y, w, 4); if (w > 2) px(g, '#ffffff', c.x - 1, c.y + 1, 1, 1); }
  const rim = mixc(col[0], '#ffffff', .45);
  for (const v of aq.vis) aqVisitor(g, v, rim);
  for (const p of aq.pops) { g.fillStyle = '#ffd84a'; g.font = '6px "Press Start 2P", monospace'; g.textAlign = 'center'; g.fillText(p.text, p.x, p.y - p.t / 3); g.textAlign = 'left'; }
  // the gauges, with their little icons, and the stars of the tank
  px(g, '#0b0716', 0, 0, W, TOP); px(g, '#2e2440', 0, TOP - 1, W, 1);
  const gauge = (x, icon, label, v, c) => { sprite(g, icon, x, 5, {'#': c, o: '#ffffff'}); g.fillStyle = '#d9c6ff'; g.font = '6px "Press Start 2P", monospace'; g.fillText(label, x + 10, 12); px(g, '#2a1f50', x + 46, 6, 52, 6); px(g, c, x + 47, 7, Math.round(v / 2), 4); px(g, '#ffffff', x + 47, 7, Math.round(v / 2), 1); };
  gauge(6, ['.o.o.', 'o#o#o', '.o#o.', 'o#o#o', '.o.o.', '.....'], 'FAIM', 100 - tank.food, tank.food > 30 ? '#8ee8a0' : '#ff4f6d');
  gauge(124, ['..#..', '.###.', '#####', '##o##', '.###.', '.....'], 'SALE', tank.dirt, tank.dirt < 40 ? '#8ee8a0' : '#ffc23a');
  gauge(242, ['##.##', '#####', '#####', '.###.', '..#..', '.....'], 'JOIE', aqHappy(tank), '#ff5ad9');
  const st = aqStars(tank); for (let i = 0; i < 3; i++) sprite(g, AQ_STAR, 368 + i * 10, 5, {'#': i < st ? '#ffd84a' : '#3a2f5a'});
  g.fillStyle = '#ffd07a'; g.textAlign = 'right'; g.fillText(tank.fish.length + '/' + AQA.sizes[tank.size][1], W - 6, 12); g.textAlign = 'left';
  if (!tank.fish.length) gameText(g, W, [['BASSIN VIDE', '#ffd07a', 9], ['AJOUTE DES POISSONS DU VIVIER', '#ffffff', 7]], 110);
}
/* ---------- page ---------- */
function aqBuy(price, then) { const f = fiSave(); if (f.money < price) return toast('Pas assez de pièces (' + f.money + ' / ' + price + ')', true); f.money -= price; then(); saveGames(); sfx('notify'); aqUi(); }
const aqFishName = f => aqFish(f).name + ' · ' + Math.round(f.cm) + ' cm' + (f.v ? ' · couleur rare' : '') + (f.born && !aqAdult(f) ? ' · jeune' : '');
function aqPut(f) {  // from the pool to the tank shown
  const s = aqSave(), tank = aqTank(); s.pool.splice(s.pool.indexOf(f), 1); tank.fish.push(f); fiSave().money += aqDexAdd(s, f); aqNews(); saveGames(); sfx('click'); aqUi();
}
function aqCash() { const s = aqSave(), n = Math.floor(s.cash); if (!n) return; s.cash -= n; s.earned += n; fiSave().money += n; saveGames(); sfx('notify'); toast('+' + n + ' pièces pour la Pêche'); aqUi(); }
function aqUi(soft) {
  setTimeout(aqTrophies);
  const s = aqSave(), tank = aqTank(), money = fiSave().money;
  $('aqInfo').textContent = money + ' pièces (Pêche) · caisse ' + Math.floor(s.cash) + ' · ' + s.tanks.reduce((a, t) => a + aqIncome(t), 0).toFixed(1).replace('.', ',') + ' pièces / h · ' + s.tanks.reduce((a, t) => a + t.fish.length, 0) + ' poissons · ' + Math.floor(s.visitors) + ' visiteurs';
  $('aqCash').textContent = 'ENCAISSER ' + Math.floor(s.cash);
  $('aqTank').replaceChildren(...s.tanks.map((t, i) => Object.assign(el('option', '', 'Bassin ' + (i + 1) + ' · ' + AQA.waters[t.water][0] + ' · ' + AQA.sizes[t.size][0] + ' (' + t.fish.length + '/' + AQA.sizes[t.size][1] + ')' + (aqStars(t) ? ' ' + '★'.repeat(aqStars(t)) : '')), {value: i})));
  $('aqTank').value = s.tanks.indexOf(tank);
  if (soft && aq.goalsSeen === aqGoalKey(s)) return;
  // the fish of this tank, and its decorations
  const inTank = el('div', 'sysCard px aqCol'); inTank.append(el('b', '', 'Dans ce bassin'));
  if (!tank.fish.length) inTank.append(el('small', 'hint', 'Aucun poisson.'));
  for (const f of tank.fish) {
    const row = el('div', 'aqRow' + (aq.sel === f.k ? ' on' : '')), img = el('img'); img.src = fiArtUrl(aqFish(f), false, 2); if (f.v) img.style.filter = 'hue-rotate(150deg) saturate(1.5) brightness(1.1)';
    const out = el('button', 'btn px', 'AU VIVIER'); out.onclick = () => { tank.fish.splice(tank.fish.indexOf(f), 1); s.pool.push(f); saveGames(); aqUi(); };
    row.append(img, el('span', '', aqFishName(f) + ' · ' + FI_RARITY[aqFish(f).rarity][0] + (AQ_DIETS[aqDiet(aqFish(f))] ? ' · ' + AQ_DIETS[aqDiet(aqFish(f))] : '')), out); row.onclick = e => { if (e.target !== out) { aq.sel = aq.sel === f.k ? null : f.k; aqUi(); } };
    inTank.append(row);
  }
  if (tank.decor.length) {
    inTank.append(el('small', 'hint', 'Décors : fais-les glisser sur le sable.'));
    tank.decor.forEach((d, i) => { const row = el('div', 'aqRow'), rm = el('button', 'btn px', 'RETIRER'); rm.onclick = () => { tank.decor.splice(i, 1); saveGames(); aqUi(); }; row.append(el('span', '', AQA.decor[d.k][0]), rm); inTank.append(row); });
  }
  // the holding pool: fish waiting for a tank
  const pool = el('div', 'sysCard px aqCol'); pool.append(el('b', '', 'Vivier · ' + s.pool.length + ' poisson' + (s.pool.length > 1 ? 's' : '')), el('small', 'hint', 'Chaque poisson pêché arrive ici vivant (60 au plus).'));
  for (const f of [...s.pool].reverse()) {
    const row = el('div', 'aqRow'), img = el('img'); img.src = fiArtUrl(aqFish(f), false, 2); if (f.v) img.style.filter = 'hue-rotate(150deg) saturate(1.5) brightness(1.1)';
    const fits = aqFits(f, tank), big = aqNeedSize(f) > tank.size, full = tank.fish.length >= AQA.sizes[tank.size][1];
    const put = el('button', 'btn px' + (fits && !big && !full ? ' main' : ''), 'METTRE'); put.disabled = !fits || big || full;
    put.title = !fits ? 'Pas la bonne eau : ' + [...aqFish(f).spots].map(p => FI_SPOTS[p].name).join(', ') : big ? 'Trop grand : il faut un bassin ' + AQA.sizes[aqNeedSize(f)][0].toLowerCase() : full ? 'Bassin plein' : 'Dans ce bassin';
    put.onclick = () => aqPut(f);
    const v = Math.max(1, Math.round(aqVal(f) / 2)), free = el('button', 'btn px', 'RELÂCHER +' + v);
    free.title = 'Le rendre à l\'eau : la moitié de sa valeur en pièces'; free.onclick = () => { s.pool.splice(s.pool.indexOf(f), 1); fiSave().money += v; saveGames(); aqUi(); };
    const gift = el('button', 'btn px', 'AU MUSÉE'); gift.disabled = !aqCanGive(s, f); gift.title = s.museum[f.id] ? 'Déjà au musée' : gift.disabled ? 'Sa salle du musée n\'est pas encore ouverte' : 'Le donner au musée'; gift.onclick = () => { if (aqGive(f)) { sfx('launch'); aqNews(); saveGames(); aqUi(); } };
    row.append(img, el('span', '', aqFishName(f) + (s.dex[f.id] ? '' : ' · nouveau !') + (s.museum[f.id] ? '' : ' · manque au musée')), put, free, gift); pool.append(row);
  }
  // the shop, paid with the Pêche coins
  const shop = el('div', 'sysCard px aqCol'); shop.append(el('b', '', 'Boutique · ' + money + ' pièces'));
  const item = (label, price, ok, then, why = '') => { const b = el('button', 'btn px aqShop', label + (ok ? ' · ' + price : why ? ' · ' + why : '')); b.disabled = !ok || money < price; b.onclick = () => aqBuy(price, then); shop.append(b); };
  const next = AQA.sizes[tank.size + 1], room = tank.decor.length < aqMaxDecor(tank);
  item(next ? 'Agrandir : ' + next[0].toLowerCase() + ' (' + next[1] + ' places)' : 'Bassin au plus grand', next?.[2], !!next, () => tank.size++);
  item('Filtre (l\'eau se salit 3 × moins vite)', 600, !tank.filter, () => tank.filter = true, 'installé');
  item('Distributeur (nourrit tout seul)', 1200, !tank.feeder, () => tank.feeder = true, 'installé');
  const place = k => () => { const [w] = AQ_DECOR[k]; const G = aqGeo(tank); tank.decor.push({k, x: G.L + 10 + Math.floor(Math.random() * Math.max(1, G.R - G.L - w - 20))}); };
  for (const [k, [name, price, w]] of Object.entries(AQA.decor)) {
    if (w && !s.unlock[k]) { const b = el('button', 'btn px aqShop', 'Décor : ' + name.toLowerCase() + ' · à gagner (carnet ' + AQA.waters[w][0].toLowerCase() + ' à moitié)'); b.disabled = true; shop.append(b); continue; }
    item('Décor : ' + name.toLowerCase(), price, room, place(k), aqMaxDecor(tank) + ' au plus');
  }
  const nb = el('div', 'row'), sel = el('select', 'f gSel'); sel.append(...Object.entries(AQA.waters).map(([k, [n]]) => Object.assign(el('option', '', n), {value: k})));
  const price = AQA.tankPrice(s.tanks.length), add = el('button', 'btn main px', 'NOUVEAU BASSIN · ' + price); add.disabled = money < price;
  add.onclick = () => aqBuy(price, () => { s.tanks.push(aqNewTank(sel.value)); aq.tank = s.tanks.length - 1; });
  nb.append(sel, add); shop.append(nb);
  // the challenges, three at a time
  const goals = el('div', 'sysCard px aqCol'); goals.append(el('b', '', 'Défis'));
  for (const [id, text, fn, reward] of aqGoals(s)) {
    const [cur, need] = fn(s), ok = cur >= need, row = el('div', 'aqGoal'), bar = el('div', 'aqBar'), fill = el('i');
    fill.style.width = Math.min(100, cur / need * 100) + '%'; bar.append(fill);
    const claim = el('button', 'btn px' + (ok ? ' main' : ''), ok ? 'RÉCLAMER +' + reward : Math.min(cur, need) + ' / ' + need); claim.disabled = !ok;
    claim.onclick = () => { s.goals[id] = 1; fiSave().money += reward; saveGames(); sfx('notify'); toast('Défi réussi : +' + reward + ' pièces'); aqUi(); };
    row.append(el('span', '', text), bar, claim); goals.append(row);
  }
  if (!aqGoals(s).length) goals.append(el('small', 'hint', 'Tous les défis sont réussis. Bravo !'));
  aq.goalsSeen = aqGoalKey(s);
  // the log of the species of this water
  const all = aqWaterFish(tank.water), have = aqDexOf(s, tank.water), dex = el('div', 'sysCard px aqCol');
  dex.append(el('b', '', 'Carnet · ' + AQA.waters[tank.water][0] + ' · ' + have + ' / ' + all.length), el('small', 'hint', 'Chaque espèce mise dans un bassin y entre. Au quart : des pièces ; à la moitié : un décor unique ; complet : un gros gain.'));
  const grid = el('div', 'aqDex');
  for (const f of all) { const img = el('img'); img.src = fiArtUrl(f, !s.dex[f.id], 2); img.title = s.dex[f.id] ? f.name + ' · ' + FI_RARITY[f.rarity][0] : '?'; grid.append(img); }
  dex.append(grid);
  $('aqPanel').replaceChildren(inTank, pool, aqTankCard(s, tank, money), shop, goals, dex, aqMuseumCard(s));
}
$('aqTank').onchange = () => { aq.tank = +$('aqTank').value; aq.sel = null; aq.vis = []; aq.tips = []; aqUi(); $('aqTank').blur(); };
$('aqFeed').onclick = () => { const t = aqTank(); t.food = 100; for (let i = 0; i < 16; i++) aq.flakes.push({x: aqGeo(t).L + 20 + Math.random() * (aqGeo(t).R - aqGeo(t).L - 40), y: AQA.TOP + 2 + Math.random() * 8, t: 0}); saveGames(); aqUi(true); $('aqFeed').blur(); };
$('aqClean').onclick = () => { aqTank().dirt = 0; sfx('click'); saveGames(); aqUi(true); $('aqClean').blur(); };
$('aqCash').onclick = () => { aqCash(); $('aqCash').blur(); };
{ const cv = $('aqCanvas'), at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * AQA.W / r.width, (e.clientY - r.top) * AQA.H / r.height]; };
  cv.onpointerdown = e => {
    const [x, y] = at(e), tank = aqTank();
    const c = aq.tips.find(c => Math.abs(c.x - x) < 9 && Math.abs(c.y + 2 - y) < 9);
    if (c) { const v = Math.max(1, Math.round(aqTip() * (c.m || 1))), s = aqSave(); aq.tips.splice(aq.tips.indexOf(c), 1); s.cash += v; s.tips++; aq.pops.push({x: c.x, y: c.y - 4, text: '+' + v, t: 0}); sfx('click'); aqUi(true); return; }
    if (x >= AQA.W - 36 && y >= AQA.H - 30) return aqCash();
    const d = [...tank.decor, ...(tank.plants || [])].reverse().find(d => { const [w, h] = AQ_DECOR[d.k] || [AQ_PLANTS[d.k][2], AQ_PLANTS[d.k][3] * d.g]; return x >= d.x - 2 && x <= d.x + w + 2 && y >= AQB() - h - 2 && y <= AQB() + 4; });
    if (d) { aq.drag = {d, dx: x - d.x, moved: false}; try { cv.setPointerCapture(e.pointerId); } catch {} return; }
    const f = tank.fish.find(f => { const sw = aq.swim[f.k]; return sw && Math.abs(sw.x - x) < 22 && Math.abs(sw.y - y) < 14; });
    aq.sel = f ? f.k : null; if (f) toast(aqFishName(f) + ' · ' + FI_RARITY[aqFish(f).rarity][0] + ' · de : ' + [...aqFish(f).spots].map(p => FI_SPOTS[p].name).join(', ')); aqUi();
  };
  cv.onpointermove = e => { if (!aq?.drag) return; const [x] = at(e), {d} = aq.drag; const G = aqGeo(aqTank()); d.x = Math.max(G.L, Math.min(G.R - (AQ_DECOR[d.k] ? AQ_DECOR[d.k][0] : AQ_PLANTS[d.k][2]), Math.round(x - aq.drag.dx))); aq.drag.moved = true; };
  cv.onpointerup = cv.onpointercancel = () => { if (aq?.drag?.moved) saveGames(); if (aq) aq.drag = null; };
  cv.__aq = {give: aqGive, rooms: aqRoomsOpen, wall: aqWallData, wallSave: aqWallSave, eco: aqEco, like: aqLike, appeal: aqAppeal, KINDS: AQ_KINDS, diet: aqDiet, clean: aqCleanK, museumHour: aqMuseumHour, ROOMS: AQ_ROOMS, roomFish: aqRoomFish, save: aqSave, fish: fiSave, FISH, newTank: aqNewTank, st: () => aq, step: aqStep, stars: aqStars, ui: aqUi, put: aqPut, spawn: aqSpawn, fit: aqFits, need: aqNeedSize};  // pour le test
}
{  // self-check: needs and stars of a tank, growth, young (of a rare colour when the dice say so), the log and its rewards
  const t = {water: 'douce', size: 0, filter: false, feeder: false, decor: [{k: 'plante', x: 20}, {k: 'rocher', x: 80}], food: 100, dirt: 0, fish: []}, eelId = FISH.findIndex(f => f.name === 'Anguille'), eel = {id: eelId, cm: 80, k: 0};
  console.assert(aqHappy(t) === 95 && aqFits(eel, t) && aqFits(eel, {water: 'mer'}) && !aqFits(eel, {water: 'abysses'}) && aqNeedSize(eel) === 1, 'aquarium needs');
  const sp = FISH.find(f => aqWaterFish('douce').includes(f) && f.max <= 60), s = {tanks: [t], cash: 0, visitors: 0, seq: 10, dex: {}, dexT: {}, unlock: {}, news: [], births: 0};
  t.fish.push({id: sp.id, cm: sp.max, k: 1}, {id: sp.id, cm: sp.max, k: 2}, {id: sp.id, cm: sp.min, k: 3});
  t.feeder = true; aqStep(s, 3, () => 0);
  const baby = t.fish.find(f => f.born), grown = t.fish.find(f => f.k === 3);
  console.assert(baby && baby.v === 1 && s.births >= 1 && s.dex[sp.id] && grown.cm > sp.min && s.cash > 0 && aqStars(t) >= 1, 'aquarium: growth, young, log', baby, grown, s);
  const all = aqWaterFish('mer'), s2 = {dex: {}, dexT: {}, unlock: {}, news: []}; for (const f of all) aqDexAdd(s2, {id: f.id});
  console.assert(s2.dexT.mer === 3 && s2.unlock.phare, 'aquarium: log rewards', s2.dexT);
  const pike = FISH.find(f => f.name === 'Brochet'), roach = FISH.find(f => f.name === 'Gardon'), t3 = {water: 'douce', size: 2, filter: true, feeder: false, decor: [], food: 0, dirt: 0, fish: [{id: pike.id, cm: 110, k: 1}, {id: roach.id, cm: 15, k: 2}], plants: [{k: 'herbe', x: 50, g: .2}]};
  const s3 = {tanks: [t3], cash: 0, visitors: 0, seq: 5, dex: {}, dexT: {}, unlock: {}, news: [], births: 0, museum: {}}; aqStep(s3, 1, () => 0);
  const eco = t3.fish.length === 1 && t3.plants[0].g > .2 && aqCleanK(t3) < 1 && aqDiet(pike) === 'pred' && aqDiet(roach) === 'herb' && s3.eaten === 1;
  console.assert(eco, 'aquarium: the hungry pike eats, the plant grows and cleans', t3, s3);
  view.dataset.selfcheck = eco && baby && s.dex[sp.id] && s2.unlock.phare && aqHappy({...t, fish: [], decor: t.decor, food: 100, dirt: 0}) === 95 ? 'ok' : 'aquarium : vérification ratée';
}
  // ---- fin ----
  // les trophées, tirés des statistiques et des records gardés (aussi à l'ouverture : ce qui a été fait avant compte)
  function aqTrophies() {
    if (!games) return;
    const s = aqSave(), dex = Object.keys(s.dex || {}).length, vis = Math.floor(s.visitors), mus = Object.keys(s.museum || {}).length, fish = s.tanks.reduce((a, t) => a + t.fish.length, 0);
    const goals = AQ_GOALS.filter(([id]) => s.goals?.[id]).length, stars = Math.max(0, ...s.tanks.map(aqStars)), waters = new Set(s.tanks.map(t => t.water)).size;
    const sig = [dex, vis, mus, fish, goals, stars, waters, s.births].join(); if (sig === aqTrophies.sig) return; aqTrophies.sig = sig;
    trophyRecord('especes', dex || null); trophyRecord('visiteurs', vis || null);
    if (fish >= 1) trophy('premier'); if (stars >= 3) trophy('etoile3'); if (s.births >= 1) trophy('naissance'); if (waters >= 5) trophy('eaux');
    if (vis >= 1000) trophy('visiteurs'); if (mus >= 10) trophy('musee'); if (s.museum && aqRoomsOpen(s).includes(5)) trophy('legendes'); if (goals >= AQ_GOALS.length) trophy('defis');
  }
  ctx.onOpen(() => { (async () => { const d = await gf.read('games').catch(() => null); if (d) { for (const k of Object.keys(games)) delete games[k]; Object.assign(games, { best: {}, ...d }); } aqOpen(); })(); });
}
