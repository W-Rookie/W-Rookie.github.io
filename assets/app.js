const themeStorageKey = 'w-rookie-theme';
const themeButton = document.querySelector('.theme-toggle');
const themeLabel = themeButton?.querySelector('.theme-toggle-label');
const themeIcon = themeButton?.querySelector('.theme-toggle-icon');

function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;

  const lightIsNext = nextTheme === 'dark';
  if (themeLabel) themeLabel.textContent = lightIsNext ? 'LIGHT' : 'DARK';
  if (themeIcon) themeIcon.textContent = lightIsNext ? '☀' : '☾';
  if (themeButton) {
    themeButton.setAttribute('aria-label', lightIsNext ? '화이트 모드로 변경' : '다크 모드로 변경');
    themeButton.setAttribute('aria-pressed', String(nextTheme === 'light'));
  }

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute('content', nextTheme === 'light' ? '#f5f3ef' : '#08090b');
}

let savedTheme = 'dark';
try {
  const storedTheme = localStorage.getItem(themeStorageKey);
  if (storedTheme === 'light' || storedTheme === 'dark') savedTheme = storedTheme;
} catch (_) {
  savedTheme = 'dark';
}
applyTheme(savedTheme);

themeButton?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  try { localStorage.setItem(themeStorageKey, nextTheme); } catch (_) { /* storage unavailable */ }
});

const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }));
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const filters = [...document.querySelectorAll('.filter')];
const cards = [...document.querySelectorAll('.post-card')];
const search = document.querySelector('#post-search');
const emptyState = document.querySelector('#empty-state');
const vulnerabilityReference = document.querySelector('#vulnerability-reference');
let activeFilter = 'all';

function updatePosts() {
  if (!cards.length) return;
  const query = (search?.value || '').trim().toLocaleLowerCase('ko');
  let visibleCount = 0;

  cards.forEach((card) => {
    const categoryMatch = activeFilter === 'all' || card.dataset.category === activeFilter;
    const textMatch = !query || (card.dataset.search || '').toLocaleLowerCase('ko').includes(query) || card.textContent.toLocaleLowerCase('ko').includes(query);
    const visible = categoryMatch && textMatch;
    card.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  if (emptyState) emptyState.hidden = visibleCount !== 0;
  if (vulnerabilityReference) vulnerabilityReference.hidden = activeFilter === 'web-penetration-testing';
}

filters.forEach((button) => button.addEventListener('click', () => {
  filters.forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  activeFilter = button.dataset.filter;
  updatePosts();
}));

search?.addEventListener('input', updatePosts);
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && search && document.activeElement !== search) {
    event.preventDefault();
    search.focus();
  }
});

document.querySelectorAll('.code-block').forEach((block) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  button.textContent = 'COPY';
  button.addEventListener('click', async () => {
    const code = block.querySelector('pre')?.innerText || '';
    await navigator.clipboard.writeText(code);
    button.textContent = 'COPIED';
    window.setTimeout(() => { button.textContent = 'COPY'; }, 1400);
  });
  block.appendChild(button);
});

const progress = document.querySelector('.article-progress');
if (progress) {
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
}

const scanTerminal = document.querySelector('.scan-terminal');
const scanConsole = scanTerminal?.querySelector('.scan-console');
const scanPercent = scanTerminal?.querySelector('[data-scan-percent]');
const scanStatus = scanTerminal?.querySelector('[data-scan-status]');
const findingLabel = scanTerminal?.querySelector('[data-finding-label]');
const findingName = scanTerminal?.querySelector('[data-finding-name]');
const findingMeta = scanTerminal?.querySelector('[data-finding-meta]');

if (scanTerminal && scanConsole && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const messages = [
    { text: '14:09:01  [INIT] authorized target loaded', progress: 9 },
    { text: '14:09:03  [CRAWL] 24 endpoints mapped', progress: 26 },
    { text: '14:09:05  [TEST] parameter id · response diff', progress: 48 },
    { text: '14:09:07  [VERIFY] behavior reproduced', progress: 69 },
    { text: '14:09:08  [FINDING] SQL Injection detected', progress: 87, alert: true },
    { text: '14:09:09  [EVIDENCE] confidence=HIGH', progress: 95 },
    { text: '14:09:10  [REPORT] evidence stored', progress: 100, ready: true }
  ];
  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  const resetScan = () => {
    scanConsole.replaceChildren();
    scanTerminal.classList.remove('is-detected');
    scanTerminal.style.setProperty('--scan-level', '4%');
    if (scanPercent) scanPercent.textContent = '04%';
    if (scanStatus) scanStatus.textContent = 'RUNNING';
    if (findingLabel) findingLabel.textContent = 'ACTIVE TEST';
    if (findingName) findingName.textContent = 'SCANNING';
    if (findingMeta) findingMeta.textContent = 'WEB APPLICATION';
  };

  const typeLine = async (message) => {
    const line = document.createElement('p');
    if (message.alert) line.className = 'scan-alert';
    if (message.ready) line.className = 'scan-ready';
    line.classList.add('is-typing');
    const output = document.createElement('span');
    const cursor = document.createElement('i');
    cursor.className = 'type-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    line.append(output, cursor);
    scanConsole.appendChild(line);

    for (const character of message.text) {
      output.textContent += character;
      await wait(message.alert ? 34 : 20 + Math.random() * 18);
    }

    cursor.remove();
    line.classList.remove('is-typing');
    scanTerminal.style.setProperty('--scan-level', `${message.progress}%`);
    if (scanPercent) scanPercent.textContent = `${String(message.progress).padStart(2, '0')}%`;

    if (message.alert) {
      scanTerminal.classList.add('is-detected');
      if (scanStatus) scanStatus.textContent = 'FOUND';
      if (findingLabel) findingLabel.textContent = 'FINDING 01';
      if (findingName) findingName.textContent = 'SQLi';
      if (findingMeta) findingMeta.textContent = 'CWE-89 · CRITICAL';
      await wait(520);
    } else {
      await wait(220);
    }
  };

  const runLiveScan = async () => {
    while (document.body.contains(scanTerminal)) {
      resetScan();
      await wait(450);
      for (const message of messages) await typeLine(message);
      await wait(1900);
    }
  };

  runLiveScan();
}
