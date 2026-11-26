import { projectUrl, publishableKey } from './supabase-config.mjs';

const oauthKey = 'ban-eua-market-oauth-v1';
const sessionKey = 'ban-eua-market-session-v1';
const app = document.querySelector('#market-accounts');
const form = app.querySelector('form');
const notice = app.querySelector('[data-account-status]');
const roleTitle = app.querySelector('h2');
const submit = form.querySelector('button[type="submit"]');
const modeButton = form.querySelector('[data-account-mode]');
const controls = app.querySelector('[data-account-roles]');
const providers = app.querySelector('[data-identity-providers]');
const providerStatus = providers.querySelector('[data-provider-status]');
const enabledProviders = new Set();
const signedIn = app.querySelector('[data-signed-in]');
const guestButton = app.querySelector('[data-enter-guest]');
const marketButton = signedIn.querySelector('[data-enter-market]');
const email = form.elements.email;
const password = form.elements.password;

let role = 'buyer';
let mode = 'sign-in';

const labels = { buyer: 'ผู้ซื้อ', seller: 'แม่ค้า', guest: 'สำหรับผู้สั่งแบบไม่ระบุตัวตน' };

function showForm() {
  roleTitle.textContent = (mode === 'sign-up' ? 'สมัครบัญชี' : 'เข้าสู่ระบบ') + labels[role];
  submit.textContent = mode === 'sign-up' ? 'สมัครบัญชี' : 'เข้าสู่ระบบ';
  modeButton.textContent = mode === 'sign-up' ? 'มีบัญชีแล้ว เข้าสู่ระบบ' : 'สร้างบัญชีใหม่';
  password.autocomplete = mode === 'sign-up' ? 'new-password' : 'current-password';
  password.minLength = mode === 'sign-up' ? 8 : 1;
  for (const button of controls.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', button.dataset.accountRole === role);
  }
}

async function auth(path, body, token) {
  const headers = { apikey: publishableKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(projectUrl + '/auth/v1/' + path, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    if (result.error_code === 'email_not_confirmed') throw new Error('กรุณากดยืนยันอีเมลก่อนเข้าสู่ระบบ');
    if (response.status === 429) throw new Error('ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่');
    if (result.error_code === 'anonymous_provider_disabled') throw new Error('ยังไม่ได้เปิดการสั่งแบบไม่ระบุตัวตนใน Supabase');
    if (result.error_code === 'invalid_credentials') throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    throw new Error('ดำเนินการกับบัญชีไม่ได้ กรุณาตรวจข้อมูลและลองใหม่');
  }
  return result;
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null');
  } catch {
    return null;
  }
}

function showSession(session) {
  form.hidden = Boolean(session);
  controls.hidden = Boolean(session);
  providers.hidden = Boolean(session);
  guestButton.hidden = Boolean(session);
  signedIn.hidden = !session;
  if (session) {
    roleTitle.textContent = 'บัญชี' + labels[session.role];
    signedIn.querySelector('strong').textContent = session.email;
  } else {
    showForm();
  }
}

function storeSession(result, accountRole, fallbackEmail = '') {
  if (!result?.access_token || !Number.isFinite(result.expires_in)) {
    throw new Error('ระบบบัญชีไม่ได้ส่งข้อมูลการเข้าสู่ระบบที่สมบูรณ์');
  }
  const session = {
    token: result.access_token,
    expiresAt: Date.now() + result.expires_in * 1000,
    role: accountRole,
    email: result.user?.email ?? fallbackEmail,
  };
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  showSession(session);
  return session;
}

const callbackUrl = new URL('./', location.href).href;

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

providers.addEventListener('click', async event => {
  const button = event.target.closest('[data-provider]');
  const provider = button?.dataset.provider;
  if (!enabledProviders.has(provider)) return;
  button.disabled = true;
  try {
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    sessionStorage.setItem(oauthKey, JSON.stringify({ verifier, role, initiatedAt: Date.now() }));
    const url = new URL(projectUrl + '/auth/v1/authorize');
    url.search = new URLSearchParams({
      provider, redirect_to: callbackUrl, code_challenge: base64Url(new Uint8Array(hash)),
      code_challenge_method: 's256',
    }).toString();
    location.assign(url);
  } catch {
    button.disabled = false;
    notice.textContent = 'เริ่มเข้าสู่ระบบผ่านผู้ให้บริการไม่ได้ กรุณาลองใหม่';
  }
});

async function finishOAuth() {
  const url = new URL(location.href);
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) return;
  const code = url.searchParams.get('code');
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  history.replaceState(null, '', url);
  try {
    const pending = JSON.parse(sessionStorage.getItem(oauthKey) ?? 'null');
    if (!code || !pending?.verifier || !Object.hasOwn(labels, pending.role) ||
        Date.now() - pending.initiatedAt > 10 * 60 * 1000) {
      throw new Error('Sign-in attempt is invalid or expired');
    }
    const result = await auth('token?grant_type=pkce', { auth_code: code, code_verifier: pending.verifier });
    await enterMarket(storeSession(result, pending.role));
  } catch {
    notice.textContent = 'เข้าสู่ระบบผ่านผู้ให้บริการไม่สำเร็จ กรุณาลองใหม่';
  } finally {
    sessionStorage.removeItem(oauthKey);
  }
}

controls.addEventListener('click', event => {
  const choice = event.target.closest('[data-account-role]')?.dataset.accountRole;
  if (choice !== 'buyer' && choice !== 'seller') return;
  role = choice;
  mode = 'sign-in';
  notice.textContent = '';
  form.reset();
  showForm();
});

modeButton.onclick = () => {
  mode = mode === 'sign-up' ? 'sign-in' : 'sign-up';
  password.value = '';
  notice.textContent = '';
  showForm();
};

form.onsubmit = async event => {
  event.preventDefault();
  const credentials = { email: email.value.trim(), password: password.value };
  form.querySelector('fieldset').disabled = true;
  controls.hidden = true;
  notice.textContent = '';
  try {
    const path = mode === 'sign-up'
      ? 'signup?redirect_to=' + encodeURIComponent(callbackUrl)
      : 'token?grant_type=password';
    const result = await auth(path, credentials);
    form.reset();
    if (!result.access_token) {
      mode = 'sign-in';
      showForm();
      notice.textContent = 'หากใช้ที่อยู่อีเมลนี้สมัครได้ ระบบจะส่งลิงก์ยืนยันไปทางอีเมล';
      return;
    }
    await enterMarket(storeSession(result, role, credentials.email));
  } catch (error) {
    notice.textContent = error instanceof TypeError ? 'เชื่อมต่อระบบบัญชีไม่ได้ กรุณาลองใหม่' : error.message;
  } finally {
    form.querySelector('fieldset').disabled = false;
    controls.hidden = form.hidden;
  }
};

async function beginGuestSession() {
  const session = readSession();
  if (session?.role === 'guest' && session.expiresAt > Date.now()) return session;
  const result = await auth('signup', {});
  if (!result.user?.is_anonymous) throw new Error('เริ่มเซสชันไม่ระบุตัวตนไม่ได้');
  return storeSession(result, 'guest');
}

async function enterMarket(session) {
  if (!session || (session.token && session.expiresAt <= Date.now())) {
    sessionStorage.removeItem(sessionKey);
    showSession(null);
    notice.textContent = 'กรุณาเข้าสู่ระบบอีกครั้ง';
    return;
  }
  marketButton.disabled = true;
  try {
    const { startMarket } = await import('./app.mjs');
    await startMarket(session, beginGuestSession);
  } catch {
    notice.textContent = 'เปิดหน้าตลาดไม่ได้ กรุณากดเข้าสู่ตลาดอีกครั้ง';
  } finally {
    marketButton.disabled = false;
  }
}

async function loadProviders() {
  try {
    const response = await fetch(projectUrl + '/auth/v1/settings', {
      headers: { apikey: publishableKey }, cache: 'no-store',
    });
    if (!response.ok) throw new Error('Provider settings unavailable');
    const { external } = await response.json();
    const unavailable = [];
    for (const button of providers.querySelectorAll('[data-provider]')) {
      const name = button.dataset.provider;
      button.disabled = external?.[name] !== true;
      if (button.disabled) unavailable.push(name === 'google' ? 'Google' : 'Facebook');
      else enabledProviders.add(name);
    }
    providerStatus.textContent = unavailable.length
      ? 'รอเปิดใช้งาน ' + unavailable.join(' และ ') : '';
  } catch {
    providerStatus.textContent = 'ตรวจสอบการเข้าสู่ระบบผ่าน Google และ Facebook ไม่ได้';
  }
}

marketButton.onclick = () => enterMarket(readSession());
guestButton.onclick = async () => {
  guestButton.disabled = true;
  try {
    await enterMarket({ role: 'guest' });
  } finally {
    guestButton.disabled = false;
  }
};

document.querySelector('#market-sign-out').onclick = async () => {
  const session = readSession();
  sessionStorage.removeItem(sessionKey);
  document.querySelector('#app-content').hidden = true;
  if (session?.token) await auth('logout?scope=local', {}, session.token).catch(() => {});
  location.reload();
};

signedIn.querySelector('[data-sign-out]').onclick = async () => {
  const session = readSession();
  sessionStorage.removeItem(sessionKey);
  showSession(null);
  notice.textContent = '';
  if (!session?.token) return;
  try {
    await auth('logout?scope=local', {}, session.token);
  } catch {
    notice.textContent = 'ออกจากระบบในแท็บนี้แล้ว';
  }
};

if (publishableKey.startsWith('sb_publishable_')) {
  const session = readSession();
  const valid = session?.expiresAt > Date.now() && Object.hasOwn(labels, session.role);
  if (!valid) sessionStorage.removeItem(sessionKey);
  showSession(valid ? session : null);
  app.hidden = false;
  loadProviders();
  const hasOAuthCallback = new URLSearchParams(location.search).has('code') ||
    new URLSearchParams(location.search).has('error');
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('access_token')) {
    history.replaceState(null, '', location.pathname + location.search);
    notice.textContent = 'ยืนยันอีเมลแล้ว กรุณาเข้าสู่ระบบ';
  }
  if (hasOAuthCallback) await finishOAuth();
  else if (valid) await enterMarket(session);
}
