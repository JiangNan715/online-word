/* =====================================================
   js/ai.js
   AI 查词 & AI 听写
   - 使用浏览器内置 AI（window.ai / LanguageModel），不可用时自动降级
   - 使用 Web Speech API 朗读单词
   - 不修改 data.js / storage.js / app.js 的任何逻辑
   ===================================================== */
(function () {
  'use strict';

  /* ================================================================
     一、通用工具
     ================================================================ */

  // HTML 转义，防止注入
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 创建 AI 会话（多版本兼容）
  async function createAISession(systemPrompt = '') {
    // 新版：window.ai.languageModel
    try {
      if (window.ai && window.ai.languageModel) {
        const caps = await window.ai.languageModel.capabilities();
        if (caps && caps.available !== 'no') {
          const session = await window.ai.languageModel.create({ systemPrompt });
          return { type: 'builtin', session };
        }
      }
    } catch (e) { /* 继续尝试其他入口 */ }

    // 中间版本：window.LanguageModel 构造函数
    try {
      if (typeof window.LanguageModel === 'function') {
        const lm = new window.LanguageModel({ systemPrompt });
        return { type: 'builtin', session: lm };
      }
    } catch (e) { /* ignore */ }

    // 旧版：window.ai.assistant
    try {
      if (window.ai && window.ai.assistant) {
        const caps = await window.ai.assistant.capabilities();
        if (caps && caps.available !== 'no') {
          const session = await window.ai.assistant.create({ systemPrompt });
          return { type: 'builtin', session };
        }
      }
    } catch (e) { /* ignore */ }

    return { type: 'fallback', session: null };
  }

  // 调用 AI（若不可用返回 null）
  async function aiPrompt(ai, prompt) {
    if (!ai || ai.type !== 'builtin' || !ai.session) return null;
    try {
      const result = await ai.session.prompt(prompt);
      return String(result || '').trim();
    } catch (e) {
      console.warn('[AI] prompt 失败：', e);
      return null;
    }
  }

  // 语音朗读
  function speakWord(word) {
    if (!window.speechSynthesis) {
      console.warn('[AI] 浏览器不支持语音合成');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(word);
      utter.lang = 'en-US';
      utter.rate = 0.85;
      utter.pitch = 1;
      const voices = window.speechSynthesis.getVoices() || [];
      const enVoice = voices.find(v => /^en/i.test(v.lang));
      if (enVoice) utter.voice = enVoice;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('[AI] 语音播放失败：', e);
    }
  }

  // 本地词书兜底查词
  function localLookup(word) {
    const target = String(word || '').trim().toLowerCase();
    if (!target) return null;
    const books = getBooks();
    for (let i = 0; i < books.length; i++) {
      const w = books[i].words.find(item => item.word.toLowerCase() === target);
      if (w) return w;
    }
    return null;
  }

  /* ================================================================
     二、AI 查词页面
     ================================================================ */

  function renderAIQuery(app) {
    app.innerHTML = `
      <section class="page ai-page">
        <div class="page-header">
          <div>
            <h2>AI 查词</h2>
            <p class="muted" style="font-size:12px;letter-spacing:.06em;margin-top:4px">
              输入任意英文单词，AI 返回音标、释义与例句
            </p>
          </div>
          <span class="ai-badge" id="aiQueryStatus">检测中…</span>
        </div>

        <div class="card ai-hero">
          <div class="ai-input-wrap">
            <input id="aiQueryInput" class="ai-input" type="text"
                   placeholder="例如: ephemeral" autocomplete="off" spellcheck="false">
            <button class="btn primary" id="aiQueryBtn">查询</button>
          </div>
          <div class="ai-hint">按 Enter 也可以查询</div>
        </div>

        <div id="aiResultArea"></div>
      </section>
    `;

    const input = document.getElementById('aiQueryInput');
    const btn = document.getElementById('aiQueryBtn');
    const resultArea = document.getElementById('aiResultArea');
    const statusEl = document.getElementById('aiQueryStatus');

    // 检测 AI 可用性
    (async () => {
      const ai = await createAISession();
      if (ai.type === 'builtin') {
        statusEl.textContent = '内置 AI 已就绪';
        statusEl.classList.add('ok');
      } else {
        statusEl.textContent = '降级 · 本地词典';
        statusEl.classList.add('fallback');
      }
      window.__aiSession = ai;
    })();

    async function doQuery() {
      const word = input.value.trim();
      if (!word) { input.focus(); return; }

      // 加载动画
      resultArea.innerHTML = `
        <div class="card ai-loading">
          <div class="ai-loading-orb"></div>
          <div class="ai-loading-text">
            沉思中<span class="dots"><span>.</span><span>.</span><span>.</span></span>
          </div>
        </div>
      `;

      const sysPrompt =
        '你是英汉词典助手。用户给一个英文单词，你必须返回严格 JSON，' +
        '不要 markdown 代码块，不要任何解释。' +
        '格式：{"word":"单词","phonetic":"/音标/","meaning":"中文释义（含词性）","example":"一句英文例句"}';

      let result = null;

      // 优先内置 AI
      const ai = window.__aiSession || { type: 'fallback' };
      if (ai.type === 'builtin') {
        const session = await createAISession(sysPrompt);
        const raw = await aiPrompt(session, `查询单词：${word}`);
        if (raw) {
          try {
            const cleaned = raw
              .replace(/^```json\s*/i, '')
              .replace(/^```\s*/i, '')
              .replace(/```$/i, '')
              .trim();
            const match = cleaned.match(/\{[\s\S]*\}/);
            result = JSON.parse(match ? match[0] : cleaned);
          } catch (e) {
            result = {
              word,
              phonetic: '',
              meaning: raw.split('\n')[0].slice(0, 100),
              example: ''
            };
          }
        }
      }

      // 降级本地
      if (!result) {
        const local = localLookup(word);
        if (local) {
          result = {
            word: local.word,
            phonetic: local.phonetic || '',
            meaning: local.meaning || '（无释义）',
            example: local.example || ''
          };
        } else {
          result = {
            word,
            phonetic: '',
            meaning: '本地词库未收录。建议在 Chrome/Edge 开启内置 AI（需较新版本），即可获得完整结果。',
            example: ''
          };
        }
      }

      renderAIResult(resultArea, result);
    }

    btn.addEventListener('click', doQuery);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doQuery();
    });
    input.focus();
  }

  function renderAIResult(container, data) {
    const books = getBooks();
    const state = getState();

    container.innerHTML = `
      <div class="card ai-result">
        <div class="ai-result-head">
          <div class="ai-result-word">${esc(data.word)}</div>
          <div class="ai-result-phonetic">${esc(data.phonetic || '')}</div>
        </div>

        <div class="ai-result-row">
          <span class="ai-result-label">释义</span>
          <span class="ai-result-value">${esc(data.meaning || '—')}</span>
        </div>

        ${data.example ? `
        <div class="ai-result-row">
          <span class="ai-result-label">例句</span>
          <span class="ai-result-value ai-result-example">${esc(data.example)}</span>
        </div>
        ` : ''}

        <div class="ai-result-actions">
          <button class="btn small" id="aiSpeakBtn">${ICON.speaker} 朗读</button>
          <button class="btn primary small" id="aiAddBtn">+ 加入单词本</button>
        </div>

        <div class="ai-add-panel" id="aiAddPanel"></div>
      </div>
    `;

    document.getElementById('aiSpeakBtn').onclick = () => speakWord(data.word);

    document.getElementById('aiAddBtn').onclick = () => {
      const panel = document.getElementById('aiAddPanel');
      panel.innerHTML = `
        <div class="ai-add-row">
          <span class="muted" style="font-size:13px">加入词书：</span>
          <select class="ai-select" id="aiAddSelect">
            ${books.map(b => `
              <option value="${b.id}" ${b.id === state.currentBookId ? 'selected' : ''}>
                ${esc(b.name)}
              </option>
            `).join('')}
          </select>
          <button class="btn primary small" id="aiConfirmAdd">确认加入</button>
        </div>
      `;

      document.getElementById('aiConfirmAdd').onclick = () => {
        const bookId = document.getElementById('aiAddSelect').value;
        const book = books.find(b => b.id === bookId);
        if (!book) return;

        // 简单去重
        const exists = book.words.some(w => w.word.toLowerCase() === data.word.toLowerCase());
        if (exists) {
          panel.innerHTML = `<div class="ai-toast warn">该词已存在于「${esc(book.name)}」中</div>`;
          setTimeout(() => { panel.innerHTML = ''; }, 2200);
          return;
        }

        const ok = addWordToBook(bookId, {
          word: data.word,
          phonetic: data.phonetic,
          meaning: data.meaning,
          example: data.example
        });

        if (ok) {
          panel.innerHTML = `<div class="ai-toast">${ICON.check} 已加入「${esc(book.name)}」</div>`;
          setTimeout(() => { panel.innerHTML = ''; }, 2200);
              // ★ 记录到 AI 历史
    if (window.AIHistory) {
      window.AIHistory.add('query', {
        word: data.word,
        phonetic: data.phonetic,
        meaning: data.meaning,
        example: data.example
      });
    }
        }
      };
    };
  }

  /* ================================================================
     三、AI 听写页面
     ================================================================ */

  const DICT = {
    words: [],
    index: 0,
    correct: 0,
    wrong: [],
    active: false
  };

  function renderAIDictation(app) {
    const books = getBooks();
    const state = getState();

    if (!books.length) {
      app.innerHTML = `
        <section class="page">
          <div class="card center">
            <p class="muted">请先创建至少一个单词本。</p>
            <a class="btn primary mt-24" href="#/books">去创建</a>
          </div>
        </section>`;
      return;
    }

    app.innerHTML = `
      <section class="page ai-page">
        <div class="page-header">
          <div>
            <h2>AI 听写</h2>
            <p class="muted" style="font-size:12px;letter-spacing:.06em;margin-top:4px">
              选择词书，AI 朗读单词，你来拼写
            </p>
          </div>
          <span class="ai-badge" id="aiDictStatus">准备就绪</span>
        </div>

        <div class="card">
          <div class="ai-input-wrap">
            <select class="ai-select" id="dictBookSelect" style="flex:1;min-width:220px">
              ${books.map(b => `
                <option value="${b.id}" ${b.id === state.currentBookId ? 'selected' : ''}>
                  ${esc(b.name)}（${b.words.length} 词）
                </option>
              `).join('')}
            </select>
            <button class="btn primary" id="dictStartBtn">开始听写</button>
          </div>
          <div class="ai-hint">每轮随机抽取最多 15 个单词</div>
        </div>

        <div id="dictArea"></div>
      </section>
    `;

    document.getElementById('dictStartBtn').onclick = () => {
      const bookId = document.getElementById('dictBookSelect').value;
      startDictation(bookId);
    };
  }

  function startDictation(bookId) {
    const book = getBooks().find(b => b.id === bookId);
    const area = document.getElementById('dictArea');
    if (!book || !book.words.length) {
      area.innerHTML = `<div class="card" style="margin-top:20px">
        <p class="muted">该词书暂无单词，请先添加或导入。</p>
      </div>`;
      return;
    }

    // 随机打乱，取前 15
    const shuffled = book.words.slice().sort(() => Math.random() - 0.5).slice(0, 15);

    DICT.words = shuffled;
    DICT.index = 0;
    DICT.correct = 0;
    DICT.wrong = [];
    DICT.active = true;

    renderDictationCurrent();
  }

  function renderDictationCurrent() {
    const area = document.getElementById('dictArea');
    if (!area) return;

    if (DICT.index >= DICT.words.length) {
      renderDictationReport();
      return;
    }

    const word = DICT.words[DICT.index];
    const total = DICT.words.length;
    const progress = Math.round((DICT.index / total) * 100);

    area.innerHTML = `
      <div class="card dict-card">
        <div class="dict-progress">
          <span>第 ${DICT.index + 1} / ${total} 题</span>
          <div class="dict-progress-bar">
            <div class="dict-progress-fill" style="width:${progress}%"></div>
          </div>
        </div>

        <div class="dict-play-area">
          <button class="btn dict-play-btn" id="dictPlayBtn" title="播放单词">${ICON.speaker}</button>
          <div class="dict-play-hint">点击播放，可重复听</div>
        </div>

        <div class="dict-input-wrap">
          <input class="ai-input dict-input" id="dictInput" type="text"
                 placeholder="请输入你听到的单词"
                 autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="btn primary" id="dictSubmitBtn">提交</button>
        </div>

        <div class="dict-feedback" id="dictFeedback" style="display:none"></div>
      </div>
    `;

    const input = document.getElementById('dictInput');
    const submitBtn = document.getElementById('dictSubmitBtn');
    const playBtn = document.getElementById('dictPlayBtn');

    // 自动朗读
    setTimeout(() => speakWord(word.word), 250);

    playBtn.onclick = () => speakWord(word.word);

    const submit = () => {
      const answer = input.value.trim();
      if (!answer) { input.focus(); return; }
      checkDictationAnswer(answer);
    };

    submitBtn.onclick = submit;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    setTimeout(() => input.focus(), 150);
  }

  function checkDictationAnswer(answer) {
    const word = DICT.words[DICT.index];
    const target = word.word.toLowerCase();
    const given = answer.toLowerCase();
    const ok = target === given;

    const feedback = document.getElementById('dictFeedback');
    const input = document.getElementById('dictInput');
    const submitBtn = document.getElementById('dictSubmitBtn');

    if (ok) {
      DICT.correct++;
      feedback.className = 'dict-feedback correct';
      feedback.innerHTML = `${ICON.check} 正确 · <strong>${esc(word.word)}</strong>`;
    } else {
      DICT.wrong.push({ word, answer });
      feedback.className = 'dict-feedback wrong';
      feedback.innerHTML =
        `${ICON.cross} 你写的是 "<span style="text-decoration:line-through">${esc(answer)}</span>"` +
        ` · 正确拼写 <strong>${esc(word.word)}</strong>`;

      // 错词自动进入复习队列（复用原有 storage.js 的业务函数）
      try {
        updateRecord(word.id, 'unknown');
      } catch (e) {
        console.warn('[AI] 加入复习失败：', e);
      }
    }

    feedback.style.display = '';
    feedback.innerHTML += `
      <div class="dict-feedback-detail">
        <div><span class="muted">音标：</span>${esc(word.phonetic || '—')}</div>
        <div><span class="muted">释义：</span>${esc(word.meaning || '—')}</div>
        ${word.example ? `<div><span class="muted">例句：</span>${esc(word.example)}</div>` : ''}
      </div>
    `;

    input.disabled = true;
    submitBtn.disabled = true;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn primary dict-next';
    nextBtn.textContent = DICT.index + 1 >= DICT.words.length ? '查看报告 →' : '下一题 →';
    nextBtn.onclick = () => {
      DICT.index++;
      renderDictationCurrent();
    };
    feedback.appendChild(nextBtn);

    // 让"下一题"获得焦点，直接 Enter 即可
    setTimeout(() => nextBtn.focus(), 100);
    nextBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nextBtn.click();
    });
  }

  function renderDictationReport() {
    const total = DICT.words.length;
    const correct = DICT.correct;
    const wrongCount = DICT.wrong.length;
    const rate = total ? Math.round((correct / total) * 100) : 0;

    const area = document.getElementById('dictArea');
    area.innerHTML = `
      <div class="card dict-report">
        <h3>听写报告</h3>

        <div class="dict-report-stats">
          <div class="dict-report-stat">
            <span class="dict-report-num">${total}</span>
            <span class="dict-report-label">总题数</span>
          </div>
          <div class="dict-report-stat">
            <span class="dict-report-num correct">${correct}</span>
            <span class="dict-report-label">正确</span>
          </div>
          <div class="dict-report-stat">
            <span class="dict-report-num wrong">${wrongCount}</span>
            <span class="dict-report-label">错误</span>
          </div>
          <div class="dict-report-stat">
            <span class="dict-report-num">${rate}%</span>
            <span class="dict-report-label">正确率</span>
          </div>
        </div>

        ${wrongCount > 0 ? `
          <div class="dict-report-wrong">
            <h4>错题清单（已加入复习队列）</h4>
            ${DICT.wrong.map(item => `
              <div class="dict-wrong-row">
                <div class="dict-wrong-word">${esc(item.word.word)}</div>
                <div class="dict-wrong-meta">
                  <span class="muted">音标：</span>${esc(item.word.phonetic || '—')}<br>
                  <span class="muted">释义：</span>${esc(item.word.meaning || '—')}<br>
                  <span class="muted">你的答案：</span><span class="wrong">${esc(item.answer)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="dict-report-perfect">${ICON.check} 全部正确，状态极佳</div>
        `}

        <div class="dict-report-actions">
          <button class="btn primary" id="dictRestartBtn">再听写一次</button>
          <a class="btn" href="#/review">去复习错题</a>
        </div>
      </div>
    `;

    document.getElementById('dictRestartBtn').onclick = () => {
      const sel = document.getElementById('dictBookSelect');
      if (sel) startDictation(sel.value);
      else renderAIDictation(document.getElementById('app'));
    };

    DICT.active = false;
        // ★ 记录到 AI 历史
    if (window.AIHistory) {
      const bk = getCurrentBook();
      window.AIHistory.add('dictation', {
        bookName: bk ? bk.name : '',
        total: total,
        correct: correct,
        wrongCount: wrongCount,
        wrongList: DICT.wrong.map(w => ({ word: w.word.word, answer: w.answer }))
      });
    }
  }

   /* ================================================================
     四、暴露给 app.js 调用
     app.js 的 route() 里已经加了 'ai-query' / 'ai-dictation' 分支，
     这里把函数挂到 window 上供它调用。这是主路径。
     下面的 hashchange / load 兜底只作为冗余，不影响正常流程。
     ================================================================ */

  window.renderAIQuery = renderAIQuery;
  window.renderAIDictation = renderAIDictation;

  // 兜底：如果 app.js 没来得及调用（旧版本缓存），这几行也能让 AI 页面出来
  function tryRenderAIPage() {
    const page = (location.hash.split('/')[1] || '');
    const app = document.getElementById('app');
    if (!app) return;
    const alreadyAI = app.querySelector('.ai-page');
    if (alreadyAI) return;               // 已经是 AI 页面就不再重绘

    if (page === 'ai-query') {
      renderAIQuery(app);
    } else if (page === 'ai-dictation') {
      renderAIDictation(app);
    }
  }

  window.addEventListener('hashchange', () => {
    const page = (location.hash.split('/')[1] || '');
    if (page === 'ai-query' || page === 'ai-dictation') {
      tryRenderAIPage();
      setTimeout(tryRenderAIPage, 0);
      setTimeout(tryRenderAIPage, 60);
    }
  });

  // 预加载语音列表（Chrome 首次 getVoices 可能为空）
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  console.log('[AI Module] loaded');
})();