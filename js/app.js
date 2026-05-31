// ─── State ───────────────────────────────────────────────────────────────────
const STATE = {
  page: 'home',           // home | subject-select | theme-select | q-active | q-review | blank-active | blank-review | progress | settings
  selectedBook: null,
  selectedSubject: null,
  selectedTheme: null,
  feature: null,          // 'question' | 'blank'
  currentQuestion: '',
  currentAnswer: '',
  currentFeedback: '',
  currentBlanks: null,    // { sentences: [...] }
  userBlanks: {},         // { 'sentIdx-blankIdx': value }
  blankFeedback: null,
  isLoading: false,
  recognition: null,
  isRecording: false,
  recordingSentences: [], // [{text, editable}]
};

// ─── Log System ──────────────────────────────────────────────────────────────
const LOG = {
  KEY: 'haengjeongsa_study_log',

  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch { return []; }
  },

  save(entry) {
    const logs = this.load();
    logs.push({ ...entry, date: new Date().toISOString() });
    localStorage.setItem(this.KEY, JSON.stringify(logs));
  },

  getStats() {
    const logs = this.load();
    const stats = {};
    logs.forEach(log => {
      const key = `${log.subjectId}__${log.themeId}`;
      if (!stats[key]) stats[key] = { scores: [], count: 0, subjectId: log.subjectId, themeId: log.themeId, themeName: log.themeName, subjectName: log.subjectName, type: log.type };
      stats[key].scores.push(log.score);
      stats[key].count++;
    });
    Object.values(stats).forEach(s => {
      s.avg = Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length);
      s.last = s.scores[s.scores.length - 1];
    });
    return stats;
  },

  export() {
    const data = JSON.stringify(this.load(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `haengjeongsa_log_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  import(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data)) throw new Error('올바른 로그 파일이 아닙니다.');
          localStorage.setItem(this.KEY, JSON.stringify(data));
          resolve(data.length);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
};

// ─── Router ──────────────────────────────────────────────────────────────────
function navigate(page, opts = {}) {
  Object.assign(STATE, opts);
  STATE.page = page;
  render();
  window.scrollTo(0, 0);
}

// ─── Voice Recognition ───────────────────────────────────────────────────────
function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = true;
  return rec;
}

function startRecording() {
  if (!STATE.recognition) {
    STATE.recognition = initVoice();
    if (!STATE.recognition) { alert('이 브라우저는 음성 인식을 지원하지 않습니다.\nChrome 또는 Edge를 사용해주세요.'); return; }
  }

  STATE.isRecording = true;
  STATE.recordingSentences = [];
  let interim = '';
  let finalBuf = '';

  STATE.recognition.onresult = e => {
    interim = '';
    let newFinal = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) newFinal += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (newFinal) {
      finalBuf += newFinal;
      // 문장 단위 분리
      const sentences = finalBuf.split(/(?<=[.!?。])\s*/).filter(s => s.trim());
      if (sentences.length > 1) {
        sentences.slice(0, -1).forEach(s => {
          STATE.recordingSentences.push({ text: s.trim(), confirmed: true });
        });
        finalBuf = sentences[sentences.length - 1];
      }
    }
    // Update voice UI
    const voiceArea = document.getElementById('voice-interim');
    if (voiceArea) voiceArea.textContent = (finalBuf + interim) || '(인식 중...)';
    renderVoiceSentences();
  };

  STATE.recognition.onend = () => {
    if (STATE.isRecording) {
      // finalBuf 남은 것 처리
      if (finalBuf.trim()) STATE.recordingSentences.push({ text: finalBuf.trim(), confirmed: true });
      finalBuf = '';
      // 텍스트 textarea에 append
      const ta = document.getElementById('answer-textarea');
      if (ta && STATE.recordingSentences.length) {
        const addedText = STATE.recordingSentences.map(s => s.text).join(' ');
        ta.value = (ta.value ? ta.value + ' ' : '') + addedText;
        STATE.currentAnswer = ta.value;
      }
    }
    STATE.isRecording = false;
    STATE.recordingSentences = [];
    renderVoiceBtn();
  };

  STATE.recognition.onerror = () => {
    STATE.isRecording = false;
    renderVoiceBtn();
  };

  STATE.recognition.start();
  renderVoiceBtn();
}

function stopRecording() {
  if (STATE.recognition && STATE.isRecording) {
    STATE.recognition.stop();
  }
}

function renderVoiceSentences() {
  const container = document.getElementById('voice-sentences');
  if (!container) return;
  container.innerHTML = STATE.recordingSentences.map((s, i) => `
    <div class="voice-sentence">
      <span contenteditable="true" onblur="updateSentence(${i}, this.textContent)">${escHtml(s.text)}</span>
      <button class="btn-icon" onclick="removeSentence(${i})">✕</button>
    </div>`).join('');
}

function renderVoiceBtn() {
  const btn = document.getElementById('voice-btn');
  if (!btn) return;
  btn.textContent = STATE.isRecording ? '🔴 녹음 중지' : '🎤 음성 입력';
  btn.classList.toggle('recording', STATE.isRecording);
}

function updateSentence(i, text) {
  if (STATE.recordingSentences[i]) STATE.recordingSentences[i].text = text;
}

function removeSentence(i) {
  STATE.recordingSentences.splice(i, 1);
  renderVoiceSentences();
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function scoreColor(score) {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}

function showLoading(msg = '생성 중...') {
  const el = document.getElementById('loading-overlay');
  if (el) { el.querySelector('.loading-msg').textContent = msg; el.classList.remove('hidden'); }
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── Render ──────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  switch (STATE.page) {
    case 'home':           app.innerHTML = renderHome(); break;
    case 'subject-select': app.innerHTML = renderSubjectSelect(); break;
    case 'theme-select':   app.innerHTML = renderThemeSelect(); break;
    case 'q-active':       app.innerHTML = renderQActive(); break;
    case 'q-review':       app.innerHTML = renderQReview(); break;
    case 'blank-active':   app.innerHTML = renderBlankActive(); break;
    case 'blank-review':   app.innerHTML = renderBlankReview(); break;
    case 'progress':       app.innerHTML = renderProgress(); break;
    case 'settings':       app.innerHTML = renderSettings(); break;
    default:               app.innerHTML = renderHome();
  }
  updateNav();
}

function updateNav() {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === STATE.page ||
      (b.dataset.page === 'home' && ['home','subject-select','theme-select','q-active','q-review','blank-active','blank-review'].includes(STATE.page)));
  });
}

// ─── Pages ───────────────────────────────────────────────────────────────────
function renderHome() {
  const hasKey = !!API.getKey();
  return `
<div class="page-home">
  <div class="hero">
    <div class="hero-badge">🎯 합격을 향해</div>
    <h1 class="hero-title">행정사 2차<br><span class="hero-accent">합격기원</span></h1>
    <p class="hero-sub">AI 기반 맞춤형 학습으로 실력을 키우세요</p>
    ${!hasKey ? `<div class="alert alert-warn">⚠️ API 키 미설정 — <a href="#" onclick="navigate('settings')">설정에서 입력</a>하세요.</div>` : ''}
  </div>

  <div class="section-title">📚 학습 자료 선택</div>
  <div class="book-cards">
    ${DB.books.map(book => `
    <div class="book-card" onclick="selectBook('${book.id}')">
      <div class="book-icon">${book.icon}</div>
      <div class="book-name">${book.name}</div>
      <div class="book-meta">${book.subjects.map(s=>s.name).join(' · ')}</div>
    </div>`).join('')}
    <div class="book-card book-card-all" onclick="selectBook('all')">
      <div class="book-icon">🌐</div>
      <div class="book-name">전체 DB</div>
      <div class="book-meta">모든 과목에서 문제 출제</div>
    </div>
  </div>
</div>`;
}

function selectBook(bookId) {
  STATE.selectedBook = bookId;
  navigate('subject-select');
}

function renderSubjectSelect() {
  let subjects = [];
  if (STATE.selectedBook === 'all') {
    DB.books.forEach(b => b.subjects.forEach(s => subjects.push({ ...s, bookId: b.id, bookName: b.name })));
  } else {
    const book = DB.books.find(b => b.id === STATE.selectedBook);
    if (book) book.subjects.forEach(s => subjects.push({ ...s, bookId: book.id, bookName: book.name }));
  }

  return `
<div class="page">
  <div class="page-header">
    <button class="btn-back" onclick="navigate('home')">← 뒤로</button>
    <h2>기능 및 과목 선택</h2>
  </div>

  <div class="feature-tabs">
    <button class="feature-tab ${STATE.feature==='question'?'active':''}" onclick="STATE.feature='question'; render()">
      ✏️ 예상문제
    </button>
    <button class="feature-tab ${STATE.feature==='blank'?'active':''}" onclick="STATE.feature='blank'; render()">
      📝 빈칸 채우기
    </button>
  </div>

  ${STATE.feature ? `
  <div class="section-title">과목 선택</div>
  <div class="subject-cards">
    ${subjects.map(s => `
    <div class="subject-card" style="border-left:4px solid ${s.color}" onclick="selectSubject('${s.id}')">
      <div class="subject-name" style="color:${s.color}">${s.name}</div>
      <div class="subject-desc">${s.description}</div>
      <div class="subject-count">${s.themes.length}개 주제</div>
    </div>`).join('')}
    <div class="subject-card subject-card-random" onclick="selectSubject('random')">
      <div class="subject-name">🎲 랜덤</div>
      <div class="subject-desc">모든 과목에서 랜덤 출제</div>
    </div>
  </div>` : `<div class="tip-box">위에서 기능을 먼저 선택하세요.</div>`}
</div>`;
}

function selectSubject(subjectId) {
  if (!STATE.feature) { showToast('기능을 먼저 선택해주세요.', 'warn'); return; }

  if (subjectId === 'random') {
    // 완전 랜덤
    const all = getAllThemes();
    const theme = all[Math.floor(Math.random() * all.length)];
    STATE.selectedTheme = theme;
    STATE.selectedSubject = { id: theme.subjectId, name: theme.subjectName };
    startFeature();
    return;
  }

  let subject = null;
  DB.books.forEach(b => { const s = b.subjects.find(s => s.id === subjectId); if (s) subject = { ...s, bookId: b.id }; });
  if (!subject) return;
  STATE.selectedSubject = subject;
  navigate('theme-select');
}

function renderThemeSelect() {
  const subj = STATE.selectedSubject;
  const stats = LOG.getStats();

  return `
<div class="page">
  <div class="page-header">
    <button class="btn-back" onclick="navigate('subject-select')">← 뒤로</button>
    <h2>${subj.name} — 주제 선택</h2>
  </div>
  <div class="theme-list">
    <div class="theme-item theme-item-random" onclick="selectTheme('random')">
      🎲 랜덤 출제
    </div>
    ${subj.themes.map(t => {
      const key = `${subj.id}__${t.id}`;
      const stat = stats[key];
      const avg = stat ? stat.avg : null;
      return `
    <div class="theme-item" onclick="selectTheme('${t.id}')">
      <div class="theme-item-left">
        <span class="theme-num">${t.number}</span>
        <span class="theme-name">${t.name}</span>
        ${t.examHistory ? `<span class="exam-badge">기출 ${t.examHistory}</span>` : ''}
      </div>
      <div class="theme-item-right">
        ${avg !== null ? `<span class="score-badge" style="background:${scoreColor(avg)}">${avg}점</span>` : ''}
      </div>
    </div>`;
    }).join('')}
  </div>
</div>`;
}

function selectTheme(themeId) {
  const subj = STATE.selectedSubject;
  if (themeId === 'random') {
    const theme = subj.themes[Math.floor(Math.random() * subj.themes.length)];
    STATE.selectedTheme = { ...theme, subjectId: subj.id, subjectName: subj.name };
  } else {
    const theme = subj.themes.find(t => t.id === themeId);
    STATE.selectedTheme = { ...theme, subjectId: subj.id, subjectName: subj.name };
  }
  startFeature();
}

async function startFeature() {
  if (STATE.feature === 'question') {
    // 문제 생성
    STATE.currentAnswer = '';
    STATE.currentFeedback = '';
    STATE.currentQuestion = '';
    navigate('q-active');
    showLoading('AI가 문제를 생성 중입니다...');
    try {
      STATE.currentQuestion = await API.generateQuestion(STATE.selectedTheme, STATE.selectedTheme.subjectName);
      render();
    } catch (e) {
      showToast(e.message, 'error');
      navigate('theme-select');
    } finally { hideLoading(); }
  } else {
    // 빈칸 생성
    STATE.userBlanks = {};
    STATE.blankFeedback = null;
    navigate('blank-active');
    showLoading('AI가 빈칸 문제를 생성 중입니다...');
    try {
      STATE.currentBlanks = await API.generateBlanks(STATE.selectedTheme, STATE.selectedTheme.subjectName);
      render();
    } catch (e) {
      showToast(e.message, 'error');
      navigate('theme-select');
    } finally { hideLoading(); }
  }
}

function renderQActive() {
  const theme = STATE.selectedTheme;
  return `
<div class="page">
  <div class="page-header">
    <button class="btn-back" onclick="navigate('theme-select')">← 뒤로</button>
    <div class="page-header-info">
      <span class="header-subject">${theme.subjectName}</span>
      <span class="header-theme">${theme.name}</span>
    </div>
  </div>

  <div class="question-card">
    <div class="question-label">📋 문제</div>
    <div class="question-text">${escHtml(STATE.currentQuestion)}</div>
  </div>

  <div class="answer-section">
    <div class="answer-label">✍️ 답안 작성</div>
    <div class="answer-tools">
      <button id="voice-btn" class="btn-voice" onclick="toggleVoice()">🎤 음성 입력</button>
      <span class="voice-hint">Chrome/Edge에서 음성 입력 가능</span>
    </div>
    <div id="voice-feedback" class="voice-feedback hidden">
      <div id="voice-interim" class="voice-interim"></div>
      <div id="voice-sentences" class="voice-sentences"></div>
    </div>
    <textarea id="answer-textarea" class="answer-textarea" placeholder="답안을 입력하세요..."
      oninput="STATE.currentAnswer=this.value">${escHtml(STATE.currentAnswer)}</textarea>
  </div>

  <div class="action-bar">
    <button class="btn btn-secondary" onclick="skipQuestion()">다른 문제</button>
    <button class="btn btn-primary" onclick="submitAnswer()">답안 제출 →</button>
  </div>
</div>`;
}

function toggleVoice() {
  const fb = document.getElementById('voice-feedback');
  if (STATE.isRecording) {
    stopRecording();
    fb.classList.add('hidden');
  } else {
    fb.classList.remove('hidden');
    startRecording();
  }
}

async function submitAnswer() {
  const ta = document.getElementById('answer-textarea');
  STATE.currentAnswer = ta ? ta.value : STATE.currentAnswer;

  showLoading('AI가 답안을 채점 중입니다...');
  try {
    STATE.currentFeedback = await API.evaluateAnswer(
      STATE.currentQuestion, STATE.currentAnswer,
      STATE.selectedTheme, STATE.selectedTheme.subjectName
    );
    // 점수 파싱
    const scoreMatch = STATE.currentFeedback.match(/##\s*점수\s*\n(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

    LOG.save({
      subjectId: STATE.selectedTheme.subjectId,
      subjectName: STATE.selectedTheme.subjectName,
      themeId: STATE.selectedTheme.id,
      themeName: STATE.selectedTheme.name,
      type: 'question',
      score,
      question: STATE.currentQuestion,
      answer: STATE.currentAnswer
    });

    navigate('q-review');
  } catch (e) {
    showToast(e.message, 'error');
  } finally { hideLoading(); }
}

async function skipQuestion() {
  showLoading('AI가 새 문제를 생성 중입니다...');
  STATE.currentAnswer = '';
  STATE.currentQuestion = '';
  try {
    STATE.currentQuestion = await API.generateQuestion(STATE.selectedTheme, STATE.selectedTheme.subjectName);
    render();
  } catch (e) {
    showToast(e.message, 'error');
  } finally { hideLoading(); }
}

function renderQReview() {
  const theme = STATE.selectedTheme;
  const scoreMatch = STATE.currentFeedback.match(/##\s*점수\s*\n(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

  // 마크다운 기본 파싱
  const feedbackHtml = STATE.currentFeedback
    .replace(/## (.+)/g, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '<br>')
    .replace(/\n/g, '<br>');

  return `
<div class="page">
  <div class="page-header">
    <button class="btn-back" onclick="navigate('q-active')">← 답안 수정</button>
    <h2>채점 결과</h2>
  </div>

  <div class="score-banner" style="background:${scoreColor(score)}">
    <div class="score-number">${score}</div>
    <div class="score-label">점</div>
  </div>

  <div class="review-section">
    <div class="review-box review-question">
      <div class="review-label">📋 문제</div>
      <div>${escHtml(STATE.currentQuestion)}</div>
    </div>
    <div class="review-box review-answer">
      <div class="review-label">✍️ 내 답안</div>
      <div>${escHtml(STATE.currentAnswer) || '<em>(답안 없음)</em>'}</div>
    </div>
    <div class="review-box review-feedback">
      <div class="review-label">🤖 AI 피드백</div>
      <div class="feedback-content">${feedbackHtml}</div>
    </div>
  </div>

  <div class="action-bar">
    <button class="btn btn-secondary" onclick="navigate('theme-select')">주제 선택</button>
    <button class="btn btn-primary" onclick="nextQuestion()">다음 문제 →</button>
  </div>
</div>`;
}

async function nextQuestion() {
  STATE.currentAnswer = '';
  STATE.currentFeedback = '';
  STATE.currentQuestion = '';
  navigate('q-active');
  showLoading('AI가 문제를 생성 중입니다...');
  try {
    STATE.currentQuestion = await API.generateQuestion(STATE.selectedTheme, STATE.selectedTheme.subjectName);
    render();
  } catch (e) {
    showToast(e.message, 'error');
    navigate('theme-select');
  } finally { hideLoading(); }
}

function renderBlankActive() {
  const theme = STATE.selectedTheme;
  const data = STATE.currentBlanks;

  if (!data || !data.sentences) {
    return `<div class="page"><div class="tip-box">빈칸 데이터를 불러올 수 없습니다.</div></div>`;
  }

  const sentences = data.sentences.map((s, si) => {
    let text = s.text;
    s.blanks.forEach((b, bi) => {
      const key = `${si}-${bi}`;
      const val = STATE.userBlanks[key] || '';
      text = text.replace(`[빈칸${b.index}]`,
        `<input class="blank-input" data-key="${key}" data-answer="${escHtml(b.answer)}" value="${escHtml(val)}" placeholder="?" oninput="STATE.userBlanks['${key}']=this.value">`
      );
    });
    return `<div class="blank-sentence">${text}</div>`;
  }).join('');

  return `
<div class="page">
  <div class="page-header">
    <button class="btn-back" onclick="navigate('theme-select')">← 뒤로</button>
    <div class="page-header-info">
      <span class="header-subject">${theme.subjectName}</span>
      <span class="header-theme">${theme.name}</span>
    </div>
  </div>

  <div class="blank-instructions">
    <strong>📝 빈칸 채우기</strong> — 각 빈칸에 알맞은 단어나 숫자를 입력하세요.
  </div>

  <div class="blank-content">${sentences}</div>

  <div class="action-bar">
    <button class="btn btn-secondary" onclick="regenerateBlanks()">다시 생성</button>
    <button class="btn btn-primary" onclick="submitBlanks()">제출 →</button>
  </div>
</div>`;
}

async function regenerateBlanks() {
  STATE.userBlanks = {};
  STATE.currentBlanks = null;
  showLoading('AI가 빈칸 문제를 생성 중입니다...');
  try {
    STATE.currentBlanks = await API.generateBlanks(STATE.selectedTheme, STATE.selectedTheme.subjectName);
    render();
  } catch (e) {
    showToast(e.message, 'error');
  } finally { hideLoading(); }
}

function submitBlanks() {
  if (!STATE.currentBlanks) return;
  let total = 0, correct = 0;
  const results = STATE.currentBlanks.sentences.map((s, si) => {
    const blankResults = s.blanks.map((b, bi) => {
      const key = `${si}-${bi}`;
      const userVal = (STATE.userBlanks[key] || '').trim();
      const isCorrect = userVal.toLowerCase().replace(/\s/g,'') === b.answer.toLowerCase().replace(/\s/g,'');
      total++;
      if (isCorrect) correct++;
      return { ...b, userVal, isCorrect };
    });
    return { ...s, blankResults };
  });

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  STATE.blankFeedback = { results, score, correct, total };

  LOG.save({
    subjectId: STATE.selectedTheme.subjectId,
    subjectName: STATE.selectedTheme.subjectName,
    themeId: STATE.selectedTheme.id,
    themeName: STATE.selectedTheme.name,
    type: 'blank',
    score,
    correct,
    total
  });

  navigate('blank-review');
}

function renderBlankReview() {
  const fb = STATE.blankFeedback;
  if (!fb) return `<div class="page"><div class="tip-box">결과 데이터 없음</div></div>`;

  const resultHtml = fb.results.map(s => {
    let text = s.text;
    s.blankResults.forEach(b => {
      const cls = b.isCorrect ? 'blank-result-ok' : 'blank-result-err';
      const mark = b.isCorrect ? '✓' : '✗';
      const replacement = `<span class="${cls}">${mark} ${b.isCorrect ? b.answer : `${b.userVal || '(미입력)'} → ${b.answer}`}</span>`;
      text = text.replace(`[빈칸${b.index}]`, replacement);
    });
    return `<div class="blank-sentence">${text}</div>`;
  }).join('');

  return `
<div class="page">
  <div class="page-header">
    <button class="btn-back" onclick="navigate('blank-active')">← 다시 풀기</button>
    <h2>빈칸 결과</h2>
  </div>

  <div class="score-banner" style="background:${scoreColor(fb.score)}">
    <div class="score-number">${fb.score}</div>
    <div class="score-label">점 (${fb.correct}/${fb.total} 정답)</div>
  </div>

  <div class="blank-content">${resultHtml}</div>

  <div class="action-bar">
    <button class="btn btn-secondary" onclick="navigate('theme-select')">주제 선택</button>
    <button class="btn btn-primary" onclick="regenerateBlanks(); navigate('blank-active')">새 문제</button>
  </div>
</div>`;
}

function renderProgress() {
  const stats = LOG.getStats();
  const logs = LOG.load();

  if (logs.length === 0) {
    return `
<div class="page">
  <h2>📊 성적 관리</h2>
  <div class="tip-box">아직 학습 기록이 없습니다.<br>예상문제나 빈칸 채우기를 풀고 나면 기록이 나타납니다.</div>
</div>`;
  }

  const bySubject = {};
  DB.books.forEach(book => book.subjects.forEach(subj => {
    const subjStats = Object.values(stats).filter(s => s.subjectId === subj.id);
    if (subjStats.length > 0) bySubject[subj.id] = { subj, themes: subjStats };
  }));

  const totalAvg = Object.values(stats).reduce((sum, s) => sum + s.avg, 0) / Math.max(Object.values(stats).length, 1);

  return `
<div class="page">
  <h2>📊 성적 관리</h2>
  <div class="overall-score">
    <div class="overall-label">전체 평균</div>
    <div class="overall-num" style="color:${scoreColor(Math.round(totalAvg))}">${Math.round(totalAvg)}점</div>
    <div class="overall-count">총 ${logs.length}회 학습</div>
  </div>

  ${Object.values(bySubject).map(({ subj, themes }) => `
  <div class="progress-subject">
    <div class="progress-subject-name">${subj.name}</div>
    <div class="progress-themes">
      ${themes.map(t => `
      <div class="progress-theme">
        <div class="progress-theme-name">${t.themeName}</div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:${t.avg}%;background:${scoreColor(t.avg)}"></div>
        </div>
        <div class="progress-score" style="color:${scoreColor(t.avg)}">${t.avg}점</div>
        <div class="progress-count">${t.count}회</div>
      </div>`).join('')}
    </div>
  </div>`).join('')}

  <div class="log-actions">
    <button class="btn btn-secondary" onclick="LOG.export(); showToast('로그 파일 저장됨', 'success')">💾 로그 내보내기</button>
    <label class="btn btn-secondary" style="cursor:pointer">
      📂 로그 가져오기
      <input type="file" accept=".json" style="display:none" onchange="importLog(this)">
    </label>
  </div>
</div>`;
}

async function importLog(input) {
  if (!input.files[0]) return;
  try {
    const count = await LOG.import(input.files[0]);
    showToast(`${count}개의 로그를 가져왔습니다.`, 'success');
    render();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderSettings() {
  const fileKey = !!(window.__CLAUDE_API_KEY__ && window.__CLAUDE_API_KEY__.trim());
  const storedKey = localStorage.getItem('anthropic_api_key');
  return `
<div class="page">
  <h2>⚙️ 설정</h2>

  <div class="settings-section">
    <div class="settings-label">Anthropic API 키</div>
    <div class="settings-desc">
      AI 기능(문제 생성, 답안 채점, 빈칸 생성)을 사용하려면 Anthropic API 키가 필요합니다.<br>
      <strong>D:\\ClaudeCode\\API\\API_KEY</strong> 파일을 열어 API 키를 입력하세요.<br>
      <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>에서 발급받을 수 있습니다.
    </div>
    ${fileKey ? `
    <div class="api-key-status ok">
      ✓ API 키가 파일(D:\\ClaudeCode\\API\\API_KEY)에서 로드되었습니다.
    </div>` : `
    <div class="api-key-status empty">
      ⚠️ 파일에서 API 키를 찾을 수 없습니다. D:\\ClaudeCode\\API\\API_KEY 파일에 키를 입력하거나 아래에 직접 입력하세요.
    </div>
    <div class="api-key-row">
      <input type="password" id="api-key-input" class="input-field" placeholder="sk-ant-..." value="${escHtml(storedKey || '')}">
      <button class="btn btn-primary" onclick="saveApiKey()">저장</button>
    </div>
    <div id="api-key-status" class="api-key-status ${storedKey ? 'ok' : 'empty'}">
      ${storedKey ? '✓ API 키가 저장되어 있습니다.' : '⚠️ API 키가 설정되지 않았습니다.'}
    </div>`}
  </div>

  <div class="settings-section">
    <div class="settings-label">학습 기록 관리</div>
    <div class="log-actions">
      <button class="btn btn-secondary" onclick="LOG.export(); showToast('저장됨', 'success')">💾 로그 내보내기</button>
      <label class="btn btn-secondary" style="cursor:pointer">
        📂 로그 가져오기
        <input type="file" accept=".json" style="display:none" onchange="importLog(this)">
      </label>
      <button class="btn btn-danger" onclick="clearLogs()">🗑️ 기록 초기화</button>
    </div>
    <div class="log-count">현재 ${LOG.load().length}개의 학습 기록 있음</div>
  </div>

  <div class="settings-section">
    <div class="settings-label">앱 정보</div>
    <div class="settings-desc">
      행정사 2차 합격기원 v1.0<br>
      슬기로운 행정사 실무법 기본서 (2026년판) 기반<br>
      행정사법 18개 · 행정심판 21개 · 비송사건절차법 24개 주제
    </div>
  </div>
</div>`;
}

function saveApiKey() {
  const val = document.getElementById('api-key-input')?.value?.trim();
  if (!val) { showToast('API 키를 입력해주세요.', 'warn'); return; }
  API.setKey(val);
  showToast('API 키가 저장되었습니다.', 'success');
  render();
}

function clearLogs() {
  if (!confirm('모든 학습 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  localStorage.removeItem(LOG.KEY);
  showToast('학습 기록이 초기화되었습니다.', 'success');
  render();
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  render();
  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
});
