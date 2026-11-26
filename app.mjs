import { menu, statuses, createOrder, advance, review, closeOrder, isActive } from './model.mjs';

const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' });

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function orderCard(order) {
  const item = listings().find(entry => entry.id === order.item);
  const next = currentView === 'seller' && isActive(order)
    ? '<button data-next="' + order.id + '" data-status="' + order.status + '">' +
      (order.status === 0 ? 'รับออเดอร์' : statuses[order.status + 1]) + '</button>' : '';
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
  const delivery = order.delivery && currentView !== 'admin'
    ? '<p>ผู้รับ ' + escapeText(order.delivery.name) + ' · จุดส่ง ' + escapeText(order.delivery.address) +
      (order.delivery.note ? '<br>หมายเหตุ ' + escapeText(order.delivery.note) : '') + '</p>' : '';
  return '<article><h3>' + escapeText(item.name) + ' × ' + order.quantity + '</h3><p>' + escapeText(item.shop) +
    ' · โซน' + order.zone + ' · ฿' + order.total + '</p><p>' + (order.closed ?? statuses[order.status]) +
    '</p>' + delivery + score + next + close + rate + '<details data-panel="history-' + order.id +
    '"><summary>ประวัติสถานะ</summary><ol>' + history + '</ol></details>' + chat + '</article>';
}

const get = selector => document.querySelector(selector);
const ordersKey = 'village-food-demo-v1';
const catalogKey = 'village-food-catalog-v1';
const sellerKey = 'village-food-seller-v1';
const guestKey = 'village-food-guest-v1';
const read = (key, fallback) => JSON.parse(localStorage.getItem(key)) ?? fallback;
const readCatalog = () => read(catalogKey, { shops: [], items: [] });
const notice = message => { get('#notice').textContent = message; };
const buyer = localStorage.getItem(guestKey) ?? crypto.randomUUID();
localStorage.setItem(guestKey, buyer);

let orders = read(ordersKey, []);
let catalog = readCatalog();
let currentView = 'home';
let zone = 'เหนือ';
let seller;
let demoShop;
let checkout;
let challenge;

const listings = () => [...menu, ...catalog.items];
const shopId = item => item.shopId ?? item.shop;

async function update(key, mutate, success) {
  const commit = () => {
    catalog = readCatalog();
    orders = read(ordersKey, []);
    const data = key === ordersKey ? orders : catalog;
    const changed = mutate(data);
    if (changed) localStorage.setItem(key, JSON.stringify(data));
    return changed;
  };
  try {
    const changed = navigator.locks ? await navigator.locks.request(key, commit) : commit();
    if (changed && typeof success === 'function') success();
    render();
    if (typeof success !== 'function' || !changed) {
      notice(changed ? success : 'ข้อมูลเปลี่ยนแปลงแล้ว กรุณาตรวจสอบอีกครั้ง');
    }
  } catch {
    catalog = readCatalog();
    orders = read(ordersKey, []);
    notice('บันทึกข้อมูลไม่ได้ กรุณาลองอีกครั้ง');
  }
}

function show(view) {
  currentView = view;
  checkout = undefined;
  demoShop = undefined;
  challenge = undefined;
  get('#home').hidden = view !== 'home';
  get('#back').hidden = view === 'home';
  get('#auth').hidden = view !== 'registration';
  get('#view').hidden = ['home', 'registration'].includes(view);
  get('#view').replaceChildren();
  get('#request').reset();
  get('#verify').reset();
  get('#verify').hidden = true;
  notice('');
  render();
}

get('main').addEventListener('click', event => {
  const view = event.target.closest('[data-page]')?.dataset.page;
  if (view === 'seller') {
    catalog = readCatalog();
    seller = catalog.shops.find(shop => shop.id === localStorage.getItem(sellerKey));
    show(seller ? 'seller' : 'registration');
  } else if (view) {
    show(view);
  }
});

get('#request').onsubmit = event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const name = data.get('name').trim();
  if (!name) {
    notice('กรุณากรอกชื่อร้าน');
    return;
  }
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  challenge = { name, phone: data.get('phone'), zone: data.get('zone'), code,
    expires: Date.now() + 120000, remaining: 5 };
  get('#verify').reset();
  get('#verify').hidden = false;
  get('#verify input').focus();
  notice('รหัสทดลอง ' + code + ' ใช้ได้ 2 นาที');
};

get('#verify').onsubmit = event => {
  event.preventDefault();
  if (!challenge || Date.now() >= challenge.expires || !challenge.remaining) {
    notice('กรุณาขอ OTP ทดลองใหม่');
    return;
  }
  if (new FormData(event.target).get('code') !== challenge.code) {
    challenge.remaining -= 1;
    notice('รหัสไม่ตรง เหลือ ' + challenge.remaining + ' ครั้ง');
    return;
  }
  const { name, phone, zone } = challenge;
  challenge = undefined;
  update(catalogKey, data => {
    seller = data.shops.find(shop => shop.phone === phone);
    if (!seller) {
      seller = { id: crypto.randomUUID(), name, phone, zone };
      data.shops.push(seller);
    }
    return true;
  }, () => {
    localStorage.setItem(sellerKey, seller.id);
    if (currentView === 'registration') {
      show('seller');
      notice('ยืนยันเบอร์แล้ว เริ่มลงขายเมนูได้เลย');
    }
  });
};

function rating(id) {
  const itemIds = new Set(listings().filter(item => shopId(item) === id).map(item => item.id));
  const rated = orders.filter(order => order.score && itemIds.has(order.item));
  if (!rated.length) return 'ยังไม่มีรีวิว';
  const sum = rated.reduce((total, order) => total + order.score, 0);
  return 'คะแนนร้าน ' + (sum / rated.length).toFixed(1) + '/5 (' + rated.length + ' รีวิว)';
}

function buyerMenu() {
  const zoneOptions = ['เหนือ', 'ใต้'].map(name =>
    '<option' + (name === zone ? ' selected' : '') + '>' + name + '</option>').join('');
  const cards = listings().filter(item => item.zone === zone && !item.paused).map(item =>
    '<article><h2>' + escapeText(item.name) + '</h2><p>' + escapeText(item.shop) + ' · ฿' +
    item.price + '</p>' + (item.description ? '<p>' + escapeText(item.description) + '</p>' : '') +
    '<p>' + rating(shopId(item)) + '</p><form data-item="' + item.id +
    '"><label>จำนวน<input name="quantity" type="number" min="1" max="20" value="1" required></label>' +
    '<button>ตรวจสอบออเดอร์</button></form></article>').join('');
  return '<h1>สั่งอาหารใกล้บ้าน</h1><label>โซนจัดส่ง<select id="zone">' + zoneOptions +
    '</select></label>' + cards + '<h2>ติดตามออเดอร์ของฉัน</h2>';
}

function checkoutForm() {
  const { item, quantity } = checkout;
  return '<h1>ตรวจสอบและยืนยันออเดอร์</h1><p>' + escapeText(item.name) + ' × ' +
    quantity + ' · ร้าน ' + escapeText(item.shop) + ' · โซน' + item.zone +
    '</p><p>ยอดรวม ฿' + item.price * quantity + ' · ส่งฟรีในรอบทดลอง</p>' +
    '<form data-checkout><label>ชื่อผู้รับ<input name="name" maxlength="60" required></label>' +
    '<label>บ้านเลขที่และจุดสังเกต<input name="address" maxlength="150" required></label>' +
    '<label>หมายเหตุ (ถ้ามี)<input name="note" maxlength="150"></label>' +
    '<button>ยืนยันสั่งอาหาร</button><button type="button" class="secondary" data-back-menu>กลับไปเลือกเมนู</button></form>';
}

function sellerMenu() {
  const cards = catalog.items.filter(item => item.shopId === seller.id).map(item =>
    '<article><h3>' + escapeText(item.name) + '</h3><p>' + escapeText(item.description) +
    ' · ฿' + item.price + ' · ' + (item.paused ? 'พักขาย' : 'กำลังขาย') +
    '</p><button class="secondary" data-toggle="' + item.id + '" data-paused="' +
    Boolean(item.paused) + '">' + (item.paused ? 'เปิดขาย' : 'พักขาย') + '</button></article>').join('');
  const demoOptions = [...new Set(menu.map(item => item.shop))].map(name =>
    '<option' + (name === demoShop ? ' selected' : '') + '>' + name + '</option>').join('');
  const selector = '<label>ร้านที่จัดการ<select id="managed-shop"><option value="">ร้านของฉัน</option>' +
    demoOptions + '</select></label>';
  if (demoShop) return '<h1>ร้านทดลอง ' + demoShop + '</h1>' + selector + '<h2>ออเดอร์ร้านค้า</h2>';
  return '<h1>ร้าน ' + escapeText(seller.name) + '</h1><p>จัดส่งโซน' + seller.zone + '</p>' + selector +
    '<h2>ลงขายอาหาร</h2><form data-listing><label>ชื่อเมนู<input name="name" maxlength="80" required></label>' +
    '<label>รายละเอียด<input name="description" maxlength="200" required></label>' +
    '<label>ราคา (บาท)<input name="price" type="number" min="1" max="9999" required></label>' +
    '<button>ลงขายเมนู</button></form>' + cards + '<h2>ออเดอร์ร้านค้า</h2>';
}

function sellerOwns(order, id) {
  return listings().some(item => item.id === order.item && shopId(item) === id);
}

function canAccess(order, actor, id) {
  return actor === 'buyer' ? order.buyer === buyer : actor === 'seller' && sellerOwns(order, id);
}

function render() {
  const view = get('#view');
  if (view.hidden) return;
  if (checkout) {
    if (!view.querySelector('[data-checkout]')) view.innerHTML = checkoutForm();
    return;
  }
  const open = new Set([...view.querySelectorAll('details[open]')].map(panel => panel.dataset.panel));
  const drafts = new Map([...view.querySelectorAll('[data-chat]')].map(form =>
    [form.dataset.chat, form.elements.message.value]));
  const listingDraft = view.querySelector('[data-listing]');
  const fields = listingDraft && new FormData(listingDraft);
  let visible = orders;
  if (currentView === 'buyer') {
    visible = orders.filter(order => order.buyer === buyer);
    view.innerHTML = buyerMenu();
  } else if (currentView === 'seller') {
    visible = orders.filter(order => sellerOwns(order, demoShop ?? seller.id));
    view.innerHTML = sellerMenu();
    if (fields) {
      const form = view.querySelector('[data-listing]');
      for (const [name, value] of fields) form.elements[name].value = value;
    }
  } else {
    view.innerHTML = '<h1>ภาพรวมแอดมิน</h1><p>ทั้งหมด ' + orders.length +
      ' ออเดอร์ · กำลังดำเนินการ ' + orders.filter(isActive).length + '</p>';
  }
  view.insertAdjacentHTML('beforeend', visible.map(orderCard).join('') || '<p>ยังไม่มีออเดอร์</p>');
  for (const panel of view.querySelectorAll('details')) panel.open = open.has(panel.dataset.panel);
  for (const form of view.querySelectorAll('[data-chat]')) {
    form.elements.message.value = drafts.get(form.dataset.chat) ?? '';
  }
}

get('#view').onchange = event => {
  if (event.target.id === 'zone') {
    zone = event.target.value;
    render();
  } else if (event.target.id === 'managed-shop') {
    demoShop = event.target.value || undefined;
    get('#view').replaceChildren();
    render();
  }
};

get('#view').onclick = event => {
  const { next, close, status, toggle, paused, backMenu } = event.target.dataset;
  const actor = currentView;
  const id = demoShop ?? seller?.id;
  if (backMenu !== undefined) {
    checkout = undefined;
    render();
    notice('');
  } else if (toggle && actor === 'seller') {
    update(catalogKey, data => {
      const item = data.items.find(entry => entry.id === toggle && entry.shopId === id);
      if (!item || Boolean(item.paused) !== (paused === 'true')) return false;
      item.paused = !item.paused;
      return true;
    }, 'อัปเดตสถานะเมนูแล้ว');
  } else if (next || close) {
    update(ordersKey, data => {
      const order = data.find(entry => entry.id === (next ?? close));
      if (!order || !canAccess(order, actor, id)) return false;
      if (close) return closeOrder(order, actor);
      return actor === 'seller' && order.status === Number(status) && advance(order);
    }, 'อัปเดตสถานะออเดอร์แล้ว');
  }
};

get('#view').onsubmit = event => {
  event.preventDefault();
  const actor = currentView;
  const form = event.target;
  const { item, rate, chat, listing, checkout: confirm } = form.dataset;
  const formData = new FormData(form);
  const id = demoShop ?? seller?.id;

  if (listing !== undefined && actor === 'seller' && !demoShop) {
    const name = formData.get('name').trim();
    const description = formData.get('description').trim();
    const price = Number(formData.get('price'));
    if (!name || !description || !Number.isInteger(price) || price < 1 || price > 9999) {
      notice('กรุณาระบุชื่อ รายละเอียด และราคาให้ครบ');
      return;
    }
    event.submitter.disabled = true;
    update(catalogKey, catalog => {
      const shop = catalog.shops.find(entry => entry.id === id);
      if (!shop) return false;
      catalog.items.push({ id: crypto.randomUUID(), shopId: id, shop: shop.name,
        zone: shop.zone, name, description, price });
      form.reset();
      return true;
    }, 'ลงขายเมนูแล้ว').finally(() => { event.submitter.disabled = false; });
  } else if (item && actor === 'buyer') {
    const selected = listings().find(entry => entry.id === item && entry.zone === zone && !entry.paused);
    const quantity = Number(formData.get('quantity'));
    if (!selected || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
    checkout = { item: selected, quantity };
    notice('');
    render();
  } else if (confirm !== undefined && checkout && actor === 'buyer') {
    const delivery = { name: formData.get('name').trim(), address: formData.get('address').trim(),
      note: formData.get('note').trim() };
    if (!delivery.name || !delivery.address) {
      notice('กรุณากรอกชื่อผู้รับและจุดจัดส่ง');
      return;
    }
    const selection = checkout;
    checkout = undefined;
    update(ordersKey, data => {
      const order = createOrder({ id: crypto.randomUUID(), buyer, item: selection.item.id,
        zone: selection.item.zone, quantity: selection.quantity, listings: listings() });
      if (!order) return false;
      order.delivery = delivery;
      data.unshift(order);
      return true;
    }, 'ส่งออเดอร์ทดลองแล้ว ร้านเป็นผู้จัดส่ง');
  } else if (rate && actor === 'buyer') {
    update(ordersKey, data => {
      const order = data.find(entry => entry.id === rate);
      return order && review(order, buyer, Number(formData.get('score')));
    }, 'บันทึกคะแนนรีวิวแล้ว');
  } else if (chat) {
    const message = formData.get('message').trim();
    if (!message || message.length > 300) {
      notice('กรุณาพิมพ์ข้อความ 1–300 ตัวอักษร');
      return;
    }
    update(ordersKey, data => {
      const order = data.find(entry => entry.id === chat);
      if (!order || !canAccess(order, actor, id)) return false;
      order.messages ??= [];
      order.messages.push({ actor, text: message, at: Date.now() });
      if (form.elements.message.value.trim() === message) form.reset();
      return true;
    }, 'ส่งข้อความแล้ว');
  }
};

window.addEventListener('storage', event => {
  if (event.key === ordersKey) orders = read(ordersKey, []);
  else if (event.key === catalogKey) catalog = readCatalog();
  else return;
  render();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error));
}
