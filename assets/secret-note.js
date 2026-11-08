const secretForm = document.querySelector('#secret-form');
const secretGate = document.querySelector('#secret-gate');
const secretContent = document.querySelector('#secret-content');
const secretStatus = document.querySelector('#secret-status');
const secretPassword = document.querySelector('#secret-password');

function base64ToBytes(value) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function unlockArticle(password) {
  const response = await fetch('../assets/rookies-sqli.enc.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('unavailable');
  const payload = await response.json();
  if (payload.version !== 1 || payload.kdf !== 'PBKDF2-SHA256' || payload.cipher !== 'AES-256-GCM') throw new Error('format');
  const passwordBytes = new TextEncoder().encode(password);
  const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: base64ToBytes(payload.salt), iterations: payload.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const tag = base64ToBytes(payload.tag);
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);
  const plainBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(payload.iv), tagLength: 128 }, key, encrypted);
  return new TextDecoder('utf-8', { fatal: true }).decode(plainBytes);
}

secretForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = secretForm.querySelector('button');
  const password = secretPassword.value;
  button.disabled = true;
  secretStatus.textContent = '본문을 여는 중입니다…';
  try {
    const html = await unlockArticle(password);
    secretContent.innerHTML = html;
    secretContent.hidden = false;
    secretGate.hidden = true;
    secretPassword.value = '';
    document.querySelectorAll('#secret-content .code-block').forEach((block) => {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'copy-button';
      copy.textContent = 'COPY';
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(block.querySelector('pre')?.innerText || '');
        copy.textContent = 'COPIED';
        window.setTimeout(() => { copy.textContent = 'COPY'; }, 1400);
      });
      block.appendChild(copy);
    });
  } catch (error) {
    secretStatus.textContent = error.message === 'unavailable' ? '본문이 아직 준비되지 않았습니다.' : '비밀번호를 확인해 주세요.';
    secretPassword.focus();
  } finally {
    button.disabled = false;
  }
});
