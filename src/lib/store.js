import { SEED_PRODUCTS, DEFAULT_SETTINGS } from '../data/seed.js';

// In-memory fallback so the site still renders if the KV binding is missing.
// Data stored here does not persist, so real deployments must have the STORE binding.
const mem = new Map();
const memKV = {
  async get(key, type) {
    const v = mem.get(key);
    if (v == null) return null;
    return type === 'json' || type?.type === 'json' ? JSON.parse(v.value) : v.value;
  },
  async put(key, value, opts = {}) { mem.set(key, { value, metadata: opts.metadata }); },
  async delete(key) { mem.delete(key); },
  async list({ prefix = '' } = {}) {
    const keys = [...mem.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata }));
    return { keys, list_complete: true };
  },
};
export const kv = (env) => env.STORE || memKV;
export const hasKV = (env) => Boolean(env.STORE);

export async function getCatalog(env) {
  const saved = await kv(env).get('catalog', 'json');
  return Array.isArray(saved) ? saved : SEED_PRODUCTS;
}
export const saveCatalog = (env, products) => kv(env).put('catalog', JSON.stringify(products));

export async function getSettings(env) {
  const saved = (await kv(env).get('settings', 'json')) || {};
  return { ...DEFAULT_SETTINGS, ...saved, shipping: { ...DEFAULT_SETTINGS.shipping, ...(saved.shipping || {}) } };
}
export const getFeeds = async (env) => (await kv(env).get('feeds', 'json')) || [];
export const saveFeeds = (env, feeds) => kv(env).put('feeds', JSON.stringify(feeds));
export const saveSettings = (env, settings) => kv(env).put('settings', JSON.stringify(settings));

const orderMeta = (o) => ({
  t: o.createdAt, total: o.totals.total, status: o.status,
  name: (o.customer.name || '').slice(0, 60), email: (o.customer.email || '').slice(0, 80),
  items: o.lines.reduce((s, l) => s + l.qty, 0),
  cj: o.cj?.orderId ? 1 : 0, cjErr: o.cj?.error ? 1 : 0,
});

export function saveOrder(env, order, { ttl } = {}) {
  const opts = { metadata: orderMeta(order) };
  if (ttl) opts.expirationTtl = ttl;
  return kv(env).put('order:' + order.id, JSON.stringify(order), opts);
}
export const getOrder = (env, id) => kv(env).get('order:' + String(id).toUpperCase(), 'json');

export async function listOrders(env) {
  const out = [];
  let cursor;
  do {
    const page = await kv(env).list({ prefix: 'order:', cursor });
    for (const k of page.keys) if (k.metadata) out.push({ id: k.name.slice(6), ...k.metadata });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out.sort((a, b) => b.t - a.t);
}

/** Prices a cart on the server. Client-sent prices are never trusted. */
export function priceCart(items, catalog, settings, country) {
  const lines = [];
  for (const item of Array.isArray(items) ? items.slice(0, 50) : []) {
    const p = catalog.find((x) => x.id === item.id && x.active !== false);
    if (!p) continue;
    const hasVariants = p.variants && p.variants.length > 0;
    const v = hasVariants ? p.variants.find((x) => x.id === item.variant) || p.variants[0] : null;
    const qty = Math.min(99, Math.max(1, parseInt(item.qty, 10) || 1));
    const unit = v ? v.price : p.price;
    lines.push({
      id: p.id, variant: v ? v.id : '', slug: p.slug, title: p.title, variantName: v ? v.name : '',
      image: p.images?.[0] || '', sku: v?.sku || p.sku || '', cjPid: p.cjPid || '', cjVid: v?.cjVid || p.cjVid || '',
      supplierUrl: p.supplierUrl || '', qty, unit, total: unit * qty,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const sh = settings.shipping;
  const domestic = !country || country === sh.domesticCountry;
  let shipping = 0;
  if (subtotal > 0) shipping = domestic ? (sh.freeOver > 0 && subtotal >= sh.freeOver ? 0 : sh.domesticFlat) : sh.internationalFlat;
  const tax = Math.round((subtotal * (Number(settings.taxRate) || 0)) / 100);
  return { lines, subtotal, shipping, tax, total: subtotal + shipping + tax, freeOver: domestic ? sh.freeOver : 0 };
}
