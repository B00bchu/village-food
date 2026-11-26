import { projectUrl, publishableKey } from './supabase-config.mjs';

export const statusCodes = ['new', 'preparing', 'shipping', 'delivered'];
const closedLabels = { rejected: 'ร้านปฏิเสธ', cancelled: 'ผู้ซื้อยกเลิก' };
const labels = { new: 'รอร้านรับ', preparing: 'กำลังทำ', shipping: 'กำลังจัดส่ง', delivered: 'ส่งแล้ว', ...closedLabels };

export async function marketRequest(path, token, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: publishableKey };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(projectUrl + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store',
  });
  if (!response.ok) throw new Error('Supabase HTTP ' + response.status);
  const payload = await response.text();
  return payload ? JSON.parse(payload) : undefined;
}

export async function marketSnapshot(token) {
  const request = path => marketRequest('/rest/v1/' + path, token);
  const [shops, items, orders, ratings, profiles] = await Promise.all([
    request('market_shops?select=id,owner_id,name,description,cover_path,qr_path,is_open,opens_at,closes_at'),
    request('market_menu?select=*'),
    request('market_orders?select=*,market_order_items(*)&order=created_at.desc&limit=200'),
    marketRequest('/rest/v1/rpc/market_ratings', token, { method: 'POST', body: {} }),
    request('market_profiles?select=name,house,phase,lane&limit=1'),
  ]);
  const names = new Map(shops.map(shop => [shop.id, shop.name]));
  return {
    catalog: {
      shops: shops.map(shop => ({
        id: shop.id, owner: shop.owner_id, name: shop.name, offer: shop.description,
        cover: shop.cover_path, qr: shop.qr_path, closed: !shop.is_open,
        opens: shop.opens_at?.slice(0, 5), closes: shop.closes_at?.slice(0, 5),
      })),
      items: items.map(item => ({
        id: item.id, shopId: item.shop_id, shop: names.get(item.shop_id), name: item.name,
        description: item.description, category: item.category, price: item.price_baht,
        image: item.image_path, paused: item.paused,
      })),
    },
    orders: orders.map(order => {
      const lines = order.market_order_items.map(line => ({
        item: line.menu_id, name: line.name, quantity: line.quantity, price: line.price_baht,
      }));
      return {
        id: order.id, item: lines[0]?.item, quantity: lines[0]?.quantity, lines,
        buyer: order.buyer_id, shopId: order.shop_id, shop: names.get(order.shop_id),
        total: order.total_baht, payment: order.payment, handoff: order.handoff,
        status: Math.max(0, statusCodes.indexOf(order.status)), closed: closedLabels[order.status],
        score: order.score ?? undefined, messages: order.messages,
        history: [{ label: labels.new, at: Date.parse(order.created_at) },
          ...order.history.map(entry => ({ label: labels[entry.status], at: entry.at }))],
        delivery: { name: order.recipient, house: order.house, phase: order.phase, lane: order.lane,
          address: 'บ้านเลขที่ ' + order.house + ' · เฟส ' + order.phase + ' · ซอย ' + order.lane, note: order.note },
      };
    }),
    ratings: new Map(ratings.map(row => [row.shop_id, row])),
    profile: profiles[0] ?? null,
  };
}
