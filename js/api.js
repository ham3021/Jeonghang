const API = {
  getKey() {
    const fileKey = window.__CLAUDE_API_KEY__ && window.__CLAUDE_API_KEY__.trim();
    return fileKey || localStorage.getItem('anthropic_api_key') || '';
  },
  setKey(key) { localStorage.setItem('anthropic_api_key', key); },

  async call(messages, systemPrompt, maxTokens = 2048) {
    const key = this.getKey();
    if (!key) throw new Error('NO_KEY');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('API 키가 유효하지 않습니다. 설정에서 다시 확인해주세요.');
      throw new Error(err.error?.message || `API 오류 (${res.status})`);
    }

    const data = await res.json();
    return data.content[0].text;
  },

  // ── 로컬 폴백 ──────────────────────────────────────────────────────────────
  _localQuestion(theme) {
    const kw = theme.keywords || [];
    const pick3 = kw.slice(0, 3).join(', ');
    const templates = [
      `${theme.name}의 개념과 주요 내용에 대하여 설명하시오.`,
      `${theme.name}에 관한 법적 요건과 효과를 서술하시오.`,
      `${theme.name}의 의의 및 주요 특징을 약술하시오.`,
      `${theme.name}과 관련하여 다음 개념을 설명하시오: ${pick3}`,
      `${theme.name}에서 중요한 절차와 기준을 서술하시오.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  },

  _localEvaluate(userAnswer, theme) {
    const answer = (userAnswer || '').toLowerCase();
    const keywords = theme.keywords || [];
    const found = keywords.filter(k => answer.includes(k.toLowerCase()));
    const missing = keywords.filter(k => !answer.includes(k.toLowerCase()));
    const base = Math.min(keywords.length, 10);
    const score = base > 0 ? Math.round((found.length / base) * 100) : (userAnswer ? 50 : 0);

    const foundList = found.length > 0
      ? found.map(k => `- **${k}**`).join('\n')
      : '- (핵심 키워드 미발견)';
    const missingList = missing.slice(0, 6).map(k => `- **${k}**`).join('\n') || '- 없음';
    const modelPoints = keywords.slice(0, 8).map(k => `- ${k}`).join('\n');

    return `## 점수\n${score}점\n\n## 잘한 점\n${foundList}\n\n## 부족한 점 / 보완할 내용\n${missingList}\n\n## 모범 답안 요점\n${modelPoints}\n\n## 학습 조언\n교재의 핵심 키워드를 중심으로 답안을 구성하세요.\n*(※ 키워드 매칭 채점 — API 키 설정 시 AI 상세 채점으로 전환됩니다)*`;
  },

  _localBlanks(theme) {
    const keywords = theme.keywords || [];
    const lines = (theme.content || '')
      .split(/\n/)
      .map(s => s.trim())
      .filter(s => s.length > 15 && s.length < 200);

    // 매번 다른 문장과 키워드가 선택되도록 셔플
    const shuffledLines = [...lines].sort(() => Math.random() - 0.5);
    const result = [];
    let idx = 1;

    for (const line of shuffledLines) {
      if (result.length >= 7) break;
      const hits = keywords.filter(k => line.includes(k));
      if (hits.length === 0) continue;
      const shuffledHits = [...hits].sort(() => Math.random() - 0.5);
      const toBlank = shuffledHits.slice(0, Math.random() > 0.5 ? 2 : 1);
      let text = line;
      const blanks = [];
      for (const kw of toBlank) {
        if (text.includes(kw)) {
          text = text.replace(kw, `[빈칸${idx}]`);
          blanks.push({ index: idx, answer: kw });
          idx++;
        }
      }
      if (blanks.length > 0) result.push({ text, blanks });
    }

    // 문장이 부족하면 키워드로 직접 생성
    if (result.length < 3) {
      const shuffledKw = [...keywords].sort(() => Math.random() - 0.5);
      shuffledKw.slice(0, 5).forEach((kw) => {
        if (result.length >= 7) return;
        result.push({
          text: `이 주제에서 [빈칸${idx}]은(는) 핵심 개념입니다.`,
          blanks: [{ index: idx, answer: kw }]
        });
        idx++;
      });
    }

    return { sentences: result };
  },

  // ── 공개 메서드 ────────────────────────────────────────────────────────────
  async generateQuestion(theme, subject, difficulty = '중간') {
    if (!this.getKey()) return this._localQuestion(theme);

    const system = `당신은 행정사 2차 시험을 준비하는 수험생을 위한 문제 출제 전문가입니다.
행정사 2차 시험은 주관식 서술형으로, 약술형(20점)과 사례형(40점) 문제가 출제됩니다.
주어진 교재 내용을 바탕으로 실제 시험에 나올 법한 문제를 출제하세요.

문제 출제 규칙:
1. 실제 시험 출제 스타일로 작성 (예: "~에 대하여 서술하시오", "~의 요건과 효과에 대해 설명하시오")
2. 단순 암기가 아닌 이해력을 평가하는 문제
3. 한국어로 작성
4. 문제만 출력 (해설, 정답 없음)`;

    const user = `과목: ${subject}
주제: ${theme.name}
난이도: ${difficulty}

교재 내용:
${theme.content}

위 내용을 바탕으로 행정사 2차 시험 스타일의 주관식 서술형 문제 1개를 출제해주세요.
문제만 출력하고, 번호나 "문제:" 같은 접두사 없이 바로 문제 문장으로 시작하세요.`;

    try {
      return await this.call([{ role: 'user', content: user }], system, 512);
    } catch (e) {
      if (e.message === 'NO_KEY') return this._localQuestion(theme);
      throw e;
    }
  },

  async evaluateAnswer(question, userAnswer, theme, subject) {
    if (!this.getKey()) return this._localEvaluate(userAnswer, theme);

    const system = `당신은 행정사 2차 시험 채점 전문가입니다.
수험생의 답안을 교재 내용과 비교하여 정확하고 건설적인 피드백을 제공하세요.
한국어로 응답하며, 수험생이 실력을 향상시킬 수 있도록 구체적으로 피드백하세요.`;

    const user = `과목: ${subject}
주제: ${theme.name}

[문제]
${question}

[교재 핵심 내용]
${theme.content}

[수험생 답안]
${userAnswer || '(답안 없음)'}

다음 형식으로 평가해주세요:

## 점수
[0-100점 사이의 점수]점

## 잘한 점
[수험생이 정확하게 서술한 내용]

## 부족한 점 / 보완할 내용
[누락되거나 잘못된 내용, 추가해야 할 핵심 키워드]

## 모범 답안 요점
[핵심 내용을 정리한 모범 답안 요점 (불릿 포인트로)]

## 학습 조언
[이 주제를 더 잘 이해하기 위한 조언]`;

    try {
      return await this.call([{ role: 'user', content: user }], system, 1500);
    } catch (e) {
      if (e.message === 'NO_KEY') return this._localEvaluate(userAnswer, theme);
      throw e;
    }
  },

  async generateBlanks(theme, subject) {
    if (!this.getKey()) return this._localBlanks(theme);

    const system = `당신은 행정사 2차 시험용 빈칸 채우기 문제 전문가입니다.
교재의 핵심 내용에서 중요한 키워드나 숫자, 법률 용어에 빈칸을 만들어 학습 효과를 높이세요.
반드시 JSON 형식으로만 응답하세요.`;

    const user = `과목: ${subject}
주제: ${theme.name}

교재 내용:
${theme.content}

주요 키워드: ${theme.keywords.join(', ')}

위 내용을 바탕으로 빈칸 채우기 문제를 만들어주세요.
빈칸은 반드시 이 주제의 핵심 법률 용어, 중요 숫자(기간·횟수·금액 등), 법적 효과·요건 등 가장 중요한 내용에 만드세요.
같은 범위를 여러 번 풀 수 있도록, 이번에는 교재 내용 중 무작위로 다른 위치의 핵심 내용에 빈칸을 만들어 매번 다양한 부분을 연습할 수 있게 하세요.

다음 JSON 형식으로 정확히 응답하세요 (다른 텍스트 없이 JSON만, hint 필드 포함 금지):
{
  "sentences": [
    {
      "text": "행정사는 업무를 위임받으면 업무처리부를 작성하여 [빈칸1]간 보관해야 한다.",
      "blanks": [
        {"index": 1, "answer": "1년"}
      ]
    }
  ]
}

5~8개의 문장을 만들어주세요. 각 문장에는 1~3개의 빈칸이 있어야 합니다.`;

    try {
      const raw = await this.call([{ role: 'user', content: user }], system, 2000);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('빈칸 생성 응답 파싱 오류');
      return JSON.parse(match[0]);
    } catch (e) {
      if (e.message === 'NO_KEY') return this._localBlanks(theme);
      throw e;
    }
  },

  async generateModelAnswer(question, theme, subject) {
    if (!this.getKey()) return '*(API 키 설정 시 모범 답안이 생성됩니다)*';

    const system = `당신은 행정사 2차 시험 전문가입니다. 주어진 문제에 대한 모범 답안을 작성해주세요.
실제 시험 답안 형식으로, 핵심 내용을 빠짐없이 포함하여 작성하세요.`;

    const user = `과목: ${subject}
주제: ${theme.name}

[문제]
${question}

[교재 핵심 내용]
${theme.content}

위 문제에 대한 모범 답안을 작성해주세요.
실제 시험 답안 형식으로 체계적으로 서술하세요.`;

    return this.call([{ role: 'user', content: user }], system, 1000);
  }
};
