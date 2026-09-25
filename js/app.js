/* CourtFlair: geometry, scoring, simulation, rendering and input. Reads RULES, STYLES and the note tables from rules.js. */

/* ============ geometry (feet; opponent baseline y=0, net y=39, your baseline y=78) ============ */
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const rand = (a,b) => a + Math.random()*(b-a);
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
const colOf = x => x < 13.5 ? 'L' : x > 22.5 ? 'R' : 'C';
const depthOf = t => t.y <= 9 ? 'deep' : t.y <= 18 ? 'mid' : 'short';
const bandOf = y => y <= 52 ? 'net' : y <= 71 ? 'nml' : y <= 81 ? 'base' : 'deep';
function margin(t){
  let m = Math.min(t.x - 4.5, 31.5 - t.x, 39 - t.y);
  if (t.y <= 9) m = Math.min(m, t.y);
  return m;
}
// Bisector of the opponent's widest possible replies (to the corners and the service-line corners)
function idealX(from, y, mine = true){
  const ys = mine ? [60, 78] : [18, 0];
  const a = [];
  for (const cx of [4.5, 31.5]) for (const cy of ys) a.push(Math.atan2(cx - from.x, Math.abs(cy - from.y)));
  const mid = (Math.min(...a) + Math.max(...a)) / 2;
  return clamp(from.x + Math.tan(mid) * Math.abs(y - from.y), 2, 34);
}
// The opponent's widest replies from a point, as a cone ending at y
function coneFor(from, y){
  const a = [];
  for (const cx of [4.5, 31.5]) for (const cy of [60, 78]) a.push(Math.atan2(cx - from.x, Math.abs(cy - from.y)));
  const d = Math.abs(y - from.y);
  return [from, { x: from.x + Math.tan(Math.min(...a))*d, y }, { x: from.x + Math.tan(Math.max(...a))*d, y }];
}

/* Target zones on their side. You aim at a zone; the ball is aimed at its aim point. */
const COLS = [
  { id:'L1', x0:4.5,  x1:7.5,  aim:6.1,  name:'their forehand sideline', line:true },
  { id:'L',  x0:7.5,  x1:13.5, aim:10.3, name:'their forehand side' },
  { id:'C',  x0:13.5, x1:22.5, aim:18,   name:'the middle' },
  { id:'R',  x0:22.5, x1:28.5, aim:25.7, name:'their backhand side' },
  { id:'R1', x0:28.5, x1:31.5, aim:29.9, name:'their backhand sideline', line:true }
];
const ROWS = [
  { id:'deep',  y0:0,  y1:9,  aim:4.5,  name:'deep' },
  { id:'mid',   y0:9,  y1:18, aim:13.5, name:'mid-court' },
  { id:'short', y0:18, y1:39, aim:29,   name:'short' }
];
function zoneAt(x, y){
  const cx = clamp(x, 4.5, 31.49), cy = clamp(y, 0, 38.99);
  const col = COLS.find(c => cx >= c.x0 && cx < c.x1), row = ROWS.find(r => cy >= r.y0 && cy < r.y1);
  return { id: row.id + '-' + col.id, col, row, aim: { x: col.aim, y: row.aim } };
}
const zoneName = z => `${z.row.name} · ${z.col.name}`;

/* Broadcast camera: a true perspective of the ground plane, seen from high behind your baseline */
const CAM = { Yc: 324, F: 107670, hz: -324.3, G: 474, cx: 50 };
function proj(x, y, h = 0){
  const z = CAM.Yc - y, s = CAM.G / z;
  return { X: CAM.cx + (x - 18)*s, Y: CAM.hz + CAM.F / z - h*s*0.8, s };
}
function unproj(X, Y){
  const z = CAM.F / Math.max(1, Y - CAM.hz);
  return { x: 18 + (X - CAM.cx)*z/CAM.G, y: CAM.Yc - z };
}

/* ============ scoring ============ */
function classify(dec, ctx){
  const d = depthOf(dec.target), c = colOf(dec.target.x), t = dec.type, k = ctx.sit.kind;
  if (k === 'volley') return t === 'loop' ? 'lob_volley' : (d === 'short' && t === 'slice') ? 'drop_volley' : 'volley';
  if (ctx.oppAtNet){
    if (t === 'loop' && d !== 'short') return 'lob';
    if (t === 'slice' && d === 'short') return 'dip';
    return Math.abs(dec.target.x - ctx.opp.x) >= 8 ? 'pass' : 'into_net_player';
  }
  if (d === 'short'){
    if (t === 'slice') return 'drop';
    return c === 'C' ? 'short_middle' : 'angle';
  }
  if (bandOf(dec.rec.y) === 'net') return 'approach';
  if (t === 'loop') return 'loop_deep';
  if (t === 'slice') return 'slice_deep';
  return (c !== 'C' && margin(dec.target) < 4) ? 'drive_line' : 'drive_deep';
}

function scoreShot(intent, ctx){
  const k = ctx.sit.kind;
  const s = RULES.shotForSituation[k][intent] ?? 50;
  const note = FUND_NOTES[k + '.' + intent] || FUND_NOTES['*.' + intent] ||
    (s >= 75 ? 'A sound shot for this ball.' : s >= 50 ? 'Playable, but not the best percentage for this ball.' : 'The wrong tool for this ball.');
  return { score: s, note };
}

function scoreTarget(dec, intent, ctx){
  const t = dec.target, o = ctx.opp, d = depthOf(t), c = colOf(t.x), m = margin(t);
  const dx = Math.abs(t.x - o.x);
  let s, note;
  if (ctx.oppAtNet){
    if (intent === 'lob'){ s = d === 'deep' ? 92 : d === 'mid' ? 55 : 30; note = d === 'deep' ? 'Deep over their head.' : 'A lob that lands short gets smashed.'; }
    else if (intent === 'dip'){ s = 80; note = 'Low at their feet.'; }
    else { s = clamp(35 + dx*5, 10, 95); note = dx >= 10 ? 'Passes well wide of them.' : 'Within reach of the net player.'; }
  } else if (ctx.sit.kind === 'volley'){
    s = clamp(40 + dx*4 + (d === 'short' && o.y < 10 ? 15 : 0), 15, 95);
    note = dx >= 10 ? 'Volleyed into space.' : 'Volleyed back toward them.';
  } else {
    const depthS = d === 'deep' ? 90 : d === 'mid' ? 55 : (['drop','angle'].includes(intent) ? (o.y < 6 ? 80 : 55) : 25);
    const latS = clamp(45 + dx*3.5, 30, 100);
    const centerDeep = d === 'deep' && c === 'C' && ctx.sit.kind !== 'attack';
    s = 0.6*depthS + 0.4*(centerDeep ? Math.max(latS, 85) : latS);
    if (centerDeep) note = 'Deep through the middle takes away their angles.';
    else if (d === 'mid') note = 'Lands mid-court: a comfortable ball for them to step into.';
    else if (d === 'short' && depthS < 50) note = 'Short and within their reach: they can attack it.';
    else if (dx < 5) note = 'Right back to where they are standing.';
    else if (dx >= 12) note = `Makes them run about ${Math.round(dx)} ft.`;
    else note = 'Moves them off their spot.';
  }
  if (m < 2 && !ctx.oppAtNet){
    if (ctx.sit.kind !== 'attack') s -= 8;
    note += ' Sideline target: more pressure, less margin.';
  }
  return { score: clamp(Math.round(s), 0, 100), note };
}

function scoreRecovery(dec, intent, ctx){
  const r = dec.rec, b = bandOf(r.y), k = ctx.sit.kind;
  let bs, bn;
  if (b === 'nml'){ bs = 20; bn = "You stopped in no-man's land, so deep balls will land at your feet."; }
  else if (b === 'net'){
    if (['approach','volley','drop_volley'].includes(intent) || (intent === 'drop' && k === 'attack')){ bs = 95; bn = 'Closing the net behind the shot.'; }
    else if (k === 'defend'){ bs = 25; bn = 'Coming in behind a defensive ball invites the pass.'; }
    else if (intent === 'loop_deep'){ bs = 55; bn = 'Moonball-and-come-in can surprise them, but the high ball gives them time.'; }
    else if (intent === 'lob'){ bs = 40; bn = 'Following a lob in only works when it is deep and over the backhand.'; }
    else { bs = 45; bn = 'Rushing the net after that shot leaves you exposed.'; }
  } else if (b === 'deep'){
    if (k === 'attack'){ bs = 55; bn = 'Backing up after an attack ball hands the time back.'; }
    else { bs = 85; bn = 'Deep court position buys time.'; }
  } else {
    if (k === 'volley'){ bs = 60; bn = 'Backing off the net after a volley gives up your position.'; }
    else { bs = 90; bn = 'Recovered to the baseline.'; }
  }
  const ideal = idealX(dec.target, r.y);
  const err = Math.abs(r.x - ideal);
  const ls = clamp(Math.round(100 - Math.max(0, err - 2)*11), 0, 100);
  const dir = r.x > ideal ? 'left' : 'right';
  const ln = err <= 3 ? 'Centered on the middle of their possible angles.'
    : `About ${Math.round(err)} ft off: the middle of their angles is further to your ${dir}.`;
  return { score: Math.round(bs*0.5 + ls*0.5), note: bs <= ls ? bn : ln, ideal: { x: ideal, y: r.y } };
}

function scoreStyle(style, dec, intent, ctx){
  const key = ctx.sit.kind + '.' + intent;
  const is = RULES.styleSituation[style][key] ?? RULES.styleIntent[style][intent] ?? 60;
  const band = bandOf(dec.rec.y);
  const bsc = RULES.styleBand[style][band];
  const score = Math.round(is*0.75 + bsc*0.25);
  const AL = aLower(style);
  let note = STYLE_NOTES[style][key] || STYLE_NOTES[style][intent] ||
    (is >= 75 ? `A shot ${AL} would choose.` : is <= 50 ? `Not how ${AL} builds points.` : `Playable for ${AL}, but not a signature shot.`);
  if (bsc < 60 && band !== 'nml' && STYLE_NOTES[style]['band.' + band]) note += ' ' + STYLE_NOTES[style]['band.' + band];
  return { score, note };
}

function scoreMatchup(opp, dec, intent){
  const c = colOf(dec.target.x), d = depthOf(dec.target);
  const keys = [];
  if (intent === 'loop_deep' && c === 'R' && d === 'deep') keys.push('loop_deep_bh');
  if (intent === 'drive_deep' && c === 'C') keys.push('drive_deep_center');
  keys.push(intent);
  for (const k of keys){
    if (RULES.matchup[opp][k] != null) return { score: RULES.matchup[opp][k], note: MATCH_NOTES[opp][k] || '' , key:k };
  }
  return { score: RULES.matchupDefault, note: `No special edge against ${aLower(opp)}.`, key:intent };
}

function evaluate(dec, ctx, style){
  const intent = classify(dec, ctx);
  const sh = scoreShot(intent, ctx), tg = scoreTarget(dec, intent, ctx), rc = scoreRecovery(dec, intent, ctx);
  const fm = RULES.fundamentalsMix;
  const fScore = Math.round(sh.score*fm.shot + tg.score*fm.target + rc.score*fm.recovery);
  const parts = [sh, tg, rc];
  const worst = parts.reduce((a,b) => b.score < a.score ? b : a);
  const bestp = parts.reduce((a,b) => b.score > a.score ? b : a);
  const F = { score: fScore, shot: sh, target: tg, recovery: rc, note: worst.score < 70 ? worst.note : bestp.note };
  const styleAll = {};
  for (const s of Object.keys(STYLES)) styleAll[s] = scoreStyle(s, dec, intent, ctx);
  const Sx = styleAll[style];
  const M = scoreMatchup(ctx.oppStyle, dec, intent);
  const W = RULES.weights;
  const total = Math.round(F.score*W.fundamentals + Sx.score*W.style + M.score*W.matchup);
  return { intent, total, F, S: Sx, M, styleAll, idealRec: rc.ideal };
}

function findBest(ctx, style){
  let best = null;
  for (const c of COLS) for (const r of ROWS) for (const type of ['drive','loop','slice']) for (const ry of [46, 78, 84]){
    const target = { x: c.aim, y: r.aim };
    const dec = { target, type, rec: { x: idealX(target, ry), y: ry } };
    const ev = evaluate(dec, ctx, style);
    if (!best || ev.total > best.ev.total) best = { dec, ev };
  }
  return best;
}

function typeLabel(type, kind){
  if (kind === 'serve') return cap(type);
  if (kind === 'volley') return { drive:'Punch volley', loop:'Lob volley', slice:'Touch volley' }[type];
  return { drive:'Drive', loop:'Heavy loop', slice:'Slice' }[type];
}
function describe(dec, kind){
  const z = zoneAt(dec.target.x, dec.target.y);
  const band = { net:'close the net', nml:"stop in no-man's land", base:'recover to the baseline', deep:'recover behind the baseline' }[bandOf(dec.rec.y)];
  return `${typeLabel(dec.type, kind)} ${z.row.name} to ${z.col.name}, then ${band}`;
}
const tone = s => s >= 75 ? 'g' : s >= 50 ? 'm' : 'b';

/* ============ match state ============ */
const S = {
  phase: 'setup', style: 'agg', oppChoice: 'random', oppStyle: 'moon',
  score: { me: 0, opp: 0 }, point: 1, rally: 0,
  me: { x: 18, y: 79 }, opp: { x: 18, y: 0.5 }, sit: null,
  mode: 'serve', serve: null,
  sel: { target: null, zone: null, place: null, type: null, rec: null }, hoverZone: null,
  ball: null, swing: { me: -1e9, opp: -1e9 }, moving: { me: false, opp: false }, anim: false,
  decisions: [], last: null, pointMsg: null, busy: false
};
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ctxNow(){ return { sit: S.sit, me: { ...S.me }, opp: { ...S.opp }, oppAtNet: S.opp.y > 20, oppStyle: S.oppStyle, serve: S.serve ? { ...S.serve } : null }; }

// Where their ball meets you, given where you recovered to (me)
function computeIncoming(land, q, height, from, me){
  const wasNet = me.y <= 52;
  const d = Math.abs(land.x - me.x);
  let kind, contact, flags = {};
  if (height === 'lob' && wasNet){
    kind = 'defend'; flags.lobbed = true;
    contact = { x: land.x, y: clamp(land.y + 5, 74, 86) };
  } else if (wasNet){
    kind = 'volley';
    const tt = (me.y - from.y) / Math.max(1, land.y - from.y);
    contact = { x: clamp(from.x + (land.x - from.x)*tt, 1, 35), y: me.y };
  } else {
    const atFeet = me.y > 52 && me.y <= 71 && land.y > me.y - 2;
    contact = { x: land.x, y: clamp(land.y + (land.y < 62 ? 3 : 6), 48, 86) };
    if (land.y < 62 && q < 0.55) kind = 'attack';
    else if (d > 12 || (q > 0.72 && d > 7) || atFeet) kind = 'defend';
    else kind = 'neutral';
    flags.atFeet = atFeet && kind === 'defend';
    flags.stretched = d > 12;
  }
  return { sit: { kind, height, land, contact, ...flags }, contact };
}

const restBall = () => ({ x: S.me.x + 1, y: S.me.y - .4, h: 3.2 });

const emptySel = () => ({ target: null, zone: null, place: null, type: null, rec: null });

function beginPoint(){
  S.rally = 0; S.sel = emptySel(); S.hoverZone = null;
  S.pointMsg = null; S.lastAim = null; S.replyDesc = null;
  if (S.mode === 'rally'){
    S.serve = null;
    // rally ball: you start in the middle of your baseline and the first ball comes to you
    S.opp = { x: 18, y: S.oppStyle === 'moon' ? -4.5 : 0.5 };
    const land = { x: rand(15, 21), y: rand(70, 75) };
    const inc = computeIncoming(land, 0.45, S.oppStyle === 'moon' ? 'high' : 'normal', S.opp, { x: 18, y: 79.5 });
    S.sit = { ...inc.sit, kind: 'neutral', contact: { x: land.x, y: 79.5 }, stretched: false };
    S.me = { ...S.sit.contact }; S.ball = restBall();
    return;
  }
  // tiebreak rotation: you serve point 1, then each player serves two in a row
  const n = S.score.me + S.score.opp;
  const server = Math.floor((n + 1)/2) % 2 === 0 ? 'me' : 'opp';
  const side = n % 2 === 0 ? 'deuce' : 'ad';
  S.serve = { server, side, no: 1 };
  if (server === 'me') setupMyServe(); else runOppServe();
}

function errProb(dec, intent, ctx){
  const k = ctx.sit.kind, m = margin(dec.target);
  let e = { drive: .06, loop: .03, slice: .04 }[dec.type];
  if (m < 2) e += .08; else if (m < 3) e += .04;
  if (k === 'defend') e *= dec.type === 'drive' ? 3 : dec.type === 'slice' ? 1.5 : 1.2;
  if (k === 'attack') e *= .7;
  if (k === 'volley') e = .05 + (m < 1.5 ? .12 : 0) + (dec.type === 'loop' ? .12 : 0);
  if (depthOf(dec.target) === 'short' && ctx.sit.contact.y > 72) e += dec.type === 'drive' ? .08 : .06;
  return clamp(e, .01, .6);
}

function pressure(dec, ctx){
  const t = dec.target, o = ctx.opp, d = depthOf(t);
  const run = Math.min(Math.hypot(t.x - o.x, (t.y - o.y)*0.6) / 20, 1);
  let p = .08 + .45*run;
  if (d === 'deep' && o.y < 20) p += .15;
  if (d === 'short' && o.y < 12) p += .15;
  if (d === 'mid' && o.y < 12) p -= .05;
  p += { drive: .15, slice: .06, loop: .04 }[dec.type];
  p *= { attack: 1.35, neutral: 1, defend: .6, volley: 1.3 }[ctx.sit.kind];
  if (ctx.oppStyle === 'agg' && dec.type === 'loop' && colOf(t.x) === 'R' && d === 'deep') p += .08;
  return clamp(p, 0, 1);
}

// Your shot: error, winner, their error, or the rally continues
function resolveMine(dec, intent, ctx, ev){
  const e = errProb(dec, intent, ctx);
  if (Math.random() < e){
    const wide = Math.min(dec.target.x - 4.5, 31.5 - dec.target.x) < 2;
    const where = wide ? 'wide' : Math.random() < .5 ? 'into the net' : 'long';
    const miss = where === 'wide' ? { x: dec.target.x < 18 ? 2.5 : 33.5, y: dec.target.y } : where === 'long' ? { x: dec.target.x, y: -3 } : { x: dec.target.x, y: 39.5, h: 1.2 };
    return { end: 'opp', msg: `Your ${typeLabel(dec.type, ctx.sit.kind).toLowerCase()} goes ${where}.`, to: miss };
  }
  const p = pressure(dec, ctx);
  const oppRun = Math.hypot(dec.target.x - ctx.opp.x, dec.target.y - ctx.opp.y);
  let win = clamp((p - .62)*1.1, 0, .6);
  if (oppRun > 16) win += .2;
  if (ctx.oppAtNet && intent === 'pass' && Math.abs(dec.target.x - ctx.opp.x) > 9) win += .3;
  if (ctx.oppAtNet && intent === 'lob' && depthOf(dec.target) === 'deep') win += .2;
  if (Math.random() < win) return { end: 'me', msg: `${INTENT[intent]}. Clean winner.`, to: dec.target };
  const base = { agg: .09, all: .07, moon: .035 }[ctx.oppStyle];
  const oe = base + p*.3 + (ev.M.score - 65)/100*.2 + Math.max(0, S.rally - 11)*.05;
  if (Math.random() < oe) return { end: 'me', msg: `They miss under pressure from your ${INTENT[intent].toLowerCase()}.`, to: dec.target, oppMiss: true };
  return { end: null, p, to: dec.target };
}

// Their reply, shaped by their style and by where you recovered
function opponentReply(dec, intent, p, ctx, me){
  const os = ctx.oppStyle, oppWasNet = ctx.oppAtNet;
  const from = { x: dec.target.x, y: clamp(dec.target.y - (depthOf(dec.target) === 'deep' ? 3 : 1), -6, 36) };
  if (oppWasNet && intent !== 'lob') from.y = clamp(ctx.opp.y, 22, 33);
  let q = clamp(Math.random()*.35 + { agg: .35, all: .3, moon: .2 }[os] + (1 - p)*.4, 0, 1);
  const meNet = me.y <= 52, nml = me.y > 52 && me.y <= 71;
  let land, height = 'normal', desc, oppWin = 0, winMsg, volley = false;

  if (oppWasNet && intent !== 'lob'){
    const side = me.x < 18 ? 1 : -1;
    land = { x: 18 + side*rand(7, 12), y: rand(52, 64) };
    q = clamp(q + .15, 0, 1);
    oppWin = clamp((Math.abs(land.x - me.x) - 7)/10, 0, .7)*q + (intent === 'into_net_player' ? .25 : 0);
    winMsg = 'They volley into the open court.'; desc = 'They volley it back.'; volley = true;
  } else if (meNet){
    const lobChance = { agg: .2, all: .35, moon: .65 }[os];
    if (Math.random() < lobChance){
      land = { x: rand(10, 26), y: rand(71, 77) }; height = 'lob';
      oppWin = q*.35 + (me.y < 47 ? .1 : 0);
      winMsg = 'Their lob sails over you and lands deep.'; desc = 'They throw up a lob.';
    } else {
      const side = me.x < 18 ? 1 : -1;
      land = { x: 18 + side*rand(7, 12.5), y: rand(58, 72) };
      oppWin = clamp((Math.abs(land.x - me.x) - 8)/10, 0, .8)*q + .05;
      winMsg = 'Passing shot down the open side.'; desc = 'They try to pass you.';
    }
  } else {
    const open = me.x < 18 ? rand(22, 30) : rand(6, 14);
    const aimOpen = { agg: .7, all: .6, moon: .35 }[os];
    const x = Math.random() < aimOpen ? open : rand(10, 26);
    let y;
    if (os === 'moon'){ y = rand(69, 77); height = 'high'; desc = 'They loop it back high and deep.'; }
    else if (os === 'agg'){ y = rand(64, 76); desc = 'They drive it back with pace.'; }
    else { y = Math.random() < .25 ? rand(52, 60) : rand(62, 75); desc = y < 61 ? 'They slice it short and low.' : 'They play it back with shape.'; }
    if (q < .35){ y = rand(56, 63); desc = 'Their reply lands short.'; }
    land = { x, y };
    oppWin = clamp((Math.abs(land.x - me.x) - 10)/12, 0, .6)*q;
    if (nml && y > me.y - 2) oppWin += .12;
    winMsg = nml ? "They hit deep while you're stuck in no-man's land." : 'They hit into the open court. Winner.';
  }
  if (Math.random() < oppWin) return { from, land, height, volley, end: 'opp', msg: winMsg };

  // their recovery
  let next;
  const comeIn = os === 'all' && !meNet && (p < .4 || dec.target.y > 15) && Math.random() < .7;
  if (comeIn || (oppWasNet && intent !== 'lob' && os !== 'moon')){
    const ny = rand(27, 31); next = { x: idealX(land, ny, false), y: ny }; desc += ' They follow it to the net.';
  } else {
    const ny = os === 'moon' ? -4.5 : .5; next = { x: idealX(land, ny, false), y: ny };
  }
  return { from, land, q, height, volley, desc, next };
}

/* ============ serve ============ */
// Their service boxes (you serve into these); aim point y = 22, deep in the box
const SERVE_ZONES = {
  deuce: [ { place:'wide', x0:4.5, x1:8.5, aim:6.4 }, { place:'body', x0:8.5, x1:14, aim:11.2 }, { place:'T', x0:14, x1:18, aim:16.2 } ],
  ad:    [ { place:'T', x0:18, x1:22, aim:19.8 }, { place:'body', x0:22, x1:27.5, aim:24.8 }, { place:'wide', x0:27.5, x1:31.5, aim:29.6 } ]
};
// Your service boxes (they serve into these)
const MY_BOXES = {
  deuce: [ { place:'T', aim:19.8 }, { place:'body', aim:24.8 }, { place:'wide', aim:29.6 } ],
  ad:    [ { place:'wide', aim:6.4 }, { place:'body', aim:11.2 }, { place:'T', aim:16.2 } ]
};
const PLACE_NAME = { wide:'out wide', body:'into the body', T:'down the T' };
const aLower = k => (/^[aeiou]/i.test(STYLES[k].lower) ? 'an ' : 'a ') + STYLES[k].lower;
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const isBH = (side, place) => (side === 'deuce' && place === 'T') || (side === 'ad' && place === 'wide');
const serveApex = t => ({ flat: 1.5, slice: 2.5, kick: 6 }[t]);
const sleep = ms => new Promise(r => setTimeout(r, reduceMotion ? 0 : ms));

function serverPos(who, side){
  if (who === 'me') return { x: side === 'deuce' ? 20.5 : 15.5, y: 79.3 };
  return { x: side === 'deuce' ? 15.5 : 20.5, y: -1.3 };
}
function returnerPos(who, side, style){
  if (who === 'me') return { x: side === 'deuce' ? 27.5 : 8.5, y: 80.5 };
  return { x: side === 'deuce' ? 8.5 : 27.5, y: { moon: -5, agg: -.5, all: -1.5 }[style] };
}
// The serve keeps travelling on its line after the bounce; slice out wide curls further away
function serveReturnContact(from, land, retY, type, place){
  const t = (retY - from.y)/(land.y - from.y);
  let x = from.x + (land.x - from.x)*t;
  if (type === 'slice' && place === 'wide') x += x < 18 ? -2 : 2;
  return { x: clamp(x, -3, 39), y: retY };
}
const returnFrom = (dec, ctx) => serveReturnContact(ctx.me, dec.target, ctx.opp.y, dec.type, dec.place);

function scoreServeStyle(style, type, no, band){
  const key = (no === 2 ? 'second.' : '') + type;
  const is = RULES.serveStyle[style][key] ?? RULES.serveStyle[style][type];
  const bsc = RULES.serveBand[style][band];
  const N = SERVE_STYLE_NOTES[style], AL = aLower(style);
  let note = N[key] || N[type] || (is >= 75 ? `A serve ${AL} would choose.` : `Not a typical serve for ${AL}.`);
  if (band !== 'nml' && N['band.' + band] && (bsc < 60 || band === 'net')) note += ' ' + N['band.' + band];
  return { score: Math.round(is*.75 + bsc*.25), note };
}
function scoreServeMatchup(opp, type, place, bh, band){
  const T = RULES.serveMatchup[opp], N = SERVE_MATCH_NOTES[opp];
  const keys = [type + '_' + place, bh ? type + '_bh' : null, place, type].filter(Boolean);
  let score = RULES.matchupDefault, note = `No special edge against ${aLower(opp)}.`;
  for (const k of keys) if (T[k] != null){ score = T[k]; note = N[k] || note; break; }
  if (band === 'net' && T.serve_volley != null){ score = Math.round((score + T.serve_volley)/2); note += ' ' + N.serve_volley; }
  return { score, note };
}

function evaluateServe(dec, ctx, style){
  const no = ctx.serve.no, side = ctx.serve.side, t = dec.type, pl = dec.place;
  const bh = isBH(side, pl);
  const shot = { score: RULES.serveType[no][t], note: SERVE_NOTES[no + '.' + t] };
  let ts = RULES.servePlace[pl];
  let tn = pl === 'body' ? 'Into the body jams the returner and takes away their angles.'
    : pl === 'wide' ? 'Out wide pulls them off the court and opens space for your next shot.'
    : 'Down the T: over the lowest part of the net, and it takes away their angles.';
  if (bh){ ts += 8; tn = `${cap(PLACE_NAME[pl])} to their backhand, usually the weaker return.`; }
  if (t === 'slice' && pl === 'wide' && side === 'deuce'){ ts += 8; tn = 'Slice out wide on the deuce side swings away and drags them off the court.'; }
  if (t === 'kick' && bh){ ts += 4; tn = 'A kick jumping up to the backhand: the classic high-percentage pattern.'; }
  if (t === 'flat' && pl === 'T') ts += 5;
  const target = { score: Math.min(100, ts), note: tn };

  const band = bandOf(dec.rec.y);
  let bs, bn;
  if (band === 'nml'){ bs = 20; bn = "You stopped in no-man's land after serving, so the return will land at your feet."; }
  else if (band === 'net'){ bs = no === 1 ? 75 : t === 'kick' ? 60 : 40; bn = no === 1 ? 'Serve-and-volley behind a first serve takes time away.' : 'Serve-and-volley behind a second serve invites an attacking return.'; }
  else if (band === 'deep'){ bs = 75; bn = 'Backing up after the serve gives up the next ball.'; }
  else { bs = 90; bn = 'Recovered to the baseline, ready for the serve +1.'; }
  const retC = returnFrom(dec, ctx);
  const ideal = idealX(retC, dec.rec.y), err = Math.abs(dec.rec.x - ideal);
  const ls = clamp(Math.round(100 - Math.max(0, err - 2)*11), 0, 100);
  const ln = err <= 3 ? 'Centered on the middle of their return angles.' : `About ${Math.round(err)} ft off: the middle of their return angles is further to your ${dec.rec.x > ideal ? 'left' : 'right'}.`;
  const recovery = { score: Math.round(bs*.5 + ls*.5), note: bs <= ls ? bn : ln };

  const fm = RULES.serveMix;
  const parts = [shot, target, recovery];
  const worst = parts.reduce((a, b) => b.score < a.score ? b : a), top = parts.reduce((a, b) => b.score > a.score ? b : a);
  const F = { score: Math.round(shot.score*fm.shot + target.score*fm.target + recovery.score*fm.recovery), shot, target, recovery, note: worst.score < 70 ? worst.note : top.note };
  const styleAll = {};
  for (const k of Object.keys(STYLES)) styleAll[k] = scoreServeStyle(k, t, no, band);
  const M = scoreServeMatchup(ctx.oppStyle, t, pl, bh, band);
  const W = RULES.weights;
  const total = Math.round(F.score*W.fundamentals + styleAll[style].score*W.style + M.score*W.matchup);
  return { intent: 'serve_' + t, total, F, S: styleAll[style], M, styleAll, idealRec: { x: ideal, y: dec.rec.y }, retFrom: retC };
}
function findBestServe(ctx, style){
  let best = null;
  for (const z of SERVE_ZONES[ctx.serve.side]) for (const type of ['flat','slice','kick']) for (const ry of [46, 79, 84]){
    const dec = { target: { x: z.aim, y: 22 }, place: z.place, type, rec: null };
    dec.rec = { x: idealX(returnFrom(dec, ctx), ry), y: ry };
    const ev = evaluateServe(dec, ctx, style);
    if (!best || ev.total > best.ev.total) best = { dec, ev };
  }
  return best;
}
function describeServe(dec, no, side){
  const band = { net:'serve-and-volley', nml:"stop in no-man's land", base:'recover to the baseline', deep:'recover behind the baseline' }[bandOf(dec.rec.y)];
  return `${cap(dec.type)} ${no === 1 ? 'first' : 'second'} serve ${PLACE_NAME[dec.place]} on the ${side} side, then ${band}`;
}

// simulation odds
function servePressure(type, place, no, bh, returnerStyle){
  let p = { flat: .62, slice: .52, kick: .42 }[type] + { wide: .1, T: .1, body: .06 }[place];
  if (no === 2) p -= .15;
  if (bh) p += .05;
  if (returnerStyle === 'moon' && place === 'wide') p += .06;
  if (returnerStyle === 'agg' && place === 'body') p += .05;
  return clamp(p, 0, 1);
}
const faultP = (type, place, no) => RULES.serveFault[no][type] + (place === 'body' ? -.02 : .04);
const aceP = (p, type) => (p > .6 ? (p - .55)*.9 : .02) * (type === 'kick' ? .5 : 1);
function oppServeChoice(no){
  const w = no === 1
    ? { agg: { flat: .6, slice: .3, kick: .1 }, all: { flat: .3, slice: .45, kick: .25 }, moon: { flat: .15, slice: .3, kick: .55 } }[S.oppStyle]
    : { agg: { flat: .1, slice: .3, kick: .6 }, all: { slice: .4, kick: .6 }, moon: { slice: .15, kick: .85 } }[S.oppStyle];
  let r = Math.random(), type = 'kick';
  for (const [k, v] of Object.entries(w)){ if ((r -= v) <= 0){ type = k; break; } }
  return { type, place: pick(['wide', 'body', 'T']) };
}
const handBall = who => who === 'me' ? { x: S.me.x + .6, y: S.me.y - .2, h: 3.5 } : { x: S.opp.x - .6, y: S.opp.y + .2, h: 3.5 };

function setupMyServe(){
  const sd = S.serve.side;
  S.me = serverPos('me', sd); S.opp = returnerPos('opp', sd, S.oppStyle);
  S.sit = { kind: 'serve', land: null, contact: { ...S.me } };
  S.ball = handBall('me');
}

async function playServe(){
  if (S.busy || S.phase !== 'play' || !S.sel.target || !S.sel.type || !S.sel.rec) return;
  S.busy = true;
  const ctx = ctxNow(), no = S.serve.no, sd = S.serve.side;
  const dec = { target: { ...S.sel.target }, type: S.sel.type, rec: { ...S.sel.rec }, place: S.sel.place };
  const ev = evaluateServe(dec, ctx, S.style);
  const best = findBestServe(ctx, S.style);
  const rec = { point: S.point, kind: 'serve', serveNo: no, desc: describeServe(dec, no, sd), intent: ev.intent, ev,
    best: { desc: describeServe(best.dec, no, sd), total: best.ev.total } };
  S.decisions.push(rec); S.last = rec;
  S.sel = emptySel(); S.hoverZone = null;
  S.lastAim = { from: ev.retFrom, ideal: ev.idealRec };
  S.anim = true; render();

  const from = { x: S.me.x + .5, y: S.me.y - .3, h: 9.5 };
  swing('me', 1.25);
  if (Math.random() < faultP(dec.type, dec.place, no)){
    const where = pick(['into the net', 'long', 'wide']);
    const miss = where === 'into the net' ? { x: dec.target.x, y: 39.5, h: 1.4 } : where === 'long' ? { x: dec.target.x, y: 15 } : { x: sd === 'deuce' ? 3 : 33, y: dec.target.y };
    await tween(560, t => { S.ball = arcPt(from, miss, serveApex(dec.type), t, miss.h || 0); drawDynamic(); });
    miss.h ? Sound.net() : Sound.bounce();
    await sleep(250);
    S.anim = false;
    if (no === 1){
      S.serve.no = 2; S.replyDesc = `Your first serve goes ${where}. Second serve.`;
      S.ball = handBall('me'); S.busy = false; render(); return;
    }
    return finishPoint('opp', `Double fault: your second serve goes ${where}.`);
  }
  const p = servePressure(dec.type, dec.place, no, isBH(sd, dec.place), S.oppStyle);
  const ace = Math.random() < aceP(p, dec.type);
  const retC = ev.retFrom, me0 = { ...S.me }, opp0 = { ...S.opp };
  S.moving = { me: true, opp: true };
  await tween(560, t => { const e = ease(t)*.6; S.ball = arcPt(from, dec.target, serveApex(dec.type), t, 0); S.me = lerpPt(me0, dec.rec, e); S.opp = lerpPt(opp0, retC, e); drawDynamic(); });
  const b1 = { ...S.ball }, me1 = { ...S.me }, opp1 = { ...S.opp };
  Sound.bounce();
  if (ace){
    await tween(340, t => { S.ball = arcPt(b1, { x: retC.x, y: -9 }, 2, t, 2); S.me = lerpPt(me1, dec.rec, t); S.opp = lerpPt(opp1, lerpPt(opp0, retC, .7), t); drawDynamic(); });
    S.moving = { me: false, opp: false }; S.anim = false;
    return finishPoint('me', `${p > .7 ? 'Ace' : 'Service winner'}: ${dec.type} serve ${PLACE_NAME[dec.place]}.`);
  }
  await tween(300, t => { const e = ease(t); S.ball = arcPt(b1, { x: retC.x - .8, y: retC.y + .4 }, dec.type === 'kick' ? 4.5 : 2.5, t, 3); S.me = lerpPt(me1, dec.rec, e); S.opp = lerpPt(opp1, retC, e); drawDynamic(); });
  S.moving = { me: false, opp: false };
  S.me = { ...dec.rec }; S.opp = { ...retC }; S.rally++;
  // their return, played like any other reply (it lands deep from their return position)
  const pseudo = { target: { x: retC.x, y: retC.y + 3 }, type: 'drive', rec: dec.rec };
  const rep = opponentReply(pseudo, 'serve', p, { ...ctx, oppAtNet: false }, dec.rec);
  const inc = rep.end ? null : computeIncoming(rep.land, rep.q, rep.height, rep.from, dec.rec);
  if (!rep.end) rep.desc = 'They return it. ' + rep.desc;
  return theirShot(rep, inc);
}

async function runOppServe(){
  S.busy = true; S.anim = true;
  const sd = S.serve.side;
  S.opp = serverPos('opp', sd); S.me = returnerPos('me', sd);
  S.sit = { kind: 'receive', land: null, contact: { ...S.me } };
  S.ball = handBall('opp');
  render();
  for (let no = 1; no <= 2; no++){
    S.serve.no = no;
    const c = oppServeChoice(no);
    const zone = MY_BOXES[sd].find(z => z.place === c.place);
    const land = { x: zone.aim + rand(-1, 1), y: rand(53, 58) };
    await sleep(no === 1 ? 500 : 650);
    swing('opp', 1.25);
    const from = { x: S.opp.x - .5, y: S.opp.y + .3, h: 9.5 };
    if (Math.random() < faultP(c.type, c.place, no)){
      const where = pick(['into the net', 'long', 'wide']);
      const miss = where === 'into the net' ? { x: land.x, y: 38.5, h: 1.4 } : where === 'long' ? { x: land.x, y: 63.5 } : { x: sd === 'deuce' ? 33 : 3, y: land.y };
      await tween(560, t => { S.ball = arcPt(from, miss, serveApex(c.type), t, miss.h || 0); drawDynamic(); });
      miss.h ? Sound.net() : Sound.bounce();
      if (no === 1){ S.replyDesc = `Their first serve goes ${where}. Second serve coming.`; renderCoach(); await sleep(350); S.ball = handBall('opp'); drawDynamic(); continue; }
      S.anim = false;
      return finishPoint('me', `Double fault: their second serve goes ${where}.`);
    }
    const bh = isBH(sd, c.place);
    const p = servePressure(c.type, c.place, no, bh, S.style);
    const contact = serveReturnContact(from, land, S.me.y, c.type, c.place);
    const ace = Math.random() < aceP(p, c.type);
    const me0 = { ...S.me }, opp0 = { ...S.opp };
    const oppY = S.oppStyle === 'moon' ? -4.5 : .5;
    const oppNext = { x: idealX(contact, oppY, false), y: oppY };
    S.moving = { me: true, opp: false };
    await tween(540, t => { S.ball = arcPt(from, land, serveApex(c.type), t, 0); S.me = lerpPt(me0, contact, ease(t)*.55); drawDynamic(); });
    const b1 = { ...S.ball }, me1 = { ...S.me };
    Sound.bounce();
    if (ace){
      await tween(320, t => { S.ball = arcPt(b1, { x: contact.x, y: 90 }, 2, t, 2); S.me = lerpPt(me1, lerpPt(me0, contact, .6), t); drawDynamic(); });
      S.moving = { me: false, opp: false }; S.anim = false;
      return finishPoint('opp', `${p > .7 ? 'Ace' : 'Service winner'}: their ${c.type} serve ${PLACE_NAME[c.place]}.`);
    }
    S.moving = { me: true, opp: true };
    await tween(320, t => { const e = ease(t); S.ball = arcPt(b1, { x: contact.x + 1, y: contact.y - .4 }, c.type === 'kick' ? 4.5 : 2.5, t, 3.2); S.me = lerpPt(me1, contact, e); S.opp = lerpPt(opp0, oppNext, e); drawDynamic(); });
    S.moving = { me: false, opp: false };
    const kind = p > .62 ? 'defend' : p < .4 ? 'attack' : 'neutral';
    S.sit = { kind, height: c.type === 'kick' ? 'high' : 'normal', land, contact, isReturn: true,
      serve: { type: c.type, place: c.place, no, bh }, stretched: Math.abs(contact.x - me0.x) > 9 };
    S.me = { ...contact }; S.opp = oppNext; S.ball = restBall(); S.replyDesc = null;
    S.anim = false; S.busy = false; render();
    return;
  }
}

/* ============ flow ============ */
const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;
const lerpPt = (a, b, t) => ({ x: a.x + (b.x - a.x)*t, y: a.y + (b.y - a.y)*t });
function arcPt(a, b, apex, t, hEnd = 0){
  return { x: a.x + (b.x - a.x)*t, y: a.y + (b.y - a.y)*t, h: (a.h || 0)*(1 - t) + hEnd*t + apex*4*t*(1 - t) };
}
function tween(ms, step){
  return new Promise(res => {
    if (reduceMotion){ step(1); return res(); }
    let done = false; const t0 = performance.now();
    const f = now => { if (done) return; const t = Math.min((now - t0)/ms, 1); step(t); if (t < 1) requestAnimationFrame(f); else { done = true; res(); } };
    requestAnimationFrame(f);
    setTimeout(() => { if (!done){ done = true; step(1); res(); } }, ms + 500);
  });
}
function shotApex(type, ctx){
  if (ctx.sit.kind === 'volley') return { drive: 2.5, loop: 11, slice: 2 }[type];
  if (ctx.oppAtNet && type === 'loop') return 20;
  return { drive: 5.5, loop: 12, slice: 4 }[type];
}
const replyApex = rep => rep.volley ? 2.5 : { lob: 22, high: 13, normal: 5.5 }[rep.height] ?? 5.5;

async function playShot(){
  if (S.busy || S.phase !== 'play' || !S.sel.target || !S.sel.type || !S.sel.rec) return;
  S.busy = true;
  const ctx = ctxNow();
  const dec = { target: { ...S.sel.target }, type: S.sel.type, rec: { ...S.sel.rec } };
  const ev = evaluate(dec, ctx, S.style);
  const best = findBest(ctx, S.style);
  const rec = {
    point: S.point, kind: ctx.sit.kind, isReturn: !!ctx.sit.isReturn, desc: describe(dec, ctx.sit.kind), intent: ev.intent, ev,
    best: { desc: describe(best.dec, ctx.sit.kind), total: best.ev.total }
  };
  S.decisions.push(rec); S.last = rec; S.rally++;
  S.sel = { target: null, zone: null, type: null, rec: null }; S.hoverZone = null;
  S.lastAim = { from: dec.target, ideal: ev.idealRec, y: dec.rec.y };

  // decide the whole exchange up front, then animate it
  const out = resolveMine(dec, ev.intent, ctx, ev);
  let rep = null, inc = null;
  if (!out.end){
    rep = opponentReply(dec, ev.intent, out.p, ctx, dec.rec);
    if (!rep.end) inc = computeIncoming(rep.land, rep.q, rep.height, rep.from, dec.rec);
  }
  S.anim = true;
  render();

  // 1. your shot: you swing and recover, they run to the ball
  const me0 = { ...S.me }, opp0 = { ...S.opp };
  const oppGoal = rep ? rep.from : lerpPt(opp0, { x: dec.target.x, y: dec.target.y - 2 }, out.end === 'me' && !out.oppMiss ? .55 : .9);
  swing('me'); S.moving = { me: true, opp: true };
  const b0 = { ...S.ball };
  await tween(780, t => {
    const e = ease(t);
    S.me = lerpPt(me0, dec.rec, e); S.opp = lerpPt(opp0, oppGoal, e);
    S.ball = arcPt(b0, out.to, shotApex(dec.type, ctx), t, out.to.h || 0);
    drawDynamic();
  });
  S.moving = { me: false, opp: false };
  if (out.to.h) Sound.net(); else Sound.bounce();
  if (out.end){
    if (out.oppMiss){
      swing('opp');
      const from = { x: S.opp.x - .8, y: S.opp.y + .4, h: 3 }, to = { x: S.opp.x + rand(-3, 3), y: 38.6 };
      await tween(460, t => { S.ball = arcPt(from, to, 3, t, 1.2); drawDynamic(); });
    } else if (out.end === 'opp' && out.to.h){
      const from = { ...S.ball };
      await tween(220, t => { S.ball = arcPt(from, { x: from.x, y: 40.5 }, 0, t, 0); drawDynamic(); });
    }
    S.anim = false;
    return finishPoint(out.end, out.msg);
  }

  return theirShot(rep, inc);
}

// Their shot: they swing and recover, you run to the ball
async function theirShot(rep, inc){
  swing('opp'); S.moving = { me: true, opp: true };
  const opp1 = { ...S.opp }, me1 = { ...S.me };
  const oppNext = rep.end ? opp1 : rep.next;
  const meGoal = rep.end ? lerpPt(me1, rep.land, .4) : inc.contact;
  const volleyHit = inc && inc.sit.kind === 'volley';
  const bFrom = { x: rep.from.x - .8, y: rep.from.y + .4, h: 3 };
  const bTo = volleyHit ? { x: inc.contact.x + 1, y: inc.contact.y - .4 } : rep.land;
  await tween(820, t => {
    const e = ease(t);
    S.opp = lerpPt(opp1, oppNext, e); S.me = lerpPt(me1, meGoal, e);
    S.ball = arcPt(bFrom, bTo, replyApex(rep), t, volleyHit ? 3 : 0);
    drawDynamic();
  });
  if (rep.end){
    const from = { ...S.ball };
    await tween(300, t => { S.ball = arcPt(from, { x: from.x + (from.x - bFrom.x)*.15, y: Math.min(90, from.y + 9) }, 2, t, 0); drawDynamic(); });
    S.moving = { me: false, opp: false }; S.anim = false;
    return finishPoint('opp', rep.msg);
  }
  if (!volleyHit){
    Sound.bounce();
    const from = { ...S.ball };
    await tween(260, t => { S.ball = arcPt(from, { x: inc.contact.x + 1, y: inc.contact.y - .4 }, 2.2, t, 3.2); drawDynamic(); });
  }
  S.moving = { me: false, opp: false };
  S.sit = inc.sit; S.me = { ...inc.contact }; S.opp = rep.next; S.ball = restBall();
  S.replyDesc = rep.desc; S.anim = false; S.busy = false;
  render();
}

function finishPoint(who, msg){
  S.score[who]++;
  S.pointMsg = { who, msg };
  const { me, opp } = S.score;
  S.phase = (Math.max(me, opp) >= 7 && Math.abs(me - opp) >= 2) ? 'over' : 'between';
  S.busy = false;
  if (who === 'me'){ Sound.win(); cheer(); } else Sound.lose();
  if (S.phase === 'over') setTimeout(() => { S.reportOpen = true; render(); }, 1300);
  render();
}

function nextPoint(){ S.point++; S.phase = 'play'; beginPoint(); render(); }

function startMatch(){
  Sound.init();
  S.matchStarted = true; S.setupOpen = false; S.reportOpen = false;
  S.oppStyle = S.oppChoice === 'random' ? pick(Object.keys(STYLES)) : S.oppChoice;
  S.score = { me: 0, opp: 0 }; S.point = 1; S.decisions = []; S.last = null;
  S.phase = 'play'; beginPoint(); render();
  try { localStorage.setItem('courtFlair.style', S.style); } catch (e) {}
}

/* ============ rendering ============ */
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const avg = arr => arr.length ? Math.round(arr.reduce((a,b) => a + b, 0)/arr.length) : 0;

const srv = who => S.phase !== 'setup' && S.serve && S.serve.server === who ? ' <span class="srv" title="Serving"></span>' : '';
// style shown as its icon only; the name stays in the tooltip and for screen readers
const bsty = k => k ? `<span class="bsty" role="img" title="${STYLES[k].name}" aria-label="${STYLES[k].name}">${styleIcon(k, 'sm')}</span>` : '';
function renderBoard(){
  const setup = S.phase === 'setup';
  const a = avg(S.decisions.map(d => d.ev.total));
  $('#board').innerHTML = `
    <div class="who"><span class="dot you"></span>You${bsty(S.style)}${srv('me')}</div>
    <div class="pts">${S.score.me}</div>
    <div class="serve"><span>Decisions</span><strong>${S.decisions.length ? a + '%' : '—'}</strong></div>
    <div class="who"><span class="dot them"></span>Opponent${bsty(setup ? (S.oppChoice === 'random' ? null : S.oppChoice) : S.oppStyle)}${srv('opp')}</div>
    <div class="pts">${S.score.opp}</div>`;
}

/* ---- court scene (perspective) ---- */
const f2 = n => n.toFixed(2);
function pts(list){ return list.map(([x, y]) => { const q = proj(x, y); return f2(q.X) + ',' + f2(q.Y); }).join(' '); }
function gline(g, x1, y1, x2, y2, cls){ const a = proj(x1, y1), b = proj(x2, y2); return el('line', { x1: f2(a.X), y1: f2(a.Y), x2: f2(b.X), y2: f2(b.Y), class: cls }, g); }
function gring(g, x, y, r, cls){ const q = proj(x, y); return el('ellipse', { cx: f2(q.X), cy: f2(q.Y), rx: f2(r*q.s), ry: f2(r*q.s*.72), class: cls }, g); }
function gtext(g, x, y, str, cls, h = 0){ const q = proj(x, y, h); const t = el('text', { x: f2(q.X), y: f2(q.Y), class: cls }, g); t.textContent = str; return t; }

let zonePolys = [];
function buildCourt(){
  const g = $('#static');
  el('rect', { x: -30, y: -26, width: 160, height: 160, class: 'c-sur' }, g);
  el('rect', { x: -30, y: -26, width: 160, height: 25.4, class: 'wall' }, g);
  el('rect', { x: -30, y: -.8, width: 160, height: .45, class: 'wall-edge' }, g);
  const lab = el('text', { x: 50, y: -20.2, class: 'readout-lab' }, g); lab.textContent = 'AIM';
  el('text', { x: 50, y: -14, id: 'readout', class: 'readout' }, g);
  el('polygon', { points: pts([[0,0],[36,0],[36,78],[0,78]]), class: 'c-court' }, g);
  el('polygon', { points: pts([[0,0],[4.5,0],[4.5,78],[0,78]]), class: 'c-alley' }, g);
  el('polygon', { points: pts([[31.5,0],[36,0],[36,78],[31.5,78]]), class: 'c-alley' }, g);
  el('polygon', { points: pts([[0,0],[36,0],[36,78],[0,78]]), class: 'c-line' }, g);
  [[4.5,0,4.5,78],[31.5,0,31.5,78],[4.5,18,31.5,18],[4.5,60,31.5,60],[18,18,18,60],[18,0,18,.8],[18,78,18,77.2]]
    .forEach(l => gline(g, ...l, 'c-line'));
  // your court: where you can recover to
  [52, 71, 81].forEach(y => gline(g, 4.5, y, 31.5, y, 'c-guide'));
  gtext(g, -.8, 46.5, 'NET', 'band-lab');
  gtext(g, -.8, 62, "NO-MAN'S", 'band-lab'); gtext(g, -.8, 65.5, 'LAND', 'band-lab');
  gtext(g, -.8, 76.8, 'BASELINE', 'band-lab');
  gtext(g, -.8, 85.2, 'DEEP', 'band-lab');
  gtext(g, 11, 86.3, 'YOUR BACKHAND', 'side-lab'); gtext(g, 25, 86.3, 'YOUR FOREHAND', 'side-lab');
  gtext(g, 9, -1.6, 'THEIR FOREHAND', 'side-lab'); gtext(g, 27, -1.6, 'THEIR BACKHAND', 'side-lab');

  const zg = $('#zones');
  zonePolys = [];
  for (const r of ROWS) for (const c of COLS){
    const p = el('polygon', { points: pts([[c.x0, r.y0],[c.x1, r.y0],[c.x1, r.y1],[c.x0, r.y1]]), class: 'zone rz' + (c.line ? ' line' : '') }, zg);
    p.dataset.z = r.id + '-' + c.id; zonePolys.push(p);
  }
  for (const side of ['deuce', 'ad']) for (const z of SERVE_ZONES[side]){
    const p = el('polygon', { points: pts([[z.x0, 18],[z.x1, 18],[z.x1, 39],[z.x0, 39]]), class: 'zone sz' }, zg);
    p.dataset.z = `sv-${side}-${z.place}`; p.dataset.side = side; zonePolys.push(p);
  }

  const n = $('#net');
  el('polygon', { points: pts([[-3, 39],[39, 39],[39, 40.6],[-3, 40.6]]), class: 'net-shadow' }, n);
  const L = proj(-3, 39), R = proj(39, 39), Lt = proj(-3, 39, 3.5), Rt = proj(39, 39, 3.5), Ct = proj(18, 39, 3);
  const cy = 2*Ct.Y - (Lt.Y + Rt.Y)/2;
  const d = `M${f2(L.X)} ${f2(L.Y)} L${f2(R.X)} ${f2(R.Y)} L${f2(Rt.X)} ${f2(Rt.Y)} Q${f2(Ct.X)} ${f2(cy)} ${f2(Lt.X)} ${f2(Lt.Y)} Z`;
  el('path', { d, class: 'net-body' }, n); el('path', { d, class: 'net-mesh' }, n);
  el('path', { d: `M${f2(Lt.X)} ${f2(Lt.Y)} Q${f2(Ct.X)} ${f2(cy)} ${f2(Rt.X)} ${f2(Rt.Y)}`, class: 'net-tape' }, n);
  const c1 = proj(18, 39), c2 = proj(18, 39, 3);
  el('line', { x1: f2(c1.X), y1: f2(c1.Y), x2: f2(c2.X), y2: f2(c2.Y), stroke: '#F7F8F3', 'stroke-width': .35 }, n);
  el('line', { x1: f2(L.X), y1: f2(L.Y), x2: f2(Lt.X), y2: f2(Lt.Y - .3), class: 'net-post' }, n);
  el('line', { x1: f2(R.X), y1: f2(R.Y), x2: f2(Rt.X), y2: f2(Rt.Y - .3), class: 'net-post' }, n);
}

/* ---- stands and fans along both sidelines ---- */
function buildStands(){
  const g = $('#stands');
  const SH = ['#E8574B','#F2C14E','#FFFFFF','#3A7BD5','#8E5BB5','#2BA38E','#F28C3A','#E9E4D8','#253353','#D94F87','#7FC4E8'];
  const SK = ['#F1C7A5','#D9A07A','#A96D45','#6E452B','#E8B48E','#C58B63'];
  const P = (x, y, h) => { const q = proj(x, y, h); return f2(q.X) + ',' + f2(q.Y); };
  for (const dir of [-1, 1]){
    const X = d => dir < 0 ? -8.5 - d : 44.5 + d;      // d = distance out from the court
    el('polygon', { points: [P(X(1), -8, 3), P(X(1), 90, 3), P(X(14), 90, 11), P(X(14), -8, 11)].join(' '), class: 'stand' }, g);
    for (let i = 0; i <= 5; i++){
      const d = 1 + i*2.6, h = 3 + i*1.6, a = proj(X(d), -8, h), b = proj(X(d), 90, h);
      el('line', { x1: f2(a.X), y1: f2(a.Y), x2: f2(b.X), y2: f2(b.Y), class: 'tier' }, g);
    }
    const fans = el('g', { class: 'fans' }, g);
    for (let i = 4; i >= 0; i--){
      const d = 2.3 + i*2.6, h = 3.8 + i*1.6;
      for (let y = -6 + (i % 2)*1.1; y < 88; y += 2.25){
        if (Math.random() < .12) continue;
        const x = X(d) + (Math.random() - .5)*.4;
        const b = proj(x, y, h + .9), hd = proj(x, y, h + 2.1);
        const fan = el('g', { class: 'fan', style: `--d:${-Math.round(Math.random()*260)}ms` }, fans);
        el('ellipse', { cx: f2(b.X), cy: f2(b.Y), rx: f2(.62*b.s), ry: f2(.8*b.s), fill: pick(SH) }, fan);
        el('circle', { cx: f2(hd.X), cy: f2(hd.Y), r: f2(.4*hd.s), fill: pick(SK) }, fan);
      }
    }
    el('polygon', { points: [P(X(0), -8, 0), P(X(0), 90, 0), P(X(0), 90, 3), P(X(0), -8, 3)].join(' '), class: 'boards' }, g);
  }
}
function cheer(){
  const f = document.querySelectorAll('.fans');
  f.forEach(g => g.classList.add('cheer'));
  clearTimeout(cheer.t); cheer.t = setTimeout(() => f.forEach(g => g.classList.remove('cheer')), 1800);
}

/* ---- sound: synthesized, starts after the first click ----
   Everything runs through a master gain and a compressor, so the mix can be louder without clipping. */
const Sound = {
  ctx: null, on: true, noise: null, out: null, volume: 1.7,
  init(){
    if (!this.on) return null;
    try {
      if (!this.ctx){
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        this.ctx = new AC();
        const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
        this.noise = b;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = .002; comp.release.value = .12;
        this.out = this.ctx.createGain(); this.out.gain.value = this.volume;
        this.out.connect(comp).connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e){ return null; }
    return this.ctx;
  },
  tone(freq, dur, type, gain, when = 0, slideTo){
    const c = this.init(); if (!c) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + .02);
  },
  // band-passed noise; freqTo sweeps the band, which is what makes a swing sound like air moving
  hiss(dur, freq, gain, when = 0, attack = .005, q = 1, freqTo){
    const c = this.init(); if (!c) return;
    const t = c.currentTime + when, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + attack);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f).connect(g).connect(this.out); src.start(t); src.stop(t + dur + .05);
  },
  // racket swing: a rising whoosh into a hard, dry strike on the strings
  hit(p = 1){
    this.hiss(.16, 450, .5*p, 0, .07, .8, 2800);            // whoosh, peaking at contact
    this.tone(280, .08, 'sine', .95*p, .07, 105);            // body of the strike
    this.tone(1400, .025, 'triangle', .22*p, .07, 700);      // string ping
    this.hiss(.045, 3800, .6*p, .07, .001, 1.4);             // crack
  },
  bounce(){ this.tone(160, .07, 'sine', .3, 0, 80); this.hiss(.035, 1400, .12, 0, .002, 2); },
  net(){ this.hiss(.18, 300, .2, 0, .005, .8); },
  win(){ this.hiss(1.6, 1100, .22, 0, .25, .6); this.hiss(1.4, 2400, .08, .05, .3, .8); this.tone(660, .18, 'triangle', .12, .05); this.tone(990, .28, 'triangle', .12, .18); },
  lose(){ this.hiss(.9, 500, .1, 0, .15, .7); this.tone(392, .22, 'triangle', .11); this.tone(294, .34, 'triangle', .11, .18); }
};
function swing(who, power = 1){ S.swing[who] = performance.now(); Sound.hit(power*(who === 'opp' ? .75 : 1)); }

/* ---- players: drawn in feet, standing on the ground point ---- */
const LOOK = {
  me:  { shirt: '#FFFFFF', trim: '#1C2C45', shorts: '#1C2C45', skin: '#A96D45', hair: '#1D140F', band: '#DDF140', frame: '#1C2C45', shoe: '#F4F4EF' },
  opp: { shirt: '#EE7F45', trim: '#FFFFFF', shorts: '#23262C', skin: '#E6BC95', hair: '#6A3E20', band: '#FFFFFF', frame: '#B62A22', shoe: '#FFFFFF' }
};
function drawPerson(g, pos, look, o){
  const p = proj(pos.x, pos.y), k = p.s*1.45;
  const root = el('g', { transform: `translate(${f2(p.X)} ${f2(p.Y)}) scale(${(o.toward ? -k : k).toFixed(3)} ${k.toFixed(3)})` }, g);
  el('ellipse', { cx: 0, cy: 0, rx: 1.3, ry: .42, class: 'shadow' }, root);
  const st = o.moving ? Math.sin(performance.now()/70)*.32 : 0;
  const leg = (x0, x1) => el('path', { d: `M${x0} -2.75 L${x1} -.2`, stroke: look.skin, 'stroke-width': .34, 'stroke-linecap': 'round', fill: 'none' }, root);
  leg(-.3, -.44 + st); leg(.3, .46 - st);
  el('ellipse', { cx: -.46 + st, cy: -.14, rx: .27, ry: .15, fill: look.shoe, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .04 }, root);
  el('ellipse', { cx: .48 - st, cy: -.14, rx: .27, ry: .15, fill: look.shoe, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .04 }, root);
  el('path', { d: 'M-.62 -3.35 H.62 L.72 -2.5 H.1 L0 -2.72 L-.1 -2.5 H-.72 Z', fill: look.shorts }, root);
  el('path', { d: 'M-.72 -5.05 Q0 -5.32 .72 -5.05 L.64 -3.22 H-.64 Z', fill: look.shirt, stroke: 'rgba(0,0,0,.18)', 'stroke-width': .04 }, root);
  el('path', { d: 'M-.64 -3.34 H.64', stroke: look.trim, 'stroke-width': .1 }, root);
  el('path', { d: 'M-.68 -4.88 L-1 -3.78', stroke: look.skin, 'stroke-width': .25, 'stroke-linecap': 'round' }, root);
  const ang = o.swing == null ? 0 : -150*Math.sin(Math.PI*o.swing);
  const arm = el('g', { transform: `rotate(${ang.toFixed(1)} .68 -4.88)` }, root);
  el('path', { d: 'M.68 -4.88 L1.02 -3.86', stroke: look.skin, 'stroke-width': .25, 'stroke-linecap': 'round' }, arm);
  el('path', { d: 'M1.02 -3.86 L1.32 -4.52', stroke: '#1A1A1A', 'stroke-width': .14, 'stroke-linecap': 'round' }, arm);
  el('ellipse', { cx: 1.55, cy: -5.2, rx: .36, ry: .52, transform: 'rotate(22 1.55 -5.2)', fill: 'rgba(255,255,255,.3)', stroke: look.frame, 'stroke-width': .12 }, arm);
  el('circle', { cx: 0, cy: -5.62, r: .45, fill: look.skin }, root);
  if (o.toward) el('path', { d: 'M-.46 -5.66 A.46 .46 0 0 1 .46 -5.66 Q0 -5.86 -.46 -5.66 Z', fill: look.hair }, root);
  else el('circle', { cx: 0, cy: -5.66, r: .46, fill: look.hair }, root);
  el('path', { d: 'M-.45 -5.8 Q0 -5.95 .45 -5.8', stroke: look.band, 'stroke-width': .12, fill: 'none' }, root);
}

/* ---- side view of the selected shot: height over the net ---- */
/* ---- side view of the selected shot: height over the net ---- */
function drawProfile(){
  const g = $('#profile'); g.replaceChildren();
  const X = y => 8 + (86 - y)/92*184, H = h => 19 - h*1.35;
  const attrs = { 'vector-effect': 'non-scaling-stroke' };
  el('line', { x1: 0, y1: 19, x2: 200, y2: 19, class: 'pf-ground', ...attrs }, g);
  el('line', { x1: X(39), y1: 19, x2: X(39), y2: H(3), class: 'pf-net', ...attrs }, g);
  [X(78), X(0)].forEach(x => el('line', { x1: x, y1: 16.5, x2: x, y2: 19, class: 'pf-ground', ...attrs }, g));
  const note = $('#pfNote');
  const ready = S.phase === 'play' && S.sel.target && S.sel.type && !S.anim;
  if (!ready){ note.textContent = 'Pick a zone and a shot'; note.style.color = 'var(--ink-2)'; return; }
  const { from, apex } = flightFor(S.sel.type);
  const path = [];
  for (let i = 0; i <= 40; i++){ const b = arcPt(from, S.sel.target, apex, i/40, 0); path.push(f2(X(b.y)) + ',' + f2(H(b.h))); }
  el('polyline', { points: path.join(' '), class: 'pf-arc', ...attrs }, g);
  const t = (from.y - 39)/(from.y - S.sel.target.y);
  const clear = arcPt(from, S.sel.target, apex, t, 0).h - 3;
  note.style.color = '';
  note.textContent = `${typeLabel(S.sel.type, S.sit.kind)} clears the net by ${Math.max(0, clear).toFixed(0)} ft`;
}
function flightFor(type){
  if (S.sit && S.sit.kind === 'serve') return { from: { x: S.me.x + .5, y: S.me.y - .3, h: 9.5 }, apex: type ? serveApex(type) : 0 };
  return { from: { x: S.me.x + 1, y: S.me.y - .4, h: 3.2 }, apex: type ? shotApex(type, ctxNow()) : 0 };
}
const swingT = who => { const t = (performance.now() - S.swing[who])/380; return t >= 0 && t <= 1 ? t : null; };

function drawDynamic(){
  const playing = S.phase === 'play' && !S.busy;
  const serving = S.sit && S.sit.kind === 'serve' && S.phase === 'play';
  for (const p of zonePolys){
    p.style.display = p.dataset.side ? (serving && p.dataset.side === S.serve.side ? '' : 'none') : (serving ? 'none' : '');
    p.classList.toggle('hover', playing && p.dataset.z === S.hoverZone && p.dataset.z !== S.sel.zone);
    p.classList.toggle('sel', p.dataset.z === S.sel.zone);
  }
  const g = $('#ground'); g.replaceChildren();
  if (S.sit && S.sit.land && S.phase !== 'setup' && !S.anim) gring(g, S.sit.land.x, S.sit.land.y, 1.1, 'land');
  const la = S.lastAim;
  if (la){
    const [a, b, c] = coneFor(la.from, 87);
    el('polygon', { points: pts([[a.x, a.y],[b.x, b.y],[c.x, c.y]]), class: 'cone' }, g);
    gline(g, la.from.x, la.from.y, la.ideal.x, la.ideal.y, 'bis');
    gring(g, la.ideal.x, la.ideal.y, 1.3, 'ideal');
    gtext(g, la.ideal.x, la.ideal.y + 2.6, 'IDEAL', 'ideal-lab');
  }
  if (S.sel.rec){
    gline(g, S.me.x, S.me.y, S.sel.rec.x, S.sel.rec.y, 'run');
    gring(g, S.sel.rec.x, S.sel.rec.y, 1.4, 'rec');
  }
  if (S.ball){ const q = proj(S.ball.x, S.ball.y); el('ellipse', { cx: f2(q.X), cy: f2(q.Y), rx: f2(.5*q.s), ry: f2(.25*q.s), class: 'shadow' }, g); }

  const far = $('#far'), near = $('#near');
  far.replaceChildren(); near.replaceChildren();
  drawPerson(far, S.opp, LOOK.opp, { toward: true, swing: swingT('opp'), moving: S.moving.opp });
  drawPerson(near, S.me, LOOK.me, { toward: false, swing: swingT('me'), moving: S.moving.me });

  const fx = $('#fx'); fx.replaceChildren();
  if (S.sel.target && !S.anim){
    const { from, apex } = flightFor(S.sel.type);
    const path = [];
    for (let i = 0; i <= 24; i++){ const b = arcPt(from, S.sel.target, apex, i/24, 0); const q = proj(b.x, b.y, b.h); path.push(f2(q.X) + ',' + f2(q.Y)); }
    el('polyline', { points: path.join(' '), class: 'aim' }, fx);
    gring(fx, S.sel.target.x, S.sel.target.y, .8, 'land');
  }
  if (S.ball){
    const q = proj(S.ball.x, S.ball.y, S.ball.h);
    el('circle', { cx: f2(q.X), cy: f2(q.Y), r: f2(.55*q.s), class: 'ball' }, fx);
  }
  drawProfile();
  const ro = $('#readout');
  if (ro){
    let t;
    if (S.phase === 'setup') t = 'PICK YOUR STYLE';
    else if (S.phase === 'between') t = S.pointMsg.who === 'me' ? 'YOUR POINT' : 'THEIR POINT';
    else if (S.phase === 'over') t = 'MATCH OVER';
    else if (S.busy) t = 'BALL IN PLAY';
    else {
      const id = S.hoverZone || S.sel.zone;
      if (id && id.startsWith('sv-')){ const [, side, place] = id.split('-'); t = `${PLACE_NAME[place]} · ${side} box`.toUpperCase(); }
      else if (id){ const [r, c] = id.split('-'); t = zoneName({ row: ROWS.find(x => x.id === r), col: COLS.find(x => x.id === c) }).toUpperCase(); }
      else t = serving ? `SERVE · ${S.serve.no === 1 ? 'FIRST' : 'SECOND'} · ${S.serve.side.toUpperCase()} SIDE` : 'TAP A ZONE ON THEIR SIDE';
    }
    ro.textContent = t;
  }
}

function renderControls(){
  const kind = S.sit ? S.sit.kind : 'neutral';
  const playing = S.phase === 'play' && !S.busy && kind !== 'receive';
  const subs = kind === 'serve'
    ? { flat: 'Most pace, least margin', slice: 'Curves to your left, stays low', kick: 'Jumps high: the safest' }
    : kind === 'volley'
    ? { drive: 'Firm, into space', loop: 'Soft, over their head', slice: 'Soft, short or angled' }
    : { drive: 'Pace, low over the net', loop: 'High, heavy topspin', slice: 'Low, skidding backspin' };
  $('#shots').innerHTML = Object.keys(subs).map(t =>
    `<button type="button" class="shot" data-type="${t}" aria-pressed="${S.sel.type === t}" ${playing ? '' : 'disabled'}><b>${typeLabel(t, kind)}</b><small>${subs[t]}</small></button>`).join('');
  const st = [['Aim', kind === 'serve' ? 'wide, body or T' : 'tap a zone', S.sel.target], [kind === 'serve' ? 'Serve' : 'Shot', 'pick below', S.sel.type], ['Recover', 'tap your side', S.sel.rec]];
  $('#steps').innerHTML = st.map(([n, h, v], i) => `<span class="step ${v ? 'done' : ''}"><i>${v ? '✓' : i + 1}</i>${n}${v ? '' : ` <span class="muted">${h}</span>`}</span>`).join('');
  const go = $('#go');
  go.classList.remove('alt');
  if (S.phase === 'setup'){ go.textContent = 'Set up match'; go.disabled = false; go.classList.add('alt'); }
  else if (S.phase === 'between'){ go.textContent = 'Next point'; go.disabled = false; go.classList.add('alt'); }
  else if (S.phase === 'over'){ go.textContent = 'See match report'; go.disabled = false; go.classList.add('alt'); }
  else if (S.dockCollapsed && playing && !(S.sel.target && S.sel.type && S.sel.rec)){ go.textContent = 'Show controls'; go.disabled = false; go.classList.add('alt'); }
  else { go.textContent = S.busy ? (kind === 'receive' ? 'They are serving…' : 'Ball in play…') : kind === 'serve' ? 'Serve' : 'Play shot'; go.disabled = !(playing && S.sel.target && S.sel.type && S.sel.rec); }
}

function sitText(){
  const s = S.sit;
  const oppWhere = S.opp.y < -2.5 ? 'well behind their baseline' : 'on their baseline';
  if (s.kind === 'serve') return `You're serving from the ${S.serve.side} side. Their backhand is ${S.serve.side === 'deuce' ? 'down the T' : 'out wide'} on this side. The returner stands ${oppWhere}.`;
  if (s.kind === 'receive') return `They're serving from the ${S.serve.side} side. Get ready to return.`;
  if (s.isReturn){
    const sv = s.serve;
    const feel = s.kind === 'defend' ? "It's a strong serve and you're on the back foot." : s.kind === 'attack' ? "It's a weak serve, sitting up." : 'A solid serve you can play.';
    return `Returning their ${sv.type} ${sv.no === 1 ? 'first' : 'second'} serve ${PLACE_NAME[sv.place]}${sv.bh ? ' to your backhand' : ''}. ${feel} Server recovers ${oppWhere}.`;
  }
  const side = { L: 'your backhand', C: 'the middle', R: 'your forehand' }[colOf(s.land.x)];
  const oppPos = S.opp.y > 20 ? 'is at the net' : S.opp.y < -1 ? 'is deep behind their baseline' : 'is on their baseline';
  const oppSide = { L: 'on their forehand side', C: 'in the center', R: 'on their backhand side' }[colOf(S.opp.x)];
  let t;
  if (s.kind === 'attack') t = `Short ball to ${side}, sitting up.`;
  else if (s.kind === 'volley') t = `You're at the net. The ball comes to your ${colOf(s.contact.x) === 'L' ? 'backhand' : colOf(s.contact.x) === 'R' ? 'forehand' : 'body'} volley.`;
  else if (s.kind === 'defend') t = s.lobbed ? 'They lobbed you. You turn and chase it back to the baseline.' : s.atFeet ? "The ball lands at your feet in no-man's land." : s.stretched ? `You're stretched out wide to ${side}.` : `A heavy, deep ball to ${side} pushes you back.`;
  else t = `Rally ball, ${s.land.y > 69 ? 'deep' : 'mid-depth'} to ${side}.`;
  if (s.height === 'high' && s.kind !== 'volley') t += ' It kicks up high.';
  return `${t} Opponent ${oppPos}, ${oppSide}.`;
}

function renderCoach(){
  const ph = S.phase;
  $('#setupModal').hidden = !S.setupOpen;
  $('#resume').hidden = !(S.matchStarted && ph !== 'over');
  $('#startLabel').innerHTML = S.matchStarted ? '<span class="lg">Start new match</span><span class="sh">New match</span>' : 'Start match';
  $('#reportModal').hidden = !(S.reportOpen && ph === 'over');
  if (S.reportOpen && ph === 'over') renderReport();

  if (S.last) renderFeedback(S.last);
  else $('#feedback').innerHTML = '<h3>Last decision</h3><p class="muted">Each decision is scored here on fundamentals, fit with your style and the matchup, next to the best option for your style.</p>';

  if (S.decisions.length && S.guideOpen && !S.guidePref && !S.guideAuto){ S.guideAuto = true; setGuide(false, false); }
  renderPointCard();
  if (S.decisions.length) renderMeter($('#meter'));
  else $('#meter').innerHTML = '<h3>Your decisions play like</h3><p class="muted">After a few shots, this shows which of the three styles your choices actually match.</p>';
  renderDock();
}

function setGuide(open, remember){
  S.guideOpen = open;
  $('#guideBody').hidden = !open;
  $('#guide').classList.toggle('closed', !open);
  $('#guideToggle').setAttribute('aria-expanded', String(open));
  if (remember){ S.guidePref = true; try { localStorage.setItem('courtFlair.guide', open ? 'open' : 'closed'); } catch (e) {} }
}
function renderPointCard(){
  const list = S.decisions.filter(d => d.point === S.point);
  const started = S.matchStarted;
  const who = S.serve ? `${S.serve.server === 'me' ? 'You serve' : 'They serve'} from the ${S.serve.side} side` : '';
  let tag = '', res = '';
  if (S.pointMsg && (S.phase === 'between' || S.phase === 'over')){
    const w = S.pointMsg.who === 'me';
    tag = `<span class="pill ${w ? 'win' : 'lose'}">${w ? 'Your point' : 'Their point'}</span>`;
    res = `<p class="sit-text" style="margin-bottom:12px">${esc(S.pointMsg.msg)}</p>`;
  }
  $('#pointCard').innerHTML = `<div class="pc-head"><h3>${started ? `Point ${S.point}` : 'This point'}</h3>${tag}</div>${started && who ? `<p class="sub">${who}</p>` : ''}${res}
    ${list.length ? `<ol class="plist">${list.map(d => `<li><span class="chip ${tone(d.ev.total)}">${d.ev.total}</span><span>${esc(d.desc)}</span></li>`).join('')}</ol>`
      : `<p class="muted">${started ? 'No decisions yet this point.' : 'Your shots in the current point are listed here with their scores.'}</p>`}
    ${started ? `<p class="note" style="margin-top:14px">Score ${S.score.me}–${S.score.opp}. First to 7, win by 2.</p>` : ''}`;
  const log = $('#pointCard .plist');
  if (log){
    const fade = () => log.classList.toggle('up', log.scrollTop > 4);
    log.addEventListener('scroll', fade, { passive: true });
    log.scrollTop = log.scrollHeight; fade();
  }
}

function renderDock(){
  const ph = S.phase, k = S.sit ? S.sit.kind : null;
  const deciding = ph === 'play' && k && k !== 'receive';
  $('#dock').classList.toggle('compact', !deciding);
  let html, mood = null;
  const moment = (head, main, small) => `<div class="moment-box"><strong class="mh">${head}</strong>${main ? `<p class="mm">${main}</p>` : ''}${small ? `<p class="ms">${small}</p>` : ''}</div>`;
  const { me, opp } = S.score;
  if (ph === 'setup') html = moment('Ready to play', 'Pick your style, your opponent and how points start.');
  else if (ph === 'between'){
    const w = S.pointMsg.who === 'me'; mood = w ? 'win' : 'lose';
    const state = me === opp ? `Level at ${me}–${opp}.` : me > opp ? `You lead ${me}–${opp}.` : `You trail ${me}–${opp}.`;
    html = moment(w ? 'Your point!' : 'Their point', esc(S.pointMsg.msg), `${state} First to 7, win by 2.`);
  }
  else if (ph === 'over'){
    const w = me > opp; mood = w ? 'win' : 'lose';
    html = moment(w ? 'Match won!' : 'Match lost', `${me}–${opp} against ${aLower(S.oppStyle)}.`, 'The report shows every decision next to the best one for your style.');
  }
  else {
    const label = k === 'serve' ? `${S.serve.no === 1 ? 'First' : 'Second'} serve` : k === 'receive' ? 'Their serve'
      : S.sit.isReturn ? { attack: 'Return: attack', neutral: 'Return', defend: 'Return: defend' }[k] : { attack: 'Attack ball', neutral: 'Neutral', defend: 'Defend', volley: 'At the net' }[k];
    const lead = S.replyDesc ? `<span class="sit-reply">${esc(S.replyDesc)}</span><span class="sit-arrow" aria-hidden="true">→</span>` : '';
    const st = sitText(), [, head, rest] = st.match(/^(.+?\.)(?:\s+(.*))?$/) || [, st];
    html = `<span class="pill ${k === 'receive' ? 'serve' : k}">${label}</span><p>${lead}<b class="sit-head">${esc(head)}</b>${rest ? ` <span class="sit-rest">${esc(rest)}</span>` : ''}</p>`;
  }
  const d = $('#dock');
  d.classList.toggle('moment', ph === 'setup' || ph === 'between' || ph === 'over');
  d.classList.toggle('win', mood === 'win'); d.classList.toggle('lose', mood === 'lose');
  // only rewrite when the text changes, so the headline animation plays once per point
  if (renderDock.last !== html){ renderDock.last = html; $('#dockSit').innerHTML = html; }
}

function rowHTML(label, weight, score, note, extra = ''){
  return `<div class="row"><div class="lab">${label}<em>${weight}</em></div><div class="val ${tone(score)}">${score}</div>
    <div class="bar"><i class="${tone(score)}" style="width:${score}%"></i></div><p>${esc(note)}</p>${extra}</div>`;
}

const ico = d => `<svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  g: ico('<circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/>'),
  m: ico('<path d="M12 3 2.5 20h19Z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
  b: ico('<circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.01"/>'),
  tip: ico('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  ring: '<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2F5E8E"/><circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="2"/></svg>'

};
function renderFeedback(r){
  const ev = r.ev, W = RULES.weights;
  const f = ev.F;
  const ring = v => `<svg class="ring ${tone(v)}" viewBox="0 0 36 36" aria-hidden="true"><circle class="trk" cx="18" cy="18" r="15.9"/><circle class="arc" cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray="${v} 100"/></svg>`;
  const sub = `<div class="parts">${[['Shot', f.shot.score], ['Target', f.target.score], ['Recovery', f.recovery.score]]
    .map(([n, v]) => `<span class="part">${ring(v)}${n} <b class="${tone(v)}">${v}</b></span>`).join('')}</div>`;
  // gap to the best option: 0-3 is noise, 4-10 is a small tip, >10 warns (red only when the decision itself was poor)
  const gap = r.best.total - ev.total;
  const top = gap <= 3;
  const bt = top ? 'g' : gap <= 10 ? 'tip' : ev.total >= 50 ? 'm' : 'b';
  const AL = aLower(S.style);
  const head = top ? `Top-rated choice for ${AL} here` : gap <= 10 ? `One step better (${r.best.total}%)` : `Better option for ${AL} (${r.best.total}%)`;
  $('#feedback').innerHTML = `
    <h3>Last decision</h3>
    <div class="fb-head"><div class="fb-score ${tone(ev.total)}">${ev.total}<span style="font-size:.5em">%</span></div>
      <div><div class="fb-title">${esc(r.desc)}.</div><div class="fb-sub">${esc(INTENT[ev.intent])}, ${r.kind === 'serve' ? (r.serveNo === 1 ? 'first serve' : 'second serve') : (r.isReturn ? 'return, ' : '') + { attack: 'attack ball', neutral: 'neutral ball', defend: 'defending', volley: 'at the net' }[r.kind]}</div></div></div>
    <div class="rows">
      ${rowHTML('Fundamentals', Math.round(W.fundamentals*100) + '%', f.score, f.note, sub)}
      ${rowHTML('Fits your style', Math.round(W.style*100) + '%', ev.S.score, ev.S.note)}
      ${rowHTML('Against this opponent', Math.round(W.matchup*100) + '%', ev.M.score, ev.M.note)}
    </div>
    <div class="best ${bt}">
      <p class="bh">${ICONS[bt]}<b>${head}</b></p>
      ${top ? '' : `<p class="bd">${esc(cap(r.best.desc))}.</p>`}
      <p class="bn">${ICONS.ring}<span>The ring marked IDEAL on court shows where to recover.</span></p>
    </div>`;
}

function styleAverages(){
  const out = {};
  for (const s of Object.keys(STYLES)) out[s] = avg(S.decisions.map(d => d.ev.styleAll[s].score));
  return out;
}

function renderMeter(node){
  const a = styleAverages();
  const ranked = Object.keys(a).sort((x, y) => a[y] - a[x]);
  const top = ranked[0];
  const svg = d => `<svg class="vicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON_MATCH = svg('<circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/>');
  const ICON_DRIFT = svg('<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4 4-4-4 4-4"/>');
  const matched = top === S.style || a[top] === a[S.style];
  const verdict = S.decisions.length < 3 ? '<span class="muted">Play a few more shots for a clear read.</span>'
    : matched ? `<span class="v g">${ICON_MATCH}<span>Your choices match your plan as ${aLower(S.style)}.</span></span>`
    : `<span class="v m">${ICON_DRIFT}<span>You picked ${STYLES[S.style].name}, but so far you play more like a <b>${STYLES[top].lower}</b>.</span></span>`;
  node.innerHTML = `<h3>Your decisions play like</h3>
    ${ranked.map(s => `<div class="mrow ${s === S.style ? 'me' : ''}">${styleIcon(s)}<div class="mcol"><span>${STYLES[s].name}</span><div class="bar"><i class="${tone(a[s])}" style="width:${a[s]}%"></i></div></div><span class="val">${a[s]}</span></div>`).join('')}
    <p class="verdict">${verdict}</p>`;
}

function renderReport(){
  const D = S.decisions, won = S.score.me > S.score.opp;
  const cats = [
    ['Overall', avg(D.map(d => d.ev.total))],
    ['Shot choice', avg(D.map(d => d.ev.F.shot.score))],
    ['Target', avg(D.map(d => d.ev.F.target.score))],
    ['Recovery', avg(D.map(d => d.ev.F.recovery.score))],
    ['Style fit', avg(D.map(d => d.ev.S.score))],
    ['Matchup', avg(D.map(d => d.ev.M.score))]
  ];
  const counts = {};
  for (const d of D){
    const parts = [d.ev.F.shot, d.ev.F.target, d.ev.F.recovery, d.ev.S, d.ev.M];
    for (const p of parts) if (p.score < 50){ const k = p.note.split(/(?<=\.)\s/)[0]; counts[k] = (counts[k] || 0) + 1; }
  }
  const mist = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const meter = document.createElement('div'); meter.className = 'meter'; renderMeter(meter);
  $('#report').innerHTML = `
    <button class="mclose" type="button" id="closeReport" aria-label="Close report"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <span class="pill ${won ? 'win' : 'lose'}">${won ? 'Tiebreak won' : 'Tiebreak lost'}</span>
    <h2>${S.score.me}–${S.score.opp} against ${aLower(S.oppStyle)}</h2>
    <p class="muted">${D.length} decisions as ${aLower(S.style)}. The scoreline includes luck; the decision scores don't.</p>
    <div class="cats">${cats.map(([n, v]) => `<div class="cat"><span>${n}</span><strong class="${tone(v)}">${v}%</strong></div>`).join('')}</div>
    ${meter.outerHTML}
    <h3 style="margin-top:18px">Recurring mistakes</h3>
    ${mist.length ? `<ul class="mist">${mist.map(([k, n]) => `<li>${esc(k)} <span class="muted">×${n}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin-bottom:16px">No decision part scored under 50. Clean match.</p>'}
    <h3>All decisions</h3>
    <div class="tbl"><table><thead><tr><th>Pt</th><th>Ball</th><th>Your choice</th><th>Score</th><th>Best for your style</th></tr></thead><tbody>
      ${D.map(d => `<tr><td class="n">${d.point}</td><td>${d.kind === 'serve' ? (d.serveNo === 1 ? '1st serve' : '2nd serve') : d.isReturn ? 'Return' : { attack: 'Attack', neutral: 'Neutral', defend: 'Defend', volley: 'Net' }[d.kind]}</td><td>${esc(d.desc)}</td><td class="n ${tone(d.ev.total)}">${d.ev.total}%</td><td>${d.best.total <= d.ev.total + 3 ? '<span class="muted">Your choice</span>' : esc(d.best.desc) + ` <span class="muted">(${d.best.total}%)</span>`}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="btns"><button class="go ghost" type="button" id="change">Change settings</button><button class="go" type="button" id="again">Play again</button></div>`;
}

function render(){ renderBoard(); drawDynamic(); renderControls(); renderCoach(); }

/* ============ setup + events ============ */
function buildSetup(){
  try { const s = localStorage.getItem('courtFlair.style'); if (s && STYLES[s]) S.style = s; } catch (e) {}
  $('#stylePick').innerHTML = Object.entries(STYLES).map(([k, v]) =>
    `<div><input type="radio" name="style" id="style-${k}" value="${k}" ${k === S.style ? 'checked' : ''}><label for="style-${k}">${styleIcon(k)}<span><b>${v.name}</b><span><span class="lg">${v.blurb}</span><span class="sh">${v.short}</span></span></span></label></div>`).join('');
  $('#oppPick').innerHTML = [['random', 'Random'], ...Object.entries(STYLES).map(([k, v]) => [k, v.name])].map(([k, n]) =>
    `<span><input type="radio" name="opp" id="opp-${k}" value="${k}" ${k === S.oppChoice ? 'checked' : ''}><label for="opp-${k}">${STYLES[k] ? styleIcon(k, 'sm') : '<span class="sicon sm s-rand"><i data-lucide="shuffle"></i></span>'}${n}</label></span>`).join('');
  $('#stylePick').addEventListener('change', e => { S.style = e.target.value; renderBoard(); });
  $('#oppPick').addEventListener('change', e => { S.oppChoice = e.target.value; renderBoard(); });
  $('#modePick').addEventListener('change', e => { S.mode = e.target.value; });
}

const svg = $('#court');
function serveZoneAt(x){
  const box = SERVE_ZONES[S.serve.side];
  const cx = clamp(x, box[0].x0, box[2].x1 - .01);
  return box.find(z => cx >= z.x0 && cx < z.x1);
}
function worldAt(e){
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return unproj(p.x, p.y);
}
svg.addEventListener('click', e => {
  if (S.phase !== 'play' || S.busy) return;
  if (S.sit.kind === 'receive') return;
  const w = worldAt(e);
  if (w.y < 39.5 && S.sit.kind === 'serve'){
    const z = serveZoneAt(w.x);
    S.sel.zone = `sv-${S.serve.side}-${z.place}`; S.sel.place = z.place; S.sel.target = { x: z.aim, y: 22 };
  } else if (w.y < 39.5){
    const z = zoneAt(w.x, w.y);
    S.sel.zone = z.id; S.sel.target = { ...z.aim };
  } else {
    S.sel.rec = { x: Math.round(clamp(w.x, -4, 40)*2)/2, y: clamp(w.y, 41, 86) };
  }
  S.lastAim = null;
  drawDynamic(); renderControls();
});
svg.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || S.phase !== 'play' || S.busy) return;
  const w = worldAt(e);
  const inside = w.y < 39.5 && w.y > -6 && w.x > 1 && w.x < 35;
  const id = !inside ? null : S.sit.kind === 'serve' ? (w.y > 12 ? `sv-${S.serve.side}-${serveZoneAt(w.x).place}` : null) : zoneAt(w.x, w.y).id;
  if (id !== S.hoverZone){ S.hoverZone = id; drawDynamic(); }
});
svg.addEventListener('pointerleave', () => { if (S.hoverZone){ S.hoverZone = null; drawDynamic(); } });
$('#shots').addEventListener('click', e => {
  const b = e.target.closest('.shot'); if (!b || b.disabled) return;
  S.sel.type = b.dataset.type; renderControls(); drawDynamic();
});
$('#go').addEventListener('click', () => {
  Sound.init();
  if (S.phase === 'setup') return openSetup();
  if (S.phase === 'over'){ S.reportOpen = true; return render(); }
  if (S.phase === 'between') return nextPoint();
  if (S.dockCollapsed && !(S.sel.target && S.sel.type && S.sel.rec)){ setDockCollapsed(false); return renderControls(); }
  if (S.sit && S.sit.kind === 'serve') playServe(); else playShot();
});
function openSetup(){ S.setupOpen = true; render(); }
function setDockCollapsed(on){
  S.dockCollapsed = on;
  $('#dock').classList.toggle('collapsed', on);
  const b = $('#dockToggle'); b.setAttribute('aria-expanded', String(!on)); b.textContent = on ? 'Show controls' : 'Hide controls';
  try { localStorage.setItem('courtFlair.dock', on ? 'collapsed' : 'open'); } catch (e) {}
}
$('#dockToggle').addEventListener('click', () => { setDockCollapsed(!S.dockCollapsed); renderControls(); });
$('#settingsBtn').addEventListener('click', openSetup);
$('#guideToggle').addEventListener('click', () => setGuide(!S.guideOpen, true));
$('#soundBtn').addEventListener('click', e => {
  Sound.on = !Sound.on;
  e.currentTarget.setAttribute('aria-pressed', Sound.on); $('#soundLabel').textContent = Sound.on ? 'Sound on' : 'Sound off';
  try { localStorage.setItem('courtFlair.sound', Sound.on ? '1' : '0'); } catch (err) {}
  if (Sound.on) Sound.hit(.6);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (S.reportOpen){ S.reportOpen = false; render(); }
  else if (S.setupOpen && S.matchStarted){ S.setupOpen = false; render(); }
});
$('#start').addEventListener('click', startMatch);
document.addEventListener('click', e => {
  const b = e.target.closest('button'); const id = b ? b.id : '';
  if (id === 'again') startMatch();
  if (id === 'resume'){ S.setupOpen = false; render(); }
  if (id === 'closeReport'){ S.reportOpen = false; render(); }
  if (id === 'change'){ S.reportOpen = false; openSetup(); }
});

// Fit the camera: show the stands when there is room, crop to the court on phones
function fitCourt(){ const w = $('.stage').clientWidth; svg.setAttribute('viewBox', w < 520 ? '-5 -26 110 160' : '-30 -26 160 160'); }
if (window.ResizeObserver){
  new ResizeObserver(fitCourt).observe($('.stage'));
  new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', $('#dock').offsetHeight + 'px')).observe($('#dock'));
}

// Opening view: a sample rally position behind the setup card
buildCourt();
buildStands();
buildSetup();
try { window.lucide && lucide.createIcons(); } catch (e) {}
try { if (localStorage.getItem('courtFlair.sound') === '0'){ Sound.on = false; $('#soundBtn').setAttribute('aria-pressed', 'false'); $('#soundLabel').textContent = 'Sound off'; } } catch (e) {}
S.setupOpen = true;
try { const g = localStorage.getItem('courtFlair.guide'); S.guidePref = !!g; setGuide(g !== 'closed', false); } catch (e) { setGuide(true, false); }
try { setDockCollapsed(localStorage.getItem('courtFlair.dock') === 'collapsed'); } catch (e) { setDockCollapsed(false); }
fitCourt();
S.me = { x: 24, y: 79 }; S.opp = { x: 13, y: .5 };
S.sit = { kind: 'neutral', land: { x: 24, y: 72 }, contact: { x: 24, y: 79 } };
S.ball = restBall();
render();
