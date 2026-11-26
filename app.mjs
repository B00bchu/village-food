import { menu, statuses, createOrder, advance, review, closeOrder, isActive } from './model.mjs';

const get = selector => document.querySelector(selector);
const storageKey = 'village-food-demo-v1';
const notice = message => { get('#notice').textContent = message; };
let orders = readOrders();
let buyer = '';
let challenge;
let currentView = 'buyer';
let zone = 'เหนือ';
let shop = menu[0].shop;

function readOrders() {
  return JSON.parse(localStorage.getItem(storageKey) ?? '[]');
}

async function updateOrders(mutate, success) {
  const commit = () => {
    orders = readOrders();
    if (!mutate()) return false;
    localStorage.setItem(storageKey, JSON.stringify(orders));
    return true;
  };
  try {
    const changed = navigator.locks
      ? await navigator.locks.request(storageKey, commit)
      : commit();
    render();
    notice(changed ? success : 'ออเดอร์นี้มีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง');
  } catch {
    orders = readOrders();
    notice('บันทึกข้อมูลไม่ได้ กรุณาลองอีกครั้ง');
  }
}

const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' });

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function canAccess(order, actor, phone, shopName) {
  if (actor === 'buyer') return order.buyer === phone;
  return actor === 'seller' && menu.some(entry => entry.id === order.item && entry.shop === shopName);
}

get('#request').onsubmit = event => {
  event.preventDefault();
  const phone = new FormData(event.target).get('phone');
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  challenge = { phone, code, expires: Date.now() + 120000, remaining: 5 };
  get('#verify').reset();
  get('#verify').hidden = false;
  get('#verify input').focus();
  notice('รหัสทดลอง ' + code + ' ใช้ได้ 2 นาที');
};

get('#verify').onsubmit = event => {
  event.preventDefault();
  if (!challenge || Date.now() >= challenge.expires || challenge.remaining === 0) {
    notice('กรุณาขอรหัสทดลองใหม่');
    return;
  }
  if (new FormData(event.target).get('code') !== challenge.code) {
    challenge.remaining -= 1;
    notice('รหัสไม่ตรง เหลือ ' + challenge.remaining + ' ครั้ง');
    return;
  }
  buyer = challenge.phone;
  challenge = undefined;
  currentView = 'buyer';
  get('#auth').hidden = true;
  get('#market').hidden = false;
  notice('เข้าสู่ระบบทดลองแล้ว');
  render();
};

get('#logout').onclick = () => {
  buyer = '';
  get('#view').replaceChildren();
  get('#auth').hidden = false;
  get('#market').hidden = true;
  get('#verify').hidden = true;
  get('#request').reset();
  get('#verify').reset();
  notice('ออกจากระบบแล้ว');
};

function rating(shopName) {
  const rated = orders.filter(order => order.score && menu.some(item => item.id === order.item && item.shop === shopName));
  if (!rated.length) return 'ยังไม่มีรีวิว';
  const sum = rated.reduce((total, order) => total + order.score, 0);
  return 'คะแนนร้าน ' + (sum / rated.length).toFixed(1) + '/5 (' + rated.length + ' รีวิว)';
}

function orderCard(order) {
  const item = menu.find(entry => entry.id === order.item);
  const next = currentView === 'seller' && isActive(order)
    ? '<button data-next="' + order.id + '" data-status="' + order.status + '">' +
      statuses[order.status + 1] + '</button>' : '';
  const close = currentView !== 'admin' && order.status === 0 && isActive(order)
    ? '<button data-close="' + order.id + '">' +
      (currentView === 'buyer' ? 'ยกเลิกออเดอร์' : 'ปฏิเสธออเดอร์') + '</button>' : '';
  const history = (order.history ?? [{ label: statuses[order.status] }]).map(entry =>
    '<li>' + entry.label + (entry.at ? ' · ' + dateTime.format(entry.at) : '') + '</li>').join('');
  const messages = (order.messages ?? []).map(message =>
    '<li><strong>' + (message.actor === 'buyer' ? 'ผู้ซื้อ' : 'ร้านค้า') + '</strong> · ' +
    dateTime.format(message.at) + '<p>' + escapeText(message.text) + '</p></li>').join('');
  const chat = currentView !== 'admin'
    ? '<details data-panel="chat-' + order.id + '"><summary>แชทออเดอร์ (' +
      (order.messages?.length ?? 0) + ')</summary>' +
      (messages ? '<ul class="messages">' + messages + '</ul>' : '<p>ยังไม่มีข้อความ</p>') +
      '<form data-chat="' + order.id + '"><label>ข้อความ<input name="message" maxlength="300" required></label>' +
      '<button>ส่งข้อความ</button></form></details>' : '';
  const rate = currentView === 'buyer' && order.status === statuses.length - 1 && order.score === undefined
    ? '<form data-rate="' + order.id + '"><label>คะแนนรีวิว<select name="score">' +
      [5, 4, 3, 2, 1].map(score => '<option>' + score + '</option>').join('') +
      '</select></label><button>ส่งคะแนน</button></form>' : '';
  const score = order.score ? '<p>รีวิว ' + order.score + '/5</p>' : '';
  return '<article><h3>' + item.name + ' × ' + order.quantity + '</h3><p>' + item.shop +
    ' · โซน' + order.zone + ' · ฿' + order.total + '</p><p>' + (order.closed ?? statuses[order.status]) +
    '</p>' + score + next + close + rate + '<details data-panel="history-' + order.id +
    '"><summary>ประวัติสถานะ</summary><ol>' + history + '</ol></details>' + chat + '</article>';
}

function options(values, selected) {
  return values.map(value => '<option' + (value === selected ? ' selected' : '') + '>' + value + '</option>').join('');
}

function render() {
  for (const button of document.querySelectorAll('[data-view]')) {
    button.setAttribute('aria-pressed', button.dataset.view === currentView);
  }
  const view = get('#view');
  const open = new Set([...view.querySelectorAll('details[open]')].map(panel => panel.dataset.panel));
  const drafts = new Map([...view.querySelectorAll('form[data-chat]')].map(form =>
    [form.dataset.chat, form.elements.message.value]));
  let visible = orders;
  if (currentView === 'buyer') {
    visible = orders.filter(order => order.buyer === buyer);
    view.innerHTML = '<h1>สั่งอาหารใกล้บ้าน</h1><label>โซนจัดส่ง<select id="zone">' +
      options(['เหนือ', 'ใต้'], zone) + '</select></label>' +
      menu.filter(item => item.zone === zone).map(item =>
        '<article><h2>' + item.name + '</h2><p>' + item.shop + ' · ฿' + item.price +
        '</p><p>' + rating(item.shop) + '</p><form data-item="' + item.id +
        '"><label>จำนวน<input name="quantity" type="number" min="1" max="20" value="1" required></label>' +
        '<button>สั่งอาหาร</button></form></article>').join('') + '<h2>ติดตามออเดอร์ของฉัน</h2>';
  } else if (currentView === 'seller') {
    visible = orders.filter(order => menu.some(item => item.id === order.item && item.shop === shop));
    view.innerHTML = '<h1>ออเดอร์ร้านค้า</h1><label>ร้านทดลอง<select id="shop">' +
      options([...new Set(menu.map(item => item.shop))], shop) + '</select></label>';
  } else {
    const pending = orders.filter(isActive).length;
    view.innerHTML = '<h1>ภาพรวมแอดมิน</h1><p>ทั้งหมด ' + orders.length + ' ออเดอร์ · กำลังดำเนินการ ' + pending + '</p>';
  }
  view.insertAdjacentHTML('beforeend', visible.map(orderCard).join('') || '<p>ยังไม่มีออเดอร์</p>');
  for (const panel of view.querySelectorAll('details')) panel.open = open.has(panel.dataset.panel);
  for (const form of view.querySelectorAll('form[data-chat]')) {
    form.elements.message.value = drafts.get(form.dataset.chat) ?? '';
  }
}

get('#market').onclick = event => {
  const { view, next, close, status } = event.target.dataset;
  if (view) {
    if (currentView !== view) get('#view').replaceChildren();
    currentView = view;
    notice('');
    render();
  }
  if (!buyer || (!next && !close)) return;
  const actor = currentView;
  const phone = buyer;
  const shopName = shop;
  updateOrders(() => {
    const order = orders.find(entry => entry.id === (next ?? close));
    if (!order || !canAccess(order, actor, phone, shopName)) return false;
    if (close) return closeOrder(order, actor);
    return actor === 'seller' && order.status === Number(status) && advance(order);
  }, 'อัปเดตสถานะแล้ว');
};

get('#view').onchange = event => {
  if (event.target.id === 'zone') zone = event.target.value;
  else if (event.target.id === 'shop') shop = event.target.value;
  else return;
  render();
};

get('#view').onsubmit = event => {
  event.preventDefault();
  if (!buyer) return;
  const actor = currentView;
  const phone = buyer;
  const shopName = shop;
  const { item, rate, chat } = event.target.dataset;
  const data = new FormData(event.target);
  if (chat) {
    const message = data.get('message').trim();
    if (!message || message.length > 300) {
      notice('กรุณาพิมพ์ข้อความ 1–300 ตัวอักษร');
      return;
    }
    updateOrders(() => {
      const order = orders.find(entry => entry.id === chat);
      if (!order || !canAccess(order, actor, phone, shopName)) return false;
      order.messages ??= [];
      order.messages.push({ actor, text: message, at: Date.now() });
      if (event.target.elements.message.value.trim() === message) event.target.reset();
      return true;
    }, 'ส่งข้อความแล้ว');
  } else if (actor === 'buyer' && item) {
    const order = createOrder({ id: crypto.randomUUID(), buyer: phone, item, zone, quantity: Number(data.get('quantity')) });
    if (!order) return;
    updateOrders(() => {
      orders.unshift(order);
      return true;
    }, 'ส่งออเดอร์ทดลองแล้ว ร้านเป็นผู้จัดส่ง');
  } else if (actor === 'buyer' && rate) {
    updateOrders(() => {
      const order = orders.find(entry => entry.id === rate);
      return order && review(order, phone, Number(data.get('score')));
    }, 'บันทึกคะแนนรีวิวแล้ว');
  }
};

window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  orders = readOrders();
  if (buyer) {
    render();
    notice('มีข้อมูลออเดอร์เปลี่ยนแปลง');
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error));
}
