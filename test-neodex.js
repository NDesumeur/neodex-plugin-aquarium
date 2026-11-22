// lancé par le test « local » de NeoDex : vérification interne, poissons mis au bassin (carnet), décors achetés et déplacés, visiteurs et pourboire,
// deux jours qui passent (croissance, naissance), un défi réclamé, puis une capture de trois bassins (eau douce, tropical, abysses)
module.exports = async ({ pj, sleep }) => {
  const H = `document.getElementById('aqCanvas').__aq`;
  const shot = async name => { const dir = process.env.NEO_SHOTS; if (!dir) return; const d = await pj(`document.getElementById('aqCanvas').toDataURL()`); require('fs').writeFileSync(require('path').join(dir, 'aquarium-' + name + '.png'), Buffer.from(d.split(',')[1], 'base64')); };
  const sc = await pj(`document.querySelector('[data-selfcheck]')?.dataset.selfcheck`); if (sc !== 'ok') throw new Error('vérification interne : ' + sc);
  await sleep(500);
  // des poissons d'eau douce de moins de 60 cm : deux de la même espèce, et trois autres
  const seeded = await pj(`(() => { const h = ${H}, s = h.save(), t = s.tanks[0], sp = h.FISH.filter(f => h.fit({id: f.id}, t) && f.max <= 60).sort((a, b) => b.rarity - a.rarity);
    s.pool.length = 0; t.fish.length = 0; h.fish().money = 1e6;
    for (const f of [sp[0], sp[0], sp[1], sp[2], sp[3]]) s.pool.push({id: f.id, cm: f.max, k: s.seq++}); h.ui(); return sp.slice(0, 4).map(f => f.name).join(', '); })()`);
  const dex0 = await pj(`Object.keys(${H}.save().dex).length`);
  for (let i = 0; i < 5; i++) { await pj(`[...document.querySelectorAll('#aqPanel button')].find(b => b.textContent === 'METTRE' && !b.disabled).click(), 0`); await sleep(80); }
  const n = await pj(`${H}.save().tanks[0].fish.length`), dex1 = await pj(`Object.keys(${H}.save().dex).length`);
  if (n !== 5 || dex1 < dex0 + 1) throw new Error('mise au bassin : ' + n + ' poissons, carnet ' + dex0 + ' → ' + dex1);
  for (const d of ['plante', 'rocher', 'corail']) { await pj(`[...document.querySelectorAll('#aqPanel button')].find(b => b.textContent.startsWith('Décor : ${d}')).click(), 0`); await sleep(80); }
  await pj(`document.getElementById('aqFeed').click(), document.getElementById('aqClean').click(), 0`);
  // faire glisser le premier décor
  const moved = await pj(`(async () => { const cv = document.getElementById('aqCanvas'), d = ${H}.save().tanks[0].decor[0], r = cv.getBoundingClientRect(), k = r.width / 480, x0 = d.x;
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {clientX: r.left + x * k, clientY: r.top + y * k, pointerId: 1, bubbles: true}));
    const to = x0 < 240 ? 330 : 150; ev('pointerdown', d.x + 4, 205); ev('pointermove', to, 205); ev('pointerup', to, 205); return [x0, d.x]; })()`);
  if (Math.abs(moved[1] - moved[0]) < 20) throw new Error('le décor ne bouge pas : ' + moved);
  // des visiteurs, et un pourboire ramassé
  await pj(`(() => { const h = ${H}; for (let i = 0; i < 4; i++) h.spawn(); h.st().tips.push({x: 200, y: 264, vy: 0, t: 0}); })()`);
  const tip = await pj(`(() => { const cv = document.getElementById('aqCanvas'), r = cv.getBoundingClientRect(), k = r.width / 480, s = ${H}.save(), c0 = s.cash;
    cv.dispatchEvent(new PointerEvent('pointerdown', {clientX: r.left + 200 * k, clientY: r.top + 266 * k, pointerId: 1, bubbles: true})); cv.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, bubbles: true})); return [s.tips, s.cash - c0]; })()`);
  if (tip[0] < 1 || !(tip[1] > 0)) throw new Error('pourboire : ' + tip);
  // deux jours passent, les dés toujours favorables : les petits grandissent, un petit naît
  const life = await pj(`(() => { const h = ${H}, s = h.save(), t = s.tanks[0], pair = t.fish.find(f => t.fish.filter(g => g.id === f.id).length === 2).id, young = t.fish.find(f => f.id !== pair);
    t.fish.forEach(f => { if (f.id !== pair) f.cm = h.FISH[f.id].min; }); const c1 = young.cm;
    t.feeder = true; t.filter = true; h.step(s, 48, () => 0); h.ui(); return {births: s.births, grew: young.cm > c1, stars: h.stars(t), n: t.fish.length}; })()`);
  if (!life.births || !life.grew) throw new Error('vie des poissons : ' + JSON.stringify(life));
  const claimed = await pj(`(() => { const s = ${H}.save(), b = [...document.querySelectorAll('#aqPanel button')].find(b => b.textContent.startsWith('RÉCLAMER')); if (!b) return -1; const m = ${H}.fish().money; b.click(); return ${H}.fish().money - m; })()`);
  if (!(claimed > 0)) throw new Error('aucun défi à réclamer');
  await sleep(2500); await shot('douce');
  // deux autres bassins pour les captures
  for (const w of ['tropical', 'abysses']) {
    await pj(`(() => { const h = ${H}, s = h.save(), t = h.newTank('${w}'); t.size = 2; t.decor = [{k: '${w === 'tropical' ? 'tiki' : 'cheminee'}', x: 60}, {k: 'corail', x: 200}, {k: '${w === 'tropical' ? 'arche' : 'epave'}', x: 320}];
      const sp = h.FISH.filter(f => h.fit({id: f.id}, t)); for (let i = 0; i < 10; i++) { const f = sp[i * 7 % sp.length]; t.fish.push({id: f.id, cm: (f.min + f.max) / 2, k: s.seq++, v: i === 3 ? 1 : 0}); }
      s.tanks.push(t); h.st().tank = s.tanks.length - 1; h.st().vis = []; h.ui(); for (let i = 0; i < 4; i++) h.spawn(); })()`);
    await sleep(3000); await shot(w);
  }
  // 1.4 : forme du bassin et plantes vivantes, écosystème, goûts des visiteurs, musée salle par salle, fond d'écran du thème
  const click = async start => { const ok = await pj(`(() => { const b = [...document.querySelectorAll('#aqPanel button')].find(b => b.textContent.startsWith(${JSON.stringify(start)}) && !b.disabled); if (b) b.click(); return !!b; })()`); if (!ok) throw new Error('bouton introuvable : ' + start); await sleep(120); };
  await pj(`(() => { const h = ${H}; h.st().tank = 0; h.ui(); return 0; })()`); await sleep(200);
  await click('Forme : panoramique'); await click('Planter : grande algue'); await click('Planter : fougère'); await click('Planter : herbe');
  const lay = await pj(`(() => { const h = ${H}, t = h.save().tanks[0], c0 = h.clean(t); t.plants.forEach(p => p.g = 1); return {shape: t.shape, plants: t.plants.length, before: c0, after: h.clean(t), inside: t.decor.every(d => d.x >= 8 && d.x <= 472)}; })()`);
  if (lay.shape !== 'panorama' || lay.plants !== 3 || !(lay.after < lay.before) || !lay.inside) throw new Error('aménagement : ' + JSON.stringify(lay));
  await sleep(1500); await shot('panorama');
  await click('Forme : arrondi'); await sleep(1200); await shot('arrondi');
  // tastes: one visitor of each kind stops in front of the tank, then says what it thinks
  const vis = await pj(`(async () => { const h = ${H}, st = h.st(), s = h.save(); st.vis = []; for (let i = 0; i < 12; i++) h.spawn(); const kinds = new Set(st.vis.map(v => v.kind)); const n0 = Object.values(s.likes).reduce((a, [, n]) => a + n, 0);
    st.vis.forEach(v => { v.x = v.tx; v.seen = true; v.stop = 52; }); await new Promise(r => setTimeout(r, 600)); const n1 = Object.values(s.likes).reduce((a, [, n]) => a + n, 0);
    return {kinds: kinds.size, judged: n1 - n0, appeal: +h.appeal(s.tanks[0]).toFixed(2), sad: st.vis.some(v => v.sad), happy: st.vis.some(v => v.heart)}; })()`);
  if (vis.kinds < 3 || vis.judged < 10) throw new Error('visiteurs : ' + JSON.stringify(vis));
  // the museum: gifts from the pool, the next room opens after 8 gifts
  const mus = await pj(`(() => { const h = ${H}, s = h.save(), room = h.roomFish('douce').slice(0, 9); s.pool.length = 0; for (const f of room) s.pool.push({id: f.id, cm: f.max, k: s.seq++}); s.pool.push({id: room[0].id, cm: 20, k: s.seq++}); h.ui(); return {open: h.rooms(s).join(), n: Object.keys(s.museum).length}; })()`);
  for (let i = 0; i < 9; i++) await click('DONNER');
  const mus2 = await pj(`(() => { const h = ${H}, s = h.save(); return {open: h.rooms(s).join(), n: Object.keys(s.museum).length, left: s.pool.length, hour: +h.museumHour(s).toFixed(1), give: [...document.querySelectorAll('.aqGive button')].length}; })()`);
  if (mus.open !== '0' || mus2.n !== 9 || mus2.open !== '0,1' || mus2.left !== 1 || mus2.give !== 0 || !(mus2.hour > 0)) throw new Error('musée : ' + JSON.stringify([mus, mus2]));
  if (process.env.NEO_SHOTS) { const d = await pj(`document.querySelector('.aqMuseum').toDataURL()`); require('fs').writeFileSync(require('path').join(process.env.NEO_SHOTS, 'aquarium-musee.png'), Buffer.from(d.split(',')[1], 'base64')); }
  // the wallpaper: the scene of the tank and its fish apart, written on this device only (local-fond)
  const wall = await pj(`(async () => { const h = ${H}, s = h.save(); s.wall = s.tanks.length - 2; const d = h.wall(); await h.wallSave(); return {keys: Object.keys(d), sizes: Object.values(d).map(v => v.length), d}; })()`);
  if (!wall.keys.includes('aq-scene') || wall.keys.filter(k => k.startsWith('aq-f')).length < 4 || wall.sizes.some(n => !(n > 100 && n < 1.5e6))) throw new Error('fond d\'écran : ' + JSON.stringify(wall.keys) + ' ' + wall.sizes);
  if (process.env.NEO_SHOTS) for (const [k, v] of Object.entries(wall.d)) require('fs').writeFileSync(require('path').join(process.env.NEO_SHOTS, 'wall-' + k + '.png'), Buffer.from(v.split(',')[1], 'base64'));
  const errs = await pj(`(window.__e || []).join(' | ')`); if (errs) throw new Error('erreur : ' + errs);
  const err = await pj(`document.getElementById('aqCanvas').width`); if (err !== 480) throw new Error('taille du jeu');
  { // la zone de jeu tient dans la fenêtre, quelle que soit sa taille
    const L = await pj(`(() => { const c = [...document.querySelectorAll('.gameBox canvas')].filter(c => c.offsetWidth).sort((a, b) => b.offsetWidth - a.offsetWidth)[0], r = c.getBoundingClientRect(); let s = 0; for (let e = c.parentElement; e; e = e.parentElement) s += e.scrollTop; return { top: Math.round(r.top + s), bottom: Math.round(r.bottom + s), h: Math.round(r.height), w: Math.round(r.width), wh: innerHeight, ww: innerWidth, sw: document.documentElement.scrollWidth }; })()`);
    if (process.env.NEO_FIT_LOG) console.log('FIT', JSON.stringify(L));
    if (L.bottom > L.wh + 1 || L.sw > L.ww + 1) throw new Error('la zone de jeu dépasse la fenêtre : ' + JSON.stringify(L));
  }
  return 'carnet ' + dex0 + ' → ' + dex1 + ' · décor ' + moved.join(' → ') + ' · pourboire +' + tip[1] + ' · ' + JSON.stringify(life) + ' · défi +' + claimed + ' · ' + seeded + ' · ' + JSON.stringify(lay) + ' · visiteurs ' + JSON.stringify(vis) + ' · musée ' + JSON.stringify(mus2) + ' · fond ' + wall.keys.length + ' images, ' + Math.round(wall.sizes.reduce((a, b) => a + b, 0) / 1024) + ' Ko';
};
