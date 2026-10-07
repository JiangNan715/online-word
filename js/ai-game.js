/* =====================================================
   js/ai-game.js
   AI 情景对话闯关 · AI 可视化联想词网 · AI 单词猜谜
   复用 ai.js 的能力，不修改任何业务逻辑
   ===================================================== */
(function () {
  'use strict';

  /* ---------- 通用工具 ---------- */
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 创建会话（多入口兼容）
  async function createAISession(systemPrompt = '') {
    try {
      if (window.ai && window.ai.languageModel) {
        const caps = await window.ai.languageModel.capabilities();
        if (caps && caps.available !== 'no') {
          const session = await window.ai.languageModel.create({ systemPrompt });
          return { type: 'builtin', session };
        }
      }
    } catch (e) {}
    try {
      if (typeof window.LanguageModel === 'function') {
        return { type: 'builtin', session: new window.LanguageModel({ systemPrompt }) };
      }
    } catch (e) {}
    try {
      if (window.ai && window.ai.assistant) {
        const caps = await window.ai.assistant.capabilities();
        if (caps && caps.available !== 'no') {
          return { type: 'builtin', session: await window.ai.assistant.create({ systemPrompt }) };
        }
      }
    } catch (e) {}
    return { type: 'fallback', session: null };
  }

  async function aiPrompt(ai, prompt) {
    if (!ai || ai.type !== 'builtin' || !ai.session) return null;
    try { return String(await ai.session.prompt(prompt) || '').trim(); }
    catch (e) { console.warn('[AI-Game] prompt 失败：', e); return null; }
  }

  // 一次调用 + 解析 JSON
  async function callAIJson(systemPrompt, userPrompt) {
    const ai = await createAISession(systemPrompt);
    const raw = await aiPrompt(ai, userPrompt);
    if (!raw) return null;
    const cleaned = raw
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    try { return JSON.parse(m ? m[0] : cleaned); }
    catch (e) { return null; }
  }

  // 语音朗读
  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.9;
      const vs = window.speechSynthesis.getVoices() || [];
      const v = vs.find(x => /^en/i.test(x.lang));
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // 本地词书查找
  function localLookup(word) {
    const t = String(word || '').trim().toLowerCase();
    if (!t) return null;
    const books = getBooks();
    for (let i = 0; i < books.length; i++) {
      const w = books[i].words.find(x => x.word.toLowerCase() === t);
      if (w) return w;
    }
    return null;
  }

  /* ---------- 今日待背单词 ---------- */
  function getTodayWords() {
    const book = getCurrentBook();
    if (!book) return [];
    const state = getState();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // 1. 今日已学习的
    const studied = book.words.filter(w => {
      const r = state.records[w.id];
      if (!r || !r.lastReview) return false;
      const t = new Date(r.lastReview);
      const key = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
      return key === today;
    });
    if (studied.length) return studied.slice(0, 8);

    // 2. 还没学过的
    const fresh = book.words.filter(w => !state.records[w.id]);
    if (fresh.length) return fresh.slice(0, 8);

    // 3. 学习中 / 待复习
    return book.words
      .filter(w => {
        const r = state.records[w.id];
        return r && r.status !== 'mastered';
      })
      .slice(0, 8);
  }

  /* ---------- 待复习单词 ---------- */
  function getReviewWords() {
    const book = getCurrentBook();
    if (!book) return [];
    const state = getState();
    return book.words.filter(w => {
      const r = state.records[w.id];
      return r && r.status !== 'mastered';
    });
  }

  /* =====================================================
     模块 1：AI 情景对话闯关
     ===================================================== */

  const DIALOGUE = {
    targetWords: [],   // 待练习的单词
    practiced: [],     // 已练习成功
    history: [],       // [{ role: 'ai'|'user', text, feedback }]
    active: false
  };

  function renderAIDialogue(app) {
    const words = getTodayWords();

    if (!words.length) {
      app.innerHTML = `
        <section class="page ai-page">
          <div class="card center">
            <p class="muted">当前词书暂无待背单词，请先学习一些词或添加单词。</p>
            <a class="btn primary mt-24" href="#/learn">去学习</a>
          </div>
        </section>`;
      return;
    }

    app.innerHTML = `
      <section class="page ai-page">
        <div class="page-header">
          <div>
            <h2>AI 情景对话闯关</h2>
            <p class="muted" style="font-size:12px;letter-spacing:.06em;margin-top:4px">
              AI 在对话中自然嵌入目标单词，你需在回复中使用它们
            </p>
          </div>
          <span class="ai-badge" id="dialogueStatus">准备就绪</span>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <span style="font-size:11px;letter-spacing:.1em;color:var(--text-mute)">本次目标单词</span>
              <div class="word-chips" id="dialogueChips"></div>
            </div>
            <button class="btn primary" id="dialogueStartBtn">开始对话</button>
          </div>
        </div>

        <div id="dialogueArea"></div>
      </section>
    `;

    // 初始化 chip
    DIALOGUE.targetWords = words;
    DIALOGUE.practiced = [];
    DIALOGUE.history = [];
    DIALOGUE.active = false;
    renderDialogueChips();

    document.getElementById('dialogueStartBtn').onclick = startDialogue;
  }

  function renderDialogueChips() {
    const box = document.getElementById('dialogueChips');
    if (!box) return;
    box.innerHTML = DIALOGUE.targetWords.map(w => {
      const done = DIALOGUE.practiced.includes(w.word);
      return `<span class="tag ${done ? 'done' : ''}">${esc(w.word)}</span>`;
    }).join('');
  }

  async function startDialogue() {
    DIALOGUE.history = [];
    DIALOGUE.practiced = [];
    DIALOGUE.active = true;
    renderDialogueChips();

    const area = document.getElementById('dialogueArea');
    area.innerHTML = `
      <div class="card mt-24">
        <div class="chat-window" id="chatWindow"></div>
        <div id="dialogueInputArea" style="margin-top:18px;display:none">
          <div class="ai-input-wrap">
            <input class="ai-input" id="dialogueInput" placeholder="用英文回复…"
                   autocomplete="off" spellcheck="false">
            <button class="btn primary" id="dialogueSendBtn">发送</button>
          </div>
          <div class="ai-hint">提示：自然使用目标单词，AI 会检测你练习了哪些</div>
        </div>
      </div>
    `;

    await generateOpeningLine();
  }

  function renderDialogueHistory() {
    const win = document.getElementById('chatWindow');
    if (!win) return;
    win.innerHTML = DIALOGUE.history.map(msg => {
      const isAI = msg.role === 'ai';
      const text = esc(msg.text || '').replace(
        new RegExp(`\\b(${DIALOGUE.targetWords.map(w => w.word).join('|')})\\b`, 'gi'),
        '<span class="hl">$1</span>'
      );
      return `
        <div class="chat-row ${isAI ? 'ai' : 'user'}">
          <div class="chat-avatar">${isAI ? 'AI' : '你'}</div>
          <div class="chat-bubble">
            <div>${text}</div>
            ${msg.feedback ? `<div class="chat-feedback ${msg.feedback.type}">${esc(msg.feedback.text)}</div>` : ''}
            ${isAI ? `
              <div class="chat-actions">
                <button class="btn small" data-speak="${esc(msg.text)}">${ICON.speaker} 朗读</button>
              </div>
              <div class="chat-meta">${msg.used && msg.used.length ? '融入单词：' + msg.used.map(esc).join('、') : ''}</div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // 绑定朗读按钮
    win.querySelectorAll('[data-speak]').forEach(btn => {
      btn.onclick = () => speak(btn.dataset.speak);
    });

    // 滚动到底部
    win.scrollTop = win.scrollHeight;
  }

  async function generateOpeningLine() {
    const statusEl = document.getElementById('dialogueStatus');
    statusEl.textContent = 'AI 思考中…';

    const sys =
      'You are an English conversation coach. Generate a short, natural opening line ' +
      'that naturally weaves in 1 or 2 of the target words. Keep it under 25 words. ' +
      'Return strict JSON only: {"reply":"...", "used":["word1"], "feedback":"", "understood":true}. ' +
      'No markdown, no explanation.';

    const targets = DIALOGUE.targetWords.map(w => w.word);
    const user =
      `Target words to practice: ${targets.join(', ')}\n` +
      `Pick 1-2 to weave into a natural opening line.`;

    const result = await callAIJson(sys, user);

    let reply, used;
    if (result && result.reply) {
      reply = String(result.reply).trim();
      used = Array.isArray(result.used) ? result.used : [];
    } else {
      // 降级：本地造句
      const w = DIALOGUE.targetWords[0];
      reply = `Hey, nice to meet you! By the way, I often hear people say "${w.word}" — what does it mean to you?`;
      used = [w.word];
    }

    DIALOGUE.history.push({ role: 'ai', text: reply, used });
    renderDialogueHistory();

    // 显示输入框
    const inputArea = document.getElementById('dialogueInputArea');
    inputArea.style.display = '';
    const input = document.getElementById('dialogueInput');
    const sendBtn = document.getElementById('dialogueSendBtn');
    input.focus();

    sendBtn.onclick = () => sendDialogueMessage();
    input.onkeydown = (e) => { if (e.key === 'Enter') sendDialogueMessage(); };

    statusEl.textContent = '对话进行中';
    statusEl.classList.add('ok');
  }

  async function sendDialogueMessage() {
    const input = document.getElementById('dialogueInput');
    const sendBtn = document.getElementById('dialogueSendBtn');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    DIALOGUE.history.push({ role: 'user', text: userText });
    renderDialogueHistory();

    const statusEl = document.getElementById('dialogueStatus');
    statusEl.textContent = 'AI 分析中…';

    const sys =
      'You are an English conversation coach. The user is practicing these words: ' +
      DIALOGUE.targetWords.map(w => w.word).join(', ') + '. ' +
      'Already practiced: ' + (DIALOGUE.practiced.join(', ') || 'none') + '. ' +
      'Check the user reply: (1) did they understand the context? ' +
      '(2) did they actually USE any of the target words? ' +
      'Then continue the conversation with a short natural reply (under 25 words) ' +
      'that weaves in 1-2 more unpracticed target words. ' +
      'Return strict JSON only: {"reply":"...","used":["word(s) the user used"],"feedback":"brief Chinese comment","understood":true/false}. ' +
      'No markdown.';

    const user = `User reply: "${userText}"`;

    const result = await callAIJson(sys, user);
    let reply, usedByAI, usedByUser, feedbackText, understood;

    if (result) {
      reply = String(result.reply || '').trim();
      usedByAI = Array.isArray(result.used) ? result.used : [];
      // 在用户回复中检测目标词
      usedByUser = DIALOGUE.targetWords
        .map(w => w.word)
        .filter(w => new RegExp(`\\b${w}\\b`, 'i').test(userText));
      understood = result.understood !== false;
      feedbackText = result.feedback || (understood ? '理解正确' : '理解有偏差');
    } else {
      // 降级
      usedByUser = DIALOGUE.targetWords
        .map(w => w.word)
        .filter(w => new RegExp(`\\b${w}\\b`, 'i').test(userText));
      const remaining = DIALOGUE.targetWords
        .map(w => w.word)
        .filter(w => !DIALOGUE.practiced.includes(w) && !usedByUser.includes(w));
      const next = remaining[0] || DIALOGUE.targetWords[0].word;
      reply = `I see! Can you tell me more about "${next}"? Use it in a sentence please.`;
      usedByAI = [next];
      understood = true;
      feedbackText = usedByUser.length ? '用词到位' : '这一轮没用上目标单词';
    }

    // 标记用户练习的单词
    usedByUser.forEach(w => {
      if (!DIALOGUE.practiced.includes(w)) DIALOGUE.practiced.push(w);
    });
    renderDialogueChips();

    // 给用户消息加反馈
    DIALOGUE.history[DIALOGUE.history.length - 1].feedback = {
      type: usedByUser.length ? 'ok' : (understood ? 'info' : 'no'),
      text: usedByUser.length
        ? `已使用：${usedByUser.join(', ')} · ${feedbackText}`
        : feedbackText
    };

    // AI 回复
    DIALOGUE.history.push({ role: 'ai', text: reply, used: usedByAI });
    renderDialogueHistory();

    input.disabled = false;
    sendBtn.disabled = false;

    // 是否全部练习完
    if (DIALOGUE.practiced.length >= DIALOGUE.targetWords.length) {
      finishDialogue();
    } else {
      statusEl.textContent = `已练习 ${DIALOGUE.practiced.length} / ${DIALOGUE.targetWords.length}`;
      input.focus();
          // ★ 记录到 AI 历史
    if (window.AIHistory) {
      window.AIHistory.add('dialogue', {
        targetWords: DIALOGUE.targetWords.map(w => w.word),
        practiced: DIALOGUE.practiced.slice(),
        messages: DIALOGUE.history.map(m => ({ role: m.role, text: m.text }))
      });
    }
    }
  }

  function finishDialogue() {
    DIALOGUE.active = false;
    const statusEl = document.getElementById('dialogueStatus');
    statusEl.textContent = '闯关完成';
    statusEl.classList.add('ok');

    const inputArea = document.getElementById('dialogueInputArea');
    if (inputArea) inputArea.style.display = 'none';

    // 追加汇总
    const win = document.getElementById('chatWindow');
    if (!win) return;
    win.innerHTML += `
      <div class="card" style="margin-top:16px;background:linear-gradient(135deg, rgba(52,211,153,0.08), rgba(124,158,255,0.06))">
        <h3 style="margin-bottom:14px">本关汇总</h3>
        <div class="word-chips" style="margin-bottom:16px">
          ${DIALOGUE.targetWords.map(w => `
            <span class="tag ${DIALOGUE.practiced.includes(w.word) ? 'done' : 'wrong'}">
              ${esc(w.word)} ${DIALOGUE.practiced.includes(w.word) ? ICON.check : ICON.cross}
            </span>
          `).join('')}
        </div>
        <p class="muted" style="font-size:13px">
          共练习 <strong>${DIALOGUE.practiced.length}</strong> / ${DIALOGUE.targetWords.length} 个单词。
        </p>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn primary" onclick="location.reload()">再来一轮</button>
          <a class="btn" href="#/review">去复习</a>
        </div>
      </div>
    `;
    win.scrollTop = win.scrollHeight;
  }

  /* =====================================================
     模块 2：AI 可视化联想词网
     ===================================================== */

  const NET = {
    center: '',
    data: null,
    nodes: [],
    edges: [],
    hover: null,
    canvas: null,
    ctx: null,
    dpr: 1,
    resizeObserver: null
  };

  function renderAINetwork(app) {
    const book = getCurrentBook();
    const suggestion = book && book.words.length ? book.words[0].word : 'light';

    app.innerHTML = `
      <section class="page ai-page">
        <div class="page-header">
          <div>
            <h2>AI 联想词网</h2>
            <p class="muted" style="font-size:12px;letter-spacing:.06em;margin-top:4px">
              点击任意节点切换为新中心词，自动重绘
            </p>
          </div>
          <span class="ai-badge" id="netStatus">准备就绪</span>
        </div>

        <div class="card">
          <div class="ai-input-wrap">
            <input class="ai-input" id="netInput" placeholder="输入一个英文单词，例如 ${esc(suggestion)}"
                   autocomplete="off" spellcheck="false">
            <button class="btn primary" id="netBuildBtn">生成词网</button>
          </div>
          <div class="ai-hint">AI 返回词根 / 同义词 / 反义词 / 衍生词 / 形近易混词</div>
        </div>

        <div class="card mt-24">
          <div class="net-wrap" id="netWrap">
            <canvas id="aiNetworkCanvas"></canvas>
            <div class="net-tooltip" id="netTooltip"></div>
          </div>
          <div class="net-legend">
            <span class="l-root">词根</span>
            <span class="l-syn">同义词</span>
            <span class="l-ant">反义词</span>
            <span class="l-der">衍生词</span>
            <span class="l-con">易混词</span>
          </div>
        </div>
      </section>
    `;

    NET.canvas = document.getElementById('aiNetworkCanvas');
    NET.ctx = NET.canvas.getContext('2d');
    setupCanvasResize();

    document.getElementById('netBuildBtn').onclick = () => {
      const w = document.getElementById('netInput').value.trim();
      if (w) buildNetwork(w);
    };
    document.getElementById('netInput').onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('netBuildBtn').click();
    };

    // 首次自动生成
    buildNetwork(suggestion);
  }

  function setupCanvasResize() {
    const wrap = document.getElementById('netWrap');
    if (!wrap || !NET.canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      NET.dpr = window.devicePixelRatio || 1;
      NET.canvas.width = rect.width * NET.dpr;
      NET.canvas.height = rect.height * NET.dpr;
      NET.ctx.setTransform(NET.dpr, 0, 0, NET.dpr, 0, 0);
      drawNetwork();
    };

    if (NET.resizeObserver) NET.resizeObserver.disconnect();
    NET.resizeObserver = new ResizeObserver(resize);
    NET.resizeObserver.observe(wrap);
    resize();

    NET.canvas.addEventListener('mousemove', onCanvasHover);
    NET.canvas.addEventListener('mouseleave', () => {
      NET.hover = null;
      hideTooltip();
      drawNetwork();
    });
    NET.canvas.addEventListener('click', onCanvasClick);
  }

  async function buildNetwork(word) {
    const statusEl = document.getElementById('netStatus');
    statusEl.textContent = 'AI 生成中…';
    NET.center = word;
    NET.data = null;
    NET.nodes = [];
    NET.edges = [];
    drawNetwork();

    const sys =
      'You are an English vocabulary assistant. Given an English word, return its ' +
      'root, synonyms, antonyms, derivatives and confusables. ' +
      'Return strict JSON only: ' +
      '{"root":"词根说明","synonyms":["..."],"antonyms":["..."],"derivatives":["..."],"confusables":["..."]}. ' +
      'No markdown.';

    const result = await callAIJson(sys, `Word: ${word}`);

    if (!result) {
      // 降级：从本地词书找相似词
      const local = localLookup(word);
      result = {
        root: local ? `本地词书：${local.meaning}` : '（AI 不可用，未获取词根）',
        synonyms: [],
        antonyms: [],
        derivatives: [],
        confusables: []
      };
    }

    NET.data = {
      root: String(result.root || '').trim(),
      synonyms: Array.isArray(result.synonyms) ? result.synonyms.slice(0, 4) : [],
      antonyms: Array.isArray(result.antonyms) ? result.antonyms.slice(0, 3) : [],
      derivatives: Array.isArray(result.derivatives) ? result.derivatives.slice(0, 4) : [],
      confusables: Array.isArray(result.confusables) ? result.confusables.slice(0, 3) : []
    };

    layoutNetwork();
    drawNetwork();

    statusEl.textContent = '点击节点可切换';
    statusEl.classList.add('ok');
        // ★ 记录到 AI 历史
    if (window.AIHistory) {
      window.AIHistory.add('network', {
        center: NET.center,
        root: NET.data.root,
        synonyms: NET.data.synonyms,
        antonyms: NET.data.antonyms,
        derivatives: NET.data.derivatives,
        confusables: NET.data.confusables
      });
    }
  }

  // 计算节点位置：中心 + 五个方向发散
  function layoutNetwork() {
    const wrap = document.getElementById('netWrap');
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const cx = W / 2;
    const cy = H / 2;

    NET.nodes = [];
    NET.edges = [];

    // 中心节点
    const center = { x: cx, y: cy, r: 36, label: NET.center, kind: 'center', word: NET.center };
    NET.nodes.push(center);

    // 五个分类方向（弧度）
    const angles = {
      synonyms:    -Math.PI / 2,
      antonyms:    -Math.PI / 2 + (Math.PI * 2 / 5),
      derivatives: -Math.PI / 2 + (Math.PI * 4 / 5),
      confusables: -Math.PI / 2 + (Math.PI * 6 / 5),
      root:        -Math.PI / 2 + (Math.PI * 8 / 5)
    };

    const R1 = Math.min(W, H) * 0.30;

    if (NET.data) {
      const groups = [
        { key: 'synonyms',    kind: 'syn', list: NET.data.synonyms },
        { key: 'antonyms',    kind: 'ant', list: NET.data.antonyms },
        { key: 'derivatives', kind: 'der', list: NET.data.derivatives },
        { key: 'confusables', kind: 'con', list: NET.data.confusables },
        { key: 'root',        kind: 'root', list: NET.data.root ? [NET.data.root] : [] }
      ];

      groups.forEach(g => {
        if (!g.list.length) return;
        const a = angles[g.key];
        // 第一环节点
        g.list.forEach((item, idx) => {
          const dist = R1 + idx * 42;
          const x = cx + Math.cos(a) * dist;
          const y = cy + Math.sin(a) * dist;
          const node = {
            x, y, r: 24,
            label: typeof item === 'string' ? item.split(' ')[0].slice(0, 14) : item,
            kind: g.kind,
            word: typeof item === 'string' ? item : String(item)
          };
          NET.nodes.push(node);
          NET.edges.push({ from: 0, to: NET.nodes.length - 1 });
        });
      });
    }
  }

  function drawNetwork() {
    const ctx = NET.ctx;
    if (!ctx) return;
    const wrap = document.getElementById('netWrap');
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;

    ctx.clearRect(0, 0, W, H);

    // 边
    ctx.lineWidth = 1;
    NET.edges.forEach(e => {
      const a = NET.nodes[e.from], b = NET.nodes[e.to];
      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, 'rgba(124,158,255,0.5)');
      grad.addColorStop(1, 'rgba(124,158,255,0.05)');
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    // 节点
    NET.nodes.forEach((n, i) => {
      const hovered = NET.hover === i;
      drawNode(n, hovered, i === 0);
    });
  }

  function drawNode(n, hovered, isCenter) {
    const ctx = NET.ctx;
    const colorMap = {
      center: '#7c9eff',
      root:   '#7c9eff',
      syn:    '#34d399',
      ant:    '#f87171',
      der:    '#a78bfa',
      con:    '#fbbf24'
    };
    const color = colorMap[n.kind] || '#7c9eff';
    const r = n.r + (hovered ? 4 : 0);

    // 光晕
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, r + 12);
    glow.addColorStop(0, color + '55');
    glow.addColorStop(1, color + '00');
    ctx.fillStyle = glow;
    ctx.fill();

    // 圆
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isCenter ? color : 'rgba(20,22,30,0.85)';
    if (document.documentElement.getAttribute('data-theme') === 'light') {
      ctx.fillStyle = isCenter ? color : 'rgba(255,255,255,0.95)';
    }
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    // 文本
    ctx.fillStyle = isCenter ? '#fff' : (document.documentElement.getAttribute('data-theme') === 'light' ? '#0d1117' : '#e6e9ef');
    ctx.font = `${isCenter ? 600 : 500} ${isCenter ? 14 : 12}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let label = n.label || '';
    if (label.length > 12 && !isCenter) label = label.slice(0, 11) + '…';
    ctx.fillText(label, n.x, n.y);
  }

  function onCanvasHover(e) {
    const rect = NET.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let found = null;
    for (let i = NET.nodes.length - 1; i >= 0; i--) {
      const n = NET.nodes[i];
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) { found = i; break; }
    }

    if (found !== NET.hover) {
      NET.hover = found;
      drawNetwork();
      if (found !== null) showTooltip(NET.nodes[found], e.clientX, e.clientY);
      else hideTooltip();
    } else if (found !== null) {
      moveTooltip(e.clientX, e.clientY);
    }
  }

  function showTooltip(node, clientX, clientY) {
    const tip = document.getElementById('netTooltip');
    if (!tip) return;

    const local = localLookup(node.word);
    const meaning = local ? local.meaning : '（点一下查看详情）';
    const example = local && local.example ? `<div class="muted" style="margin-top:4px">${esc(local.example)}</div>` : '';

    tip.innerHTML = `
      <strong>${esc(node.word)}</strong>
      <div class="muted">${esc(meaning)}</div>
      ${example}
    `;
    tip.classList.add('show');
    moveTooltip(clientX, clientY);
  }

  function moveTooltip(clientX, clientY) {
    const tip = document.getElementById('netTooltip');
    const wrap = document.getElementById('netWrap');
    if (!tip || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    let x = clientX - rect.left + 14;
    let y = clientY - rect.top + 14;
    if (x + tip.offsetWidth > rect.width) x = rect.width - tip.offsetWidth - 8;
    if (y + tip.offsetHeight > rect.height) y = rect.height - tip.offsetHeight - 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function hideTooltip() {
    const tip = document.getElementById('netTooltip');
    if (tip) tip.classList.remove('show');
  }

  function onCanvasClick(e) {
    if (NET.hover === null) return;
    const node = NET.nodes[NET.hover];
    if (!node || !node.word) return;
    // 切换中心词
    document.getElementById('netInput').value = node.word;
    buildNetwork(node.word);
  }

  /* =====================================================
     模块 3：AI 单词猜谜
     ===================================================== */

  const RIDDLE = {
    pool: [],
    current: null,
    attempts: 0,
    riddle: '',
    hint: '',
    lang: 'en',
    solved: 0,
    total: 0
  };

  function renderAIRiddle(app) {
    const pool = getReviewWords().length ? getReviewWords() : getTodayWords();

    if (!pool.length) {
      app.innerHTML = `
        <section class="page ai-page">
          <div class="card center">
            <p class="muted">暂无可猜的单词。先去学习或复习一些单词吧。</p>
            <a class="btn primary mt-24" href="#/learn">去学习</a>
          </div>
        </section>`;
      return;
    }

    RIDDLE.pool = pool.slice();
    RIDDLE.solved = 0;
    RIDDLE.total = 0;

    app.innerHTML = `
      <section class="page ai-page">
        <div class="page-header">
          <div>
            <h2>AI 单词猜谜</h2>
            <p class="muted" style="font-size:12px;letter-spacing:.06em;margin-top:4px">
              根据 AI 描述猜测单词
            </p>
          </div>
          <span class="ai-badge" id="riddleStatus">准备就绪</span>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:11px;letter-spacing:.1em;color:var(--text-mute)">谜面语言</span>
              <select class="ai-select" id="riddleLang">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <button class="btn primary" id="riddleStartBtn">开始猜谜</button>
          </div>
          <div class="word-chips" id="riddleScore" style="margin-top:14px"></div>
        </div>

        <div id="riddleArea"></div>
      </section>
    `;

    document.getElementById('riddleLang').onchange = (e) => {
      RIDDLE.lang = e.target.value;
      if (RIDDLE.current) generateRiddle();
    };

    document.getElementById('riddleStartBtn').onclick = () => {
      RIDDLE.solved = 0;
      RIDDLE.total = 0;
      nextRiddle();
    };
  }

  function updateRiddleScore() {
    const box = document.getElementById('riddleScore');
    if (!box) return;
    box.innerHTML = `
      <span class="tag done">已完成 ${RIDDLE.solved}</span>
      <span class="tag">剩余 ${RIDDLE.pool.length}</span>
    `;
  }

  async function nextRiddle() {
    if (!RIDDLE.pool.length) {
      finishRiddle();
      return;
    }

    // 随机抽一个
    const idx = Math.floor(Math.random() * RIDDLE.pool.length);
    RIDDLE.current = RIDDLE.pool[idx];
    RIDDLE.pool.splice(idx, 1);
    RIDDLE.total++;
    RIDDLE.attempts = 0;
    RIDDLE.riddle = '';
    RIDDLE.hint = '';

    await generateRiddle();
  }

  async function generateRiddle() {
    const statusEl = document.getElementById('riddleStatus');
    statusEl.textContent = 'AI 出题中…';

    const area = document.getElementById('riddleArea');
    area.innerHTML = `
      <div class="card mt-24 ai-loading">
        <div class="ai-loading-orb"></div>
        <div class="ai-loading-text">AI 正在构思谜面<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
      </div>
    `;

    const w = RIDDLE.current;
    const langName = RIDDLE.lang === 'zh' ? 'Simplified Chinese (中文)' : 'English';

    const sys =
      `You are an English riddle maker. Given a target word, write a riddle in ${langName}. ` +
      'CRITICAL: never include the target word itself, its root, or any of its forms. ' +
      'Describe meaning, usage, or features only. Keep under 30 words. ' +
      'Return strict JSON only: {"riddle":"...","hint":"...","answer":"<target word>"}. ' +
      'No markdown.';

    const user =
      `Target word: ${w.word}\n` +
      `Meaning hint (for you only): ${w.meaning || ''}\n` +
      `Example (for you only): ${w.example || ''}`;

    const result = await callAIJson(sys, user);

    let riddle, hint;
    if (result && result.riddle) {
      riddle = String(result.riddle).trim();
      hint = String(result.hint || '').trim();
    } else {
      // 降级：用释义做谜面
      if (RIDDLE.lang === 'zh') {
        riddle = `猜一个英文单词：释义是「${w.meaning || '（无释义）'}」`;
      } else {
        const cleaned = (w.meaning || '')
          .replace(/[a-z]+\.\s*/gi, '')
          .replace(/[（(].*?[)）]/g, '')
          .trim();
        riddle = `Guess the English word whose meaning is: "${cleaned || 'unknown'}"`;
      }
      hint = `提示：它以字母 "${w.word[0].toUpperCase()}" 开头`;
    }

    RIDDLE.riddle = riddle;
    RIDDLE.hint = hint;

    statusEl.textContent = '请作答';
    statusEl.classList.add('ok');

    renderRiddleQuestion();
  }

  function renderRiddleQuestion() {
    const area = document.getElementById('riddleArea');
    area.innerHTML = `
      <div class="card mt-24 riddle-card">
        <div class="riddle-label">谜面</div>
        <div class="riddle-text">${esc(RIDDLE.riddle)}</div>
        <div class="riddle-input-row">
          <input class="ai-input" id="riddleInput" placeholder="输入你猜的英文单词…"
                 autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="btn primary" id="riddleSubmitBtn">提交</button>
        </div>
        <div class="riddle-attempts" id="riddleAttempts">尝试次数：0 / 3</div>
        <div id="riddleFeedbackBox"></div>
      </div>
    `;

    const input = document.getElementById('riddleInput');
    const btn = document.getElementById('riddleSubmitBtn');

    const submit = () => submitRiddleGuess();
    btn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    setTimeout(() => input.focus(), 100);

    updateRiddleScore();
  }

  function submitRiddleGuess() {
    const input = document.getElementById('riddleInput');
    const btn = document.getElementById('riddleSubmitBtn');
    if (!input) return;
    const guess = input.value.trim().toLowerCase();
    if (!guess) { input.focus(); return; }

    RIDDLE.attempts++;
    const target = RIDDLE.current.word.toLowerCase();
    const box = document.getElementById('riddleFeedbackBox');
    const attemptsEl = document.getElementById('riddleAttempts');
    attemptsEl.textContent = `尝试次数：${RIDDLE.attempts} / 3`;

    if (guess === target) {
      // 猜对
      box.innerHTML = `
        <div class="riddle-feedback correct">
          ${ICON.check} 猜对了！答案是 <span class="reveal">${esc(RIDDLE.current.word)}</span>
          <div style="margin-top:8px;color:var(--text-dim)">
            <div><span class="muted">释义：</span>${esc(RIDDLE.current.meaning || '—')}</div>
            ${RIDDLE.current.example ? `<div><span class="muted">例句：</span>${esc(RIDDLE.current.example)}</div>` : ''}
          </div>
        </div>
      `;
      // 标记复习完成
      try { updateRecord(RIDDLE.current.id, 'known');      // ★ 记录猜对
      if (window.AIHistory) {
        window.AIHistory.add('riddle', {
          answer: RIDDLE.current.word,
          meaning: RIDDLE.current.meaning,
          correct: true,
          attempts: RIDDLE.attempts
        });
      } } catch (e) {}
      RIDDLE.solved++;
      updateRiddleScore();
      input.disabled = true;
      btn.disabled = true;
      addNextRiddleButton(box);
      return;
    }

    // 猜错
    if (RIDDLE.attempts >= 3) {
      // 三次答错 → 直接揭晓，加入复习
      box.innerHTML = `
        <div class="riddle-feedback wrong">
          ${ICON.cross} 三次未猜中，答案是 <span class="reveal">${esc(RIDDLE.current.word)}</span>
          <div style="margin-top:8px">
            <div><span class="muted">释义：</span>${esc(RIDDLE.current.meaning || '—')}</div>
            ${RIDDLE.current.example ? `<div><span class="muted">例句：</span>${esc(RIDDLE.current.example)}</div>` : ''}
          </div>
          <div style="margin-top:8px;color:var(--danger)">已加入复习队列</div>
        </div>
      `;
      try { updateRecord(RIDDLE.current.id, 'unknown');       // ★ 记录未猜中
      if (window.AIHistory) {
        window.AIHistory.add('riddle', {
          answer: RIDDLE.current.word,
          meaning: RIDDLE.current.meaning,
          correct: false,
          attempts: RIDDLE.attempts
        });
      }} catch (e) {}
      input.disabled = true;
      btn.disabled = true;
      addNextRiddleButton(box);
    } else {
      // 还有机会 → 给提示
      const hintText = RIDDLE.hint || `提示：它的首字母是 "${RIDDLE.current.word[0].toUpperCase()}"`;
      box.innerHTML = `
        <div class="riddle-feedback hint">
          ${ICON.cross} 不对哦。${esc(hintText)}
        </div>
      `;
      input.value = '';
      input.focus();
    }
  }

  function addNextRiddleButton(container) {
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.style.marginTop = '16px';
    btn.textContent = RIDDLE.pool.length ? '下一个 →' : '查看总览';
    btn.onclick = () => nextRiddle();
    container.appendChild(btn);
    setTimeout(() => btn.focus(), 100);
  }

  function finishRiddle() {
    const area = document.getElementById('riddleArea');
    const statusEl = document.getElementById('riddleStatus');
    statusEl.textContent = '挑战结束';
    area.innerHTML = `
      <div class="card mt-24" style="text-align:center;padding:34px 24px">
        <h3 style="margin-bottom:12px">猜谜挑战结束</h3>
        <p class="muted">本次共完成 <strong>${RIDDLE.total}</strong> 题，
        猜对 <strong style="color:var(--success)">${RIDDLE.solved}</strong> 题，
        答错 <strong style="color:var(--danger)">${RIDDLE.total - RIDDLE.solved}</strong> 题</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px">
          <button class="btn primary" id="riddleRestartAll">再来一轮</button>
          <a class="btn" href="#/review">去复习错词</a>
        </div>
      </div>
    `;
    document.getElementById('riddleRestartAll').onclick = () => renderAIRiddle(document.getElementById('app'));
  }

  /* =====================================================
     暴露给 app.js 的路由
     ===================================================== */
  window.renderAIDialogue = renderAIDialogue;
  window.renderAINetwork = renderAINetwork;
  window.renderAIRiddle = renderAIRiddle;

  console.log('[AI Game Module] loaded');
})();