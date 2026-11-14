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
    ev('pointerdown', d.x + 4, 205); ev('pointermove', 240, 205); ev('pointerup', 240, 205); return [x0, d.x]; })()`);
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
  const err = await pj(`document.getElementById('aqCanvas').width`); if (err !== 480) throw new Error('taille du jeu');
  return 'carnet ' + dex0 + ' → ' + dex1 + ' · décor ' + moved.join(' → ') + ' · pourboire +' + tip[1] + ' · ' + JSON.stringify(life) + ' · défi +' + claimed + ' · ' + seeded;
};
