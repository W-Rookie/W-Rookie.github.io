const rookiesForm = document.querySelector('#rookies-form');
const rookiesPassword = document.querySelector('#rookies-password');
const rookiesStatus = document.querySelector('#rookies-status');
const rookiesPreview = document.querySelector('.private-preview');
const rookiesFilter = document.querySelector('[data-filter="rookies-penetration-testing"]');
const rookiesGrid = document.querySelector('#post-grid');

function rookiesBase64(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function openRookiesVault(password) {
  const response = await fetch('assets/rookies-vault.enc.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('unavailable');
  const payload = await response.json();
  if (payload.version !== 1 || payload.kdf !== 'PBKDF2-SHA256' || payload.cipher !== 'AES-256-GCM') throw new Error('format');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: rookiesBase64(payload.salt), iterations: payload.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const ciphertext = rookiesBase64(payload.ciphertext);
  const tag = rookiesBase64(payload.tag);
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rookiesBase64(payload.iv), tagLength: 128 }, key, encrypted);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
}

function createRookiesCard(entry) {
  if (!entry || !/^posts\/rookies-[a-z0-9-]+\.html$/.test(entry.file) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !/^\d{2}$/.test(entry.number) || typeof entry.title !== 'string' || typeof entry.summary !== 'string' || typeof entry.search !== 'string') throw new Error('format');
  const card = document.createElement('article');
  card.className = 'post-card visible';
  card.dataset.category = 'rookies-penetration-testing';
  card.dataset.search = entry.search;

  const link = document.createElement('a');
  link.href = entry.file;
  link.setAttribute('aria-label', `${entry.title}, 비밀번호 필요`);
  const top = document.createElement('div');
  top.className = 'card-top';
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = 'ROOKIES · LOCKED';
  const time = document.createElement('time');
  time.dateTime = entry.date;
  time.textContent = entry.date.replaceAll('-', '.');
  top.append(tag, time);

  const copy = document.createElement('div');
  copy.className = 'card-copy';
  const number = document.createElement('p');
  number.className = 'card-index';
  number.textContent = `${entry.number} / PENETRATION TESTING`;
  const title = document.createElement('h3');
  title.textContent = entry.title;
  const summary = document.createElement('p');
  summary.textContent = entry.summary;
  const more = document.createElement('span');
  more.className = 'read-more';
  more.textContent = '비밀글 열기 ';
  const arrow = document.createElement('b');
  arrow.textContent = '↗';
  more.append(arrow);
  copy.append(number, title, summary, more);
  link.append(top, copy);
  card.append(link);
  return card;
}

rookiesPreview?.querySelector('button')?.addEventListener('click', () => {
  rookiesFilter?.click();
  rookiesPassword?.focus();
});

rookiesForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = rookiesForm.querySelector('button');
  button.disabled = true;
  rookiesStatus.textContent = '암호화된 목록을 여는 중입니다…';
  try {
    const vault = await openRookiesVault(rookiesPassword.value);
    if (vault.version !== 1 || !Array.isArray(vault.entries) || vault.entries.length !== 8) throw new Error('format');
    const cards = vault.entries.map(createRookiesCard);
    rookiesPreview.replaceWith(...cards);
    document.querySelector('#rookies-gate').dataset.unlocked = 'true';
    rookiesPassword.value = '';
    document.querySelector('#post-search').value = '';
    document.dispatchEvent(new Event('rookies:unlocked'));
  } catch (error) {
    rookiesStatus.textContent = error.message === 'unavailable' ? '목록이 아직 준비되지 않았습니다.' : '비밀번호를 확인해 주세요.';
    rookiesPassword.focus();
  } finally {
    button.disabled = false;
  }
});
