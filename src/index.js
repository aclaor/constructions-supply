import { json, htmlResponse, money, uid, hmac, safeEqual, getCookie, clean, slugify, COUNTRIES } from './lib/util.js';
import { kv, hasKV, getCatalog, saveCatalog, getSettings, saveSettings, saveOrder, getOrder, listOrders, priceCart, getFeeds, saveFeeds } from './lib/store.js';
import { paypalReady, createPaypalOrder, capturePaypalOrder } from './lib/paypal.js';
import { cjReady, cjSearch, cjImport, cjSubmitOrder, cjSyncOrder } from './lib/cj.js';
import { emailReady, sendOrderEmail, notifyOwner } from './lib/email.js';
import { parseCsv, guessMapping, importRows, fetchFeed, MAX_ROWS } from './lib/csv.js';
import { CATEGORIES } from './data/seed.js';
import { artResponse } from './views/art.js';
import * as view from './views/pages.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      return await route(request, env, url, ctx);
    } catch (err) {
      if (!err?.publicMessage) console.error(err?.stack || err);
      if (url.pathname.startsWith('/api/')) return json({ error: err?.publicMessage || 'Something went wrong on our side. Try again in a moment.' }, err?.status || 500);
      return htmlResponse('<h1>Something went wrong</h1><p>Reload the page to try again.</p>', 500);
    }
  },
  // Runs on the schedule in wrangler.jsonc: pulls tracking numbers from CJ and refreshes supplier feeds.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutomation(env));
  },
};

/* ---------- Automation ---------- */

// After a payment clears: confirmation email, owner alert, and the order goes to CJ.
async function afterPaid(env, orderId) {
  const [order, settings] = await Promise.all([getOrder(env, orderId), getSettings(env)]);
  if (!order) return;
  let note = '';
  if (settings.autoForwardCJ && cjReady(env) && !order.cj?.orderId) {
    try {
      const cj = await cjSubmitOrder(env, order, settings);
      if (!cj.skipped) { order.cj = cj; if (order.status === 'paid') order.status = 'processing'; }
      note = cj.skipped ? 'This order has no CJ products, so place it with your supplier by hand.'
        : (cj.paid ? 'Sent to CJ and paid from your CJ balance.' : 'Sent to CJ. Pay for it in your CJ account so it ships.') + (cj.note ? ' ' + cj.note : '');
    } catch (err) {
      console.error('CJ forward failed', err);
      order.cj = { error: String(err.message || err).slice(0, 300), failedAt: Date.now() };
      note = 'Could not send this order to CJ automatically: ' + order.cj.error;
    }
    await saveOrder(env, order);
  }
  await Promise.all([sendOrderEmail(env, settings, order, 'confirmed'), notifyOwner(env, settings, order, note)]);
}

async function syncOneOrder(env, settings, order) {
  const change = await cjSyncOrder(env, order);
  if (change) await saveOrder(env, order);
  if (change === 'shipped') await sendOrderEmail(env, settings, order, 'shipped');
  return change;
}

async function runFeed(env, feed, catalog) {
  const parsed = parseCsv(await fetchFeed(feed.url));
  return importRows(catalog, parsed, feed.mapping, { ...feed.options, source: feed.id, hideMissing: true });
}

async function runAutomation(env) {
  const settings = await getSettings(env);
  if (cjReady(env)) {
    const open = (await listOrders(env)).filter((o) => o.cj && ['paid', 'processing', 'shipped'].includes(o.status)).slice(0, 30);
    for (const meta of open) {
      try { const order = await getOrder(env, meta.id); if (order) await syncOneOrder(env, settings, order); }
      catch (err) { console.error('CJ sync failed', meta.id, err); }
    }
  }
  const feeds = await getFeeds(env);
  const due = feeds.filter((f) => f.url && Date.now() - (f.lastRun || 0) > 20 * 3600 * 1000);
  if (due.length) {
    const catalog = await getCatalog(env);
    for (const feed of due) {
      try { feed.lastResult = await runFeed(env, feed, catalog); feed.lastError = ''; }
      catch (err) { feed.lastError = String(err.message || err).slice(0, 200); }
      feed.lastRun = Date.now();
    }
    await saveCatalog(env, catalog);
    await saveFeeds(env, feeds);
  }
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; this.publicMessage = message; }
}
const body = async (request) => {
  try { return await request.json(); } catch { throw new HttpError(400, 'The request was not valid JSON.'); }
};

async function route(request, env, url, ctx) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const seg = path.split('/').filter(Boolean);

  if (seg[0] === 'api') return api(request, env, url, seg.slice(1), ctx);
  if (seg[0] === 'art' && seg.length === 3) return artResponse(seg[1], seg[2]);
  if (method === 'POST' && path === '/track') return track(request, env);
  if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

  const settings = await getSettings(env);
  if (path === '/robots.txt') return new Response(`User-agent: *\nDisallow: /admin\nDisallow: /api\nDisallow: /checkout\nDisallow: /order\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
  if (path === '/cart') return htmlResponse(view.cartPage({ settings }));
  if (path === '/track') return htmlResponse(view.trackPage({ settings }));
  if (path === '/checkout') {
    return htmlResponse(view.checkoutPage({ settings, paypalClientId: paypalReady(env) ? env.PAYPAL_CLIENT_ID : '', testMode: !paypalReady(env) }), 200, { 'cache-control': 'no-store' });
  }
  if (seg[0] === 'pages' && seg.length === 2) {
    const page = view.policyPage({ settings, slug: seg[1] });
    if (page) return htmlResponse(page);
  }
  if (seg[0] === 'order' && seg.length === 2) {
    const order = await getOrder(env, seg[1]);
    if (order && safeEqual(order.accessKey, url.searchParams.get('key') || '')) {
      return htmlResponse(view.orderPage({ settings, order, fresh: url.searchParams.has('new') }), 200, { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    }
    return Response.redirect(url.origin + '/track', 302);
  }

  const catalog = await getCatalog(env);
  if (path === '/') return htmlResponse(view.homePage({ settings, catalog }));
  if (path === '/search') return htmlResponse(view.searchPage({ settings, catalog, q: clean(url.searchParams.get('q'), 80), url }));
  if (path === '/sitemap.xml') {
    const urls = ['/', '/collections/all', ...CATEGORIES.map((c) => '/collections/' + c.id), ...catalog.filter((p) => p.active !== false).map((p) => '/products/' + p.slug), '/pages/shipping', '/pages/returns', '/pages/contact'];
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${url.origin}${u}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml' } });
  }
  if (seg[0] === 'collections' && seg.length === 2 && (seg[1] === 'all' || CATEGORIES.some((c) => c.id === seg[1]))) {
    return htmlResponse(view.collectionPage({ settings, catalog, category: seg[1], url }));
  }
  if (seg[0] === 'products' && seg.length === 2) {
    const product = catalog.find((p) => p.slug === seg[1] && p.active !== false);
    if (product) return htmlResponse(view.productPage({ settings, catalog, product, origin: url.origin }));
  }
  return htmlResponse(view.notFoundPage({ settings }), 404);
}

async function track(request, env) {
  const settings = await getSettings(env);
  const form = await request.formData();
  const values = { order: clean(form.get('order'), 20).toUpperCase(), email: clean(form.get('email'), 120).toLowerCase() };
  const order = values.order ? await getOrder(env, values.order) : null;
  if (!order || !safeEqual(order.customer.email.toLowerCase(), values.email)) {
    return htmlResponse(view.trackPage({ settings, values, error: 'No order matches that number and email. Check both and try again.' }), 404);
  }
  return Response.redirect(new URL(`/order/${order.id}?key=${order.accessKey}`, request.url).href, 303);
}

/* ---------- Public API ---------- */

function fmtCart(cart, settings) {
  const cur = settings.currency;
  return {
    lines: cart.lines.map((l) => ({ id: l.id, variant: l.variant, slug: l.slug, title: l.title, variantName: l.variantName, image: l.image, qty: l.qty, unit: money(l.unit, cur), total: money(l.total, cur) })),
    count: cart.lines.reduce((s, l) => s + l.qty, 0),
    subtotal: money(cart.subtotal, cur), shipping: cart.shipping ? money(cart.shipping, cur) : 'Free', tax: cart.tax ? money(cart.tax, cur) : '',
    total: money(cart.total, cur),
    freeShippingGap: cart.freeOver > 0 && cart.subtotal > 0 && cart.subtotal < cart.freeOver ? money(cart.freeOver - cart.subtotal, cur) : '',
  };
}

function readCheckout(b) {
  const c = b.customer || {};
  const a = b.address || {};
  const customer = { email: clean(c.email, 120).toLowerCase(), name: clean(c.name, 100), phone: clean(c.phone, 30) };
  const address = { line1: clean(a.line1, 120), line2: clean(a.line2, 120), city: clean(a.city, 80), state: clean(a.state, 80), zip: clean(a.zip, 20), country: clean(a.country, 2).toUpperCase() };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new HttpError(400, 'Enter a valid email address.');
  if (customer.name.length < 2) throw new HttpError(400, 'Enter the full name for the delivery.');
  if (customer.phone.replace(/\D/g, '').length < 6) throw new HttpError(400, 'Enter a phone number the carrier can reach.');
  if (!address.line1 || !address.city || !address.state || !address.zip) throw new HttpError(400, 'Fill in the street address, city, state and ZIP code.');
  if (!COUNTRIES.some(([code]) => code === address.country)) throw new HttpError(400, 'Choose a country we ship to.');
  return { customer, address };
}

async function buildOrder(env, b, status, origin) {
  const { customer, address } = readCheckout(b);
  const [catalog, settings] = await Promise.all([getCatalog(env), getSettings(env)]);
  const cart = priceCart(b.items, catalog, settings, address.country);
  if (!cart.lines.length) throw new HttpError(400, 'Your cart is empty.');
  const order = {
    id: 'LB-' + uid(8), accessKey: uid(20), status, createdAt: Date.now(), currency: settings.currency,
    customer, address, lines: cart.lines,
    totals: { subtotal: cart.subtotal, shipping: cart.shipping, tax: cart.tax, total: cart.total },
    tracking: '', carrier: '', note: '', payment: {}, origin,
  };
  return { order, settings };
}

async function api(request, env, url, seg, ctx) {
  const method = request.method;
  const route = seg.join('/');
  if (seg[0] === 'admin') return adminApi(request, env, url, seg.slice(1), ctx);

  if (route === 'cart' && method === 'POST') {
    const b = await body(request);
    const [catalog, settings] = await Promise.all([getCatalog(env), getSettings(env)]);
    return json(fmtCart(priceCart(b.items, catalog, settings, clean(b.country, 2).toUpperCase()), settings));
  }

  if (route === 'checkout/paypal/create' && method === 'POST') {
    if (!paypalReady(env)) throw new HttpError(503, 'Payments are not connected yet.');
    const { order, settings } = await buildOrder(env, await body(request), 'pending_payment', url.origin);
    try {
      order.payment = { provider: 'paypal', paypalOrderId: await createPaypalOrder(env, order, settings) };
    } catch (err) {
      console.error('PayPal create failed', err);
      throw new HttpError(502, 'PayPal could not start the payment: ' + err.message);
    }
    await saveOrder(env, order, { ttl: 60 * 60 * 48 }); // unpaid orders clear themselves after 2 days
    return json({ orderId: order.id, paypalOrderId: order.payment.paypalOrderId });
  }

  if (route === 'checkout/paypal/capture' && method === 'POST') {
    if (!paypalReady(env)) throw new HttpError(503, 'Payments are not connected yet.');
    const b = await body(request);
    const order = await getOrder(env, clean(b.orderId, 20));
    if (!order || !safeEqual(order.payment?.paypalOrderId || '', clean(b.paypalOrderId, 40))) throw new HttpError(404, 'We could not find that order. You have not been charged.');
    const done = () => json({ redirect: `/order/${order.id}?key=${order.accessKey}&new=1` });
    if (order.status !== 'pending_payment') return done();
    const settings = await getSettings(env);
    const result = await capturePaypalOrder(env, order.payment.paypalOrderId, order, settings);
    if (!result.ok) throw new HttpError(402, result.error + ' Your order has not been placed.');
    order.status = 'paid';
    order.payment = { ...order.payment, captureId: result.captureId, payerEmail: result.payerEmail, paidAt: Date.now() };
    await saveOrder(env, order);
    ctx.waitUntil(afterPaid(env, order.id).catch((err) => console.error('afterPaid failed', err)));
    return done();
  }

  // Only available while PayPal is not connected, so the flow can be tried end to end.
  if (route === 'checkout/test' && method === 'POST') {
    if (paypalReady(env)) throw new HttpError(403, 'Test orders are turned off once payments are connected.');
    const { order } = await buildOrder(env, await body(request), 'test', url.origin);
    order.payment = { provider: 'test' };
    await saveOrder(env, order, { ttl: 60 * 60 * 24 * 14 });
    return json({ redirect: `/order/${order.id}?key=${order.accessKey}&new=1` });
  }

  throw new HttpError(404, 'Not found.');
}

/* ---------- Admin API ---------- */

const SESSION_HOURS = 12;
async function sessionCookie(env) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  return `adm=${exp}.${await hmac(env.ADMIN_PASSWORD, 'admin.' + exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const [exp, sig] = (getCookie(request, 'adm') || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.ADMIN_PASSWORD, 'admin.' + exp));
}

const cents = (v) => Math.max(0, Math.round(Number(v) || 0));
function readProduct(b, existing) {
  const title = clean(b.title, 140);
  if (!title) throw new HttpError(400, 'Give the product a title.');
  const category = CATEGORIES.some((c) => c.id === b.category) ? b.category : CATEGORIES[0].id;
  const price = cents(b.price);
  const variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, 40)
    .map((v, i) => ({ id: clean(v.id, 12) || 'v' + (i + 1), name: clean(v.name, 80), price: cents(v.price), sku: clean(v.sku, 60), cjVid: clean(v.cjVid, 80) }))
    .filter((v) => v.name && v.price > 0);
  if (!variants.length && price <= 0) throw new HttpError(400, 'Set a price above zero.');
  return {
    ...(existing || {}),
    id: existing?.id || 'p' + Date.now().toString(36),
    slug: existing?.slug || slugify(title) || 'product-' + Date.now().toString(36),
    title, category,
    price: variants.length ? Math.min(...variants.map((v) => v.price)) : price,
    compareAt: cents(b.compareAt) || null,
    cost: cents(b.cost),
    images: (Array.isArray(b.images) ? b.images : []).map((u) => clean(u, 500)).filter((u) => /^(https:\/\/|\/)/.test(u)).slice(0, 10),
    description: String(b.description || '').slice(0, 6000),
    specs: (Array.isArray(b.specs) ? b.specs : []).slice(0, 30).map((s) => [clean(s[0], 60), clean(s[1], 200)]).filter((s) => s[0] && s[1]),
    variants,
    sku: clean(b.sku, 60), supplierUrl: /^https:\/\//.test(b.supplierUrl || '') ? clean(b.supplierUrl, 500) : '',
    cjPid: clean(b.cjPid, 80),
    featured: Boolean(b.featured), active: b.active !== false,
    sample: false, createdAt: existing?.createdAt || Date.now(),
  };
}

async function adminApi(request, env, url, seg, ctx) {
  const method = request.method;
  const route = seg.join('/');

  if (route === 'session' && method === 'GET') {
    return json({ configured: Boolean(env.ADMIN_PASSWORD), signedIn: await isAdmin(request, env) });
  }
  if (route === 'login' && method === 'POST') {
    if (!env.ADMIN_PASSWORD) throw new HttpError(503, 'Set the ADMIN_PASSWORD secret in Cloudflare first.');
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const key = 'rl:login:' + ip;
    const tries = parseInt((await kv(env).get(key)) || '0', 10);
    if (tries >= 8) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
    const b = await body(request);
    if (!safeEqual(String(b.password || ''), env.ADMIN_PASSWORD)) {
      await kv(env).put(key, String(tries + 1), { expirationTtl: 900 });
      throw new HttpError(401, 'That password is not right.');
    }
    return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env) });
  }
  if (route === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': 'adm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  if (!(await isAdmin(request, env))) throw new HttpError(401, 'Sign in to continue.');

  if (route === 'overview' && method === 'GET') {
    const [orders, catalog, settings] = await Promise.all([listOrders(env), getCatalog(env), getSettings(env)]);
    const real = orders.filter((o) => ['paid', 'processing', 'shipped', 'delivered'].includes(o.status));
    return json({
      orders, categories: CATEGORIES, settings,
      stats: {
        revenue: money(real.reduce((s, o) => s + o.total, 0), settings.currency), orderCount: real.length,
        toShip: orders.filter((o) => o.status === 'paid' || o.status === 'processing').length,
        products: catalog.filter((p) => p.active !== false).length, samples: catalog.filter((p) => p.sample).length,
      },
      feeds: await getFeeds(env),
      integrations: { email: emailReady(env), paypal: paypalReady(env), paypalEnv: String(env.PAYPAL_ENV || 'live').toLowerCase(), cj: cjReady(env), storage: hasKV(env) },
    });
  }

  if (seg[0] === 'orders' && seg[1]) {
    const order = await getOrder(env, seg[1]);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (method === 'GET') return json({ order });
    if (method === 'PUT') {
      const b = await body(request);
      const allowed = ['paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'test', 'pending_payment'];
      if (b.status && allowed.includes(b.status)) order.status = b.status;
      const trackingBefore = order.tracking;
      if (b.tracking != null) order.tracking = clean(b.tracking, 80);
      if (b.carrier != null) order.carrier = clean(b.carrier, 40);
      if (b.note != null) order.note = clean(b.note, 1000);
      const hadTracking = Boolean(trackingBefore);
      if (order.tracking && ['paid', 'processing'].includes(order.status)) order.status = 'shipped';
      await saveOrder(env, order);
      if (order.tracking && !hadTracking && order.status === 'shipped') ctx.waitUntil(sendOrderEmail(env, await getSettings(env), order, 'shipped'));
      return json({ order });
    }
    if (method === 'POST' && seg[2] === 'cj') {
      if (!cjReady(env)) throw new HttpError(503, 'Add the CJ_API_KEY secret in Cloudflare first.');
      if (order.cj?.orderId) throw new HttpError(409, 'This order was already sent to CJ.');
      if (!['paid', 'processing'].includes(order.status)) throw new HttpError(400, 'Only paid orders can be sent to CJ.');
      let cj;
      try { cj = await cjSubmitOrder(env, order, await getSettings(env)); } catch (err) { throw new HttpError(502, err.message); }
      if (cj.skipped) throw new HttpError(400, cj.note);
      order.cj = cj; order.status = 'processing';
      await saveOrder(env, order);
      return json({ order });
    }
    if (method === 'POST' && seg[2] === 'cj-sync') {
      if (!order.cj?.orderId) throw new HttpError(400, 'This order has not been sent to CJ.');
      try { await syncOneOrder(env, await getSettings(env), order); } catch (err) { throw new HttpError(502, err.message); }
      return json({ order });
    }
  }

  if (route === 'products' && method === 'GET') return json({ products: await getCatalog(env) });
  if (route === 'products' && method === 'POST') {
    const b = await body(request);
    const catalog = await getCatalog(env);
    const i = catalog.findIndex((p) => p.id === b.id);
    const product = readProduct(b, i >= 0 ? catalog[i] : null);
    if (catalog.some((p) => p.slug === product.slug && p.id !== product.id)) product.slug += '-' + Date.now().toString(36).slice(-4);
    if (i >= 0) catalog[i] = product; else catalog.unshift(product);
    await saveCatalog(env, catalog);
    return json({ product });
  }
  if (route === 'products/samples' && method === 'DELETE') {
    const catalog = (await getCatalog(env)).filter((p) => !p.sample);
    await saveCatalog(env, catalog);
    return json({ products: catalog });
  }
  if (seg[0] === 'products' && seg[1] && method === 'DELETE') {
    const catalog = (await getCatalog(env)).filter((p) => p.id !== seg[1]);
    await saveCatalog(env, catalog);
    return json({ ok: true });
  }

  if (route === 'settings' && method === 'PUT') {
    const b = await body(request);
    const current = await getSettings(env);
    const sh = b.shipping || {};
    const next = {
      ...current,
      storeName: clean(b.storeName, 60) || current.storeName,
      tagline: clean(b.tagline, 160),
      announcement: clean(b.announcement, 120),
      supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.supportEmail || '') ? clean(b.supportEmail, 120) : '',
      taxRate: Math.min(30, Math.max(0, Number(b.taxRate) || 0)),
      autoForwardCJ: Boolean(b.autoForwardCJ), cjPayFromBalance: Boolean(b.cjPayFromBalance),
      cjFromCountry: /^[A-Za-z]{2}$/.test(b.cjFromCountry || '') ? b.cjFromCountry.toUpperCase() : 'CN',
      cjLogistic: clean(b.cjLogistic, 50),
      shipping: { ...current.shipping, domesticFlat: cents(sh.domesticFlat), freeOver: cents(sh.freeOver), internationalFlat: cents(sh.internationalFlat) },
    };
    await saveSettings(env, next);
    return json({ settings: next });
  }

  // Spreadsheet import: preview first (headers, guessed columns, sample rows), then run.
  if ((route === 'import/preview' || route === 'import/run') && method === 'POST') {
    const b = await body(request);
    let text;
    try { text = b.url ? await fetchFeed(clean(b.url, 600)) : String(b.csv || ''); } catch (err) { throw new HttpError(400, err.message); }
    if (text.length > 8_000_000) throw new HttpError(413, 'That file is larger than 8 MB. Split it into smaller files.');
    const parsed = parseCsv(text);
    if (!parsed.headers.length || !parsed.rows.length) throw new HttpError(400, 'No rows found. The file needs a header row and at least one product row.');
    if (route === 'import/preview') {
      return json({ headers: parsed.headers, mapping: guessMapping(parsed.headers), sample: parsed.rows.slice(0, 4), rows: parsed.rows.length, maxRows: MAX_ROWS });
    }
    const mapping = {};
    for (const f of ['title', 'sku', 'cost', 'retail', 'images', 'description', 'category', 'stock', 'brand', 'weight']) {
      const i = parseInt(b.mapping?.[f], 10);
      mapping[f] = Number.isInteger(i) && i >= 0 && i < parsed.headers.length ? i : -1;
    }
    if (mapping.title < 0) throw new HttpError(400, 'Choose which column holds the product title.');
    if (mapping.cost < 0 && mapping.retail < 0) throw new HttpError(400, 'Choose a price column.');
    const options = {
      priceMode: b.options?.priceMode === 'retail' ? 'retail' : 'cost',
      markup: Math.min(20, Math.max(1, Number(b.options?.markup) || 2)),
      category: CATEGORIES.some((c) => c.id === b.options?.category) ? b.options.category : CATEGORIES[0].id,
    };
    const feeds = await getFeeds(env);
    const supplier = clean(b.supplier, 40) || 'Supplier';
    let feed = feeds.find((f) => f.name.toLowerCase() === supplier.toLowerCase());
    if (!feed) { feed = { id: 'feed-' + slugify(supplier) + '-' + Date.now().toString(36).slice(-4), name: supplier }; feeds.push(feed); }
    Object.assign(feed, { mapping, options, lastRun: Date.now(), lastError: '' });
    if (b.url) feed.url = b.keepSynced ? clean(b.url, 600) : '';
    else feed.url = feed.url || '';
    const catalog = await getCatalog(env);
    feed.lastResult = importRows(catalog, parsed, mapping, { ...options, source: feed.id, hideMissing: false });
    await saveCatalog(env, catalog);
    await saveFeeds(env, feeds);
    return json({ result: feed.lastResult, feed });
  }
  if (seg[0] === 'feeds' && seg[1]) {
    const feeds = await getFeeds(env);
    const feed = feeds.find((f) => f.id === seg[1]);
    if (!feed) throw new HttpError(404, 'Supplier not found.');
    if (method === 'POST' && seg[2] === 'sync') {
      if (!feed.url) throw new HttpError(400, 'This supplier has no feed link. Upload its file again to update.');
      const catalog = await getCatalog(env);
      try { feed.lastResult = await runFeed(env, feed, catalog); feed.lastError = ''; } catch (err) { throw new HttpError(502, err.message); }
      feed.lastRun = Date.now();
      await saveCatalog(env, catalog); await saveFeeds(env, feeds);
      return json({ feed });
    }
    if (method === 'DELETE') {
      // Removes the supplier and, when asked, every product that came from it.
      if (url.searchParams.get('products') === '1') await saveCatalog(env, (await getCatalog(env)).filter((p) => p.source !== feed.id));
      await saveFeeds(env, feeds.filter((f) => f.id !== feed.id));
      return json({ ok: true });
    }
  }

  if (route === 'cj/search' && method === 'GET') {
    if (!cjReady(env)) throw new HttpError(503, 'Add the CJ_API_KEY secret in Cloudflare to search CJ Dropshipping.');
    try { return json({ results: await cjSearch(env, clean(url.searchParams.get('q'), 80)) }); }
    catch (err) { throw new HttpError(502, err.message); }
  }
  if (route === 'cj/import' && method === 'POST') {
    if (!cjReady(env)) throw new HttpError(503, 'Add the CJ_API_KEY secret in Cloudflare to import from CJ Dropshipping.');
    const b = await body(request);
    const category = CATEGORIES.some((c) => c.id === b.category) ? b.category : CATEGORIES[0].id;
    let product;
    try { product = await cjImport(env, clean(b.pid, 80), category, b.markup); }
    catch (err) { throw new HttpError(502, err.message); }
    const catalog = await getCatalog(env);
    if (catalog.some((p) => p.cjPid === product.cjPid)) throw new HttpError(409, 'That CJ product is already in your catalog.');
    if (catalog.some((p) => p.slug === product.slug)) product.slug += '-' + Date.now().toString(36).slice(-4);
    catalog.unshift(product);
    await saveCatalog(env, catalog);
    return json({ product });
  }

  throw new HttpError(404, 'Not found.');
}
