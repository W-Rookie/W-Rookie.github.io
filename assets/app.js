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
