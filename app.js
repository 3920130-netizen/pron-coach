/* 발음코치 — 플래시카드 + 발음/억양 채점 + 한국인 습관 피드백 + 데일리 학습 */
(() => {
'use strict';

// ───────── 저장소 ─────────
const store = {
  get(k, d) { try { const v = localStorage.getItem('pc_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch {} }
};
const settings = Object.assign(
  { engine: 'browser', azKey: '', azRegion: 'koreacentral', azVoice: 'en-US-JennyNeural', bVoice: '', pass: 80, theme: '' },
  store.get('settings', {})
);
const saveSettings = () => store.set('settings', settings);
let progress = store.get('progress', {});            // { 'YYYY-MM-DD': { 0: {best, tries, passed}, ... } }
const saveProgress = () => store.set('progress', progress);

// lessons.js(배포본) + 이 기기에서 선생님이 수정한 것
function loadLessons() {
  const map = {};
  (window.LESSONS || []).forEach(l => map[l.date] = l);
  const local = store.get('lessonsLocal', {});
  Object.keys(local).forEach(d => { if (local[d] === null) delete map[d]; else map[d] = local[d]; });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}
let lessons = loadLessons();

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = s => { const d = new Date(s + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${'일월화수목금토'[d.getDay()]})`; };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }

// ───────── 영어 분석 (강세·억양·교정 포인트) ─────────
const FUNC = new Set(('a an the to of in on at for from by with as and or but so if than that this these those ' +
  'is am are was were be been being do does did have has had will would can could shall should may might must ' +
  'i me my you your he him his she her it its we us our they them their there here not just me').split(' '));
const AUX = new Set('do does did is am are was were can could will would shall should may might have has had'.split(' '));
const WH = new Set('what where when why who whom whose which how'.split(' '));

const tokenize = s => s.replace(/[’‘]/g, "'").split(/\s+/).filter(Boolean);
const norm = w => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');

function expectedIntonation(en) {
  const t = en.trim();
  const first = norm(tokenize(t)[0] || '');
  if (t.endsWith('?')) return (WH.has(first)) ? 'fall-q' : 'rise';
  return 'fall';
}
const INTO_LABEL = { rise: '끝을 올려요 ↗ (Yes/No 질문)', fall: '끝을 내려요 ↘ (평서문)', 'fall-q': '끝을 내려요 ↘ (의문사 질문)' };

const consonantEnd = w => { const n = norm(w).replace(/'/g, ''); if (!n) return false;
  const last = n.slice(-1); if (!'aeiouyw'.includes(last)) return true;
  return last === 'e' && n.length > 2 && !'aeiou'.includes(n.slice(-2, -1)) && n !== 'the' && n !== 'be' && n !== 'he' && n !== 'she' && n !== 'we' && n !== 'me'; };
const vowelStart = w => /^[aeiou]/i.test(norm(w)) && !/^(u[^n]|one|once|eu)/i.test(norm(w));

const REDUCTIONS = [
  [/\bwant to\b/i, 'want to → "wanna"'], [/\bgoing to\b/i, 'going to → "gonna"'], [/\bgot to\b/i, 'got to → "gotta"'],
  [/\b(did|would|could|should) you\b/i, m => `${m[1]} you → "${m[1].slice(0, -1)}ju" (d+y=쥬)`],
  [/\b(what|don't|can't|won't|that|got) you\b/i, m => `${m[1]} you → "…츄" (t+y=츄)`],
  [/\blet me\b/i, 'let me → "lemme"'], [/\bgive me\b/i, 'give me → "gimme"'], [/\bkind of\b/i, 'kind of → "kinda"'],
  [/\bout of\b/i, 'out of → "outta"']
];

// 문장에서 한국인이 틀리기 쉬운 포인트 미리 뽑기
function analyzeSentence(en) {
  const words = tokenize(en);
  const pts = [];
  const pick = (re) => [...new Set(words.filter(w => re.test(norm(w))).map(w => w.replace(/[.,!?]/g, '')))].slice(0, 3);
  let w;
  if ((w = pick(/th/)).length) pts.push({ k: 'th', title: 'th 발음', words: w, tip: '혀끝을 윗니 아래에 살짝 내밀고 바람을 보내세요. ㅅ·ㄷ·ㅆ로 바꾸지 않기 (think ≠ 싱크).' });
  if ((w = pick(/r/)).length) pts.push({ k: 'r', title: 'R 발음', words: w, tip: '혀끝이 입천장에 닿지 않게 뒤로 살짝 말고, 입술을 둥글게 내밀어요. 단어 앞 r은 "(우)r"처럼 시작.' });
  if ((w = pick(/l/)).length) pts.push({ k: 'l', title: 'L 발음', words: w, tip: '혀끝을 윗잇몸에 확실히 붙였다 떼요. 단어 끝 L은 "얼"처럼 어둡게 (feel=피얼).' });
  if ((w = pick(/f|ph/)).length) pts.push({ k: 'f', title: 'F 발음', words: w, tip: '윗니를 아랫입술에 가볍게 대고 바람을 내보내요. ㅍ이 아니에요.' });
  if ((w = pick(/v/)).length) pts.push({ k: 'v', title: 'V 발음', words: w, tip: '윗니를 아랫입술에 대고 목을 울리며 소리 내요. ㅂ이 아니에요.' });
  if ((w = pick(/z|[^s]s$/)).filter(x => /z/i.test(x)).length) pts.push({ k: 'z', title: 'Z 발음', words: w.filter(x => /z/i.test(x)), tip: 'ㅈ이 아니라 "ㅅ"에 목 진동(벌 소리 zzz)을 더해요.' });

  // 연음 (자음 끝 + 모음 시작)
  const links = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (/[.,!?]$/.test(words[i])) continue;
    if (consonantEnd(words[i]) && vowelStart(words[i + 1])) links.push(`${words[i]}‿${words[i + 1].replace(/[.,!?]/g, '')}`);
  }
  if (links.length) pts.push({ k: 'link', title: '연음 (이어 말하기)', words: links.slice(0, 3), tip: '앞 단어 끝 자음을 다음 단어 모음에 붙여 한 단어처럼! (pick it up → 피끼럽)' });

  // 플랩 t (모음 사이 t → 부드러운 ㄹ)
  const flaps = [];
  words.forEach((x, i) => { const n = norm(x);
    if (/[aeiou]tt?(er|y|le|ing|ed|[aeiou])/.test(n) && !/^(it|at)$/.test(n)) flaps.push(x.replace(/[.,!?]/g, ''));
    else if (/[aeiou]t$/.test(n) && words[i + 1] && vowelStart(words[i + 1]) && !/[.,!?]$/.test(x)) flaps.push(`${x}‿${words[i + 1].replace(/[.,!?]/g, '')}`);
  });
  if (flaps.length) pts.push({ k: 'flap', title: '미국식 T (ㄹ처럼)', words: [...new Set(flaps)].slice(0, 3), tip: '모음 사이의 t는 혀를 한 번 톡 치는 부드러운 ㄹ 소리 (water=워러, get it=게릿).' });

  for (const [re, label] of REDUCTIONS) { const m = en.match(re); if (m) { pts.push({ k: 'reduce', title: '축약 발음', words: [typeof label === 'function' ? label(m) : label], tip: '원어민은 빠르게 붙여서 줄여 말해요. 기능어는 약하고 짧게.' }); break; } }

  const ends = [...new Set(words.filter(x => /[pbtdkg]$/.test(norm(x)) && !/ng$/.test(norm(x)) && norm(x).length > 1).map(x => x.replace(/[.,!?]/g, '')))].slice(0, 3);
  if (ends.length) pts.push({ k: 'end', title: '끝소리에 "으" 금지', words: ends, tip: '끝 자음 뒤에 "으"를 붙이지 마세요 (good ≠ 구드, stop ≠ 스토프). 짧게 끊거나 살짝만 터뜨려요.' });

  const ed = words.filter(x => /ed$/.test(norm(x)) && norm(x).length > 3).map(x => x.replace(/[.,!?]/g, ''));
  if (ed.length) pts.push({ k: 'ed', title: '-ed 끝소리', words: ed.slice(0, 3), tip: '-ed는 "에드"가 아니에요. 대부분 짧은 t/d, t·d 뒤에서만 "이드" (delayed=딜레이드 X → 딜레잇d).' });

  return pts.slice(0, 6);
}

function sentenceHTML(en, opts = {}) {
  const words = tokenize(en);
  const into = expectedIntonation(en);
  return words.map((w, i) => {
    const n = norm(w);
    const cls = FUNC.has(n) ? 'func' : 'stress';
    const blank = opts.cloze && cls === 'stress' ? ' blank' : '';
    const color = opts.marks ? ' ' + (opts.marks[i] || '') : '';
    return `<span class="w ${cls}${blank}${color}" data-i="${i}" data-w="${esc(n)}">${esc(w)}</span>`;
  }).join(' ') + (opts.arrow ? `<span class="into">${into === 'rise' ? '↗' : '↘'}</span>` : '');
}

// ───────── 원어민 음성 (TTS) ─────────
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
  const rank = v => (/natural|online|neural/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : /samantha|aria|jenny|zira|david/i.test(v.name) ? 2 : 3) + (/en[-_]US/i.test(v.lang) ? 0 : .5);
  voices.sort((a, b) => rank(a) - rank(b));
  const sel = $('#bVoice');
  sel.innerHTML = voices.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${v.lang})</option>`).join('') || '<option value="">(영어 목소리 없음)</option>';
  if (settings.bVoice && voices.some(v => v.name === settings.bVoice)) sel.value = settings.bVoice;
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

let azureSDK = null, azSynth = null;
function loadAzureSDK() {
  if (azureSDK) return Promise.resolve(azureSDK);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.40.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js';
    s.onload = () => { azureSDK = window.SpeechSDK; azureSDK ? res(azureSDK) : rej(new Error('SDK 로드 실패')); };
    s.onerror = () => rej(new Error('Azure SDK를 불러오지 못했어요 (인터넷 확인)'));
    document.head.appendChild(s);
  });
}
const useAzure = () => settings.engine === 'azure' && settings.azKey && settings.azRegion;

function speak(text, rate = 1) {
  return new Promise(async resolve => {
    if (useAzure()) {
      try {
        const SDK = await loadAzureSDK();
        if (azSynth) { try { azSynth.close(); } catch {} }
        const cfg = SDK.SpeechConfig.fromSubscription(settings.azKey, settings.azRegion);
        azSynth = new SDK.SpeechSynthesizer(cfg, SDK.AudioConfig.fromDefaultSpeakerOutput());
        const lang = settings.azVoice.slice(0, 5);
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${settings.azVoice}"><prosody rate="${Math.round((rate - 1) * 100)}%">${esc(text)}</prosody></voice></speak>`;
        azSynth.speakSsmlAsync(ssml, r => {
          // 재생 끝날 때까지 대략 기다림 (audioDuration: 100ns 단위)
          const ms = r && r.audioDuration ? r.audioDuration / 10000 : 1500;
          setTimeout(resolve, ms + 200);
        }, e => { toast('Azure 음성 오류: ' + e); resolve(); });
        return;
      } catch (e) { toast(e.message); }
    }
    if (!('speechSynthesis' in window)) { toast('이 브라우저는 음성 재생을 지원하지 않아요'); return resolve(); }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(v => v.name === settings.bVoice) || voices[0];
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = rate; u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

// ───────── 녹음 + 억양(피치) 추적 ─────────
function detectPitch(buf, sr) {
  // 2배 다운샘플 후 정규화 자기상관
  const n = buf.length >> 1, x = new Float32Array(n);
  let rms = 0;
  for (let i = 0; i < n; i++) { x[i] = buf[i * 2]; rms += x[i] * x[i]; }
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return null;
  const s = sr / 2, minLag = Math.floor(s / 400), maxLag = Math.floor(s / 70);
  let best = 0, bestLag = -1;
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < n - lag; i++) { sum += x[i] * x[i + lag]; e1 += x[i] * x[i]; e2 += x[i + lag] * x[i + lag]; }
    corr[lag] = 2 * sum / (e1 + e2 || 1);
  }
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (corr[lag] > corr[lag - 1] && corr[lag] >= corr[lag + 1] && corr[lag] > best) { best = corr[lag]; bestLag = lag; if (best > 0.92) break; }
  }
  if (best < 0.6 || bestLag < 0) return null;
  const a = corr[bestLag - 1], b = corr[bestLag], c = corr[bestLag + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return s / (bestLag + (isFinite(shift) ? shift : 0));
}

const rec = { stream: null, ctx: null, timer: null, mr: null, chunks: [], track: [], t0: 0, url: null };
async function startCapture() {
  rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  rec.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = rec.ctx.createMediaStreamSource(rec.stream);
  const an = rec.ctx.createAnalyser(); an.fftSize = 2048; src.connect(an);
  const buf = new Float32Array(an.fftSize);
  rec.track = []; rec.t0 = performance.now();
  rec.timer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let e = 0; for (let i = 0; i < buf.length; i += 4) e += buf[i] * buf[i];
    rec.track.push({ t: (performance.now() - rec.t0) / 1000, f: detectPitch(buf, rec.ctx.sampleRate), e: Math.sqrt(e / (buf.length / 4)) });
  }, 30);
  rec.chunks = [];
  if (window.MediaRecorder) {
    rec.mr = new MediaRecorder(rec.stream);
    rec.mr.ondataavailable = ev => ev.data.size && rec.chunks.push(ev.data);
    rec.mr.start();
  }
}
function stopCapture() {
  return new Promise(resolve => {
    clearInterval(rec.timer);
    const finish = () => {
      if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
      if (rec.ctx) rec.ctx.close();
      if (rec.url) URL.revokeObjectURL(rec.url);
      rec.url = rec.chunks.length ? URL.createObjectURL(new Blob(rec.chunks, { type: rec.mr.mimeType })) : null;
      resolve();
    };
    if (rec.mr && rec.mr.state !== 'inactive') { rec.mr.onstop = finish; rec.mr.stop(); } else finish();
  });
}

function analyzePitch(track) {
  const pts = track.filter(p => p.f);
  if (pts.length < 8) return null;
  const st = f => 12 * Math.log2(f);
  const sorted = pts.map(p => st(p.f)).sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  const clean = pts.map(p => ({ t: p.t, s: st(p.f) - med })).filter(p => Math.abs(p.s) < 9);
  if (clean.length < 8) return null;
  // 3점 중앙값 스무딩
  const sm = clean.map((p, i) => { const w = clean.slice(Math.max(0, i - 1), i + 2).map(q => q.s).sort((a, b) => a - b); return { t: p.t, s: w[w.length >> 1] }; });
  const vals = sm.map(p => p.s).sort((a, b) => a - b);
  const range = vals[Math.floor(vals.length * .92)] - vals[Math.floor(vals.length * .08)];
  // 마지막 유성 구간의 끝 방향 (선형회귀)
  let end = sm.length - 1, start = end;
  while (start > 0 && sm[start].t - sm[start - 1].t < 0.18) start--;
  const seg = sm.slice(Math.max(start, end - 14), end + 1);
  let slope = 0;
  if (seg.length >= 4) {
    const mt = seg.reduce((a, p) => a + p.t, 0) / seg.length, ms = seg.reduce((a, p) => a + p.s, 0) / seg.length;
    let num = 0, den = 0; seg.forEach(p => { num += (p.t - mt) * (p.s - ms); den += (p.t - mt) ** 2; });
    slope = den ? num / den : 0;
  }
  const delta = slope * (seg.length ? seg[seg.length - 1].t - seg[0].t : 0);
  const tail = (seg.slice(-4).reduce((a, p) => a + p.s, 0) / Math.min(4, seg.length)) - (sm.reduce((a, p) => a + p.s, 0) / sm.length);
  const dir = (delta > 1.2 || tail > 2) ? 'rise' : (delta < -1.2 || tail < -1.5) ? 'fall' : 'flat';
  const voicedDur = sm[sm.length - 1].t - sm[0].t;
  return { pts: sm, range, dir, delta, voicedDur };
}

function drawPitch(pa, into) {
  const cv = $('#pitch'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const css = getComputedStyle(document.documentElement);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = css.getPropertyValue('--line'); g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  if (!pa) { g.fillStyle = css.getPropertyValue('--sub'); g.font = '28px sans-serif'; g.fillText('목소리 높낮이를 충분히 잡지 못했어요', 30, H / 2 - 14); return; }
  const t0 = pa.pts[0].t, t1 = pa.pts[pa.pts.length - 1].t || 1;
  const X = t => 20 + (t - t0) / (t1 - t0 || 1) * (W - 120), Y = s => H / 2 - s * (H / 2 - 16) / 8;
  // 기대 억양 가이드 (끝부분)
  g.strokeStyle = css.getPropertyValue('--ok'); g.setLineDash([10, 8]); g.lineWidth = 4;
  const ex = W - 90, rise = into === 'rise';
  g.beginPath(); g.moveTo(ex - 140, H / 2); g.lineTo(ex + 60, rise ? 30 : H - 30); g.stroke(); g.setLineDash([]);
  // 내 억양
  g.strokeStyle = css.getPropertyValue('--brand'); g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); let prev = null;
  pa.pts.forEach(p => { const x = X(p.t), y = Y(p.s); if (prev && p.t - prev.t < 0.12) g.lineTo(x, y); else g.moveTo(x, y); prev = p; });
  g.stroke();
}

// ───────── 채점: 기본(브라우저 음성인식) ─────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function align(exp, got) {
  // 단어 단위 편집거리 정렬 → 각 기대 단어의 상태
  const n = exp.length, m = got.length, D = [...Array(n + 1)].map(() => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) D[i][0] = i; for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (same(exp[i - 1], got[j - 1]) ? 0 : 1));
  const res = [], ins = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (same(exp[i - 1], got[j - 1]) ? 0 : 1)) {
      res[i - 1] = same(exp[i - 1], got[j - 1]) ? { s: 'ok' } : { s: 'sub', got: got[j - 1] }; i--; j--;
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { res[i - 1] = { s: 'miss' }; i--; }
    else { ins.push(got[j - 1]); j--; }
  }
  return { res, ins: ins.reverse(), dist: D[n][m] };
}
const CONTR = { "it's": 'it is', "that's": 'that is', "you're": 'you are', "i'm": 'i am', "don't": 'do not', "can't": 'cannot', "you've": 'you have', "what's": 'what is', "let's": 'let us', "i'll": 'i will' };
const same = (a, b) => a === b || (CONTR[a] && CONTR[a].replace(' ', '') === b) || (CONTR[b] && CONTR[b].replace(' ', '') === a) || (a === 'ok' && b === 'okay') || (a === 'okay' && b === 'ok');

function wordTip(exp, got) {
  const tips = [];
  const e = exp.replace(/'/g, ''), g = (got || '').replace(/'/g, '');
  if (/th/.test(e) && !/th/.test(g)) tips.push(['th', `"${exp}"의 th가 ${/^t|d|s/.test(g) ? 'ㄷ/ㅅ' : '다른'} 소리로 들렸어요 → 혀끝을 이 사이로 살짝 내밀어요.`]);
  if (e.replace(/r/g, 'l') === g.replace(/r/g, 'l') && e !== g) tips.push(['rl', `"${exp}"가 "${got}"로 들렸어요 → R/L 구분! R은 혀를 안 붙이고, L은 윗잇몸에 꼭 붙여요.`]);
  else if (/r/.test(e) && !/r/.test(g)) tips.push(['r', `"${exp}"의 R이 약해요 → 입술을 둥글게, 혀를 뒤로 말아요.`]);
  if (/f|ph/.test(e) && /p/.test(g) && !/f|ph/.test(g)) tips.push(['f', `"${exp}"의 F가 P(ㅍ)로 들렸어요 → 윗니를 아랫입술에.`]);
  if (/v/.test(e) && /b/.test(g) && !/v/.test(g)) tips.push(['v', `"${exp}"의 V가 B(ㅂ)로 들렸어요 → 윗니를 아랫입술에 대고 진동.`]);
  if (/z/.test(e) && /j|g/.test(g)) tips.push(['z', `"${exp}"의 Z가 ㅈ으로 들렸어요 → 벌 소리 zzz.`]);
  if (g && (e === g + 's' || e === g + 'es')) tips.push(['s', `"${exp}"의 끝 -s가 빠졌어요 → 끝까지 "스"(모음 없이 s만) 살려요.`]);
  if (g && (e === g + 'd' || e === g + 'ed')) tips.push(['ed', `"${exp}"의 -ed가 빠졌어요 → 짧은 t/d 소리로 마무리.`]);
  if (g && /'(ve|s|ll|re|d|m)$/.test(exp) && exp.replace(/'.*$/, '') === got) tips.push(['contr', `"${exp}"의 끝 '${exp.split("'")[1]} 소리가 빠졌어요 → 짧게라도 붙여 말해요 (you've = 유v).`]);
  if (g && g.startsWith(e) && g.length > e.length + 1) tips.push(['epen', `"${exp}" 뒤에 소리가 더 붙었어요 → 끝 자음 뒤에 "으" 넣지 않기.`]);
  if (!tips.length && got) tips.push(['gen', `"${exp}"가 "${got}"로 들렸어요 → 단어만 따로 들어보고 (단어를 탭) 천천히 따라 해보세요.`]);
  return tips;
}

function browserName() {
  const u = navigator.userAgent;
  const b = /KAKAOTALK/i.test(u) ? '카톡 내부' : /SamsungBrowser/.test(u) ? '삼성 인터넷' : /EdgA?\//.test(u) ? 'Edge' : /; wv\)/.test(u) ? '앱 내부(WebView)' : /Chrome\//.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : '기타';
  const v = (u.match(/(?:Chrome|SamsungBrowser|Version)\/(\d+)/) || [])[1] || '';
  return `${b} ${v}`.trim();
}
function recognizeBrowser(onInterim, track) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('이 브라우저는 음성인식을 지원하지 않아요. Chrome이나 Edge를 사용해 주세요.'));
    const r = new SR();
    r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
    let finalAlts = null, lastInterim = '';
    const ev = recognizeBrowser.events = [];
    ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'nomatch', 'end'].forEach(n => r.addEventListener(n, () => ev.push(n)));
    r.addEventListener('result', () => ev.push('result'));
    r.addEventListener('error', e => ev.push('error:' + e.error));
    r.onresult = ev => {
      const res = ev.results[ev.results.length - 1];
      if (res.isFinal) finalAlts = [...res].map(a => ({ text: a.transcript, conf: a.confidence }));
      else { lastInterim = [...ev.results].map(x => x[0].transcript).join(' '); onInterim(lastInterim); }
    };
    r.onerror = ev => { if (ev.error === 'no-speech') resolve([]); else if (ev.error !== 'aborted') reject(new Error(ev.error === 'not-allowed' ? '마이크 권한을 허용해 주세요.' : '음성인식 오류: ' + ev.error)); };
    r.onend = () => resolve(finalAlts || (lastInterim ? [{ text: lastInterim, conf: 0 }] : []));
    // 최신 Chrome은 녹음 중인 마이크 트랙을 채점기에 같이 넘길 수 있음 (지원 안 하면 인자 무시)
    try { track ? r.start(track) : r.start(); } catch { r.start(); }
    recognizeBrowser.stop = () => { try { r.stop(); } catch {} };
  });
}

function scoreBrowser(en, alts) {
  const exp = tokenize(en).map(norm).filter(Boolean);
  if (!alts.length) return { score: 0, marks: exp.map(() => 'miss'), fb: [{ c: 'bad', t: '소리가 안 들렸어요', d: '마이크 가까이에서 또박또박, 조금 더 크게 말해 주세요.' }], heard: '' };
  // 가장 잘 맞는 후보 선택
  let best = null;
  alts.forEach((a, k) => {
    const got = tokenize(a.text).map(norm).filter(Boolean);
    const al = align(exp, got);
    const ok = al.res.filter(x => x.s === 'ok').length;
    const cand = { a, got, al, ok, k };
    if (!best || ok > best.ok || (ok === best.ok && k < best.k)) best = cand;
  });
  const { al, a } = best;
  // 첫 후보가 아닌 걸로 맞았으면 인식기가 "헷갈렸다"는 뜻 → 감점
  const wordPct = best.ok / exp.length * 100;
  const conf = a.conf > 0 ? a.conf : 0.75;
  let score = Math.round(wordPct * 0.8 + conf * 100 * 0.2 - (best.k > 0 ? 6 : 0) - al.ins.length * 3);
  score = Math.max(0, Math.min(100, score));
  const marks = al.res.map(x => x.s === 'ok' ? (conf < 0.6 ? 'y' : 'g') : x.s === 'miss' ? 'miss' : 'r');
  const fb = [], seen = new Set();
  al.res.forEach((x, i) => {
    if (x.s === 'sub') wordTip(exp[i], x.got).forEach(([k, t]) => { if (!seen.has(k + exp[i])) { seen.add(k + exp[i]); fb.push({ c: 'bad', t: '발음 교정', d: t }); } });
    if (x.s === 'miss') fb.push({ c: FUNC.has(exp[i]) ? 'warn' : 'bad', t: '안 들린 단어', d: FUNC.has(exp[i]) ? `"${exp[i]}" — 기능어도 약하게나마 소리는 내야 해요 (완전히 삼키지 않기).` : `"${exp[i]}" — 중요한 단어예요. 강세를 넣어 또렷하게!` });
  });
  if (al.ins.length) fb.push({ c: 'warn', t: '불필요한 소리', d: `"${al.ins.join(' ')}"가 더 들렸어요. 자음 뒤에 "으" 모음을 붙이면 단어가 하나 더 생긴 것처럼 들려요.` });
  if (best.k > 0) fb.push({ c: 'warn', t: '조금 애매했어요', d: '인식기가 여러 후보 중에서 겨우 찾았어요. 강세 단어를 더 분명하게!' });
  return { score, marks, fb, heard: a.text };
}

// ───────── 채점: 정밀(Azure 발음평가) ─────────
const PH_TIP = {
  th: 'th(θ): 혀끝을 이 사이로, 바람만', dh: 'th(ð): 혀끝을 이 사이로, 목 울리기', r: 'R: 혀를 붙이지 말고 뒤로 말기 + 입술 둥글게',
  l: 'L: 혀끝을 윗잇몸에 꼭 붙이기', f: 'F: 윗니를 아랫입술에, 바람', v: 'V: 윗니를 아랫입술에, 진동',
  z: 'Z: ㅈ이 아니라 진동하는 ㅅ', zh: 'zh(ʒ): "쥐"보다 부드럽게 (usually)', sh: 'sh: 입술 내밀고 "쉬"', ch: 'ch: 입술 내밀고 "취"', jh: 'j: 입술 내밀고 "쥐"',
  s: 'S: "쉬"로 새지 않게 (see ≠ 쉬)', w: 'W: 입술을 먼저 동그랗게 모았다 풀기 (would≠우드)', y: 'Y: "이"에서 미끄러지듯',
  ae: 'æ: "애"보다 입을 크게 벌려 (cat)', aa: 'ɑ: 입을 크게 "아" (hot)', ah: 'ʌ: 짧고 힘 뺀 "어" (but)', ao: 'ɔ: 입 둥글게 "오어"',
  ih: 'ɪ: 짧고 느슨한 "이" (sit) — 길게 끌지 않기', iy: 'iː: 입꼬리 당겨 긴 "이-" (seat)', uh: 'ʊ: 짧은 "우" (book)', uw: 'uː: 입술 내밀고 긴 "우-"',
  er: 'ɚ: 혀를 말아 "어r"', ey: 'eɪ: "에"가 아니라 "에이"', ow: 'oʊ: "오"가 아니라 "오우"', ay: 'aɪ: "아이"', aw: 'aʊ: "아우"', oy: 'ɔɪ: "오이"',
  eh: 'ɛ: "에" (bed)', ax: 'ə: 아주 약한 "어" — 강세 없는 모음은 약하게', ng: 'ng: "응" 받침, 뒤에 g 소리 내지 않기',
  p: 'P: 첫소리는 바람 세게 (ㅍ)', b: 'B: 목 울리며 부드럽게', t: 'T: 끝에서는 "트"가 아니라 짧게 끊기', d: 'D: 끝에 "드"로 모음 붙이지 않기',
  k: 'K: 끝에 "크"로 모음 붙이지 않기', g: 'G: 끝에 "그" 붙이지 않기', m: 'M: 입술 닫고 울리기', n: 'N: 혀끝 윗잇몸', h: 'H: 숨만 내쉬듯'
};
const AZ_ERR = { Omission: ['bad', '빠뜨린 단어', '이 단어를 소리 내지 않았어요.'], Insertion: ['warn', '추가된 소리', '없는 소리가 끼었어요 (끝 자음 뒤 "으"?)'],
  UnexpectedBreak: ['warn', '불필요한 끊김', '단어 사이를 끊지 말고 이어 말해요.'], MissingBreak: ['warn', '쉼이 필요해요', '쉼표나 의미 단위에서 잠깐 쉬어 주세요.'],
  Monotone: ['warn', '억양이 단조로워요', '강세 단어에서 높낮이를 더 크게 주세요.'] };

let azRecognizer = null;
async function recognizeAzure(en) {
  const SDK = await loadAzureSDK();
  const cfg = SDK.SpeechConfig.fromSubscription(settings.azKey, settings.azRegion);
  cfg.speechRecognitionLanguage = settings.azVoice.slice(0, 5);
  const pa = new SDK.PronunciationAssessmentConfig(en, SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity.Phoneme, true);
  try { pa.enableProsodyAssessment = true; } catch {}
  azRecognizer = new SDK.SpeechRecognizer(cfg, SDK.AudioConfig.fromDefaultMicrophoneInput());
  pa.applyTo(azRecognizer);
  return new Promise((resolve, reject) => {
    azRecognizer.recognizeOnceAsync(r => {
      const close = () => { try { azRecognizer.close(); } catch {} azRecognizer = null; };
      if (r.reason === SDK.ResultReason.Canceled) {
        const c = SDK.CancellationDetails.fromResult(r); close();
        return reject(new Error('Azure 오류: ' + (c.errorDetails || c.reason) + ' (키/지역 확인)'));
      }
      let json = null;
      try { json = JSON.parse(r.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult)); } catch {}
      close(); resolve({ text: r.text || '', json });
    }, e => { reject(new Error('Azure 오류: ' + e)); });
  });
}

function scoreAzure(en, out) {
  const exp = tokenize(en).map(norm).filter(Boolean);
  const nb = out.json && out.json.NBest && out.json.NBest[0];
  if (!nb) return { score: 0, marks: exp.map(() => 'miss'), fb: [{ c: 'bad', t: '소리가 안 들렸어요', d: '마이크 가까이에서 또박또박 말해 주세요.' }], heard: '' };
  const P = nb.PronunciationAssessment || {};
  const words = (nb.Words || []).filter(w => (w.PronunciationAssessment || {}).ErrorType !== 'Insertion');
  const marks = exp.map((e, i) => {
    const w = words[i]; if (!w) return 'miss';
    const a = w.PronunciationAssessment || {};
    if (a.ErrorType === 'Omission') return 'miss';
    return a.AccuracyScore >= 80 ? 'g' : a.AccuracyScore >= 60 ? 'y' : 'r';
  });
  const fb = [], seenPh = new Set();
  (nb.Words || []).forEach(w => {
    const a = w.PronunciationAssessment || {};
    if (AZ_ERR[a.ErrorType]) { const [c, t, d] = AZ_ERR[a.ErrorType]; fb.push({ c, t: `${t}: "${w.Word}"`, d }); }
    if (a.ErrorType === 'Omission' || a.ErrorType === 'Insertion') return;
    if ((a.AccuracyScore ?? 100) < 80 && w.Phonemes) {
      const low = w.Phonemes.filter(p => (p.PronunciationAssessment || {}).AccuracyScore < 60);
      const tips = low.map(p => p.Phoneme).filter(ph => PH_TIP[ph] && !seenPh.has(ph + w.Word));
      tips.forEach(ph => seenPh.add(ph + w.Word));
      fb.push({ c: a.AccuracyScore < 60 ? 'bad' : 'warn', t: `"${w.Word}" ${Math.round(a.AccuracyScore)}점`, d: tips.length ? tips.map(ph => PH_TIP[ph]).join(' · ') : '단어를 탭해서 원어민 발음을 다시 들어보세요.' });
    }
  });
  return {
    score: Math.round(P.PronScore ?? P.AccuracyScore ?? 0), marks, fb, heard: out.text,
    subs: [['정확도', P.AccuracyScore], ['유창성', P.FluencyScore], ['완성도', P.CompletenessScore], ['운율', P.ProsodyScore]]
  };
}

// 억양·속도 피드백 (두 방식 공통)
function prosodyFeedback(en, pa) {
  const fb = [];
  if (!pa) return fb;
  const into = expectedIntonation(en);
  const want = into === 'rise' ? 'rise' : 'fall';
  if (pa.dir === want) fb.push({ c: 'good', t: '문장 끝 억양 👍', d: want === 'rise' ? '질문 끝을 잘 올렸어요.' : '문장 끝을 자연스럽게 내렸어요.' });
  else if (want === 'fall') fb.push({ c: 'warn', t: '문장 끝 억양', d: pa.dir === 'rise' ? '끝이 올라갔어요 ("~요↗" 한국어 습관). 평서문·의문사 질문은 마지막 강세 단어에서 툭 떨어뜨려요.' : '끝이 평평해요. 마지막 강세 단어에서 높였다가 확실히 내려요 ↘' });
  else fb.push({ c: 'warn', t: '문장 끝 억양', d: 'Yes/No 질문이에요. 마지막 단어에서 끝을 쭉 올려 주세요 ↗' });
  if (pa.range < 3.5) fb.push({ c: 'warn', t: '억양이 평평해요', d: '한국어처럼 높낮이 없이 읽었어요. 밑줄 친 강세 단어는 더 높고·길고·크게, 나머지는 약하게!' });
  else if (pa.range > 5) fb.push({ c: 'good', t: '높낮이 좋아요 👍', d: '영어다운 리듬이 살아 있어요.' });
  const n = tokenize(en).length;
  if (pa.voicedDur > 0 && n >= 4) {
    const wps = n / pa.voicedDur;
    if (wps < 1.6) fb.push({ c: 'warn', t: '조금 끊어 읽어요', d: '단어마다 끊지 말고 의미 덩어리로 이어 말해요. 기능어(to, a, the…)는 짧게 붙이기.' });
  }
  return fb;
}

const chromeIntent = () => `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;

// ───────── 화면: 홈 ─────────
function dayStatus(date) {
  const p = progress[date] || {}, l = lessons.find(x => x.date === date);
  const n = l ? l.sentences.length : 3;
  const passed = Object.values(p).filter(x => x.passed).length;
  return { passed, n, done: passed >= n };
}
function streak() {
  let s = 0; const d = new Date();
  if (!dayStatus(todayStr()).done) d.setDate(d.getDate() - 1);
  for (let k = 0; k < 400; k++) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (lessons.find(l => l.date === ds)) { if (dayStatus(ds).done) s++; else break; }
    d.setDate(d.getDate() - 1);
  }
  return s;
}
function renderHome() {
  const t = todayStr();
  let cur = lessons.find(l => l.date === t);
  const avail = lessons.filter(l => l.date <= t);
  const tp = $('#todayPanel');
  if (!cur) cur = avail[avail.length - 1];
  if (!cur) tp.innerHTML = `<div class="muted">아직 등록된 문장이 없어요. 설정 → 선생님 메뉴에서 등록해 주세요.</div>`;
  else {
    const st = dayStatus(cur.date);
    tp.innerHTML = `<div class="muted">${cur.date === t ? '오늘의 문장' : '최근 학습'} · ${fmtDate(cur.date)}${cur.card ? ' · 카드 ' + cur.card : ''}</div>
      <h2>${esc(cur.sentences[0].en)}</h2>
      <div class="muted">외 ${cur.sentences.length - 1}문장</div>
      <div class="prog">${cur.sentences.map((_, i) => `<i class="${(progress[cur.date] || {})[i]?.passed ? 'done' : ''}"></i>`).join('')}</div>
      <button class="btn primary block" data-start="${cur.date}">${st.done ? '✅ 완료 · 다시 복습하기' : st.passed ? `이어서 하기 (${st.passed}/${st.n})` : '▶ 시작하기'}</button>`;
  }
  const shown = avail.concat(lessons.filter(l => l.date > t).slice(0, 3));
  $('#dayList').innerHTML = shown.reverse().map(l => {
    const st = dayStatus(l.date), locked = l.date > t;
    const badge = locked ? '<span class="badge">🔒 예정</span>' : st.done ? '<span class="badge ok">완료</span>' : st.passed ? `<span class="badge part">${st.passed}/${st.n}</span>` : '<span class="badge">미학습</span>';
    return `<button class="day${locked ? ' locked' : ''}" ${locked ? 'disabled' : `data-start="${l.date}"`}><span class="d">${fmtDate(l.date)}</span><span class="s">${esc(l.sentences.map(s => s.en).join(' / '))}</span>${badge}</button>`;
  }).join('') || '<div class="muted">등록된 날짜가 없어요.</div>';
  $('#stStreak').textContent = streak();
  $('#stDays').textContent = lessons.filter(l => dayStatus(l.date).done).length;
  $('#stSent').textContent = Object.values(progress).reduce((a, p) => a + Object.values(p).filter(x => x.passed).length, 0);
  const warn = [];
  if (/SamsungBrowser/.test(navigator.userAgent)) warn.push(`삼성 인터넷에서는 발음 채점이 안 돼요. <a href="${chromeIntent()}">여기를 눌러 Chrome으로 열기</a>`);
  else if (/KAKAOTALK/i.test(navigator.userAgent)) warn.push(`카톡 안에서는 발음 채점이 안 돼요. <a href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">여기를 눌러 Chrome/Safari로 열기</a>`);
  else if (!SR && settings.engine === 'browser') warn.push('이 브라우저는 음성인식이 안 돼요. Chrome 또는 Edge로 열어 주세요.');
  if (location.protocol === 'file:') warn.push('파일로 직접 열면 마이크가 막힐 수 있어요. "실행.bat"으로 열어 주세요.');
  $('#envWarn').innerHTML = warn.join('<br>'); $('#envWarn').classList.toggle('on', warn.length > 0);
}

// ───────── 화면: 학습 ─────────
const S = { lesson: null, idx: 0, mode: 'en', busy: false, last: null };
function startLesson(date, from) {
  S.lesson = lessons.find(l => l.date === date); if (!S.lesson) return;
  const p = progress[date] || {};
  S.idx = from ?? Math.max(0, S.lesson.sentences.findIndex((_, i) => !p[i]?.passed));
  if (S.idx < 0 || from === undefined && dayStatus(date).done) S.idx = 0;
  show('study'); renderCard();
}
function renderCard() {
  const L = S.lesson, s = L.sentences[S.idx];
  $('#studyTitle').textContent = `${fmtDate(L.date)} · ${S.idx + 1}/${L.sentences.length}`;
  const p = progress[L.date] || {};
  $('#dots').innerHTML = L.sentences.map((_, i) => `<i class="${p[i]?.passed ? 'done' : i === S.idx ? 'cur' : ''}"></i>`).join('');
  $('#studyBody').style.display = ''; $('#doneCard').style.display = 'none';
  $$('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  $('#flip').classList.remove('flipped');
  const enHTML = `<div class="en">${sentenceHTML(s.en, { arrow: true, cloze: S.mode === 'cloze' })}</div>`;
  const koHTML = `<div class="ko">${esc(s.ko || '')}</div>`;
  if (S.mode === 'ko') { $('#frontLab').textContent = '한국어'; $('#frontText').innerHTML = koHTML; $('#backLab').textContent = 'ENGLISH'; $('#backText').innerHTML = `<div class="en">${sentenceHTML(s.en, { arrow: true })}</div>`; $('#frontHint').textContent = '영어로 먼저 말해보고 탭해서 확인'; }
  else { $('#frontLab').textContent = S.mode === 'cloze' ? '빈칸 · 탭하면 단어 보기' : 'ENGLISH'; $('#frontText').innerHTML = enHTML; $('#backLab').textContent = '한국어'; $('#backText').innerHTML = koHTML; $('#frontHint').textContent = S.mode === 'cloze' ? '빈칸을 탭하면 하나씩 보여요 · 빈 곳을 탭하면 뒤집혀요' : '탭하면 한국어 뜻'; }
  const pts = analyzeSentence(s.en);
  pts.unshift({ k: 'into', title: '억양', words: [INTO_LABEL[expectedIntonation(s.en)]], tip: '영어는 문장 끝 억양이 의미를 바꿔요. 화살표 방향을 따라 하세요. 굵은 밑줄 단어 = 강세(높고·길고·크게).' });
  $('#chips').innerHTML = pts.map((p, i) => `<button class="chip" data-tip="${i}"><b>${esc(p.title)}</b> ${esc(p.words.join(', '))}</button>`).join('');
  $('#chips')._pts = pts;
  $('#tipbox').classList.remove('on');
  $('#result').classList.remove('on');
  $('#live').innerHTML = '단어를 누르면 그 단어만 들려줘요 · <b>굵은 단어</b>에 힘을 주세요';
}

async function doAttempt() {
  if (S.busy) { // 녹음 중 다시 누르면 종료
    if (recognizeBrowser.stop) recognizeBrowser.stop();
    return;
  }
  const s = S.lesson.sentences[S.idx];
  if (settings.engine === 'azure' && !useAzure()) { toast('설정에서 Azure 키와 지역을 넣어 주세요'); return; }
  speechSynthesis && speechSynthesis.cancel();
  S.busy = true;
  const mic = $('#btnMic'); mic.classList.add('rec'); mic.textContent = '⏺ 듣고 있어요… (다 말하면 자동 종료)';
  $('#live').textContent = '';
  try {
    // 일부 폰(안드로이드 등)은 음성인식과 녹음이 마이크를 동시에 못 씀 → 그런 기기는 음성인식만 사용
    const solo = !useAzure() && store.get('micSolo', false);
    if (solo) { rec.track = []; if (rec.url) { URL.revokeObjectURL(rec.url); rec.url = null; } }
    else try { await startCapture(); } catch { throw new Error('마이크를 사용할 수 없어요. 브라우저 마이크 권한을 확인해 주세요.'); }
    let r;
    if (useAzure()) {
      $('#live').textContent = '말해 보세요 — 정밀 채점 중';
      const out = await recognizeAzure(s.en);
      await stopCapture(); r = scoreAzure(s.en, out);
    } else {
      const track = solo ? null : rec.stream.getAudioTracks()[0];
      const alts = await recognizeBrowser(t => $('#live').textContent = '“' + t + '”', track);
      if (!solo) { await new Promise(z => setTimeout(z, 250)); await stopCapture(); }
      if (!solo && !alts.length && rec.track.filter(p => p.f).length >= 10) {
        store.set('micSolo', true);
        $('#live').textContent = '이 기기에 맞게 설정을 바꿨어요. 한 번만 다시 말해 주세요 🙏';
        toast('목소리는 녹음됐는데 채점기가 못 들었어요 → 채점 우선 모드로 전환');
        return;
      }
      r = scoreBrowser(s.en, alts);
      if (!alts.length) r.fb.push({ c: 'warn', t: '진단 정보 (선생님께 캡처해 보내 주세요)', d: `${browserName()} · ${solo ? '채점우선' : '동시녹음'} · 녹음된 목소리 ${rec.track.filter(p => p.f).length} · 채점기: ${(recognizeBrowser.events || []).join('>') || '없음'}` });
    }
    const pa = analyzePitch(rec.track);
    r.fb = r.fb.concat(prosodyFeedback(s.en, pa));
    if (solo) r.fb.push({ c: 'warn', t: '억양 그래프는 꺼져 있어요', d: '이 폰은 채점과 녹음을 동시에 못 해서 발음 채점만 해요. 억양은 화살표(↗↘)와 굵은 강세 단어를 보고 따라 해 주세요.' });
    showResult(s, r, pa);
  } catch (e) {
    await stopCapture().catch(() => {});
    toast(e.message);
  } finally {
    S.busy = false; mic.classList.remove('rec'); mic.textContent = '🎙️ 따라 말하기';
  }
}

function showResult(s, r, pa) {
  const L = S.lesson, pass = r.score >= settings.pass;
  const p = progress[L.date] = progress[L.date] || {};
  const e = p[S.idx] = p[S.idx] || { best: 0, tries: 0, passed: false };
  e.tries++; e.best = Math.max(e.best, r.score); if (pass) e.passed = true;
  saveProgress();
  const col = pass ? 'var(--ok)' : r.score >= settings.pass - 15 ? 'var(--warn)' : 'var(--bad)';
  $('#ring').style.background = `conic-gradient(${col} ${r.score * 3.6}deg, var(--line) 0)`;
  $('#ring').innerHTML = `<span style="background:var(--card);width:70px;height:70px;border-radius:50%;display:grid;place-items:center">${r.score}</span>`;
  $('#verdict').textContent = pass ? 'PASS! 🎉' : '한 번 더!';
  $('#verdict').className = 'verdict ' + (pass ? 'pass' : 'fail');
  $('#verdictSub').textContent = pass ? `통과 점수 ${settings.pass}점 이상 · ${e.tries}번째 시도` : `통과까지 ${settings.pass - r.score}점 · 아래 교정 포인트를 보고 다시 해봐요` + (e.tries >= 3 ? ' (어려우면 "다음 문장"으로 넘어가도 돼요)' : '');
  $('#subScores').innerHTML = r.subs ? r.subs.map(([k, v]) => `<div><b>${v == null ? '–' : Math.round(v)}</b>${k}</div>`).join('') : '';
  $('#subScores').style.display = r.subs ? '' : 'none';
  $('#said').innerHTML = sentenceHTML(s.en, { marks: r.marks });
  const heard = r.heard ? `<li><b>들린 문장</b>“${esc(r.heard)}”</li>` : '';
  const fb = r.fb.length ? r.fb : [{ c: 'good', t: '완벽해요!', d: '원어민 발음과 거의 같아요.' }];
  $('#fb').innerHTML = heard + fb.slice(0, 7).map(f => `<li class="${f.c}"><b>${esc(f.t)}</b>${esc(f.d)}</li>`).join('');
  const into = expectedIntonation(s.en);
  drawPitch(pa, into);
  $('#pitchLegend').innerHTML = `<span style="color:var(--brand)">━ 내 목소리 높낮이</span> &nbsp; <span style="color:var(--ok)">┅ 끝 억양 목표 (${into === 'rise' ? '↗ 올리기' : '↘ 내리기'})</span>`;
  $('#btnMine').disabled = !rec.url; $('#btnCompare').disabled = !rec.url;
  $('#btnNext').textContent = S.idx < L.sentences.length - 1 ? '다음 문장 →' : '완료 →';
  $('#btnNext').disabled = !pass && e.tries < 3;
  $('#result').classList.add('on');
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderDotsOnly();
}
function renderDotsOnly() { const p = progress[S.lesson.date] || {}; $('#dots').innerHTML = S.lesson.sentences.map((_, i) => `<i class="${p[i]?.passed ? 'done' : i === S.idx ? 'cur' : ''}"></i>`).join(''); }
function playMine() { return new Promise(res => { if (!rec.url) return res(); const a = new Audio(rec.url); a.onended = a.onerror = res; a.play().catch(res); }); }
function next() {
  if (S.idx < S.lesson.sentences.length - 1) { S.idx++; renderCard(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  $('#studyBody').style.display = 'none'; $('#doneCard').style.display = '';
  const p = progress[S.lesson.date] || {};
  $('#doneSub').textContent = S.lesson.sentences.map((x, i) => `${i + 1}번 최고 ${p[i]?.best ?? 0}점`).join(' · ');
}

// ───────── 선생님 메뉴 ─────────
function edLoad(date) {
  $('#edDate').value = date;
  const l = lessons.find(x => x.date === date);
  $('#edCard').value = l?.card ?? '';
  const ss = l ? l.sentences : [{}, {}, {}];
  $('#edRows').innerHTML = [0, 1, 2].map(i => `<div class="ed-row"><input data-en="${i}" placeholder="영어 문장 ${i + 1}" value="${esc(ss[i]?.en || '')}"><input data-ko="${i}" placeholder="한국어 뜻 ${i + 1}" value="${esc(ss[i]?.ko || '')}"></div>`).join('');
}
function edRenderList() {
  $('#edList').innerHTML = lessons.slice().reverse().map(l => `<button class="day" data-ed="${l.date}"><span class="d">${fmtDate(l.date)}</span><span class="s">${l.card ? '#' + l.card + ' ' : ''}${esc(l.sentences.map(s => s.en).join(' / '))}</span></button>`).join('');
}
function edSave() {
  const date = $('#edDate').value; if (!date) return toast('날짜를 골라 주세요');
  const sentences = [0, 1, 2].map(i => ({ en: $(`[data-en="${i}"]`).value.trim(), ko: $(`[data-ko="${i}"]`).value.trim() })).filter(s => s.en);
  if (!sentences.length) return toast('영어 문장을 1개 이상 넣어 주세요');
  const local = store.get('lessonsLocal', {});
  local[date] = { date, card: $('#edCard').value ? Number($('#edCard').value) : undefined, sentences };
  store.set('lessonsLocal', local); lessons = loadLessons(); edRenderList(); toast('저장했어요');
  // 다음 날짜 자동 준비 (주말 건너뛰기)
  const d = new Date(date + 'T00:00'); do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  const nd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const card = $('#edCard').value; edLoad(nd); if (card && !lessons.find(x => x.date === nd)) $('#edCard').value = Number(card) + 1;
}
function edExport() {
  const body = 'window.LESSONS = ' + JSON.stringify(lessons.map(l => ({ date: l.date, card: l.card, sentences: l.sentences })), null, 2) + ';\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['// 날짜별 학습 문장 (카드뉴스 1장 = 하루 3문장)\n' + body], { type: 'text/javascript' }));
  a.download = 'lessons.js'; a.click();
}
function edImport(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const txt = String(fr.result), json = txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1);
      const arr = JSON.parse(json.replace(/,\s*([\]}])/g, '$1'));
      const local = store.get('lessonsLocal', {});
      arr.forEach(l => { if (l.date && l.sentences) local[l.date] = l; });
      store.set('lessonsLocal', local); lessons = loadLessons(); edRenderList(); toast(`${arr.length}개 날짜를 불러왔어요`);
    } catch { toast('파일 형식을 읽지 못했어요'); }
  };
  fr.readAsText(file);
}

// ───────── 설정 ─────────
function renderSettings() {
  $$('#engineSeg button').forEach(b => b.classList.toggle('on', b.dataset.engine === settings.engine));
  $$('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.theme === settings.theme));
  $('#azureBox').style.display = settings.engine === 'azure' ? '' : 'none';
  $('#browserVoiceBox').style.display = settings.engine === 'azure' ? 'none' : '';
  $('#engineNote').innerHTML = settings.engine === 'azure'
    ? '음소(소리) 단위로 채점해요: 정확도·유창성·완성도·운율 점수 + 어떤 소리가 틀렸는지. Azure 무료 등급은 매달 5시간까지 무료예요.'
    : '브라우저 음성인식으로 <b>원어민 귀에 그 단어로 들렸는지</b>를 채점해요. 무료지만 소리 단위 분석은 안 돼요. 더 정밀하게 하려면 Azure를 쓰세요.';
  $('#azKey').value = settings.azKey; $('#azRegion').value = settings.azRegion; $('#azVoice').value = settings.azVoice;
  $('#passScore').value = settings.pass; $('#passVal').textContent = settings.pass;
}
function applyTheme() { if (settings.theme) document.documentElement.dataset.theme = settings.theme; else delete document.documentElement.dataset.theme; }

// ───────── 이벤트 ─────────
function show(id) {
  $$('.view').forEach(v => v.classList.toggle('on', v.id === id));
  if (id === 'home') renderHome();
  if (id === 'settings') renderSettings();
  if (id === 'teacher') { edRenderList(); edLoad(todayStr()); }
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-start],[data-mode],[data-tip],[data-engine],[data-theme],[data-ed],.w');
  if (!t) return;
  if (t.dataset.go) return show(t.dataset.go);
  if (t.dataset.start) return startLesson(t.dataset.start);
  if (t.dataset.mode) { S.mode = t.dataset.mode; return renderCard(); }
  if (t.dataset.tip != null) { const p = $('#chips')._pts[+t.dataset.tip], tb = $('#tipbox'); tb.innerHTML = `<b>${esc(p.title)}</b> — ${esc(p.tip)}`; tb.classList.add('on'); return; }
  if (t.dataset.engine) { settings.engine = t.dataset.engine; saveSettings(); return renderSettings(); }
  if (t.dataset.theme != null && t.closest('#themeSeg')) { settings.theme = t.dataset.theme; saveSettings(); applyTheme(); return renderSettings(); }
  if (t.dataset.ed) return edLoad(t.dataset.ed);
  if (t.classList.contains('w')) {
    e.stopPropagation();
    if (t.classList.contains('blank') && !t.classList.contains('show')) { t.classList.add('show'); return; }
    speak(t.textContent.replace(/[.,!?]/g, ''), 0.8);
  }
}, true);
$('#flip').addEventListener('click', e => { if (!e.target.closest('.w')) $('#flip').classList.toggle('flipped'); });
$('#btnListen').onclick = () => speak(S.lesson.sentences[S.idx].en, 1);
$('#btnSlow').onclick = () => speak(S.lesson.sentences[S.idx].en, 0.7);
$('#btnMic').onclick = doAttempt;
$('#btnRetry').onclick = () => { $('#result').classList.remove('on'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
$('#btnNext').onclick = next;
$('#btnAgain').onclick = () => startLesson(S.lesson.date, 0);
$('#btnMine').onclick = playMine;
$('#btnCompare').onclick = async () => { await speak(S.lesson.sentences[S.idx].en, 1); await new Promise(r => setTimeout(r, 300)); await playMine(); };
$('#azKey').onchange = e => { settings.azKey = e.target.value.trim(); saveSettings(); };
$('#azRegion').onchange = e => { settings.azRegion = e.target.value.trim(); saveSettings(); };
$('#azVoice').onchange = e => { settings.azVoice = e.target.value; saveSettings(); };
$('#bVoice').onchange = e => { settings.bVoice = e.target.value; saveSettings(); };
$('#passScore').oninput = e => { settings.pass = +e.target.value; $('#passVal').textContent = settings.pass; saveSettings(); };
$('#btnSolo').onclick = () => { store.set('micSolo', false); toast('다음 시도부터 녹음·억양 그래프를 다시 써요'); };
$('#btnReset').onclick = () => { if (confirm('이 기기의 학습 기록을 모두 지울까요?')) { progress = {}; saveProgress(); toast('초기화했어요'); } };
$('#edDate').onchange = e => edLoad(e.target.value);
$('#edSave').onclick = edSave;
$('#edDelete').onclick = () => {
  const d = $('#edDate').value; if (!d || !confirm(d + ' 문장을 삭제할까요?')) return;
  const local = store.get('lessonsLocal', {}); local[d] = null; store.set('lessonsLocal', local); lessons = loadLessons(); edRenderList(); edLoad(d); toast('삭제했어요');
};
$('#edExport').onclick = edExport;
$('#edImport').onchange = e => e.target.files[0] && edImport(e.target.files[0]);

applyTheme();
renderHome();
})();
