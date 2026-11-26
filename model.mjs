export const categories = {
  meals: 'ข้าวและอาหารตามสั่ง',
  noodles: 'ก๋วยเตี๋ยวและเส้น',
  sides: 'กับข้าวและแกง',
  snacks: 'ของกินเล่น',
  desserts: 'ขนมและของหวาน',
  drinks: 'เครื่องดื่ม',
  other: 'อื่น ๆ',
};

export const menu = [
  { id: 'rice', shop: 'ครัวหน้าซอย', name: 'ข้าวกะเพราไก่ไข่ดาว', zone: 'เหนือ', price: 60, category: 'meals' },
  { id: 'soup', shop: 'ครัวหน้าซอย', name: 'ต้มจืดเต้าหู้หมูสับ', zone: 'เหนือ', price: 55, category: 'sides' },
  { id: 'garlic-chicken', shop: 'ครัวหน้าซอย', name: 'ข้าวไก่กระเทียม', zone: 'เหนือ', price: 55, category: 'meals' },
  { id: 'pad-thai', shop: 'ผัดไทยเตาถ่าน', name: 'ผัดไทยกุ้งสด', zone: 'เหนือ', price: 70, category: 'noodles' },
  { id: 'fried-tofu', shop: 'ผัดไทยเตาถ่าน', name: 'เต้าหู้ทอด', zone: 'เหนือ', price: 35, category: 'snacks' },
  { id: 'green-curry', shop: 'แกงบ้านยาย', name: 'แกงเขียวหวานไก่', zone: 'เหนือ', price: 65, category: 'sides' },
  { id: 'mango-rice', shop: 'หวานละมุน', name: 'ข้าวเหนียวมะม่วง', zone: 'เหนือ', price: 55, category: 'desserts' },
  { id: 'thai-tea', shop: 'หวานละมุน', name: 'ชาไทยเย็น', zone: 'เหนือ', price: 35, category: 'drinks' },
  { id: 'noodles', shop: 'ก๋วยเตี๋ยวบ้านสวน', name: 'ก๋วยเตี๋ยวหมูน้ำใส', zone: 'ใต้', price: 50, category: 'noodles' },
  { id: 'tom-yum-noodles', shop: 'ก๋วยเตี๋ยวบ้านสวน', name: 'ก๋วยเตี๋ยวต้มยำ', zone: 'ใต้', price: 60, category: 'noodles' },
  { id: 'grilled-pork', shop: 'เตาปิ้งท้ายหมู่บ้าน', name: 'หมูปิ้งชุดเล็ก', zone: 'ใต้', price: 45, category: 'snacks' },
  { id: 'grilled-chicken', shop: 'เตาปิ้งท้ายหมู่บ้าน', name: 'ข้าวไก่ย่าง', zone: 'ใต้', price: 60, category: 'meals' },
  { id: 'massaman', shop: 'ครัวบ้านร่มไม้', name: 'มัสมั่นไก่', zone: 'ใต้', price: 70, category: 'sides' },
  { id: 'shrimp-rice', shop: 'ครัวบ้านร่มไม้', name: 'ข้าวผัดกุ้ง', zone: 'ใต้', price: 65, category: 'meals' },
  { id: 'coconut-pancakes', shop: 'ขนมหน้าสวน', name: 'ขนมครก', zone: 'ใต้', price: 35, category: 'desserts' },
  { id: 'lime-tea', shop: 'ขนมหน้าสวน', name: 'ชามะนาว', zone: 'ใต้', price: 35, category: 'drinks' },
];
export const statuses = ['รอร้านรับ', 'กำลังทำ', 'กำลังจัดส่ง', 'ส่งแล้ว'];

export function createOrder({ id, buyer, item, quantity, zone, listings = menu }) {
  const listing = listings.find(entry => entry.id === item && entry.zone === zone);
  if (!listing || listing.paused || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
  return { id, buyer, item, quantity, zone, total: listing.price * quantity, status: 0, history: [{ label: statuses[0], at: Date.now() }] };
}

export function recordStatus(order, label) {
  order.history ??= [{ label: statuses[order.status] }];
  order.history.push({ label, at: Date.now() });
}

export function isActive(order) {
  return !order.closed && order.status < statuses.length - 1;
}

export function closeOrder(order, actor) {
  if (order.status !== 0 || !isActive(order)) return false;
  order.closed = actor === 'buyer' ? 'ผู้ซื้อยกเลิก' : 'ร้านปฏิเสธ';
  recordStatus(order, order.closed);
  return true;
}

export function advance(order) {
  if (!isActive(order)) return false;
  order.history ??= [{ label: statuses[order.status] }];
  order.status += 1;
  recordStatus(order, statuses[order.status]);
  return true;
}

export function review(order, buyer, score) {
  if (order.buyer !== buyer || order.status !== statuses.length - 1 ||
      order.score !== undefined || !Number.isInteger(score) || score < 1 || score > 5) return false;
  order.score = score;
  return true;
}
