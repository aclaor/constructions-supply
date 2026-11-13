// CJ Dropshipping product search and import (API 2.0).
// Docs: https://developers.cjdropshipping.com/en/api/api2/api/product.html
import { kv } from './store.js';
import { slugify, clean } from './util.js';

const API = 'https://developers.cjdropshipping.com/api2.0/v1/';
export const cjReady = (env) => Boolean(env.CJ_API_KEY);

// CJ only allows a new token every 5 minutes, so the token is cached (it lasts 15 days).
async function token(env) {
  const cached = await kv(env).get('cj:token');
  if (cached) return cached;
  const res = await fetch(API + 'authentication/getAccessToken', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: env.CJ_API_KEY }),
  });
  const data = await res.json().catch(() => ({}));
  const t = data?.data?.accessToken;
  if (!t) throw new Error('CJ did not accept the API key: ' + (data?.message || res.status));
  await kv(env).put('cj:token', t, { expirationTtl: 60 * 60 * 24 * 10 });
  return t;
}

async function cjGet(env, path) {
  const res = await fetch(API + path, { headers: { 'CJ-Access-Token': await token(env) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.result === false) throw new Error('CJ: ' + (data?.message || res.status));
  return data.data;
}

const toCents = (v) => {
  // CJ prices can be "4.50" or a range like "4.50-7.20"; use the highest so margins are never negative.
  const nums = String(v ?? '').split(/[-–~]| -- /).map((x) => parseFloat(x)).filter((x) => !isNaN(x));
  return nums.length ? Math.round(Math.max(...nums) * 100) : 0;
};
const parseImages = (v) => {
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v); if (Array.isArray(a)) return a; } catch {}
  return v ? [String(v)] : [];
};
const stripHtml = (s) => String(s || '').replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

export async function cjSearch(env, q) {
  const data = await cjGet(env, 'product/list?pageNum=1&pageSize=20&productNameEn=' + encodeURIComponent(q));
  return (data?.list || []).map((p) => ({
    pid: p.pid, title: p.productNameEn, image: parseImages(p.productImage)[0] || '', cost: toCents(p.sellPrice), category: p.categoryName || '',
  }));
}

/** Builds a store product from a CJ product. `markup` is a multiplier on CJ's price, e.g. 2.2. */
export async function cjImport(env, pid, category, markup) {
  const p = await cjGet(env, 'product/query?pid=' + encodeURIComponent(pid));
  if (!p?.pid) throw new Error('CJ product not found.');
  const m = Math.max(1, Number(markup) || 2);
  const retail = (cost) => Math.max(99, Math.ceil((cost * m) / 100) * 100 - 5); // rounds to x.95
  const title = clean(p.productNameEn, 140);
  const variants = (p.variants || []).slice(0, 40).map((v, i) => ({
    id: 'v' + (i + 1),
    name: clean(v.variantKey || v.variantNameEn || 'Option ' + (i + 1), 80),
    price: retail(toCents(v.variantSellPrice)),
    cost: toCents(v.variantSellPrice),
    sku: clean(v.variantSku, 60),
    cjVid: v.vid || '',
  }));
  const baseCost = toCents(p.sellPrice) || variants[0]?.cost || 0;
  const images = [...new Set([...parseImages(p.productImageSet), ...parseImages(p.productImage)])]
    .filter((u) => /^https:\/\//.test(u)).slice(0, 8);
  return {
    id: 'cj' + Date.now().toString(36),
    slug: slugify(title) || 'product-' + Date.now().toString(36),
    title, category,
    price: variants.length ? Math.min(...variants.map((v) => v.price)) : retail(baseCost),
    compareAt: null, cost: baseCost, images,
    description: stripHtml(p.description).slice(0, 4000),
    specs: [p.productWeight ? ['Weight', p.productWeight + ' g'] : null, p.materialNameEn ? ['Material', stripHtml(p.materialNameEn)] : null].filter(Boolean),
    variants: variants.length > 1 ? variants : [],
    sku: clean(p.productSku, 60), cjPid: p.pid,
    cjVid: variants.length === 1 ? variants[0].cjVid : '',
    supplierUrl: '',
    featured: false, active: true, sample: false, createdAt: Date.now(),
  };
}

/* ---------- Order forwarding and tracking ---------- */

async function cjPost(env, path, body) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { 'CJ-Access-Token': await token(env), 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.result === false) throw new Error('CJ: ' + (data?.message || res.status));
  return data.data;
}

/**
 * Creates the matching order at CJ for every line that came from a CJ product.
 * By default the CJ order is created unpaid (you pay it in your CJ account).
 * With settings.cjPayFromBalance it is paid from your CJ wallet balance straight away.
 */
export async function cjSubmitOrder(env, order, settings) {
  const lines = order.lines.filter((l) => l.cjVid);
  if (!lines.length) return { skipped: true, note: 'No CJ products in this order.' };
  const products = lines.map((l) => ({ vid: l.cjVid, quantity: l.qty, storeLineItemId: l.id + (l.variant ? ':' + l.variant : '') }));
  const from = settings.cjFromCountry || 'CN';
  const a = order.address;

  // Pick the shipping method: your preferred one when CJ offers it for this parcel, otherwise the cheapest.
  const options = (await cjPost(env, 'logistic/freightCalculate', {
    startCountryCode: from, endCountryCode: a.country, products: products.map((p) => ({ vid: p.vid, quantity: p.quantity })),
  })) || [];
  if (!options.length) throw new Error('CJ has no shipping method from ' + from + ' to ' + a.country + ' for these items.');
  const preferred = options.find((o) => o.logisticName === settings.cjLogistic);
  const pick = preferred || [...options].sort((x, y) => Number(x.logisticPrice) - Number(y.logisticPrice))[0];

  const data = await cjPost(env, 'shopping/order/createOrderV2', {
    orderNumber: order.id,
    shippingCountryCode: a.country, shippingCountry: a.country, shippingProvince: a.state, shippingCity: a.city,
    shippingCustomerName: order.customer.name.slice(0, 50), shippingAddress: a.line1, shippingAddress2: a.line2 || undefined,
    shippingZip: a.zip, shippingPhone: order.customer.phone, email: order.customer.email,
    logisticName: pick.logisticName, fromCountryCode: from,
    payType: settings.cjPayFromBalance ? 2 : 3,
    products,
  });
  const other = order.lines.length - lines.length;
  return {
    orderId: data?.orderId || '', status: data?.orderStatus || 'CREATED', logistic: pick.logisticName,
    shippingCost: Math.round(Number(data?.postageAmount ?? pick.logisticPrice) * 100) || 0,
    total: Math.round(Number(data?.orderAmount ?? data?.actualPayment) * 100) || 0,
    paid: Boolean(settings.cjPayFromBalance), submittedAt: Date.now(),
    note: other ? `${other} item(s) in this order are not CJ products. Order those from their supplier.` : '',
  };
}

/** Reads the CJ order and copies status and tracking onto ours. Returns 'shipped' when tracking newly arrived. */
export async function cjSyncOrder(env, order) {
  if (!order.cj?.orderId) return null;
  const d = await cjGet(env, 'shopping/order/getOrderDetail?orderId=' + encodeURIComponent(order.cj.orderId));
  if (!d) return null;
  let change = null;
  if (d.orderStatus && d.orderStatus !== order.cj.status) { order.cj.status = d.orderStatus; change = 'status'; }
  if (d.trackNumber && !order.tracking) {
    order.tracking = clean(d.trackNumber, 80);
    order.carrier = clean(d.trackingProvider || d.logisticName, 40);
    order.trackingUrl = /^https:\/\//.test(d.trackingUrl || '') ? clean(d.trackingUrl, 300) : '';
    if (['paid', 'processing'].includes(order.status)) order.status = 'shipped';
    change = 'shipped';
  }
  if (d.orderStatus === 'DELIVERED' && order.status === 'shipped') { order.status = 'delivered'; change = change || 'status'; }
  return change;
}
