/* CourtFlair: ratings, styles and coaching copy. Tune the game here. */

/* ============================================================
   RULEBOOK: every rating the coach uses. Edit these numbers.
   Scores are 0-100. Intents are the shot plans the app detects:
   drive_deep, drive_line, angle, approach, loop_deep, slice_deep,
   drop, short_middle, lob, pass, dip, into_net_player,
   volley, drop_volley, lob_volley
   ============================================================ */
const RULES = {
  weights: { fundamentals: 0.4, style: 0.4, matchup: 0.2 },
  fundamentalsMix: { shot: 0.45, target: 0.25, recovery: 0.30 },

  // Layer 1: is this shot sensible for the ball you were given? (style-independent)
  shotForSituation: {
    attack:  { drive_deep:90, drive_line:85, angle:80, approach:95, loop_deep:60, slice_deep:65, drop:75, short_middle:20, lob:70, pass:90, dip:80, into_net_player:20 },
    neutral: { drive_deep:90, drive_line:60, angle:60, approach:50, loop_deep:85, slice_deep:80, drop:40, short_middle:15, lob:75, pass:75, dip:65, into_net_player:15 },
    defend:  { drive_deep:55, drive_line:20, angle:25, approach:15, loop_deep:95, slice_deep:85, drop:15, short_middle:10, lob:90, pass:45, dip:40, into_net_player:10 },
    volley:  { volley:90, drop_volley:80, lob_volley:35 }
  },

  // Layer 2: how much each style values each shot plan
  styleIntent: {
    agg:  { drive_deep:90, drive_line:85, angle:75, approach:80, loop_deep:45, slice_deep:55, drop:55, short_middle:20, lob:60, pass:90, dip:65, into_net_player:20, volley:85, drop_volley:70, lob_volley:30 },
    all:  { drive_deep:80, drive_line:70, angle:85, approach:95, loop_deep:60, slice_deep:80, drop:85, short_middle:20, lob:75, pass:85, dip:85, into_net_player:20, volley:95, drop_volley:95, lob_volley:45 },
    moon: { drive_deep:65, drive_line:45, angle:55, approach:35, loop_deep:95, slice_deep:80, drop:50, short_middle:20, lob:95, pass:80, dip:70, into_net_player:20, volley:60, drop_volley:55, lob_volley:50 }
  },
  // Situation-specific overrides for a style ("situation.intent")
  styleSituation: {
    agg:  { 'attack.loop_deep':35, 'attack.slice_deep':40, 'defend.loop_deep':85, 'defend.slice_deep':80 },
    all:  { 'attack.approach':100, 'defend.slice_deep':90, 'defend.loop_deep':80 },
    moon: { 'attack.drive_deep':80, 'attack.approach':55, 'defend.loop_deep':100 }
  },
  // Where each style likes to stand after the shot
  styleBand: {
    agg:  { net:80, nml:20, base:95, deep:50 },
    all:  { net:95, nml:20, base:90, deep:60 },
    moon: { net:30, nml:20, base:70, deep:95 }
  },

  // Layer 3: shot plan vs the opponent's style (missing = matchupDefault)
  matchup: {
    agg:  { loop_deep_bh:92, slice_deep:80, drive_deep_center:80, drive_line:50, angle:55, approach:70, drop:60 },
    all:  { drive_deep:80, drive_deep_center:80, loop_deep:70, slice_deep:55, drop:35, approach:80, lob:88, pass:85, dip:85, into_net_player:15 },
    moon: { approach:90, drop:85, angle:80, loop_deep:45, drive_line:55, drive_deep:70, volley:85 }
  },
  matchupDefault: 65,

  // ---- SERVE (you pick placement: wide / body / T, and type: flat / slice / kick) ----
  // Layer 1: serve type for first (1) and second (2) serves
  // Layer 1 mix for serves: serve type matters most (double faults), then placement, then recovery
  serveMix: { shot: 0.55, target: 0.25, recovery: 0.20 },
  serveType: { 1: { flat:85, slice:88, kick:75 }, 2: { flat:20, slice:65, kick:95 } },
  // Layer 1: placement base (+8 when it goes to their backhand)
  servePlace: { wide:85, body:75, T:85 },
  // Layer 2: serve type by style ('second.x' = second-serve override)
  serveStyle: {
    agg:  { flat:92, slice:75, kick:55, 'second.kick':85, 'second.slice':70, 'second.flat':35 },
    all:  { flat:72, slice:92, kick:85, 'second.kick':92 },
    moon: { flat:45, slice:75, kick:95, 'second.kick':100 }
  },
  // Layer 2: where each style goes after serving (net = serve-and-volley)
  serveBand: {
    agg:  { net:70, nml:20, base:95, deep:55 },
    all:  { net:95, nml:20, base:85, deep:55 },
    moon: { net:25, nml:20, base:75, deep:95 }
  },
  // Layer 3: serve vs returner style. Keys: type_place, type_bh, place, type; serve_volley blends in when you rush the net
  serveMatchup: {
    agg:  { kick_bh:90, body:85, flat_wide:55, slice_wide:60, serve_volley:70 },
    all:  { kick_bh:85, body:78, slice_wide:80, serve_volley:60 },
    moon: { slice_wide:88, flat_wide:85, flat_T:80, kick:50, serve_volley:88 }
  },
  // Simulation odds (not scoring): fault chance per serve
  serveFault: { 1: { flat:.36, slice:.26, kick:.18 }, 2: { flat:.30, slice:.14, kick:.06 } }
};

const STYLES = {
  agg:  { name:'Aggressive Baseliner', lower:'aggressive baseliner', blurb:'Takes the ball early from the baseline, dictates with pace, and moves in to finish on a volley.', short:'Takes it early, dictates with pace, finishes at the net.' },
  all:  { name:'All-Court', lower:'all-court player', blurb:'Builds with variety (slice, angles, drop shots) and heads for the net whenever the ball sits up.', short:'Mixes slice, angles and drops, and attacks the net.' },
  moon: { name:'Moonballer', lower:'moonballer', blurb:'Heavy, high and deep. Lives well behind the baseline, makes you hit one more ball, rarely comes forward. Counterpunchers and defensive baseliners play this way too.', short:'High, heavy and deep. Makes you hit one more ball.' }
};

/* Style icons: a tiny side view of each style's signature ball (ground, net, flight) */
function styleIcon(k, size = ''){
  const base = '<path d="M2 19H34" stroke-width="1.4" opacity=".45"/><path d="M18 19V13" stroke-width="2"/>';
  const art = {
    moon: '<path d="M4 17.5Q18 -7 32 17.5" stroke-width="2" stroke-dasharray="2.4 1.7"/><circle cx="32" cy="17" r="2.3" fill="currentColor" stroke="none"/>',
    agg:  '<path d="M8 12.1L30.5 13.9" stroke-width="2.1"/><path d="M1.5 10.8H5.5M.5 13.4H4.5" stroke-width="1.4" opacity=".6"/><circle cx="32" cy="14" r="2.3" fill="currentColor" stroke="none"/>',
    all:  '<path d="M3 17H11.5" stroke-width="1.6" stroke-dasharray="1.8 1.4"/><path d="M10 14.8L12.8 17L10 19.2" stroke-width="1.6"/><path d="M15.5 9.5L27 15.8" stroke-width="2.1"/><circle cx="28.8" cy="16.6" r="2.3" fill="currentColor" stroke="none"/>'
  }[k];
  return `<span class="sicon ${size} s-${k}" aria-hidden="true"><svg viewBox="0 0 36 22" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${base}${art}</svg></span>`;
}

const INTENT = {
  drive_deep:'Deep drive', drive_line:'Drive near the line', angle:'Short angle', approach:'Approach and close the net',
  loop_deep:'Heavy loop', slice_deep:'Slice', drop:'Drop shot', short_middle:'Short ball down the middle',
  lob:'Lob', pass:'Passing shot', dip:'Dipping ball at their feet', into_net_player:'Ball at the net player',
  volley:'Volley into space', drop_volley:'Drop volley', lob_volley:'Lob volley',
  serve_flat:'Flat serve', serve_slice:'Slice serve', serve_kick:'Kick serve'
};

const SERVE_NOTES = {
  '1.flat':'Big first serve: your best chance of a free point.',
  '1.slice':'A first-serve slice with good margin and movement.',
  '1.kick':'A kick first serve is safe, but it gives up free points.',
  '2.flat':'Flat second serve: a big double-fault risk.',
  '2.slice':'Second-serve slice: fair margin, but it sits lower and flatter than a kick.',
  '2.kick':'Kick second serve: net clearance and a high bounce. The percentage play.'
};
const SERVE_STYLE_NOTES = {
  agg: {
    flat:'A big flat serve sets up your forehand on the next ball.',
    slice:'A slice works, but your pattern is pace plus a forehand.',
    kick:'Kick is your safety net on a first serve, not your weapon.',
    'second.kick':'A solid kick second serve lets you start the rally on your terms.',
    'second.flat':'Even aggressive servers pay for flat second serves.',
    'band.net':'Serve-and-volley is an occasional surprise for you, not the plan.',
    'band.deep':'Retreating deep after serving gives up the serve +1 forehand.'
  },
  all: {
    flat:'A flat serve works, but variety is your edge.',
    slice:'Slice that pulls them wide sets up your first volley or an angle.',
    kick:'A kick buys time to move forward.',
    'band.net':'Serve-and-volley: the all-court payoff.',
    'band.deep':'Backing up after the serve wastes the time you just earned.'
  },
  moon: {
    flat:'Flat serves trade your consistency for risk.',
    slice:'A slice with margin fits your game.',
    kick:'Heavy kick with plenty of margin: your kind of serve.',
    'band.net':'Charging the net after serving is off-script for a moonballer.',
    'band.base':'You can start on the baseline, but your home is a step behind it.'
  }
};
const SERVE_MATCH_NOTES = {
  agg: {
    kick_bh:'A high kick to the backhand takes an aggressive returner out of their strike zone.',
    body:'Into the body jams a big hitter and takes away their swing.',
    flat_wide:'Pace out wide gives a big hitter pace to redirect.',
    slice_wide:'A wide slice hands an aggressive returner a ball to swing at.',
    serve_volley:'Serve-and-volley against a big returner risks a pass off your own pace.'
  },
  all: {
    kick_bh:'A high kick to the backhand stops an all-court player chipping and charging.',
    body:'Into the body takes away their chip angles.',
    slice_wide:'Slice out wide pulls them off the court before they can come in.',
    serve_volley:'An all-court returner is comfortable chipping at your feet.'
  },
  moon: {
    slice_wide:'A moonballer returns from deep, so the wide slice angle is wide open.',
    flat_wide:'Standing deep leaves the wide angle open against a moonballer.',
    flat_T:'Pace down the T beats a returner standing that far back.',
    kick:"A kick bounces right into a deep-standing moonballer's strike zone.",
    serve_volley:"Serve-and-volley attacks a moonballer's slow, high returns."
  }
};

const FUND_NOTES = {
  'defend.drive_line':"You're on the run. Going for the line from here is a low-percentage gamble.",
  'defend.drive_deep':'Driving through a defensive ball is possible, but height and depth buy more time.',
  'defend.angle':'Short angles from a stretched position rarely land.',
  'defend.approach':'Coming in behind a defensive ball gives them an easy pass.',
  'defend.drop':'Drop shots from deep and on the run float up and get punished.',
  'defend.loop_deep':"Height and depth reset the point when you're stretched.",
  'defend.slice_deep':'A deep slice buys time to recover.',
  'defend.pass':'Passing on the run is hard; a lob gives you more margin.',
  'attack.approach':'Short ball, sitting up. Hitting through it and closing the net is the classic play.',
  'attack.loop_deep':'The ball sat up, and a loop gives back the time you earned.',
  'attack.slice_deep':'A slice off a sitter is safe, but it lets them off the hook.',
  'attack.drive_deep':'You stepped in and hit through the short ball.',
  'attack.drive_line':'Short ball, open court: a good moment to go for it.',
  'attack.drop':'Drop shot from inside the court: well disguised.',
  'neutral.drive_line':'Going for the line off a neutral ball risks an error for little gain.',
  'neutral.approach':'Approaching off a neutral ball leaves you exposed to the pass.',
  'neutral.drop':'A drop shot from the baseline off a neutral ball is easy to read.',
  'neutral.drive_deep':'Deep and heavy keeps a neutral rally in your favour.',
  'neutral.loop_deep':'Deep with lots of net clearance: no free points.',
  'neutral.angle':'Angles off a neutral ball can work, but they open the court for you as well.',
  '*.short_middle':'A short ball in the middle is a free attack for them.',
  '*.into_net_player':'Hitting at the net player hands them an easy volley.',
  '*.pass':'Passing into the open side.',
  '*.dip':"Low at the net player's feet forces them to volley up.",
  '*.lob':"Up and over the net player's head.",
  'volley.volley':'Volleying into the space away from them.',
  'volley.drop_volley':'A soft drop volley works when they are pinned deep.',
  'volley.lob_volley':'A lob volley from the net is a low-percentage trick shot.'
};

const STYLE_NOTES = {
  agg: {
    drive_deep:'Taking it early and hitting through the court: your game.',
    drive_line:'Changing direction with pace is your weapon.',
    approach:'Finishing forward after the attack suits your game.',
    loop_deep:'A loop is fine, but an aggressive baseliner wants to take time away, not give it.',
    slice_deep:'Slice is a rescue shot for you, not a building block.',
    volley:'Moving in to finish on the volley completes your pattern.',
    'attack.loop_deep':'An aggressive baseliner punishes a short ball with pace, not height.',
    'attack.slice_deep':'An aggressive baseliner hits through a short ball instead of slicing it.',
    'defend.loop_deep':'Even aggressive players loop to escape trouble.',
    'band.deep':'Standing that far back gives up your biggest asset: taking the ball early.'
  },
  all: {
    approach:'Getting to the net is the payoff of your game.',
    drop:'Variety like the drop shot is your edge.',
    slice_deep:'Slice is a building block in your game.',
    angle:'Using the whole court with angles fits your game.',
    loop_deep:'A loop is a legitimate option, but it leaves your net game unused.',
    volley:'Finishing at the net is your game.',
    drop_volley:'Soft hands at the net: all-court at its best.',
    'band.deep':'Retreating deep pulls you away from the front of the court, where your game lives.'
  },
  moon: {
    loop_deep:'Heavy, high and deep: exactly your game.',
    lob:"The lob is a moonballer's best friend.",
    approach:'Coming forward is off-script for a moonballer and gives them a target.',
    drive_line:'Going for lines trades your biggest strength, consistency, for risk.',
    drive_deep:'A solid drive, but your plan is height and margin.',
    volley:'Volleying is outside your comfort zone. Get back to the baseline.',
    'attack.drive_deep':'A moonballer can still step in and drive a sitter deep.',
    'defend.loop_deep':'This is where a moonballer turns defence into a neutral rally.',
    'band.net':'Standing at the net is out of your comfort zone.',
    'band.base':'You can hold the baseline, but your home is a step or two behind it.'
  }
};

const MATCH_NOTES = {
  agg: {
    loop_deep_bh:'A high ball to the backhand pulls an aggressive baseliner out of their strike zone.',
    slice_deep:'A low, skidding slice makes an aggressive baseliner lift the ball.',
    drive_deep_center:'Deep through the middle takes away their angles.',
    drive_line:'Trading pace near the lines is their game, not yours to win.',
    angle:'Angles open the court for their bigger shot.'
  },
  all: {
    drop:'A drop shot invites an all-court player forward, where they want to be.',
    slice_deep:'A floating slice is an approach ball for an all-court player.',
    drive_deep:'Deep drives keep an all-court player pinned back.',
    drive_deep_center:'Deep drives keep an all-court player pinned back.',
    approach:'Taking the net first denies them their favourite spot.',
    lob:'Lobs keep a net player honest.',
    pass:"Passing shots punish an all-court player's approach.",
    dip:'A dipping ball forces them to volley up.',
    into_net_player:'Feeding a volleyer a ball at chest height.'
  },
  moon: {
    approach:'Taking their high ball out of the air robs a moonballer of time.',
    drop:'Drawing a moonballer forward pulls them off their spot.',
    angle:'Angles drag a moonballer away from their deep home base.',
    loop_deep:'Out-looping a moonballer is playing their game.',
    drive_line:'A moonballer retrieves line drives all day. Patience pays more.',
    volley:'Finishing at the net ends the moonball rally.'
  }
};
