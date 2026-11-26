import { categories, menu, statuses, createOrder, advance, review, closeOrder, isActive } from './model.mjs';

const dayInThailand = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
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
    ? '<p>' + (order.delivery.name ? 'ผู้รับ ' + escapeText(order.delivery.name) + ' · ' : '') +
      'จุดส่ง ' + escapeText(order.delivery.address) +
      (order.delivery.note ? '<br>หมายเหตุ ' + escapeText(order.delivery.note) : '') + '</p>' : '';
  return '<article class="order-card"><div class="order-meta"><strong>ออเดอร์ #' +
    escapeText(order.id.slice(0, 8).toUpperCase()) + '</strong><span class="order-state" data-state="' +
    (order.closed ? 'closed' : order.status) + '">' + (order.closed ?? statuses[order.status]) +
    '</span></div><h3>' + escapeText(item.name) + ' × ' + order.quantity + '</h3><p>' +
    escapeText(item.shop) + ' · ฿' + order.total + '</p>' +
    delivery + (order.payment ? '<p>ชำระ ' + paymentLabels[order.payment] +
      ' · รับอาหาร ' + handoffLabels[order.handoff] + '</p>' : '') + score + next + close + rate + '<details data-panel="history-' + order.id +
    '"><summary>ประวัติสถานะ</summary><ol>' + history + '</ol></details>' + chat + '</article>';
}

const get = selector => document.querySelector(selector);
const ordersKey = 'village-food-demo-v1';
const catalogKey = 'village-food-catalog-v1';
const customerKey = 'village-food-customer-v1';
const paymentLabels = { cash: 'เงินสด', transfer: 'โอน / สแกน QR' };
const handoffLabels = { handover: 'รอรับ', doorstep: 'แขวนไว้หน้าบ้าน' };
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
let search = '';
let shopFilter = '';
let categoryFilter = '';
let orderFilter = 'all';
let seller;
let customer;
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

function show(view, selectedShop = '') {
  currentView = view;
  document.body.dataset.mode = view;
  orderFilter = 'all';
  search = '';
  shopFilter = selectedShop;
  categoryFilter = '';
  checkout = undefined;
  demoShop = undefined;
  challenge = undefined;
  get('#home').hidden = view !== 'home';
  get('#back').hidden = view === 'home';
  get('#auth').hidden = view !== 'registration';
  get('#customer-registration').hidden = view !== 'customer-registration';
  get('#customer-form').reset();
  get('#view').hidden = ['home', 'registration', 'customer-registration'].includes(view);
  get('#view').replaceChildren();
  get('#request').reset();
  get('#verify').reset();
  get('#verify').hidden = true;
  notice('');
  render();
  window.scrollTo(0, 0);
}

get('main').addEventListener('click', event => {
  const action = event.target.closest('[data-page]');
  const view = action?.dataset.page;
  if (view === 'seller') {
    catalog = readCatalog();
    seller = catalog.shops.find(shop => shop.id === localStorage.getItem(sellerKey));
    show(seller?.offer ? 'seller' : 'registration');
    if (seller && !seller.offer) {
      const form = get('#request');
      form.elements.name.value = seller.name;
      form.elements.phone.value = seller.phone;
    }
  } else if (view === 'buyer') {
    customer = read(customerKey, null);
    show(customer ? 'buyer' : 'customer-registration', action.dataset.homeShop ?? '');
  } else if (view === 'guest') {
    customer = null;
    show('buyer');
  } else if (view === 'edit-customer') {
    show('customer-registration');
    const form = get('#customer-form');
    for (const name of ['name', 'house', 'phase', 'lane']) form.elements[name].value = customer[name];
  } else if (view) {
    show(view);
  }
});

get('#customer-form').onsubmit = event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const profile = { name: data.get('name').trim(), ...readAddress(data) };
  if (Object.values(profile).some(value => !value)) {
    notice('กรุณากรอกชื่อ บ้านเลขที่ เฟส และซอยให้ครบ');
    return;
  }
  try {
    localStorage.setItem(customerKey, JSON.stringify(profile));
    customer = profile;
    show('buyer', shopFilter);
  } catch {
    notice('บันทึกข้อมูลลูกค้าไม่ได้ กรุณาลองอีกครั้ง');
  }
};

async function readQR(file) {
  if (!file.size) return '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
    throw new Error('ใช้ภาพ PNG, JPG หรือ WebP ขนาดไม่เกิน 512 KB');
  }
  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดภาพ QR ไม่ได้ กรุณาเลือกไฟล์ใหม่');
  }
  image.close();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('อ่านภาพ QR ไม่ได้ กรุณาเลือกไฟล์ใหม่'));
    reader.readAsDataURL(file);
  });
}

get('#request').onsubmit = async event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const name = data.get('name').trim();
  const offer = data.get('offer').trim();
  if (!name || !offer) {
    notice('กรุณากรอกชื่อและระบุว่าขายอะไร');
    return;
  }
  challenge = undefined;
  get('#verify').hidden = true;
  event.submitter.disabled = true;
  try {
    const qr = await readQR(data.get('qr'));
    if (currentView !== 'registration') return;
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    challenge = { name, offer, qr, phone: data.get('phone'), code,
      expires: Date.now() + 120000, remaining: 5 };
    get('#verify').reset();
    get('#verify').hidden = false;
    get('#verify input').focus();
    notice('รหัสทดลอง ' + code + ' ใช้ได้ 2 นาที');
  } catch (error) {
    notice(error.message);
  } finally {
    event.submitter.disabled = false;
  }
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
  const { name, phone, offer, qr } = challenge;
  challenge = undefined;
  update(catalogKey, data => {
    seller = data.shops.find(shop => shop.phone === phone);
    if (!seller) {
      seller = { id: crypto.randomUUID(), name, phone, offer, qr };
      data.shops.push(seller);
    } else {
      seller.offer = offer;
      if (qr) seller.qr = qr;
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

function categoryOptions(selected) {
  return Object.entries(categories).map(([id, label]) =>
    '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>' + label + '</option>').join('');
}

function itemCategory(item) {
  return Object.hasOwn(categories, item.category) ? item.category : 'other';
}

const menuPhotos = { rice: 'rice', noodles: 'noodles', 'mango-rice': 'dessert', 'thai-tea': 'tea' };

function openShops(items) {
  const shops = new Map();
  for (const item of items) {
    const id = shopId(item);
    if (!shops.has(id)) shops.set(id, { name: item.shop, count: 0 });
    shops.get(id).count += 1;
  }
  return shops;
}

function shopCards(shops, home = false) {
  return [...shops].map(([id, shop]) => {
    const value = escapeText(id).replaceAll('"', '&quot;');
    const action = home ? 'data-page="buyer" data-home-shop="' + value + '"'
      : 'data-shop-choice="' + value + '" aria-pressed="' + (id === shopFilter) + '"';
    return '<button type="button" class="shop-card" ' + action + '><span class="shop-mark" aria-hidden="true">' +
      escapeText(shop.name.match(/^[เแโใไ]([ก-ฮ])/)?.[1] ?? [...shop.name][0] ?? '•') + '</span><span><strong>' + escapeText(shop.name) +
      '</strong><small>' + shop.count + ' เมนู</small></span></button>';
  }).join('');
}

function renderHome() {
  const shops = openShops(listings().filter(item => !item.paused));
  get('#home-shops').innerHTML = shopCards(shops, true);
}

const categoryIcons = { meals: '🍛', noodles: '🍜', sides: '🍲', snacks: '🍢', desserts: '🍰', drinks: '🧋', other: '🍴' };

function buyerNavigation() {
  return '<nav class="app-nav" aria-label="เมนูผู้ซื้อ">' +
    '<a href="#buyer-top"><span aria-hidden="true">⌂</span>หน้าหลัก</a>' +
    '<a href="#choose-shop"><span aria-hidden="true">▤</span>ร้านค้า</a>' +
    '<a href="#my-orders"><span aria-hidden="true">≡</span>คำสั่งซื้อ</a>' +
    (customer ? '<button data-page="edit-customer"><span aria-hidden="true">◉</span>โปรไฟล์</button>' :
      '<button data-page="buyer"><span aria-hidden="true">◉</span>ลงทะเบียน</button>') + '</nav>';
}

function buyerMenu() {
  const available = listings().filter(item => !item.paused);
  const shops = openShops(available);
  if (!shops.has(shopFilter)) shopFilter = '';
  const shopButtons = '<button type="button" class="shop-card all-shops" data-shop-choice="" aria-pressed="' +
    (shopFilter === '') + '">ทุกร้าน</button>' + shopCards(shops);
  const cards = available.map(item => {
    const photo = menuPhotos[item.id];
    return '<article class="food-card">' +
      (photo ? '<img class="food-photo" src="./food-' + photo + '.webp" alt="" loading="lazy" width="480" height="360">' : '') +
      '<div class="food-content"><div class="food-heading"><h3>' + escapeText(item.name) +
      '</h3><strong class="price">฿' + item.price + '</strong></div><p class="shop-name">' +
      escapeText(item.shop) + ' · ' + categories[itemCategory(item)] + '</p>' +
      (item.description ? '<p>' + escapeText(item.description) + '</p>' : '') +
      '<p class="rating">' + rating(shopId(item)) + '</p><form data-item="' + item.id +
      '"><label>จำนวน<input name="quantity" type="number" min="1" max="20" value="1" required></label>' +
      '<button>ตรวจสอบออเดอร์</button></form></div></article>';
  }).join('');
  const profile = customer
    ? '<p>จัดส่งให้ ' + escapeText(customer.name) + ' · ' + escapeText(customerAddress(customer)) +
      '</p><button class="secondary" data-page="edit-customer">แก้ไขที่อยู่</button> ' +
      '<button class="secondary" data-page="guest">สั่งแทน</button> '
    : '<p>กรอกที่อยู่ของผู้รับตอนยืนยันออเดอร์</p>';
  const heading = customer ? 'สั่งอาหารใกล้บ้าน' : 'สั่งแทน';
  return '<div class="market-heading" id="buyer-top"><div><h1>' + heading + '</h1>' + profile + '</div></div>' +
    '<div class="market-filters"><label>ค้นหาอาหารหรือร้าน<input id="menu-search" type="search" placeholder="เช่น ข้าวกะเพรา"></label></div>' +
    '<div class="category-strip" role="group" aria-label="หมวดอาหาร">' +
    [['', 'ทั้งหมด'], ...Object.entries(categories)].map(([id, name]) =>
      '<button type="button" data-category-chip="' + id + '" aria-pressed="' + (id === categoryFilter) +
      '"><span aria-hidden="true">' + (categoryIcons[id] ?? '☷') + '</span>' + name + '</button>').join('') +
    '</div><a class="food-banner" href="#choose-shop"><strong>เมนูวันนี้<br>ในหมู่บ้าน</strong>' +
    '<img src="./market-hero.webp" alt="" width="900" height="600"><span aria-hidden="true">›</span></a>' +
    '<h2 id="choose-shop">เลือกร้าน</h2><div class="shop-picker shop-grid" role="group" aria-labelledby="choose-shop">' +
    shopButtons + '</div><h2>เมนูอาหาร</h2><div class="food-grid">' + cards +
    '</div><p id="menu-empty" hidden>ไม่พบเมนู ลองเปลี่ยนคำค้น ร้าน หรือหมวดอาหาร</p>' +
    '<h2 id="my-orders">ติดตามออเดอร์ของฉัน</h2>' + buyerNavigation();
}

function filterMenu() {
  const query = search.trim().toLocaleLowerCase('th');
  const items = new Map(listings().map(item => [item.id, item]));
  let count = 0;
  for (const card of document.querySelectorAll('.food-card')) {
    const item = items.get(card.querySelector('[data-item]').dataset.item);
    const text = [item.name, item.shop, item.description].join(' ').toLocaleLowerCase('th');
    card.hidden = !text.includes(query) ||
      (shopFilter !== '' && shopId(item) !== shopFilter) ||
      (categoryFilter !== '' && itemCategory(item) !== categoryFilter);
    if (!card.hidden) count += 1;
  }
  get('#menu-empty').hidden = count > 0;
}

function readAddress(data) {
  return Object.fromEntries(['house', 'phase', 'lane'].map(key => [key, data.get(key).trim()]));
}

function customerAddress(profile) {
  return 'บ้านเลขที่ ' + profile.house + ' · เฟส ' + profile.phase + ' · ซอย ' + profile.lane;
}

function transferQR(item) {
  const qr = catalog.shops.find(shop => shop.id === item.shopId)?.qr;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(qr ?? '') ? qr : '';
}

function refreshPayment(form) {
  const qr = transferQR(checkout.item);
  const transfer = form.querySelector('[value=transfer]');
  const panel = form.querySelector('[data-qr-panel]');
  transfer.disabled = !qr;
  if (!qr && transfer.checked) form.elements.payment.value = 'cash';
  panel.hidden = !qr || !transfer.checked;
  const image = panel.querySelector('img');
  if (!panel.hidden && image.getAttribute('src') !== qr) image.src = qr;
  form.querySelector('[data-cash-only]').hidden = Boolean(qr);
}

function checkoutForm() {
  const { item, quantity } = checkout;
  const address = customer
    ? '<p>จัดส่งให้ ' + escapeText(customer.name) + ' · ' + escapeText(customerAddress(customer)) + '</p>'
    : '<fieldset><legend>ที่อยู่ของผู้รับ</legend>' +
      '<label>บ้านเลขที่<input name="house" maxlength="30" required></label>' +
      '<label>เฟส<input name="phase" maxlength="30" required></label>' +
      '<label>ซอย<input name="lane" maxlength="30" required></label></fieldset>';
  const photo = menuPhotos[item.id];
  return '<div class="checkout-summary">' +
    (photo ? '<img src="./food-' + photo + '.webp" alt="" width="480" height="360">' : '') +
    '<div><h1>ตรวจสอบและยืนยันออเดอร์</h1><p>' + escapeText(item.name) + ' × ' +
    quantity + ' · ร้าน ' + escapeText(item.shop) +
    '</p><p><strong>ยอดรวม ฿' + item.price * quantity + '</strong> · ส่งฟรีในรอบทดลอง</p></div></div>' +
    '<form data-checkout>' + address + '<fieldset><legend>วิธีชำระเงิน</legend>' +
    '<label><input type="radio" name="payment" value="cash" checked>เงินสด</label>' +
    '<label><input type="radio" name="payment" value="transfer">โอน / สแกน QR</label>' +
    '<p data-cash-only hidden>ร้านนี้รับเงินสดในรอบทดลอง</p>' +
    '<div data-qr-panel hidden><p>QR รับโอนของร้าน ' + escapeText(item.shop) + '</p>' +
    '<img class="payment-qr" alt="QR รับโอนของร้าน"><p>สำหรับทดลอง ระบบไม่มีการตรวจสอบยอดโอน</p></div></fieldset>' +
    '<fieldset><legend>วิธีรับอาหาร</legend>' +
    '<label><input type="radio" name="handoff" value="handover" checked>รอรับ</label>' +
    '<label><input type="radio" name="handoff" value="doorstep">แขวนไว้หน้าบ้าน</label></fieldset>' +
    '<label>หมายเหตุ (ถ้ามี)<input name="note" maxlength="150"></label>' +
    '<div class="checkout-actions"><button type="button" class="secondary" data-back-menu>กลับไปเลือกเมนู</button>' +
    '<button>ยืนยันสั่งอาหาร</button></div></form>';
}

const sellerFilters = { all: 'ทั้งหมด', new: 'ใหม่', preparing: 'กำลังเตรียม', shipping: 'กำลังส่ง', done: 'เสร็จสิ้น', closed: 'ยกเลิก' };
const orderGroup = order => order.closed ? 'closed' : ['new', 'preparing', 'shipping', 'done'][order.status];

function sellerMenu(shopOrders) {
  const newCount = shopOrders.filter(order => orderGroup(order) === 'new').length;
  const today = dayInThailand.format();
  const sales = shopOrders.filter(order => {
    const deliveredAt = order.history?.at(-1)?.at;
    return orderGroup(order) === 'done' && deliveredAt && dayInThailand.format(deliveredAt) === today;
  }).reduce((sum, order) => sum + order.total, 0);
  const dashboard = '<div class="seller-dashboard" id="seller-top"><h1>โหมดแม่ค้า</h1><h2>' +
    escapeText(demoShop ?? seller.name) + '</h2><div class="seller-stats">' +
    '<a href="#seller-orders">คำสั่งซื้อใหม่<strong>' + newCount + ' รายการ</strong></a>' +
    '<div>ยอดออเดอร์ที่ส่งแล้ววันนี้<strong>฿' + sales.toLocaleString('th-TH') + '</strong></div></div></div>';
  const navigation = '<nav class="app-nav" aria-label="เมนูแม่ค้า">' +
    '<a href="#seller-top"><span aria-hidden="true">⌂</span>หน้าหลัก</a>' +
    '<a href="#seller-orders"><span aria-hidden="true">≡</span>คำสั่งซื้อ</a>' +
    (demoShop ? '' : '<a href="#seller-menu"><span aria-hidden="true">▤</span>จัดการเมนู</a>') + '</nav>';
  const tabs = Object.entries(sellerFilters).map(([id, label]) => {
    const count = shopOrders.filter(order => id === 'all' || orderGroup(order) === id).length;
    return '<button type="button" data-order-filter="' + id + '" aria-pressed="' +
      (id === orderFilter) + '">' + label + ' (' + count + ')</button>';
  }).join('');
  const orderSection = '<h2 id="seller-orders">คำสั่งซื้อ</h2><div class="order-tabs" role="group" aria-label="สถานะออเดอร์">' +
    tabs + '</div>' + navigation;
  const cards = catalog.items.filter(item => item.shopId === seller.id).map(item =>
    '<article><h3>' + escapeText(item.name) + '</h3><p>' + escapeText(item.description) +
    ' · ฿' + item.price + ' · ' + (item.paused ? 'พักขาย' : 'กำลังขาย') +
    '</p><button class="secondary" data-toggle="' + item.id + '" data-paused="' +
    Boolean(item.paused) + '">' + (item.paused ? 'เปิดขาย' : 'พักขาย') + '</button></article>').join('');
  const demoOptions = [...new Set(menu.map(item => item.shop))].map(name =>
    '<option' + (name === demoShop ? ' selected' : '') + '>' + name + '</option>').join('');
  const selector = '<label>ร้านที่จัดการ<select id="managed-shop"><option value="">ร้านของฉัน</option>' +
    demoOptions + '</select></label>';
  if (demoShop) return dashboard + selector + orderSection;
  return dashboard + '<p>' + escapeText(seller.offer) +
    '</p>' + selector +
    '<details data-panel="shop-qr"><summary>QR รับโอนของร้าน</summary><form data-shop-qr>' +
    '<label>อัปโหลดหรือเปลี่ยน QR<input name="qr" type="file" accept="image/png,image/jpeg,image/webp" required></label>' +
    '<button>บันทึก QR</button></form><p>' + (seller.qr ? 'มี QR รับโอนแล้ว' : 'ร้านเปิดรับเงินสดอยู่') + '</p></details>' +
    '<h2 id="seller-menu">ลงขายอาหาร</h2><form data-listing><label>ชื่อเมนู<input name="name" maxlength="80" required></label>' +
    '<label>รายละเอียด<input name="description" maxlength="200" required></label>' +
    '<label>หมวดอาหาร<select name="category">' + categoryOptions('meals') + '</select></label>' +
    '<label>ราคา (บาท)<input name="price" type="number" min="1" max="9999" required></label>' +
    '<button>ลงขายเมนู</button></form>' + cards + orderSection;
}

function sellerOwns(order, id) {
  return listings().some(item => item.id === order.item && shopId(item) === id);
}

function canAccess(order, actor, id) {
  return actor === 'buyer' ? order.buyer === buyer : actor === 'seller' && sellerOwns(order, id);
}

function render() {
  const view = get('#view');
  if (view.hidden) {
    if (currentView === 'home') renderHome();
    return;
  }
  if (checkout) {
    if (!view.querySelector('[data-checkout]')) view.innerHTML = checkoutForm();
    refreshPayment(view.querySelector('[data-checkout]'));
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
    get('#menu-search').value = search;
    filterMenu();
  } else if (currentView === 'seller') {
    visible = orders.filter(order => sellerOwns(order, demoShop ?? seller.id));
    view.innerHTML = sellerMenu(visible);
    if (orderFilter !== 'all') visible = visible.filter(order => orderGroup(order) === orderFilter);
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

get('#view').oninput = event => {
  if (event.target.id === 'menu-search') {
    search = event.target.value;
    filterMenu();
  }
};

get('#view').onchange = event => {
  if (event.target.name === 'payment' && checkout) {
    refreshPayment(event.target.form);
  } else if (event.target.id === 'managed-shop') {
    demoShop = event.target.value || undefined;
    orderFilter = 'all';
    get('#view').replaceChildren();
    render();
  }
};

get('#view').onclick = event => {
  const { next, close, status, toggle, paused, backMenu, shopChoice, categoryChip, orderFilter: selectedStatus } =
    (event.target.closest('[data-shop-choice], [data-category-chip], [data-order-filter]') ?? event.target).dataset;
  const actor = currentView;
  const id = demoShop ?? seller?.id;
  if (categoryChip !== undefined && actor === 'buyer') {
    categoryFilter = categoryChip;
    for (const button of get('#view').querySelectorAll('[data-category-chip]')) {
      button.setAttribute('aria-pressed', button.dataset.categoryChip === categoryChip);
    }
    filterMenu();
  } else if (selectedStatus && actor === 'seller') {
    orderFilter = selectedStatus;
    render();
    get('[data-order-filter="' + selectedStatus + '"]').focus({ preventScroll: true });
  } else if (shopChoice !== undefined && actor === 'buyer') {
    shopFilter = shopChoice;
    for (const button of get('#view').querySelectorAll('[data-shop-choice]')) {
      button.setAttribute('aria-pressed', button.dataset.shopChoice === shopChoice);
    }
    filterMenu();
  } else if (backMenu !== undefined) {
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

get('#view').onsubmit = async event => {
  event.preventDefault();
  const actor = currentView;
  const form = event.target;
  const { item, rate, chat, listing, shopQr, checkout: confirm } = form.dataset;
  const formData = new FormData(form);
  const id = demoShop ?? seller?.id;

  if (shopQr !== undefined && actor === 'seller' && !demoShop) {
    event.submitter.disabled = true;
    try {
      const qr = await readQR(formData.get('qr'));
      if (!qr) return;
      await update(catalogKey, data => {
        const shop = data.shops.find(entry => entry.id === id);
        if (!shop) return false;
        shop.qr = qr;
        if (seller?.id === id) seller = shop;
        return true;
      }, 'บันทึก QR รับโอนแล้ว');
    } catch (error) {
      notice(error.message);
    } finally {
      event.submitter.disabled = false;
    }
  } else if (listing !== undefined && actor === 'seller' && !demoShop) {
    const name = formData.get('name').trim();
    const description = formData.get('description').trim();
    const category = formData.get('category');
    const price = Number(formData.get('price'));
    if (!name || !description || !Object.hasOwn(categories, category) || !Number.isInteger(price) || price < 1 || price > 9999) {
      notice('กรุณาระบุชื่อ รายละเอียด และราคาให้ครบ');
      return;
    }
    event.submitter.disabled = true;
    update(catalogKey, catalog => {
      const shop = catalog.shops.find(entry => entry.id === id);
      if (!shop) return false;
      catalog.items.push({ id: crypto.randomUUID(), shopId: id, shop: shop.name,
        name, description, price, category });
      form.reset();
      return true;
    }, 'ลงขายเมนูแล้ว').finally(() => { event.submitter.disabled = false; });
  } else if (item && actor === 'buyer') {
    const selected = listings().find(entry => entry.id === item && !entry.paused);
    const quantity = Number(formData.get('quantity'));
    if (!selected || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
    checkout = { item: selected, quantity };
    notice('');
    render();
    window.scrollTo(0, 0);
  } else if (confirm !== undefined && checkout && actor === 'buyer') {
    const payment = formData.get('payment');
    const handoff = formData.get('handoff');
    if (!Object.hasOwn(paymentLabels, payment) || !Object.hasOwn(handoffLabels, handoff)) return;
    const { house, phase, lane } = customer ?? readAddress(formData);
    if (!house || !phase || !lane) {
      notice('กรุณากรอกบ้านเลขที่ เฟส และซอยของผู้รับให้ครบ');
      return;
    }
    const delivery = { name: customer?.name, house, phase, lane,
      address: customerAddress({ house, phase, lane }), note: formData.get('note').trim() };
    const selection = checkout;
    checkout = undefined;
    update(ordersKey, data => {
      if (payment === 'transfer' && !transferQR(selection.item)) return false;
      const order = createOrder({ id: crypto.randomUUID(), buyer, item: selection.item.id,
        quantity: selection.quantity, listings: listings() });
      if (!order) return false;
      Object.assign(order, { delivery, payment, handoff });
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
  else if (event.key === catalogKey) {
    catalog = readCatalog();
    seller = catalog.shops.find(shop => shop.id === seller?.id);
  }
  else return;
  render();
});

renderHome();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error));
}
