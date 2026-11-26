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
    '</span></div><h3>' + (order.lines ?? [{ name: item.name, quantity: order.quantity }]).map(line =>
      escapeText(line.name) + ' × ' + line.quantity).join(' · ') + '</h3><p>' +
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
let storeTab = 'menu';
let favoritesOnly = false;
const favorites = new Set(read('village-food-favorites-v1', []));
const cart = new Map();

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
  storeTab = 'menu';
  favoritesOnly = false;
  search = '';
  shopFilter = selectedShop;
  categoryFilter = '';
  checkout = undefined;
  demoShop = undefined;
  get('#home').hidden = view !== 'home';
  get('#back').hidden = view === 'home';
  get('#seller-unavailable').hidden = view !== 'seller-unavailable';
  get('#customer-registration').hidden = view !== 'customer-registration';
  get('#customer-form').reset();
  get('#view').hidden = ['home', 'seller-unavailable', 'customer-registration'].includes(view);
  get('#view').replaceChildren();
  notice('');
  render();
  window.scrollTo(0, 0);
}

get('main').addEventListener('click', event => {
  const favorite = event.target.closest('[data-favorite]');
  if (favorite) {
    const id = favorite.dataset.favorite;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    localStorage.setItem('village-food-favorites-v1', JSON.stringify([...favorites]));
    render();
    return;
  }
  const action = event.target.closest('[data-page]');
  const view = action?.dataset.page;
  if (view === 'seller') {
    catalog = readCatalog();
    seller = catalog.shops.find(shop => shop.id === localStorage.getItem(sellerKey));
    show(seller ? 'seller' : 'seller-unavailable');
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

async function readImage(file, optimize = false) {
  if (!file.size) return '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > (optimize ? 6 * 1024 : 512) * 1024) {
    throw new Error('ใช้ภาพ PNG, JPG หรือ WebP ขนาดไม่เกิน ' + (optimize ? '6 MB' : '512 KB'));
  }
  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดภาพไม่ได้ กรุณาเลือกไฟล์ใหม่');
  }
  if (optimize) {
    const scale = Math.min(1, 960 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    return canvas.toDataURL('image/webp', .8);
  }
  image.close();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('อ่านภาพไม่ได้ กรุณาเลือกไฟล์ใหม่'));
    reader.readAsDataURL(file);
  });
}

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

const menuPhotos = {
  rice: 'rice', noodles: 'noodles', 'mango-rice': 'dessert', 'thai-tea': 'tea',
  'pad-thai': 'pad-thai', 'green-curry': 'green-curry', 'grilled-pork': 'grilled-pork',
  'coconut-pancakes': 'coconut-pancakes',
};

const shopProfile = id => catalog.shops.find(shop => shop.id === id);
const bangkokClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function accepting(id) {
  const shop = shopProfile(id);
  if (shop?.closed) return false;
  if (!shop?.opens || !shop.closes) return true;
  const time = bangkokClock.format();
  return shop.opens < shop.closes
    ? time >= shop.opens && time < shop.closes
    : time >= shop.opens || time < shop.closes;
}

function imageSource(image) {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image ?? '') ? image : '';
}

function foodImage(item) {
  return imageSource(item.image) || (menuPhotos[item.id] ? './food-' + menuPhotos[item.id] + '.webp' : '');
}

function shopImage(id, items) {
  return imageSource(shopProfile(id)?.cover) || items.map(foodImage).find(Boolean) || '';
}

function attr(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

function shopStatus(id) {
  const isOpen = accepting(id);
  return '<span class="shop-status" data-open="' + isOpen + '">' +
    (isOpen ? 'เปิดรับออเดอร์' : 'ปิดรับออเดอร์') + '</span>';
}

function favoriteButton(id) {
  const saved = favorites.has(id);
  return '<button class="favorite" data-favorite="' + attr(id) + '" aria-label="ร้านโปรด" aria-pressed="' +
    saved + '">' + (saved ? '♥' : '♡') + '</button>';
}

function cartLines() {
  const items = new Map(listings().map(item => [item.id, item]));
  return [...cart].filter(([id]) => items.has(id)).map(([id, quantity]) => ({ item: items.get(id), quantity }));
}

const totalFor = lines => lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);

function renderCartBar() {
  const bar = get('#cart-bar');
  if (!bar) return;
  const lines = cartLines();
  bar.hidden = !lines.length;
  if (lines.length) bar.innerHTML = '<button data-open-cart><span aria-hidden="true">🛒</span> ดูตะกร้า (' +
    lines.reduce((sum, line) => sum + line.quantity, 0) + ' รายการ) <strong>฿' + totalFor(lines) + '</strong></button>';
}


function openShops(items) {
  const shops = new Map();
  for (const item of items) {
    const id = shopId(item);
    if (!shops.has(id)) shops.set(id, { name: item.shop, items: [] });
    shops.get(id).items.push(item);
  }
  return shops;
}

function shopCards(shops, home = false) {
  return [...shops].map(([id, shop]) => {
    const value = escapeText(id).replaceAll('"', '&quot;');
    const action = home ? 'data-page="buyer" data-home-shop="' + value + '"'
      : 'data-shop-choice="' + value + '" aria-pressed="' + (id === shopFilter) + '"';
    const cover = shopImage(id, shop.items);
    return '<div class="shop-row" data-shop-row="' + value + '"><button type="button" class="shop-card" ' + action + '>' +
      (cover ? '<img class="shop-thumbnail" src="' + cover + '" alt="" loading="lazy">' :
        '<span class="shop-mark" aria-hidden="true">🏪</span>') +
      '<span><strong>' + escapeText(shop.name) + '</strong><small>' + shop.items.length + ' เมนู · ' +
      rating(id) + '</small>' + shopStatus(id) + '</span></button>' + favoriteButton(id) + '</div>';

  }).join('');
}

function renderHome() {
  const shops = openShops(listings().filter(item => !item.paused));
  get('#home-shops').innerHTML = shopCards(shops, true);
}

const categoryIcons = { meals: '🍛', noodles: '🍜', sides: '🍲', snacks: '🍢', desserts: '🍰', drinks: '🧋', other: '🍴' };

function buyerNavigation() {
  return '<nav class="app-nav" aria-label="เมนูผู้ซื้อ">' +
    '<button data-shop-choice=""><span aria-hidden="true">⌂</span>หน้าหลัก</button>' +
    '<button data-shop-choice="" data-shop-scroll><span aria-hidden="true">▤</span>ร้านค้า</button>' +
    '<a href="#my-orders"><span aria-hidden="true">≡</span>คำสั่งซื้อ</a>' +
    (customer ? '<button data-page="edit-customer"><span aria-hidden="true">◉</span>โปรไฟล์</button>' :
      '<button data-page="buyer"><span aria-hidden="true">◉</span>ลงทะเบียน</button>') + '</nav>';
}

function foodCards(items, compact = false) {
  return items.map(item => {
    const photo = foodImage(item);
    const isOpen = accepting(shopId(item));
    if (compact) {
      return '<article class="food-card store-item">' +
        (photo ? '<img class="food-photo" src="' + photo + '" alt="" loading="lazy">' : '<span class="store-item-placeholder" aria-hidden="true">🍴</span>') +
        '<div class="store-item-info"><h3>' + escapeText(item.name) + '</h3><strong>฿' + item.price + '</strong>' +
        (item.description ? '<p>' + escapeText(item.description) + '</p>' : '') + '</div>' +
        '<form data-item="' + item.id + '"><input name="quantity" type="hidden" value="1">' +
        '<button aria-label="เพิ่มลงตะกร้า ' + attr(item.name) + '"' + (isOpen ? '' : ' disabled') +
        '><span aria-hidden="true">+</span></button></form></article>';
    }
    return '<article class="food-card">' +
      (photo ? '<img class="food-photo" src="' + photo + '" alt="" loading="lazy" width="480" height="360">' : '') +
      '<div class="food-content"><div class="food-heading"><h3>' + escapeText(item.name) +
      '</h3><strong class="price">฿' + item.price + '</strong></div><p class="shop-name">' +
      escapeText(item.shop) + ' · ' + categories[itemCategory(item)] + '</p>' +
      (item.description ? '<p>' + escapeText(item.description) + '</p>' : '') +
      '<form data-item="' + item.id + '"><label>จำนวน<input name="quantity" type="number" min="1" max="20" value="1" required></label>' +
      '<button' + (isOpen ? '' : ' disabled') + '><span aria-hidden="true">＋ </span>' +
      (isOpen ? 'เพิ่มลงตะกร้า' : 'ร้านปิดรับออเดอร์') + '</button></form></div></article>';
  }).join('');
}

function storefront(shop, id) {
  const profile = shopProfile(id);
  const cover = shopImage(id, shop.items);
  const reviews = orders.filter(order => order.score && (order.shopId === id || sellerOwns(order, id)));
  const tabs = { menu: 'เมนู', reviews: 'รีวิว', info: 'ข้อมูลร้าน' };
  const content = storeTab === 'menu'
    ? '<div class="store-menu">' + foodCards(shop.items, true) + '</div>'
    : storeTab === 'reviews'
      ? '<h2>รีวิวจากออเดอร์ที่ส่งแล้ว</h2><p>' + rating(id) + '</p>' +
        reviews.map(order => '<article>★ ' + order.score + '/5</article>').join('')
      : '<h2>ข้อมูลร้าน</h2><p>' + escapeText(profile?.offer ?? 'ร้านอาหารในหมู่บ้าน') + '</p><p>ร้านจัดส่งถึงบ้าน</p>';
  return '<div class="store-cover">' + (cover ? '<img src="' + cover + '" alt="">' : '') +
    '<button class="cover-back" data-shop-choice="" aria-label="กลับไปหน้าร้านค้า">‹</button>' +
    favoriteButton(id) + '</div><div class="store-details"><h1>' + escapeText(shop.name) + '</h1><p>★ ' + rating(id) +
    ' ' + shopStatus(id) + '</p>' +
    '<p>จัดส่งในหมู่บ้าน · ' + (profile?.opens && profile?.closes ? profile.opens + '–' + profile.closes : 'ตรวจสถานะรับออเดอร์ก่อนสั่ง') +
    '</p></div><div class="store-tabs" role="group" aria-label="ข้อมูลหน้าร้าน">' +
    Object.entries(tabs).map(([key, label]) => '<button type="button" data-store-tab="' + key +
      '" aria-pressed="' + (key === storeTab) + '">' + label + '</button>').join('') + '</div>' +
    content + '<h2 id="my-orders">ติดตามออเดอร์ของฉัน</h2>' + buyerNavigation() + '<div id="cart-bar" hidden></div>';
}

function buyerMenu() {
  const available = listings().filter(item => !item.paused);
  const shops = openShops(available);
  if (shops.has(shopFilter)) return storefront(shops.get(shopFilter), shopFilter);
  shopFilter = '';
  const shopButtons = shopCards(favoritesOnly ? [...shops].filter(([id]) => favorites.has(id)) : shops);
  const cards = foodCards(available);
  const profile = customer
    ? '<p>จัดส่งให้ ' + escapeText(customer.name) + ' · ' + escapeText(customerAddress(customer)) +
      '</p><button class="secondary" data-page="edit-customer">แก้ไขที่อยู่</button> ' +
      '<button class="secondary" data-page="guest">สั่งแทน</button> '
    : '<p>กรอกที่อยู่ของผู้รับตอนยืนยันออเดอร์</p>';
  const heading = customer ? 'สั่งอาหารใกล้บ้าน' : 'สั่งแทน';
  return '<div class="market-heading" id="buyer-top"><div><h1>' + heading + '</h1>' + profile +
    '</div><a class="orders-bell" href="#my-orders" aria-label="ดูคำสั่งซื้อ">🔔</a></div>' +
    '<div class="market-filters"><label>ค้นหาอาหารหรือร้าน<input id="menu-search" type="search" placeholder="เช่น ข้าวกะเพรา"></label></div>' +
    '<div class="category-strip" role="group" aria-label="หมวดอาหาร">' +
    [['', 'ทั้งหมด'], ...Object.entries(categories)].map(([id, name]) =>
      '<button type="button" data-category-chip="' + id + '" aria-pressed="' + (id === categoryFilter) +
      '"><span aria-hidden="true">' + (categoryIcons[id] ?? '☷') + '</span>' + name + '</button>').join('') +
    '</div><a class="food-banner" href="#choose-shop"><strong>เมนูวันนี้<br>ในหมู่บ้าน</strong>' +
    '<img src="./market-hero.webp" alt="" width="900" height="600"><span aria-hidden="true">›</span></a>' +
    '<div class="shop-list-heading"><h2 id="choose-shop">ร้านค้าในหมู่บ้าน</h2><button class="secondary" data-show-favorites aria-pressed="' +
    favoritesOnly + '">ร้านโปรด</button></div><div class="shop-picker shop-grid" role="group" aria-labelledby="choose-shop">' +
    (shopButtons || '<p>ยังไม่มีร้านโปรด</p>') + '</div><h2>เมนูอาหาร</h2><div class="food-grid">' + cards +
    '</div><p id="menu-empty" hidden>ไม่พบเมนู ลองเปลี่ยนคำค้น ร้าน หรือหมวดอาหาร</p>' +
    '<h2 id="my-orders">ติดตามออเดอร์ของฉัน</h2>' + buyerNavigation() + '<div id="cart-bar" hidden></div>';
}

function filterMenu() {
  const query = search.trim().toLocaleLowerCase('th');
  const items = new Map(listings().map(item => [item.id, item]));
  let count = 0;
  const matches = new Set();
  for (const card of document.querySelectorAll('.food-card')) {
    const item = items.get(card.querySelector('[data-item]').dataset.item);
    const text = [item.name, item.shop, item.description].join(' ').toLocaleLowerCase('th');
    card.hidden = !text.includes(query) ||
      (shopFilter !== '' && shopId(item) !== shopFilter) ||
      (categoryFilter !== '' && itemCategory(item) !== categoryFilter);
    if (!card.hidden) {
      count += 1;
      matches.add(shopId(item));
    }
  }
  for (const row of get('#view').querySelectorAll('[data-shop-row]')) {
    row.hidden = Boolean(query || categoryFilter) && !matches.has(row.dataset.shopRow);
  }
  get('#menu-empty').hidden = count > 0;
}

function readAddress(data) {
  return Object.fromEntries(['house', 'phase', 'lane'].map(key => [key, data.get(key).trim()]));
}

function customerAddress(profile) {
  return 'บ้านเลขที่ ' + profile.house + ' · เฟส ' + profile.phase + ' · ซอย ' + profile.lane;
}

function groupCart(lines) {
  const groups = new Map();
  for (const line of lines) {
    const id = shopId(line.item);
    if (!groups.has(id)) groups.set(id, { id, name: line.item.shop, lines: [] });
    groups.get(id).lines.push(line);
  }
  return [...groups.values()];
}

const transferQR = id => imageSource(shopProfile(id)?.qr);
const paymentName = id => 'payment-' + id;
const baht = amount => '฿' + amount.toLocaleString('th-TH');

function refreshPayment(form) {
  const groups = new Map(groupCart(checkout.lines).map(group => [group.id, group]));
  for (const section of form.querySelectorAll('[data-payment-shop]')) {
    const { id } = groups.get(section.dataset.paymentShop);
    const qr = transferQR(id);
    const transfer = section.querySelector('[value=transfer]');
    const panel = section.querySelector('[data-qr-panel]');
    transfer.disabled = !qr;
    panel.hidden = !qr || !transfer.checked;
    const image = panel.querySelector('img');
    if (!panel.hidden && image.getAttribute('src') !== qr) image.src = qr;
    section.querySelector('[data-cash-only]').hidden = Boolean(qr);
  }
}

function shopCheckout(group) {
  const { id, name, lines } = group;
  const label = escapeText(name);
  const subtotal = baht(totalFor(lines));
  const radioName = attr(paymentName(id));
  const items = lines.map(({ item, quantity }) =>
    '<li><div><strong>' + escapeText(item.name) + '</strong><div>' +
    baht(item.price) + ' × ' + quantity + ' · ' + baht(item.price * quantity) + '</div></div>' +
    '<div class="cart-item-actions"><button type="button" class="secondary" data-cart-adjust="' + item.id +
    '" data-delta="-1" aria-label="ลดจำนวน ' + attr(item.name) + '">−</button> ' +
    '<button type="button" class="secondary" data-cart-adjust="' + item.id +
    '" data-delta="1" aria-label="เพิ่มจำนวน ' + attr(item.name) + '">+</button> ' +
    '<button type="button" class="secondary" data-cart-adjust="' + item.id + '" data-delta="0">นำออก</button></div></li>').join('');
  return '<section class="checkout-shop"><div class="checkout-shop-title"><h2>' + label +
    '</h2><strong>ยอดร้าน ' + subtotal + '</strong></div><ul class="cart-lines">' + items +
    '</ul><fieldset data-payment-shop="' + attr(id) + '"><legend>วิธีชำระเงินร้าน ' + label + '</legend>' +
    '<label><input type="radio" name="' + radioName + '" value="cash" checked>เงินสด</label>' +
    '<label><input type="radio" name="' + radioName + '" value="transfer" disabled>โอน / สแกน QR</label>' +
    '<p data-cash-only hidden>ร้านนี้รับเงินสด</p><div data-qr-panel hidden>' +
    '<p><strong>โอนให้ร้าน ' + label + ' จำนวน ' + subtotal + '</strong></p>' +
    '<img class="payment-qr" alt="QR รับโอนร้าน ' + attr(name) + '">' +
    '<p>กรอกยอดตามที่แสดง ระบบยังไม่ตรวจสอบยอดโอน</p></div></fieldset></section>';
}

function checkoutForm() {
  const { lines } = checkout;
  const groups = groupCart(lines);
  const total = baht(totalFor(lines));
  const address = customer
    ? '<p>จัดส่งให้ ' + escapeText(customer.name) + ' · ' + escapeText(customerAddress(customer)) + '</p>'
    : '<fieldset><legend>ที่อยู่ของผู้รับ</legend>' +
      '<label>บ้านเลขที่<input name="house" maxlength="30" required></label>' +
      '<label>เฟส<input name="phase" maxlength="30" required></label>' +
      '<label>ซอย<input name="lane" maxlength="30" required></label></fieldset>';
  return '<div class="checkout-summary"><h1>ตะกร้าและยืนยันออเดอร์</h1><p>' + groups.length +
    ' ร้าน · <strong>ยอดรวมทั้งหมด ' + total + '</strong></p></div>' +
    '<form data-checkout>' + groups.map(shopCheckout).join('') + address +
    '<fieldset><legend>วิธีรับอาหาร</legend>' +
    '<label><input type="radio" name="handoff" value="handover" checked>รอรับ</label>' +
    '<label><input type="radio" name="handoff" value="doorstep">แขวนไว้หน้าบ้าน</label></fieldset>' +
    '<label>หมายเหตุ (ถ้ามี)<input name="note" maxlength="150"></label>' +
    '<div class="checkout-actions"><button type="button" class="secondary" data-back-menu>กลับไปเลือกเมนู</button>' +
    '<button>ยืนยันสั่งอาหาร · ' + total + '</button></div></form>';
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
    escapeText(demoShop ?? seller.name) + '</h2>' +
    (demoShop ? '' : '<button class="shop-switch" data-toggle-shop aria-pressed="' + !seller.closed + '">' +
      (seller.closed ? 'เปิดรับออเดอร์' : 'พักรับออเดอร์') + '</button> ' + shopStatus(seller.id)) +
    '<div class="seller-stats" id="seller-report">' +
    '<a href="#seller-orders"><span aria-hidden="true">📋</span>คำสั่งซื้อใหม่<strong>' + newCount + ' รายการ</strong></a>' +
    '<div><span aria-hidden="true">📈</span>ยอดออเดอร์ที่ส่งแล้ววันนี้<strong>฿' + sales.toLocaleString('th-TH') + '</strong></div></div></div>';
  const navigation = '<nav class="app-nav" aria-label="เมนูแม่ค้า">' +
    '<a href="#seller-top"><span aria-hidden="true">⌂</span>หน้าหลัก</a>' +
    '<a href="#seller-orders"><span aria-hidden="true">≡</span>คำสั่งซื้อ</a>' +
    (demoShop ? '' : '<a href="#seller-menu"><span aria-hidden="true">▤</span>จัดการเมนู</a>') + '<a href="#seller-report"><span aria-hidden="true">▥</span>รายงาน</a></nav>';
  const tabs = Object.entries(sellerFilters).map(([id, label]) => {
    const count = shopOrders.filter(order => id === 'all' || orderGroup(order) === id).length;
    return '<button type="button" data-order-filter="' + id + '" aria-pressed="' +
      (id === orderFilter) + '">' + label + ' (' + count + ')</button>';
  }).join('');
  const orderSection = '<h2 id="seller-orders">คำสั่งซื้อ</h2><div class="order-tabs" role="group" aria-label="สถานะออเดอร์">' +
    tabs + '</div>' + navigation;
  const cards = catalog.items.filter(item => item.shopId === seller.id).map(item =>
    '<article class="seller-listing">' + (foodImage(item) ? '<img src="' + foodImage(item) + '" alt="">' : '') +
    '<h3>' + escapeText(item.name) + '</h3><p>' + escapeText(item.description) +
    ' · ฿' + item.price + ' · ' + (item.paused ? 'พักขาย' : 'กำลังขาย') +
    '</p><button class="secondary" data-toggle="' + item.id + '" data-paused="' +
    Boolean(item.paused) + '">' + (item.paused ? 'เปิดขาย' : 'พักขาย') + '</button></article>').join('');
  const demoOptions = [...new Set(menu.map(item => item.shop))].map(name =>
    '<option' + (name === demoShop ? ' selected' : '') + '>' + name + '</option>').join('');
  const selector = '<label>ร้านที่จัดการ<select id="managed-shop"><option value="">ร้านของฉัน</option>' +
    demoOptions + '</select></label>';
  if (demoShop) return dashboard + selector + orderSection;
  return dashboard + '<div class="seller-tools">' +
    '<a href="#seller-menu"><span aria-hidden="true">🍴</span>จัดการเมนู</a>' +
    '<a href="#shop-settings"><span aria-hidden="true">🏪</span>แก้ไขหน้าร้าน</a>' +
    '<a href="#shop-hours"><span aria-hidden="true">◷</span>เวลาเปิด–ปิด</a>' +
    '<a href="#shop-payment"><span aria-hidden="true">▣</span>ตั้งค่า QR</a></div>' + selector +
    '<h2 id="shop-settings">แก้ไขหน้าร้าน</h2><form data-shop-settings>' +
    '<label>ชื่อร้าน<input name="name" maxlength="60" value="' + attr(seller.name) + '" required></label>' +
    '<label>ขายอะไร<input name="offer" maxlength="120" value="' + attr(seller.offer) + '" required></label>' +
    '<label>ภาพปกหน้าร้าน<input name="cover" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
    '<button>บันทึกหน้าร้าน</button></form>' +
    (imageSource(seller.cover) ? '<img class="seller-cover" src="' + imageSource(seller.cover) + '" alt="ภาพปกหน้าร้าน">' : '') +
    '<h2 id="shop-hours">เวลาเปิด–ปิด</h2><form data-shop-hours>' +
    '<label>เปิด<input name="opens" type="time" value="' + attr(seller.opens ?? '') + '"></label>' +
    '<label>ปิด<input name="closes" type="time" value="' + attr(seller.closes ?? '') + '"></label>' +
    '<button>บันทึกเวลา</button></form><p>เว้นทั้งสองช่องหากเปิดรับออเดอร์ได้ตลอดวัน</p>' +
    '<details id="shop-payment" data-panel="shop-qr"><summary>QR รับโอนของร้าน</summary><form data-shop-qr>' +
    '<label>อัปโหลดหรือเปลี่ยน QR<input name="qr" type="file" accept="image/png,image/jpeg,image/webp" required></label>' +
    '<button>บันทึก QR</button></form><p>' + (seller.qr ? 'มี QR รับโอนแล้ว' : 'ร้านเปิดรับเงินสดอยู่') + '</p></details>' +
    '<h2 id="seller-menu">ลงขายอาหาร</h2><form data-listing><label>ชื่อเมนู<input name="name" maxlength="80" required></label>' +
    '<label>รายละเอียด<input name="description" maxlength="200" required></label>' +
    '<label>หมวดอาหาร<select name="category">' + categoryOptions('meals') + '</select></label>' +
    '<label>ราคา (บาท)<input name="price" type="number" min="1" max="9999" required></label>' +
    '<label>รูปอาหาร<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
    '<button>ลงขายเมนู</button></form>' + cards + orderSection;
}

function sellerOwns(order, id) {
  return order.shopId ? order.shopId === id : listings().some(item => item.id === order.item && shopId(item) === id);
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
    const searchInput = get('#menu-search');
    if (searchInput) {
      searchInput.value = search;
      filterMenu();
    }
    renderCartBar();
  } else if (currentView === 'seller') {
    visible = orders.filter(order => sellerOwns(order, demoShop ?? seller.id));
    view.innerHTML = sellerMenu(visible);
    if (orderFilter !== 'all') visible = visible.filter(order => orderGroup(order) === orderFilter);
    if (fields) {
      const form = view.querySelector('[data-listing]');
      for (const [name, value] of fields) if (typeof value === 'string') form.elements[name].value = value;
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
  if (event.target.closest('[data-payment-shop]') && checkout) {
    refreshPayment(event.target.form);
  } else if (event.target.id === 'managed-shop') {
    demoShop = event.target.value || undefined;
    orderFilter = 'all';
    get('#view').replaceChildren();
    render();
  }
};

get('#view').onclick = event => {
  const target = event.target.closest('button');
  if (!target) {
    if (event.target.closest('a[href="#shop-payment"]')) get('#shop-payment').open = true;
    return;
  }
  const { next, close, status, toggle, paused, backMenu, shopChoice, categoryChip,
    storeTab: selectedTab, openCart, cartAdjust, delta, toggleShop, showFavorites, orderFilter: selectedStatus } = target.dataset;
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
  } else if (showFavorites !== undefined && actor === 'buyer') {
    favoritesOnly = !favoritesOnly;
    render();
    get('[data-show-favorites]')?.focus({ preventScroll: true });
  } else if (selectedTab && actor === 'buyer') {
    storeTab = selectedTab;
    render();
  } else if (shopChoice !== undefined && actor === 'buyer') {
    shopFilter = shopChoice;
    storeTab = 'menu';
    render();
    if (target.hasAttribute('data-shop-scroll')) get('#choose-shop')?.scrollIntoView();
    else window.scrollTo(0, 0);
  } else if (openCart !== undefined && actor === 'buyer') {
    const lines = cartLines();
    if (!lines.length) return;
    checkout = { lines };
    render();
    window.scrollTo(0, 0);
  } else if (cartAdjust && checkout) {
    const previous = cart.get(cartAdjust);
    if (!previous) return;
    const quantity = delta === '0' ? 0 : previous + Number(delta);
    if (quantity > 20) return;
    if (quantity === 0) cart.delete(cartAdjust);
    else cart.set(cartAdjust, quantity);
    const fields = new FormData(get('[data-checkout]'));
    const lines = cartLines();
    checkout = lines.length ? { lines } : undefined;
    get('#view').replaceChildren();
    render();
    const form = get('[data-checkout]');
    if (form) {
      for (const [name, value] of fields) {
        const control = form.elements.namedItem(name);
        if (control) control.value = value;
      }
      refreshPayment(form);
    }
  } else if (toggleShop !== undefined && actor === 'seller' && !demoShop) {
    update(catalogKey, data => {
      const shop = data.shops.find(entry => entry.id === id);
      if (!shop) return false;
      shop.closed = !shop.closed;
      seller = shop;
      return true;
    }, 'อัปเดตการรับออเดอร์แล้ว');
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
  const { item, rate, chat, listing, shopQr, shopSettings, shopHours, checkout: confirm } = form.dataset;
  const formData = new FormData(form);
  const id = demoShop ?? seller?.id;

  if ((shopSettings !== undefined || shopHours !== undefined) && actor === 'seller' && !demoShop) {
    const isProfile = shopSettings !== undefined;
    const changes = isProfile
      ? { name: formData.get('name').trim(), offer: formData.get('offer').trim() }
      : { opens: formData.get('opens'), closes: formData.get('closes') };
    if (isProfile ? !changes.name || !changes.offer :
        Boolean(changes.opens) !== Boolean(changes.closes) || (changes.opens && changes.opens === changes.closes)) {
      notice(isProfile ? 'กรุณากรอกชื่อร้านและรายละเอียด' : 'กรุณาเลือกเวลาเปิดและปิดที่ต่างกัน หรือเว้นทั้งสองช่อง');
      return;
    }
    event.submitter.disabled = true;
    try {
      if (isProfile) {
        const cover = await readImage(formData.get('cover'), true);
        if (cover) changes.cover = cover;
      }
      await update(catalogKey, data => {
        const shop = data.shops.find(entry => entry.id === id);
        if (!shop) return false;
        Object.assign(shop, changes);
        if (isProfile) {
          for (const item of data.items.filter(entry => entry.shopId === id)) item.shop = shop.name;
        }
        seller = shop;
        return true;
      }, isProfile ? 'บันทึกหน้าร้านแล้ว' : 'บันทึกเวลาเปิด–ปิดแล้ว');
    } catch (error) {
      notice(error.message);
    } finally {
      event.submitter.disabled = false;
    }
  } else if (shopQr !== undefined && actor === 'seller' && !demoShop) {
    event.submitter.disabled = true;
    try {
      const qr = await readImage(formData.get('qr'));
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
    try {
      const image = await readImage(formData.get('image'), true);
      await update(catalogKey, catalog => {
        const shop = catalog.shops.find(entry => entry.id === id);
        if (!shop) return false;
        catalog.items.push({ id: crypto.randomUUID(), shopId: id, shop: shop.name,
          name, description, price, category, image });
        form.reset();
        return true;
      }, 'ลงขายเมนูแล้ว');
    } catch (error) {
      notice(error.message);
    } finally {
      event.submitter.disabled = false;
    }
  } else if (item && actor === 'buyer') {
    const selected = listings().find(entry => entry.id === item && !entry.paused);
    const quantity = Number(formData.get('quantity'));
    if (!selected || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
    if (!accepting(shopId(selected))) return;
    const nextQuantity = (cart.get(item) ?? 0) + quantity;
    if (nextQuantity > 20) {
      notice('เลือกได้ไม่เกิน 20 ชิ้นต่อเมนู');
      return;
    }
    cart.set(item, nextQuantity);
    renderCartBar();
    notice('เพิ่มลงตะกร้าแล้ว');
  } else if (confirm !== undefined && checkout && actor === 'buyer') {
    const groups = groupCart(checkout.lines).map(group =>
      ({ ...group, payment: formData.get(paymentName(group.id)) }));
    const handoff = formData.get('handoff');
    if (!Object.hasOwn(handoffLabels, handoff) || groups.some(group => !Object.hasOwn(paymentLabels, group.payment))) {
      notice('กรุณาตรวจสอบวิธีชำระเงินของแต่ละร้าน');
      return;
    }
    const { house, phase, lane } = customer ?? readAddress(formData);
    if (!house || !phase || !lane) {
      notice('กรุณากรอกบ้านเลขที่ เฟส และซอยของผู้รับให้ครบ');
      return;
    }
    const delivery = { name: customer?.name, house, phase, lane,
      address: customerAddress({ house, phase, lane }), note: formData.get('note').trim() };
    event.submitter.disabled = true;
    await update(ordersKey, data => {
      const available = listings();
      const pending = [];
      for (const { id, payment, lines: groupLines } of groups) {
        if (!accepting(id) || (payment === 'transfer' && !transferQR(id))) return false;
        const lines = [];
        for (const { item, quantity } of groupLines) {
          const current = available.find(entry => entry.id === item.id);
          if (!current || current.paused || shopId(current) !== id || current.price !== item.price) return false;
          lines.push({ item: current.id, name: current.name, quantity, price: current.price });
        }
        const first = lines[0];
        const order = createOrder({ id: crypto.randomUUID(), buyer, item: first.item,
          quantity: first.quantity, listings: available });
        if (!order) return false;
        Object.assign(order, { shopId: id, lines, total: totalFor(groupLines), delivery, payment, handoff });
        pending.push(order);
      }
      data.unshift(...pending);
      return true;
    }, () => {
      cart.clear();
      checkout = undefined;
      notice('ส่งออเดอร์ให้ ' + groups.length + ' ร้านแล้ว');
      requestAnimationFrame(() => get('#my-orders')?.scrollIntoView());
    });
    event.submitter.disabled = false;

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
