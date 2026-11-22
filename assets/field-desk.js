(() => {
  const sourceNames = { dailysecu: '데일리시큐', boannews: '보안뉴스', kisa: 'KISA 보안공지' };
  const sourcePages = {
    dailysecu: 'https://www.dailysecu.com/news/articleList.html',
    boannews: 'https://www.boannews.com/news/articleList.html',
    kisa: 'https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020'
  };
  const newsList = document.querySelector('#news-list');
  const signalList = document.querySelector('#field-signals');
  const noteList = document.querySelector('#field-notes');
  const updated = document.querySelector('#news-updated');
  const newsSearch = document.querySelector('#news-search');
  const filterButtons = [...document.querySelectorAll('[data-news-filter]')];
  const newsMore = document.querySelector('#news-more');
  const deskSearch = document.querySelector('#desk-search-input');
  const deskResults = document.querySelector('#desk-search-results');
  const readKey = 'w-rookie-news-read-v1';
  let activeFilter = 'all';
  let articles = [];
  let publicPosts = [];
  let shownCount = 6;
  let readIds = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(readKey) || '[]');
    if (Array.isArray(saved)) readIds = new Set(saved.filter((id) => typeof id === 'string').slice(-300));
  } catch (_) { /* Private browsing may disable storage. */ }

  function articleUrl(value, source) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      const allowed = {
        dailysecu: ['dailysecu.com', 'www.dailysecu.com'],
        boannews: ['boannews.com', 'www.boannews.com'],
        kisa: ['boho.or.kr', 'www.boho.or.kr']
      };
      return allowed[source]?.includes(url.hostname) ? url.href : null;
    } catch (_) { return null; }
  }

  function formatDate(value, withTime = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '날짜 미상';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {})
    }).format(date);
  }

  function saveRead() {
    try { localStorage.setItem(readKey, JSON.stringify([...readIds].slice(-300))); } catch (_) { /* storage unavailable */ }
  }

  function makeLink(article, className) {
    const link = document.createElement('a');
    link.className = className;
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function renderSignals() {
    if (!signalList) return;
    signalList.replaceChildren();
    if (!articles.length) {
      const fallback = document.createElement('a');
      fallback.className = 'field-mini-link';
      fallback.href = sourcePages.dailysecu;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      const label = document.createElement('span');
      label.textContent = 'ORIGINAL SOURCE';
      const title = document.createElement('strong');
      title.textContent = '데일리시큐 최신 기사 보기 ↗';
      fallback.append(label, title);
      signalList.append(fallback);
      return;
    }
    articles.slice(0, 3).forEach((article) => {
      const link = makeLink(article, 'field-mini-link');
      const label = document.createElement('span');
      label.textContent = `${sourceNames[article.source]} / ${formatDate(article.published)}`;
      const title = document.createElement('strong');
      title.textContent = article.title;
      link.append(label, title);
      signalList.append(link);
    });
  }

  function renderNews() {
    if (!newsList) return;
    newsList.replaceChildren();
    const query = newsSearch?.value.trim().toLocaleLowerCase('ko') || '';
    const visible = articles.filter((article) =>
      (activeFilter === 'all' || (activeFilter === 'unread' ? !readIds.has(article.url) : article.source === activeFilter)) &&
      (!query || article.title.toLocaleLowerCase('ko').includes(query))
    );
    if (!visible.length) {
      if (newsMore) newsMore.hidden = true;
      const message = document.createElement('p');
      message.className = 'news-message';
      message.textContent = articles.length ? '이 조건에 맞는 기사가 없습니다.' : '기사 목록을 가져오지 못했습니다. 오른쪽의 원문 출처에서 최신 기사를 확인해 주세요.';
      newsList.append(message);
      return;
    }
    visible.slice(0, shownCount).forEach((article, index) => {
      const row = document.createElement('article');
      row.className = `news-item${readIds.has(article.url) ? ' is-read' : ''}`;
      const number = document.createElement('span');
      number.className = 'news-index';
      number.textContent = String(index + 1).padStart(2, '0');
      const body = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'news-meta';
      const source = document.createElement('span');
      source.className = 'news-source';
      source.textContent = sourceNames[article.source];
      const date = document.createElement('time');
      date.dateTime = article.published;
      date.textContent = formatDate(article.published, true);
      meta.append(source, date);
      const link = makeLink(article, 'news-title');
      link.textContent = `${article.title} ↗`;
      link.addEventListener('click', () => {
        readIds.add(article.url);
        saveRead();
        row.classList.add('is-read');
        button.textContent = '확인됨';
        button.setAttribute('aria-pressed', 'true');
      });
      body.append(meta, link);
      const button = document.createElement('button');
      button.className = 'news-read';
      button.type = 'button';
      button.textContent = readIds.has(article.url) ? '확인됨' : '확인 표시 +';
      button.setAttribute('aria-label', `${article.title} 확인 상태 변경`);
      button.setAttribute('aria-pressed', String(readIds.has(article.url)));
      button.addEventListener('click', () => {
        if (readIds.has(article.url)) readIds.delete(article.url);
        else readIds.add(article.url);
        saveRead();
        renderNews();
      });
      row.append(number, body, button);
      newsList.append(row);
    });
    if (newsMore) {
      const remaining = visible.length - shownCount;
      newsMore.hidden = remaining <= 0;
      newsMore.textContent = `기사 더 보기 (${remaining}건 남음)`;
    }
  }

  filterButtons.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.newsFilter;
    shownCount = 6;
    filterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderNews();
  }));
  newsSearch?.addEventListener('input', () => { shownCount = 6; renderNews(); });
  newsMore?.addEventListener('click', () => { shownCount += 6; renderNews(); });

  function renderDeskSearch() {
    if (!deskSearch || !deskResults) return;
    const query = deskSearch.value.trim().toLocaleLowerCase('ko');
    deskResults.replaceChildren();
    if (!query) { deskResults.hidden = true; return; }
    const matches = [];
    publicPosts.forEach((post) => {
      if (`${post.title} ${post.category}`.toLocaleLowerCase('ko').includes(query))
        matches.push({ label: '공개 노트', title: post.title, url: post.file });
    });
    document.querySelectorAll('.project-card').forEach((card) => {
      const title = card.querySelector('.project-copy h3')?.textContent?.trim().replace(/\s+/g, ' ');
      const url = card.querySelector('a')?.href;
      if (title && url && title.toLocaleLowerCase('ko').includes(query)) matches.push({ label: '프로젝트', title, url });
    });
    articles.forEach((article) => {
      if (article.title.toLocaleLowerCase('ko').includes(query))
        matches.push({ label: sourceNames[article.source], title: article.title, url: article.url, external: true });
    });
    matches.slice(0, 8).forEach((result) => {
      const link = document.createElement('a');
      link.href = result.url;
      if (result.external || result.url.startsWith('https://')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      const label = document.createElement('span');
      label.textContent = result.label;
      const title = document.createElement('strong');
      title.textContent = result.title;
      link.append(label, title);
      link.addEventListener('click', () => { deskSearch.value = ''; deskResults.hidden = true; });
      deskResults.append(link);
    });
    if (!matches.length) {
      const message = document.createElement('p');
      message.textContent = '검색 결과가 없습니다. 비공개 Rookies 기록은 검색에 표시되지 않습니다.';
      deskResults.append(message);
    }
    deskResults.hidden = false;
  }
  deskSearch?.addEventListener('input', renderDeskSearch);
  deskSearch?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { deskSearch.value = ''; renderDeskSearch(); }
    if (event.key === 'Enter') { const first = deskResults?.querySelector('a'); if (first) { event.preventDefault(); first.click(); } }
  });

  fetch('assets/news-feed.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error('News feed unavailable'); return response.json(); })
    .then((feed) => {
      articles = (Array.isArray(feed.articles) ? feed.articles : [])
        .filter((item) => item && sourceNames[item.source] && typeof item.title === 'string' &&
          item.title.trim() && !Number.isNaN(new Date(item.published).getTime()))
        .map((item) => ({ source: item.source, title: item.title.trim().slice(0, 250),
          published: item.published, url: articleUrl(item.url, item.source) }))
        .filter((item) => item.url)
        .sort((a, b) => new Date(b.published) - new Date(a.published))
        .slice(0, 30);
      updated.textContent = feed.generated_at ? `마지막 수집 ${formatDate(feed.generated_at, true)} KST` : '기사 원문 연결';
      renderNews();
      renderSignals();
      renderDeskSearch();
    })
    .catch(() => {
      updated.textContent = '기사 목록 연결 실패';
      renderNews();
      renderSignals();
    });

  fetch('assets/posts.json')
    .then((response) => { if (!response.ok) throw new Error('Notes unavailable'); return response.json(); })
    .then((posts) => {
      if (!noteList) return;
      noteList.replaceChildren();
      publicPosts = posts.filter((post) => post && typeof post.title === 'string' && /^posts\/note-\d+\.html$/.test(post.file));
      publicPosts
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id)
        .slice(0, 3).forEach((post) => {
          const link = document.createElement('a');
          link.className = 'field-mini-link';
          link.href = post.file;
          const label = document.createElement('span');
          label.textContent = `${post.category || 'SECURITY NOTE'} / ${post.date || ''}`;
          const title = document.createElement('strong');
          title.textContent = post.title;
          link.append(label, title);
          noteList.append(link);
        });
      renderDeskSearch();
    })
    .catch(() => {
      if (noteList) noteList.textContent = '공개 기록을 불러오지 못했습니다. 아래 Notes에서 확인해 주세요.';
    });

  const clock = document.querySelector('#field-clock');
  if (clock) {
    const tick = () => { clock.textContent = `${formatDate(Date.now(), true)} KST`; };
    tick();
    window.setInterval(tick, 60000);
  }

  const calendar = document.querySelector('#activity-calendar');
  const activityTotal = document.querySelector('#activity-total');
  const activityUpdated = document.querySelector('#activity-updated');
  if (calendar) fetch('assets/github-activity.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error('Activity unavailable'); return response.json(); })
    .then((snapshot) => {
      const days = (Array.isArray(snapshot.days) ? snapshot.days : []).filter((day) =>
        day && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Number.isInteger(day.level) && day.level >= 0 && day.level <= 4);
      if (days.length < 300) throw new Error('Activity incomplete');
      calendar.replaceChildren();
      const months = document.createElement('div');
      months.className = 'activity-months';
      const grid = document.createElement('div');
      grid.className = 'activity-grid';
      grid.setAttribute('aria-hidden', 'true');
      const offset = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
      for (let i = 0; i < offset; i += 1) grid.append(document.createElement('span'));
      days.forEach((day, index) => {
        if (day.date.endsWith('-01')) {
          const label = document.createElement('span');
          label.textContent = `${Number(day.date.slice(5, 7))}월`;
          label.style.gridColumn = String(Math.floor((index + offset) / 7) + 1);
          months.append(label);
        }
        const cell = document.createElement('span');
        cell.className = `activity-day level-${day.level}`;
        cell.title = `${day.date} · GitHub 기여 단계 ${day.level}`;
        grid.append(cell);
      });
      calendar.append(months, grid);
      activityTotal.textContent = Number.isInteger(snapshot.total_contributions) ? snapshot.total_contributions.toLocaleString('ko-KR') : '—';
      activityUpdated.textContent = snapshot.generated_at ? `${formatDate(snapshot.generated_at)} 기준` : 'GitHub 프로필 기준';
    })
    .catch(() => {
      activityUpdated.textContent = '기여 달력을 불러오지 못했습니다. GitHub 프로필에서 확인해 주세요.';
    });

  const memo = document.querySelector('#desk-memo');
  const memoStatus = document.querySelector('#memo-status');
  const memoKey = 'w-rookie-desk-memo-v1';
  if (memo) {
    try { memo.value = localStorage.getItem(memoKey) || ''; } catch (_) { /* storage unavailable */ }
    memo.addEventListener('input', () => {
      try { localStorage.setItem(memoKey, memo.value); memoStatus.textContent = '이 브라우저에 저장했습니다.'; }
      catch (_) { memoStatus.textContent = '이 브라우저에서는 저장할 수 없습니다.'; }
    });
  }

  const todoForm = document.querySelector('#todo-form');
  const todoInput = document.querySelector('#todo-input');
  const todoList = document.querySelector('#todo-list');
  const todoCount = document.querySelector('#todo-count');
  const todoKey = 'w-rookie-desk-todo-v1';
  let tasks = [];
  try {
    const saved = JSON.parse(localStorage.getItem(todoKey) || '[]');
    if (Array.isArray(saved)) tasks = saved.filter((item) => item && typeof item.text === 'string' && typeof item.done === 'boolean').slice(0, 30);
  } catch (_) { /* storage unavailable */ }
  function saveTasks() { try { localStorage.setItem(todoKey, JSON.stringify(tasks)); } catch (_) { /* storage unavailable */ } }
  function renderTasks() {
    if (!todoList) return;
    todoList.replaceChildren();
    todoCount.textContent = `${tasks.filter((item) => item.done).length}/${tasks.length}`;
    if (!tasks.length) {
      const empty = document.createElement('li');
      empty.className = 'todo-empty';
      empty.textContent = '할 일을 추가하면 여기에 표시됩니다.';
      todoList.append(empty);
      return;
    }
    tasks.forEach((task, index) => {
      const item = document.createElement('li');
      item.classList.toggle('is-done', task.done);
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.done;
      checkbox.addEventListener('change', () => { tasks[index].done = checkbox.checked; saveTasks(); renderTasks(); });
      const title = document.createElement('span');
      title.textContent = task.text;
      label.append(checkbox, title);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${task.text} 삭제`);
      remove.addEventListener('click', () => { tasks.splice(index, 1); saveTasks(); renderTasks(); });
      item.append(label, remove);
      todoList.append(item);
    });
  }
  todoForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = todoInput.value.trim();
    if (!value || tasks.length >= 30) return;
    tasks.push({ text: value.slice(0, 100), done: false });
    todoInput.value = '';
    saveTasks();
    renderTasks();
    todoInput.focus();
  });
  renderTasks();

  const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
  const sections = navLinks.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if (sections.length) {
    let pending = false;
    const updateActive = () => {
      pending = false;
      const line = window.scrollY + window.innerHeight * .34;
      const current = sections.map((section) => ({ section, top: section.getBoundingClientRect().top + window.scrollY }))
        .sort((a, b) => a.top - b.top).filter((item) => item.top <= line).at(-1)?.section;
      if (current) navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${current.id}`));
    };
    window.addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(updateActive); } }, { passive: true });
    window.addEventListener('resize', updateActive);
    window.addEventListener('hashchange', updateActive);
    updateActive();
  }
})();
