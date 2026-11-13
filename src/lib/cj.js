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
