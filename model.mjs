export const menu = [
  { id: 'rice', shop: 'ครัวหน้าซอย', name: 'ข้าวกะเพราไก่ไข่ดาว', zone: 'เหนือ', price: 60 },
  { id: 'soup', shop: 'ครัวหน้าซอย', name: 'ต้มจืดเต้าหู้หมูสับ', zone: 'เหนือ', price: 55 },
  { id: 'noodles', shop: 'ก๋วยเตี๋ยวบ้านสวน', name: 'ก๋วยเตี๋ยวหมูน้ำใส', zone: 'ใต้', price: 50 },
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
