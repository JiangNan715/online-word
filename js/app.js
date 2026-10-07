/* js/app.js - 页面逻辑与路由 */

// 初始化应用
function initApp() {
  initStorage();
  renderBookSelect();
  window.addEventListener('hashchange', route);
  route();
}

// 路由分发
function route() {
  const hash = location.hash.slice(1) || '/home';
  const page = hash.split('/')[1] || 'home';

  // 高亮导航
  document.querySelectorAll('#mainNav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  const app = document.getElementById('app');

  switch (page) {
    case 'home':
      renderHome(app);
      break;
    case 'books':
      renderBooks(app);
      break;
    case 'learn':
      renderLearn(app);
      break;
    case 'review':
      renderReview(app);
      break;
    case 'stats':
      renderStats(app);
      break;

    // ---- AI 模块（由 ai.js / ai-game.js 暴露到 window 上） ----
case 'ai-history':
      if (typeof window.renderAIHistory === 'function') window.renderAIHistory(app);
      break;
    default:
      renderHome(app);
  }

  renderBookSelect();
}

// 顶部词书选择器
function renderBookSelect() {
  const select = document.getElementById('bookSelect');
  const books = getBooks();
  const state = getState();

  select.innerHTML = books.map(b => `
    <option value="${b.id}" ${b.id === state.currentBookId ? 'selected' : ''}>
      ${b.name}
    </option>
  `).join('');

  select.onchange = (e) => {
    setCurrentBook(e.target.value);
    route();
  };
}

// ==================== 首页 ====================
function renderHome(app) {
  const book = getCurrentBook();
  const daily = getDailyStats();
  const stats = getStats(book ? book.id : '');

  app.innerHTML = `
    <section class="page">
      <div class="hero card">
        <h1>在线背单词</h1>
        <p class="muted">当前词书：<strong>${book ? book.name : '无'}</strong></p>

        <div class="hero-stats">
          <div class="stat-item">
            <span class="stat-num">${daily.learned}</span>
            <span>今日学习</span>
          </div>
          <div class="stat-item">
            <span class="stat-num">${daily.reviewed}</span>
            <span>今日复习</span>
          </div>
          <div class="stat-item">
            <span class="stat-num">${stats.total}</span>
            <span>累计单词</span>
          </div>
        </div>

        <div class="hero-actions">
          <a class="btn primary" href="#/learn">开始学习</a>
          <a class="btn" href="#/review">复习待办 (${stats.due})</a>
          <a class="btn" href="#/books">管理单词本</a>
        </div>
      </div>
    </section>
  `;
}

// ==================== 单词本列表页 ====================
function renderBooks(app) {
  const books = getBooks();
  const state = getState();
  const current = getCurrentBook();

  app.innerHTML = `
    <section class="page">
      <div class="page-header">
        <h2>单词本管理</h2>
        <button class="btn primary" id="createBookBtn">+ 新建单词本</button>
      </div>

      <div class="book-list">
        ${books.map(b => `
          <div class="book-item card ${b.id === state.currentBookId ? 'active' : ''}" data-id="${b.id}">
            <div class="book-info">
              <h3>${b.name}</h3>
              <p class="muted">${b.words.length} 个单词</p>
            </div>
            <div class="book-actions">
              <button class="btn small switch-book" data-id="${b.id}">设为当前</button>
            </div>
          </div>
        `).join('')}
      </div>

      ${current ? `
        <div class="card mt-24">
          <h3>${current.name} - 单词列表</h3>

          <div class="word-tools">
            <button class="btn small" id="addWordBtn">+ 手动新增</button>
            <button class="btn small" id="importWordBtn">批量导入</button>
          </div>

          <div class="word-list">
            ${current.words.length === 0
              ? '<p class="muted">暂无单词，请添加或导入。</p>'
              : current.words.map(w => `
                <div class="word-row">
                  <div>
                    <strong>${w.word}</strong>
                    <span class="muted">${w.phonetic}</span>
                  </div>
                  <div class="muted">${w.meaning}</div>
                </div>
              `).join('')
            }
          </div>
        </div>
      ` : ''}
    </section>
  `;

  // 新建单词本
  document.getElementById('createBookBtn').onclick = () => {
    const name = prompt('请输入新单词本名称：');
    if (name && name.trim()) {
      addBook(name.trim());
      route();
    }
  };

  // 切换当前单词本
  document.querySelectorAll('.switch-book').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      setCurrentBook(btn.dataset.id);
      route();
    };
  });

  document.querySelectorAll('.book-item').forEach(item => {
    item.onclick = () => {
      setCurrentBook(item.dataset.id);
      route();
    };
  });

  // 手动新增单词
  const addWordBtn = document.getElementById('addWordBtn');
  if (addWordBtn) {
    addWordBtn.onclick = () => {
      const word = prompt('输入单词：');
      if (!word) return;
      const phonetic = prompt('输入音标（可空）：') || '';
      const meaning = prompt('输入中文释义：') || '';
      const example = prompt('输入例句（可空）：') || '';

      addWordToBook(current.id, { word, phonetic, meaning, example });
      route();
    };
  }

  // 批量导入
  const importBtn = document.getElementById('importWordBtn');
  if (importBtn) {
    importBtn.onclick = () => {
      const text = prompt(
        '批量导入，每行一个单词。格式：单词,音标,释义,例句（音标/例句可省略）\n' +
        '例如：apple,/ˈæpl/,苹果,I eat an apple.'
      );
      if (text) {
        const count = importWords(current.id, text);
        alert(`成功导入 ${count} 个单词`);
        route();
      }
    };
  }
}

// ==================== 学习页 ====================
function renderLearn(app) {
  const book = getCurrentBook();

  if (!book) {
    app.innerHTML = '<section class="page"><p class="muted">请先创建单词本。</p></section>';
    return;
  }

  const state = getState();

  // 未学习的单词：还没有任何记录
  const newWords = book.words.filter(w => !state.records[w.id]);

  if (newWords.length === 0) {
    app.innerHTML = `
      <section class="page">
        <div class="card center">
          <h2>当前词书已学完</h2>
          <p class="muted">可以去复习，或添加新单词。</p>
          <a class="btn primary" href="#/review">去复习</a>
        </div>
      </section>
    `;
    return;
  }

  const word = newWords[0];

  app.innerHTML = `
    <section class="page">
      <div class="learn-header">
        <span class="muted">待学习：${newWords.length} 个</span>
        <span class="muted">${book.name}</span>
      </div>

      <div class="flashcard" id="flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-face flashcard-front">
            <div class="word-en">${word.word}</div>
            <div class="hint">点击卡片查看释义</div>
          </div>
          <div class="flashcard-face flashcard-back">
            <div class="word-en">${word.word}</div>
            <div class="phonetic">${word.phonetic || ''}</div>
            <div class="meaning">${word.meaning}</div>
            ${word.example ? `<div class="example">${word.example}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="learn-actions">
        <button class="btn danger" id="unknownBtn">不认识</button>
        <button class="btn success" id="knownBtn">认识</button>
      </div>
    </section>
  `;

  const flashcard = document.getElementById('flashcard');
  flashcard.onclick = () => flashcard.classList.toggle('flipped');

  document.getElementById('knownBtn').onclick = (e) => {
    e.stopPropagation();
    updateRecord(word.id, 'known');
    updateDaily('learn');
    route();
  };

  document.getElementById('unknownBtn').onclick = (e) => {
    e.stopPropagation();
    updateRecord(word.id, 'unknown');
    updateDaily('learn');
    route();
  };
}

// ==================== 复习页 ====================
function renderReview(app) {
  const book = getCurrentBook();

  if (!book) {
    app.innerHTML = '<section class="page"><p class="muted">请先创建单词本。</p></section>';
    return;
  }

  const dueWords = getDueWords(book.id);

  if (dueWords.length === 0) {
    app.innerHTML = `
      <section class="page">
        <div class="card center">
          <h2>暂无需要复习的单词</h2>
          <p class="muted">可以继续学习新词，或稍后再来。</p>
          <a class="btn primary" href="#/learn">去学习</a>
        </div>
      </section>
    `;
    return;
  }

  const word = dueWords[0];
  const record = getWordRecord(word.id);

  app.innerHTML = `
    <section class="page">
      <div class="learn-header">
        <span class="muted">待复习：${dueWords.length} 个</span>
        <span class="muted">${book.name}</span>
      </div>

      <div class="flashcard" id="flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-face flashcard-front">
            <div class="word-en">${word.word}</div>
            <div class="hint">点击卡片查看释义</div>
          </div>
          <div class="flashcard-face flashcard-back">
            <div class="word-en">${word.word}</div>
            <div class="phonetic">${word.phonetic || ''}</div>
            <div class="meaning">${word.meaning}</div>
            ${word.example ? `<div class="example">${word.example}</div>` : ''}
            <div class="record-info muted">
              复习等级：${record ? record.level : 0} / 错误：${record ? record.wrongCount : 0}
            </div>
          </div>
        </div>
      </div>

      <div class="learn-actions">
        <button class="btn danger" id="unknownBtn">不认识</button>
        <button class="btn success" id="knownBtn">认识</button>
      </div>
    </section>
  `;

  const flashcard = document.getElementById('flashcard');
  flashcard.onclick = () => flashcard.classList.toggle('flipped');

  document.getElementById('knownBtn').onclick = (e) => {
    e.stopPropagation();
    updateRecord(word.id, 'known');
    updateDaily('review');
    route();
  };

  document.getElementById('unknownBtn').onclick = (e) => {
    e.stopPropagation();
    updateRecord(word.id, 'unknown');
    updateDaily('review');
    route();
  };
}

// ==================== 统计页 ====================
function renderStats(app) {
  const book = getCurrentBook();

  if (!book) {
    app.innerHTML = '<section class="page"><p class="muted">请先创建单词本。</p></section>';
    return;
  }

  const stats = getStats(book.id);
  const daily = getDailyStats();

  const masteredPercent = stats.total
    ? Math.round((stats.mastered / stats.total) * 100)
    : 0;

  const learnedPercent = stats.total
    ? Math.round((stats.learned / stats.total) * 100)
    : 0;

  app.innerHTML = `
    <section class="page">
      <h2>数据统计</h2>

      <div class="stats-grid">
        <div class="card stat-card">
          <span class="stat-num">${daily.learned}</span>
          <span>今日学习</span>
        </div>
        <div class="card stat-card">
          <span class="stat-num">${daily.reviewed}</span>
          <span>今日复习</span>
        </div>
        <div class="card stat-card">
          <span class="stat-num">${stats.total}</span>
          <span>累计单词</span>
        </div>
        <div class="card stat-card">
          <span class="stat-num">${stats.mastered}</span>
          <span>已掌握</span>
        </div>
      </div>

      <div class="card mt-24">
        <h3>掌握程度</h3>

        <div class="progress-item">
          <div class="progress-label">
            <span>已学习</span>
            <span>${stats.learned}/${stats.total}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${learnedPercent}%"></div>
          </div>
        </div>

        <div class="progress-item">
          <div class="progress-label">
            <span>已掌握</span>
            <span>${stats.mastered}/${stats.total}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill success" style="width:${masteredPercent}%"></div>
          </div>
        </div>

        <div class="stats-detail">
          <p>待复习：<strong>${stats.due}</strong> 个</p>
          <p>未学习：<strong>${stats.newWords}</strong> 个</p>
          <p>学习中：<strong>${stats.learning}</strong> 个</p>
        </div>
      </div>
    </section>
  `;
}

// 启动应用
document.addEventListener('DOMContentLoaded', initApp);