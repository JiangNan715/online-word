/* =====================================================
   js/ai-history.js
   AI 中心 —— 统一入口
   标签：概览 / AI 查词 / AI 听写 / AI 对话 / AI 词网 / AI 猜谜 / 记录
   - 概览：5 个功能卡片 + 使用统计 + 最近记录
   - 功能标签：内嵌调用 ai.js / ai-game.js 暴露的 render 函数
   - 记录标签：分类浏览 / 搜索 / 删除 / 清空
   - 所有数据存 localStorage，刷新不丢
   ===================================================== */
(function () {
  'use strict';

  const KEY = 'word_app_ai_history';
  const MAX_RECORDS = 500;

  const TYPE_META = {
    query:     { label: 'AI 查词', icon: ICON.search,    color: '#7c9eff' },
    dictation: { label: 'AI 听写', icon: ICON.headphone, color: '#34d399' },
    dialogue:  { label: 'AI 对话', icon: ICON.chat,      color: '#a78bfa' },
    network:   { label: 'AI 词网', icon: ICON.network,   color: '#22d3ee' },
    riddle:    { label: 'AI 猜谜', icon: ICON.target,    color: '#fbbf24' }
  };

  /* ---------- 工具 ---------- */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }

  function saveAll(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECORDS))); }
    catch (e) { console.warn('[AI Hub] 保存失败', e); }
  }

  function add(type, data) {
    const list = getAll();
    list.unshift({
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type,
      timestamp: Date.now(),
      data: data || {}
    });
    saveAll(list);
  }

  function remove(id) { saveAll(getAll().filter(r => r.id !== id)); }
  function clear() { saveAll([]); }

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function buildRecordContent(rec) {
    const d = rec.data || {};
    switch (rec.type) {
      case 'query':
        return {
          title: d.word || '(未记录)',
          preview: [d.phonetic, d.meaning].filter(Boolean).join(' · ').slice(0, 80),
          detail: `
            ${d.phonetic ? `<div class="hist-kv"><span class="muted">音标</span><span>${esc(d.phonetic)}</span></div>` : ''}
            <div class="hist-kv"><span class="muted">释义</span><span>${esc(d.meaning || '—')}</span></div>
            ${d.example ? `<div class="hist-kv"><span class="muted">例句</span><span class="hist-example">${esc(d.example)}</span></div>` : ''}
          `
        };
      case 'dictation': {
        const rate = d.total ? Math.round((d.correct / d.total) * 100) : 0;
        return {
          title: `${d.bookName || '词书'} · 正确率 ${rate}%`,
          preview: `共 ${d.total || 0} 题 · 对 ${d.correct || 0} · 错 ${d.wrongCount || 0}`,
          detail: `
            <div class="hist-kv"><span class="muted">词书</span><span>${esc(d.bookName || '—')}</span></div>
            <div class="hist-kv"><span class="muted">题量</span><span>${d.total || 0} 题</span></div>
            <div class="hist-kv"><span class="muted">正确</span><span style="color:var(--success)">${d.correct || 0}</span></div>
            <div class="hist-kv"><span class="muted">错误</span><span style="color:var(--danger)">${d.wrongCount || 0}</span></div>
            ${(d.wrongList && d.wrongList.length) ? `
              <div class="hist-sub">错词清单</div>
              ${d.wrongList.map(w => `
                <div class="hist-kv">
                  <span class="muted">${esc(w.word)}</span>
                  <span class="muted">你的答案：<span style="color:var(--danger)">${esc(w.answer)}</span></span>
                </div>
              `).join('')}
            ` : ''}
          `
        };
      }
      case 'dialogue': {
        const tw = d.targetWords || [];
        const pr = d.practiced || [];
        return {
          title: `对话 · 练习 ${pr.length} / ${tw.length} 个目标词`,
          preview: tw.join(', ').slice(0, 80),
          detail: `
            <div class="hist-kv"><span class="muted">目标词</span><span>${esc(tw.join(', ') || '—')}</span></div>
            <div class="hist-kv"><span class="muted">已练习</span><span style="color:var(--success)">${esc(pr.join(', ') || '—')}</span></div>
            ${(d.messages && d.messages.length) ? `
              <div class="hist-sub">对话记录</div>
              ${d.messages.map(m => `
                <div class="hist-msg ${m.role === 'ai' ? 'ai' : 'user'}">
                  <span class="hist-msg-role">${m.role === 'ai' ? 'AI' : '你'}</span>
                  <span>${esc(m.text)}</span>
                </div>
              `).join('')}
            ` : ''}
          `
        };
      }
      case 'network': {
        const cnt = [
          ['同义', (d.synonyms || []).length],
          ['反义', (d.antonyms || []).length],
          ['衍生', (d.derivatives || []).length],
          ['易混', (d.confusables || []).length]
        ];
        return {
          title: d.center || '(未记录)',
          preview: cnt.map(c => `${c[0]} ${c[1]}`).join(' · '),
          detail: `
            ${d.root ? `<div class="hist-kv"><span class="muted">词根</span><span>${esc(d.root)}</span></div>` : ''}
            ${(d.synonyms || []).length ? `<div class="hist-kv"><span class="muted">同义词</span><span>${esc(d.synonyms.join(', '))}</span></div>` : ''}
            ${(d.antonyms || []).length ? `<div class="hist-kv"><span class="muted">反义词</span><span>${esc(d.antonyms.join(', '))}</span></div>` : ''}
            ${(d.derivatives || []).length ? `<div class="hist-kv"><span class="muted">衍生词</span><span>${esc(d.derivatives.join(', '))}</span></div>` : ''}
            ${(d.confusables || []).length ? `<div class="hist-kv"><span class="muted">易混词</span><span>${esc(d.confusables.join(', '))}</span></div>` : ''}
          `
        };
      }
      case 'riddle':
        return {
          title: d.answer || '(未记录)',
          preview: `${d.correct ? '猜对' : '未猜中'} · 尝试 ${d.attempts || 0} 次`,
          detail: `
            <div class="hist-kv"><span class="muted">答案</span><span>${esc(d.answer || '—')}</span></div>
            <div class="hist-kv"><span class="muted">结果</span><span style="color:${d.correct ? 'var(--success)' : 'var(--danger)'}">${d.correct ? '猜对' : '未猜中'}</span></div>
            <div class="hist-kv"><span class="muted">尝试</span><span>${d.attempts || 0} 次</span></div>
            ${d.meaning ? `<div class="hist-kv"><span class="muted">释义</span><span>${esc(d.meaning)}</span></div>` : ''}
          `
        };
      default:
        return { title: '未知类型', preview: '', detail: '' };
    }
  }

  /* ---------- Hub 状态 ---------- */
  const HUB = { tab: 'overview', search: '', histFilter: 'all' };

  /* ---------- 主入口 ---------- */
  function renderHub(app) {
    app.innerHTML = `
      <section class="page ai-page">
        <div class="page-header">
          <div>
            <h2>AI 中心</h2>
            <p class="muted" style="font-size:12px;letter-spacing:.06em;margin-top:4px">
              所有 AI 功能的统一入口 · 对话 / 查词 / 听写 / 词网 / 猜谜 / 记录
            </p>
          </div>
          <span class="ai-badge" id="hubStatus">就绪</span>
        </div>

        <div class="hub-tabs" id="hubTabs">
          ${renderHubTabs()}
        </div>

        <div class="hub-body" id="hubBody"></div>
      </section>
    `;

    app.querySelector('#hubTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.hub-tab');
      if (!btn) return;
      HUB.tab = btn.dataset.tab;
      app.querySelectorAll('.hub-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === HUB.tab);
      });
      switchHubTab(app, HUB.tab);
    });

    switchHubTab(app, HUB.tab);
  }

  function renderHubTabs() {
    const tabs = [
      { key: 'overview',  icon: ICON.ai,        label: '概览' },
      { key: 'query',     icon: ICON.search,    label: 'AI 查词' },
      { key: 'dictation', icon: ICON.headphone, label: 'AI 听写' },
      { key: 'dialogue',  icon: ICON.chat,      label: 'AI 对话' },
      { key: 'network',   icon: ICON.network,   label: 'AI 词网' },
      { key: 'riddle',    icon: ICON.target,    label: 'AI 猜谜' },
      { key: 'history',   icon: ICON.clock,     label: '记录' }
    ];
    return tabs.map(t => `
      <button class="hub-tab ${HUB.tab === t.key ? 'active' : ''}" data-tab="${t.key}">
        <span class="hub-tab-icon">${t.icon}</span>
        <span>${t.label}</span>
      </button>
    `).join('');
  }

  function switchHubTab(app, tab) {
    const body = app.querySelector('#hubBody');
    if (!body) return;
    body.innerHTML = '';

    if (tab === 'overview') {
      renderOverview(body);
    } else if (tab === 'query') {
      if (typeof window.renderAIQuery === 'function') window.renderAIQuery(body);
    } else if (tab === 'dictation') {
      if (typeof window.renderAIDictation === 'function') window.renderAIDictation(body);
    } else if (tab === 'dialogue') {
      if (typeof window.renderAIDialogue === 'function') window.renderAIDialogue(body);
    } else if (tab === 'network') {
      if (typeof window.renderAINetwork === 'function') window.renderAINetwork(body);
    } else if (tab === 'riddle') {
      if (typeof window.renderAIRiddle === 'function') window.renderAIRiddle(body);
    } else if (tab === 'history') {
      renderHistoryTab(body);
    }
  }

  function gotoHubTab(tab) {
    HUB.tab = tab;
    const app = document.getElementById('app');
    if (!app) return;
    app.querySelectorAll('.hub-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    switchHubTab(app, tab);
  }

  /* ---------- 概览 ---------- */
  function renderOverview(container) {
    const all = getAll();
    const counts = { query: 0, dictation: 0, dialogue: 0, network: 0, riddle: 0 };
    all.forEach(r => { if (counts[r.type] != null) counts[r.type]++; });

    container.innerHTML = `
      <div class="hub-overview">
        <div class="hub-cards">
          ${Object.keys(TYPE_META).map(k => {
            const m = TYPE_META[k];
            return `
              <div class="hub-card" data-goto="${k}" style="--card-color:${m.color}">
                <div class="hub-card-icon">${m.icon}</div>
                <div class="hub-card-title">${m.label}</div>
                <div class="hub-card-count">${counts[k] || 0} 条记录</div>
                <div class="hub-card-arrow">进入 →</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="hub-recent">
          <div class="hub-section-head">
            <h3>最近记录</h3>
            <button class="btn small" data-goto="history">查看全部 →</button>
          </div>
          ${all.length === 0 ? `
            <div class="hub-empty">还没有任何 AI 记录，点击上面的卡片体验一下</div>
          ` : all.slice(0, 5).map(rec => {
            const m = TYPE_META[rec.type] || { icon: '•', label: rec.type, color: '#7c9eff' };
            const c = buildRecordContent(rec);
            return `
              <div class="hub-recent-item">
                <span class="hub-recent-badge" style="--card-color:${m.color}">${m.icon} ${esc(m.label)}</span>
                <span class="hub-recent-title">${esc(c.title)}</span>
                <span class="hub-recent-time">${fmtTime(rec.timestamp)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('[data-goto]').forEach(el => {
      el.addEventListener('click', () => gotoHubTab(el.dataset.goto));
    });
  }

  /* ---------- 历史记录 ---------- */
  function renderHistoryTab(container) {
    container.innerHTML = `
      <div class="hist-toolbar card">
        <div class="ai-input-wrap">
          <input class="ai-input" id="histSearch" type="text"
                 placeholder="搜索单词、释义、文本…" autocomplete="off">
          <button class="btn danger small" id="histClearBtn">清空全部</button>
        </div>
      </div>

      <div class="hist-tabs" id="histTabs"></div>
      <div class="hist-list" id="histList"></div>
    `;

    renderHistTabs(container);
    renderHistList(container);

    const searchEl = container.querySelector('#histSearch');
    searchEl.value = HUB.search;
    searchEl.addEventListener('input', (e) => {
      HUB.search = e.target.value.trim().toLowerCase();
      renderHistList(container);
    });

    container.querySelector('#histClearBtn').addEventListener('click', () => {
      if (!getAll().length) return;
      if (!confirm('确定要清空全部 AI 历史记录吗？此操作不可撤销。')) return;
      clear();
      renderHistTabs(container);
      renderHistList(container);
    });

    container.querySelector('#histTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.hist-tab');
      if (!btn) return;
      HUB.histFilter = btn.dataset.tab;
      container.querySelectorAll('.hist-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === HUB.histFilter);
      });
      renderHistList(container);
    });

    container.querySelector('#histList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        const id = del.dataset.del;
        const item = del.closest('.hist-item');
        if (item) {
          item.classList.add('removing');
          setTimeout(() => {
            remove(id);
            renderHistTabs(container);
            renderHistList(container);
          }, 260);
        }
        return;
      }
      const item = e.target.closest('.hist-item');
      if (item) item.classList.toggle('expanded');
    });
  }

  function renderHistTabs(container) {
    const list = getAll();
    const counts = { all: list.length, query: 0, dictation: 0, dialogue: 0, network: 0, riddle: 0 };
    list.forEach(r => { if (counts[r.type] != null) counts[r.type]++; });

    const order = ['all', 'query', 'dictation', 'dialogue', 'network', 'riddle'];
    const labels = { all: '全部' };
    Object.keys(TYPE_META).forEach(k => { labels[k] = TYPE_META[k].label; });

    container.querySelector('#histTabs').innerHTML = order.map(k => `
      <button class="hist-tab ${HUB.histFilter === k ? 'active' : ''}" data-tab="${k}">
        <span>${labels[k]}</span>
        <span class="hist-tab-count">${counts[k] || 0}</span>
      </button>
    `).join('');
  }

  function renderHistList(container) {
    const listEl = container.querySelector('#histList');
    let list = getAll();

    if (HUB.histFilter !== 'all') list = list.filter(r => r.type === HUB.histFilter);

    if (HUB.search) {
      list = list.filter(r => JSON.stringify(r.data || {}).toLowerCase().includes(HUB.search));
    }

    if (!list.length) {
      listEl.innerHTML = `
        <div class="hist-empty">
          <div class="hist-empty-icon">${ICON.clock}</div>
          <p class="muted">${HUB.search ? '没有找到匹配的记录' : '暂无历史记录，去体验一下 AI 功能吧'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = list.map((rec, i) => {
      const meta = TYPE_META[rec.type] || { label: rec.type, icon: '•', color: '#7c9eff' };
      const c = buildRecordContent(rec);
      return `
        <div class="hist-item" data-id="${rec.id}"
             style="--item-color:${meta.color}; animation-delay:${Math.min(i * 0.03, 0.35)}s">
          <div class="hist-item-head">
            <span class="hist-badge">${meta.icon} ${esc(meta.label)}</span>
            <span class="hist-time">${fmtTime(rec.timestamp)}</span>
            <button class="hist-del" data-del="${rec.id}" title="删除">${ICON.cross}</button>
          </div>
          <div class="hist-item-title">${esc(c.title)}</div>
          <div class="hist-item-preview">${esc(c.preview || '')}</div>
          <div class="hist-item-detail">
            <div class="hist-detail-inner">${c.detail}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ---------- 暴露 ---------- */
  window.AIHistory = { add, getAll, remove, clear };
  window.renderAIHistory = renderHub;

  console.log('[AI Hub Module] loaded');
})();