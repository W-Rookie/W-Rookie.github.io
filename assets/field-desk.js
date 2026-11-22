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
  const readKey = 'w-rookie-news-read-v1';
  let activeFilter = 'all';
  let articles = [];
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
      const message = document.createElement('p');
      message.className = 'news-message';
      message.textContent = articles.length ? '이 조건에 맞는 기사가 없습니다.' : '기사 목록을 가져오지 못했습니다. 오른쪽의 원문 출처에서 최신 기사를 확인해 주세요.';
      newsList.append(message);
      return;
    }
    visible.forEach((article, index) => {
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
  }

  filterButtons.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.newsFilter;
    filterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderNews();
  }));
  newsSearch?.addEventListener('input', renderNews);

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
      posts.filter((post) => post && typeof post.title === 'string' && /^posts\/note-\d+\.html$/.test(post.file))
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

  const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
  const sections = navLinks.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    sections.forEach((section) => spy.observe(section));
  }
})();
