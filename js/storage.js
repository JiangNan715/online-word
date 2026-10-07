/* js/storage.js - 本地数据管理 */

window.STORAGE_KEYS = window.STORAGE_KEYS || {
  BOOKS: 'word_app_books',
  STATE: 'word_app_state'
};

// 艾宾浩斯复习间隔（毫秒）
var REVIEW_INTERVALS = [
  5 * 60 * 1000,           // 5分钟
  30 * 60 * 1000,          // 30分钟
  12 * 60 * 60 * 1000,     // 12小时
  1 * 24 * 60 * 60 * 1000, // 1天
  2 * 24 * 60 * 60 * 1000, // 2天
  4 * 24 * 60 * 60 * 1000, // 4天
  7 * 24 * 60 * 60 * 1000, // 7天
  15 * 24 * 60 * 60 * 1000 // 15天
];

// 获取今天的本地日期字符串，例如 2025-01-01
function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 初始化本地存储
function initStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.BOOKS)) {
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(DEFAULT_BOOKS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.STATE)) {
    const defaultState = {
      currentBookId: DEFAULT_BOOKS[0].id,
      records: {},
      daily: {}
    };
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(defaultState));
  }
}
  // 自动合并新词书，防止老用户看不到新词书
  setTimeout(() => { if (typeof mergeBuiltinBooks === 'function') mergeBuiltinBooks(); }, 500);
function getBooks() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOKS)) || [];
}

function saveBooks(books) {
  localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
}

function getState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.STATE)) || {
    currentBookId: '',
    records: {},
    daily: {}
  };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
}

function getCurrentBook() {
  const state = getState();
  const books = getBooks();
  return books.find(b => b.id === state.currentBookId) || books[0] || null;
}

function setCurrentBook(bookId) {
  const state = getState();
  state.currentBookId = bookId;
  saveState(state);
}

// 新建单词本
function addBook(name) {
  const books = getBooks();
  const id = 'book_' + Date.now();
  books.push({ id, name, words: [] });
  saveBooks(books);
  setCurrentBook(id);
  return id;
}

// 向单词本添加一个单词
function addWordToBook(bookId, wordData) {
  const books = getBooks();
  const book = books.find(b => b.id === bookId);
  if (!book) return false;

  const id = wordData.id || (bookId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  book.words.push({
    id,
    word: wordData.word,
    phonetic: wordData.phonetic || '',
    meaning: wordData.meaning || '',
    example: wordData.example || ''
  });

  saveBooks(books);
  return true;
}

// 批量导入单词
// 支持格式：
// 1. 单词,音标,释义,例句
// 2. 单词,释义
// 3. 单词 释义
function importWords(bookId, text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let count = 0;

  lines.forEach(line => {
    let parts = line.split(',').map(s => s.trim());

    if (parts.length < 2) {
      parts = line.split(/\s+/);
    }

    if (parts.length >= 2) {
      const word = parts[0];
      const phonetic = parts.length >= 4 ? parts[1] : '';
      const meaning = parts.length >= 4 ? parts[2] : (parts[1] || '');
      const example = parts.length >= 4 ? parts.slice(3).join(', ') : '';

      addWordToBook(bookId, { word, phonetic, meaning, example });
      count++;
    }
  });

  return count;
}

// 获取某个单词的学习记录
function getWordRecord(wordId) {
  const state = getState();
  return state.records[wordId] || null;
}

// 更新学习记录，action 为 'known' 或 'unknown'
function updateRecord(wordId, action) {
  const state = getState();
  const now = Date.now();

  let record = state.records[wordId];

  if (!record) {
    record = {
      level: 0,
      nextReview: now,
      lastReview: null,
      wrongCount: 0,
      correctCount: 0,
      status: 'new'
    };
  }

  if (action === 'known') {
    record.level = Math.min(record.level + 1, REVIEW_INTERVALS.length);
    record.correctCount++;
    record.lastReview = now;

    const intervalIndex = Math.min(record.level - 1, REVIEW_INTERVALS.length - 1);
    record.nextReview = now + REVIEW_INTERVALS[intervalIndex];
    record.status = record.level >= 5 ? 'mastered' : 'learning';
  } else {
    record.level = 0;
    record.wrongCount++;
    record.lastReview = now;
    record.nextReview = now + REVIEW_INTERVALS[0];
    record.status = 'learning';
  }

  state.records[wordId] = record;
  saveState(state);

  return record;
}

// 更新今日学习/复习数量
function updateDaily(type) {
  const state = getState();
  const today = getTodayKey();

  if (!state.daily[today]) {
    state.daily[today] = { learned: 0, reviewed: 0 };
  }

  if (type === 'learn') state.daily[today].learned++;
  if (type === 'review') state.daily[today].reviewed++;

  saveState(state);
}

// 获取今日统计
function getDailyStats() {
  const state = getState();
  const today = getTodayKey();
  return state.daily[today] || { learned: 0, reviewed: 0 };
}

// 获取当前需要复习的单词
function getDueWords(bookId) {
  const book = getBooks().find(b => b.id === bookId);
  if (!book) return [];

  const state = getState();
  const now = Date.now();

  return book.words
    .filter(word => {
      const record = state.records[word.id];
      return record && record.nextReview <= now;
    })
    .sort((a, b) => {
      const ra = state.records[a.id];
      const rb = state.records[b.id];
      return ra.nextReview - rb.nextReview;
    });
}

// 获取统计信息
function getStats(bookId) {
  const book = getBooks().find(b => b.id === bookId);
  if (!book) {
    return { total: 0, learned: 0, mastered: 0, learning: 0, newWords: 0, due: 0 };
  }

  const state = getState();
  let learned = 0;
  let mastered = 0;
  let learning = 0;
  let newWords = 0;
  let due = 0;
  const now = Date.now();

  book.words.forEach(word => {
    const record = state.records[word.id];

    if (!record) {
      newWords++;
    } else {
      learned++;

      if (record.status === 'mastered') {
        mastered++;
      } else {
        learning++;
      }

      if (record.nextReview <= now) {
        due++;
      }
    }
  });

  return {
    total: book.words.length,
    learned,
    mastered,
    learning,
    newWords,
    due
  };
}
/* =====================================================
   合并内置词书（用于老用户升级，不覆盖已有数据）
   使用方法：浏览器控制台执行  mergeBuiltinBooks()
   ===================================================== */
function mergeBuiltinBooks() {
  if (typeof DEFAULT_BOOKS === 'undefined') return 0;
  const books = getBooks();
  const existingIds = books.map(b => b.id);
  let added = 0;

  DEFAULT_BOOKS.forEach(defBook => {
    if (!existingIds.includes(defBook.id)) {
      books.push(JSON.parse(JSON.stringify(defBook)));
      added++;
    }
  });

  saveBooks(books);
  console.log(`[词书合并] 新增 ${added} 本内置词书`);
  return added;
}