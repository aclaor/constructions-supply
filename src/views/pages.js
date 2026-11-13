import { esc, money, COUNTRIES } from '../lib/util.js';
import { CATEGORIES } from '../data/seed.js';
import { POLICIES } from '../data/policies.js';
import { iconSvg } from './art.js';

const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || 'Other';
const fromPrice = (p) => (p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.price);
const LOGO = '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="5" fill="#FFC61A"/><path d="M9 7v18h16v-5H14V7z" fill="#14212B"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICON_CART = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M2 3h3l2.6 12h10.8L21 7H6.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="20" r="1.7" fill="currentColor"/><circle cx="17" cy="20" r="1.7" fill="currentColor"/></svg>';

export function layout({ settings, title, description, body, path = '/', head = '', scripts = '' }) {
  const s = settings;
  const fullTitle = title ? `${title} | ${s.storeName}` : `${s.storeName} | Construction supply, delivered`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || s.tagline)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || s.tagline)}">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${s.announcement ? `<p class="announce">${esc(s.announcement)}</p>` : ''}
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="/">${LOGO}<span>${esc(s.storeName)}</span></a>
    <form class="search" action="/search" role="search">
      <input name="q" type="search" placeholder="Search drills, anchors, gloves" aria-label="Search products" autocomplete="off">
      <button aria-label="Search">${ICON_SEARCH}</button>
    </form>
    <a class="header-link" href="/track">Track an order</a>
    <button class="cart-btn" type="button" data-cart-open aria-label="Open cart">${ICON_CART}<span>Cart</span><b data-cart-count>0</b></button>
  </div>
  <nav class="aisle-nav" aria-label="Departments"><div class="wrap">
    <a href="/collections/all"${path === '/collections/all' ? ' aria-current="page"' : ''}>All products</a>
    ${CATEGORIES.map((c) => `<a href="/collections/${c.id}"${path === '/collections/' + c.id ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`).join('')}
  </div></nav>
</header>
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="tape" aria-hidden="true"></div>
  <div class="wrap footer-grid">
    <div>
      <a class="logo" href="/">${LOGO}<span>${esc(s.storeName)}</span></a>
      <p>${esc(s.tagline)}</p>
    </div>
    <div><h2>Shop</h2><ul>${CATEGORIES.map((c) => `<li><a href="/collections/${c.id}">${esc(c.name)}</a></li>`).join('')}</ul></div>
    <div><h2>Help</h2><ul>
      <li><a href="/track">Track an order</a></li>
      <li><a href="/pages/shipping">Shipping</a></li>
      <li><a href="/pages/returns">Returns and refunds</a></li>
      <li><a href="/pages/contact">Contact</a></li>
    </ul></div>
    <div><h2>Store</h2><ul>
      <li><a href="/pages/privacy">Privacy</a></li>
      <li><a href="/pages/terms">Terms of sale</a></li>
    </ul><p class="pay-note">Secure checkout with PayPal and cards.</p></div>
  </div>
  <p class="wrap copyright">© ${new Date().getFullYear()} ${esc(s.storeName)}</p>
</footer>
<div class="drawer-backdrop" data-cart-close hidden></div>
<aside class="drawer" id="cart-drawer" aria-label="Cart" hidden>
  <div class="drawer-head"><h2>Your cart</h2><button type="button" class="icon-btn" data-cart-close aria-label="Close cart">✕</button></div>
  <div class="drawer-body" data-cart-view="drawer"></div>
</aside>
<div class="toast" role="status" aria-live="polite" hidden></div>
<script src="/assets/app.js" defer></script>
${scripts}
</body>
</html>`;
}

export function productCard(p, settings) {
  const price = fromPrice(p);
  const hasVariants = p.variants?.length > 0;
  const sale = p.compareAt && p.compareAt > price;
  return `<article class="card">
  <a class="card-media" href="/products/${esc(p.slug)}" tabindex="-1" aria-hidden="true">
    <img src="${esc(p.images?.[0] || '/art/hand-tools/0.svg')}" alt="" loading="lazy" width="400" height="400">
    ${sale ? `<span class="badge">Save ${Math.round((1 - price / p.compareAt) * 100)}%</span>` : ''}
  </a>
  <div class="card-body">
    <p class="card-cat">${esc(catName(p.category))}</p>
    <h3><a href="/products/${esc(p.slug)}">${esc(p.title)}</a></h3>
    <p class="price">${hasVariants ? '<span class="from">From</span> ' : ''}<b>${money(price, settings.currency)}</b>${sale ? ` <s>${money(p.compareAt, settings.currency)}</s>` : ''}</p>
    ${hasVariants
      ? `<a class="btn btn-line" href="/products/${esc(p.slug)}">Choose options</a>`
      : `<button class="btn btn-line" type="button" data-add="${esc(p.id)}">Add to cart</button>`}
  </div>
</article>`;
}

const PER_PAGE = 24;
function paginate(list, url) {
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(pages, Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1));
  const link = (n) => { const u = new URL(url); u.searchParams.set('page', n); return esc(u.pathname + u.search); };
  const nav = pages > 1 ? `<nav class="pager" aria-label="Pages">${cur > 1 ? `<a class="btn" href="${link(cur - 1)}">Previous</a>` : ''}<span>Page ${cur} of ${pages}</span>${cur < pages ? `<a class="btn" href="${link(cur + 1)}">Next</a>` : ''}</nav>` : '';
  return { items: list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE), nav };
}

const grid = (products, settings) => `<div class="grid">${products.map((p) => productCard(p, settings)).join('')}</div>`;

export function homePage({ settings, catalog }) {
  const active = catalog.filter((p) => p.active !== false);
  const featured = active.filter((p) => p.featured).slice(0, 8);
  const deals = active.filter((p) => p.compareAt && p.compareAt > fromPrice(p)).slice(0, 4);
  const sh = settings.shipping;
  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <h1>Stock the whole job without leaving the site.</h1>
      <p>${esc(settings.tagline)}</p>
      <form class="hero-search" action="/search" role="search">
        <input name="q" type="search" placeholder="What do you need today?" aria-label="Search products">
        <button class="btn btn-primary">Search</button>
      </form>
      <p class="hero-links">Or browse <a href="/collections/all">all ${active.length} products</a></p>
    </div>
    <nav class="aisles" aria-label="Shop by department">
      ${CATEGORIES.map((c, i) => `<a class="aisle" href="/collections/${c.id}">
        <span class="aisle-no">Aisle ${i + 1}</span>
        ${iconSvg(c.id, '#14212B', '#FFC61A')}
        <strong>${esc(c.name)}</strong>
        <small>${esc(c.blurb)}</small>
      </a>`).join('')}
    </nav>
  </div>
  <div class="tape" aria-hidden="true"></div>
</section>
<section class="wrap facts" aria-label="How ordering works">
  <div><b>${sh.freeOver > 0 ? `Free US shipping over ${money(sh.freeOver, settings.currency)}` : `Flat ${money(sh.domesticFlat, settings.currency)} US shipping`}</b><span>${sh.freeOver > 0 ? `${money(sh.domesticFlat, settings.currency)} flat rate below that` : 'One rate, any order size'}</span></div>
  <div><b>Tracked to your door</b><span>Follow every parcel from your order page</span></div>
  <div><b>30-day returns</b><span>Wrong or damaged item? We replace it</span></div>
  <div><b>Pay with PayPal or card</b><span>Your payment details stay with PayPal</span></div>
</section>
${featured.length ? `<section class="wrap section"><div class="section-head"><h2>Featured tools and gear</h2><a href="/collections/all">See all products</a></div>${grid(featured, settings)}</section>` : ''}
${deals.length ? `<section class="wrap section"><div class="section-head"><h2>On sale now</h2><a href="/collections/all?sort=price-asc">Shop by price</a></div>${grid(deals, settings)}</section>` : ''}
<section class="wrap section bulk">
  <div>
    <h2>Buying for a crew or a full project?</h2>
    <p>Send us your materials list and we will quote the whole order with combined shipping.</p>
  </div>
  <a class="btn btn-dark" href="/pages/contact">Request a bulk quote</a>
</section>`;
  return layout({ settings, body, path: '/' });
}

export function collectionPage({ settings, catalog, category, url }) {
  const sort = url.searchParams.get('sort') || 'featured';
  const cat = CATEGORIES.find((c) => c.id === category);
  let list = catalog.filter((p) => p.active !== false && (category === 'all' || p.category === category));
  if (sort === 'price-asc') list.sort((a, b) => fromPrice(a) - fromPrice(b));
  else if (sort === 'price-desc') list.sort((a, b) => fromPrice(b) - fromPrice(a));
  else if (sort === 'newest') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else list.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  const title = cat ? cat.name : 'All products';
  const pg = paginate(list, url);
  const opt = (v, label) => `<option value="${v}"${sort === v ? ' selected' : ''}>${label}</option>`;
  const body = `
<div class="wrap page-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>${esc(title)}</span></nav>
  <h1>${esc(title)}</h1>
  ${cat ? `<p>${esc(cat.blurb)}</p>` : ''}
</div>
<div class="wrap toolbar">
  <p>${list.length} ${list.length === 1 ? 'product' : 'products'}</p>
  <form method="get"><label>Sort by <select name="sort" onchange="this.form.submit()">${opt('featured', 'Featured')}${opt('price-asc', 'Price, low to high')}${opt('price-desc', 'Price, high to low')}${opt('newest', 'Newest')}</select></label><noscript><button class="btn btn-line">Apply</button></noscript></form>
</div>
<div class="wrap section-tight">${list.length ? grid(pg.items, settings) + pg.nav : `<div class="empty"><h2>Nothing on this aisle yet</h2><p>New stock is added regularly. Browse everything we carry in the meantime.</p><a class="btn btn-primary" href="/collections/all">Browse all products</a></div>`}</div>`;
  return layout({ settings, title, description: cat?.blurb, body, path: '/collections/' + category });
}

export function searchPage({ settings, catalog, q, url }) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const list = terms.length ? catalog.filter((p) => {
    if (p.active === false) return false;
    const hay = (p.title + ' ' + catName(p.category) + ' ' + (p.description || '')).toLowerCase();
    return terms.every((t) => hay.includes(t));
  }) : [];
  const pg = paginate(list, url);
  const body = `
<div class="wrap page-head">
  <h1>${q ? `Results for “${esc(q)}”` : 'Search'}</h1>
  <form class="hero-search page-search" action="/search" role="search">
    <input name="q" type="search" value="${esc(q)}" placeholder="Search products" aria-label="Search products">
    <button class="btn btn-primary">Search</button>
  </form>
</div>
<div class="wrap section-tight">${list.length ? `<p class="count">${list.length} ${list.length === 1 ? 'product' : 'products'}</p>${grid(pg.items, settings)}${pg.nav}`
    : q ? `<div class="empty"><h2>No products match “${esc(q)}”</h2><p>Try a shorter search like “drill” or “anchor”, or pick a department.</p><a class="btn btn-primary" href="/collections/all">Browse all products</a></div>` : ''}</div>`;
  return layout({ settings, title: q ? `Search: ${q}` : 'Search', body, head: '<meta name="robots" content="noindex">' });
}

export function productPage({ settings, catalog, product: p, origin }) {
  const cur = settings.currency;
  const price = fromPrice(p);
  const hasVariants = p.variants?.length > 0;
  const sale = p.compareAt && p.compareAt > price;
  const images = p.images?.length ? p.images : ['/art/hand-tools/0.svg'];
  const related = catalog.filter((x) => x.active !== false && x.category === p.category && x.id !== p.id).slice(0, 4);
  const sh = settings.shipping;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: (p.description || '').slice(0, 500),
    image: images.map((i) => (i.startsWith('/') ? origin + i : i)), category: catName(p.category),
    offers: { '@type': 'Offer', price: (price / 100).toFixed(2), priceCurrency: cur, availability: 'https://schema.org/InStock', url: origin + '/products/' + p.slug },
  };
  const body = `
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/collections/${esc(p.category)}">${esc(catName(p.category))}</a><span>/</span><span>${esc(p.title)}</span></nav>
  <div class="pdp">
    <div class="gallery">
      <div class="gallery-main"><img id="main-image" src="${esc(images[0])}" alt="${esc(p.title)}" width="800" height="800">${sale ? `<span class="badge">Save ${Math.round((1 - price / p.compareAt) * 100)}%</span>` : ''}</div>
      ${images.length > 1 ? `<div class="thumbs">${images.map((src, i) => `<button type="button" data-thumb="${esc(src)}"${i === 0 ? ' aria-current="true"' : ''} aria-label="Show image ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" width="80" height="80"></button>`).join('')}</div>` : ''}
    </div>
    <div class="buy">
      <p class="card-cat"><a href="/collections/${esc(p.category)}">${esc(catName(p.category))}</a></p>
      <h1>${esc(p.title)}</h1>
      <p class="price price-lg"><b id="price">${money(price, cur)}</b>${sale ? ` <s>${money(p.compareAt, cur)}</s>` : ''}</p>
      <form class="buy-form" data-product="${esc(p.id)}">
        ${hasVariants ? `<label class="field"><span>Option</span><select id="variant" name="variant">${p.variants.map((v) => `<option value="${esc(v.id)}" data-price="${esc(money(v.price, cur))}">${esc(v.name)} (${money(v.price, cur)})</option>`).join('')}</select></label>` : ''}
        <div class="buy-row">
          <div class="qty" role="group" aria-label="Quantity"><button type="button" data-qty="-1" aria-label="Decrease quantity">−</button><input id="qty" name="qty" type="number" min="1" max="99" value="1" inputmode="numeric" aria-label="Quantity"><button type="button" data-qty="1" aria-label="Increase quantity">+</button></div>
          <button class="btn btn-primary btn-lg" type="submit">Add to cart</button>
        </div>
        <button class="btn btn-dark btn-lg btn-block" type="button" data-buy-now>Buy it now</button>
      </form>
      <ul class="assurances">
        <li><b>Shipping</b><span>${sh.freeOver > 0 ? `${money(sh.domesticFlat, cur)} in the US, free over ${money(sh.freeOver, cur)}` : `${money(sh.domesticFlat, cur)} flat in the US`}. International ${money(sh.internationalFlat, cur)}.</span></li>
        <li><b>Delivery</b><span>Usually 7 to 15 business days to US addresses, with tracking.</span></li>
        <li><b>Returns</b><span>30 days. <a href="/pages/returns">How returns work</a></span></li>
      </ul>
    </div>
  </div>
  <div class="pdp-info">
    <section><h2>About this product</h2>${String(p.description || '').split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('')}</section>
    ${p.specs?.length ? `<section><h2>Specifications</h2><table class="specs"><tbody>${p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>` : ''}
  </div>
  ${related.length ? `<section class="section"><div class="section-head"><h2>More from ${esc(catName(p.category).toLowerCase())}</h2></div>${grid(related, settings)}</section>` : ''}
</div>`;
  return layout({
    settings, title: p.title, description: (p.description || '').slice(0, 155), body, path: '/collections/' + p.category,
    head: `<meta property="og:image" content="${esc(images[0].startsWith('/') ? origin + images[0] : images[0])}"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  });
}

export function cartPage({ settings }) {
  const body = `<div class="wrap page-head"><h1>Your cart</h1></div><div class="wrap section-tight cart-page" data-cart-view="page"></div>`;
  return layout({ settings, title: 'Cart', body, head: '<meta name="robots" content="noindex">' });
}

export function checkoutPage({ settings, paypalClientId, testMode }) {
  const f = (name, label, attrs = '', cls = '') => `<label class="field ${cls}"><span>${label}</span><input name="${name}" ${attrs}></label>`;
  const body = `
<div class="wrap page-head"><h1>Checkout</h1></div>
<div class="wrap checkout" data-checkout data-paypal="${esc(paypalClientId || '')}" data-currency="${esc(settings.currency)}" data-test="${testMode ? '1' : ''}">
  <form id="checkout-form" class="checkout-form" novalidate>
    <fieldset><legend>Contact</legend>
      ${f('email', 'Email', 'type="email" autocomplete="email" required')}
      ${f('phone', 'Phone (for the carrier)', 'type="tel" autocomplete="tel" required')}
    </fieldset>
    <fieldset><legend>Ship to</legend>
      ${f('name', 'Full name', 'autocomplete="name" required')}
      ${f('line1', 'Street address', 'autocomplete="address-line1" required')}
      ${f('line2', 'Apartment, unit or site (optional)', 'autocomplete="address-line2"')}
      <div class="field-row">
        ${f('city', 'City', 'autocomplete="address-level2" required')}
        ${f('state', 'State or province', 'autocomplete="address-level1" required')}
        ${f('zip', 'ZIP or postal code', 'autocomplete="postal-code" required')}
      </div>
      <label class="field"><span>Country</span><select name="country" autocomplete="country">${COUNTRIES.map(([c, n]) => `<option value="${c}"${c === settings.shipping.domesticCountry ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    </fieldset>
    <fieldset><legend>Payment</legend>
      <p class="form-error" id="checkout-error" role="alert" hidden></p>
      ${paypalClientId ? `<p class="hint">Pay with your PayPal account or a debit or credit card. You confirm the total with PayPal before anything is charged.</p><div id="paypal-buttons"></div>`
      : `<div class="notice"><b>Payments are not connected yet.</b> Add your PayPal keys in Cloudflare to take real payments. Until then you can place a test order to try the full flow. No money moves.</div><button class="btn btn-primary btn-lg btn-block" type="button" id="test-order">Place test order</button>`}
    </fieldset>
  </form>
  <aside class="summary" aria-label="Order summary"><h2>Order summary</h2><div data-cart-view="summary"></div></aside>
</div>`;
  return layout({ settings, title: 'Checkout', body, head: '<meta name="robots" content="noindex">', scripts: '<script src="/assets/checkout.js" defer></script>' });
}

const STATUS_LABEL = {
  pending_payment: 'Awaiting payment', paid: 'Paid', processing: 'Being prepared', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', test: 'Test order',
};
export const statusLabel = (s) => STATUS_LABEL[s] || s;

export function orderPage({ settings, order: o, fresh }) {
  const cur = o.currency || settings.currency;
  const steps = ['Order placed', 'Being prepared', 'Shipped', 'Delivered'];
  const reached = { pending_payment: 0, test: 0, paid: 0, processing: 1, shipped: 2, delivered: 3 }[o.status];
  const stopped = o.status === 'cancelled' || o.status === 'refunded';
  const a = o.address;
  const body = `
<div class="wrap page-head">
  ${fresh ? `<p class="confirm">Thanks, ${esc(o.customer.name.split(' ')[0])}. Your order is in.</p>` : ''}
  <h1>Order ${esc(o.id)}</h1>
  <p>Placed ${new Date(o.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} <span class="status status-${esc(o.status)}">${esc(statusLabel(o.status))}</span></p>
  ${fresh ? `<p class="hint">Bookmark this page to follow your delivery, or use <a href="/track">Track an order</a> with your order number and email.</p>` : ''}
</div>
<div class="wrap order">
  <div>
    ${stopped ? `<div class="notice">This order was ${esc(statusLabel(o.status).toLowerCase())}.</div>` : `<ol class="steps">${steps.map((s, i) => `<li class="${i <= reached ? 'done' : ''}${i === reached ? ' current' : ''}">${s}</li>`).join('')}</ol>`}
    ${o.tracking ? `<div class="tracking"><h2>Tracking</h2><p>${o.carrier ? esc(o.carrier) + ' ' : ''}<b>${esc(o.tracking)}</b></p>${o.trackingUrl ? `<p><a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener">Track this parcel with the carrier</a></p>` : ''}</div>` : ''}
    <h2>Items</h2>
    <ul class="lines">${o.lines.map((l) => `<li><img src="${esc(l.image)}" alt="" width="64" height="64"><div><a href="/products/${esc(l.slug)}">${esc(l.title)}</a>${l.variantName ? `<small>${esc(l.variantName)}</small>` : ''}<small>Qty ${l.qty}</small></div><b>${money(l.total, cur)}</b></li>`).join('')}</ul>
  </div>
  <aside class="summary">
    <h2>Total</h2>
    <dl class="totals"><dt>Subtotal</dt><dd>${money(o.totals.subtotal, cur)}</dd><dt>Shipping</dt><dd>${o.totals.shipping ? money(o.totals.shipping, cur) : 'Free'}</dd>${o.totals.tax ? `<dt>Tax</dt><dd>${money(o.totals.tax, cur)}</dd>` : ''}<dt class="grand">Total</dt><dd class="grand">${money(o.totals.total, cur)}</dd></dl>
    <h2>Shipping to</h2>
    <address>${esc(o.customer.name)}<br>${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.zip)}<br>${esc(COUNTRIES.find(([c]) => c === a.country)?.[1] || a.country)}</address>
  </aside>
</div>`;
  return layout({ settings, title: 'Order ' + o.id, body, head: '<meta name="robots" content="noindex">', scripts: fresh ? '<script>try{localStorage.removeItem("cart")}catch(e){}</script>' : '' });
}

export function trackPage({ settings, error, values = {} }) {
  const body = `
<div class="wrap narrow page-head"><h1>Track an order</h1><p>Enter the order number from your confirmation page and the email you checked out with.</p></div>
<div class="wrap narrow section-tight">
  <form method="post" action="/track" class="stack">
    ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
    <label class="field"><span>Order number</span><input name="order" value="${esc(values.order || '')}" placeholder="LB-XXXXXXXX" required></label>
    <label class="field"><span>Email</span><input name="email" type="email" value="${esc(values.email || '')}" autocomplete="email" required></label>
    <button class="btn btn-primary btn-lg">Find my order</button>
  </form>
</div>`;
  return layout({ settings, title: 'Track an order', body });
}

export function policyPage({ settings, slug }) {
  const sh = settings.shipping;
  const cur = settings.currency;
  const email = settings.supportEmail || 'our support email';
  const shippingLine = `US orders ship for ${money(sh.domesticFlat, cur)}${sh.freeOver > 0 ? `, and free when the order is ${money(sh.freeOver, cur)} or more` : ''}. International orders ship for ${money(sh.internationalFlat, cur)}.`;
  const fill = (t) => esc(t.replaceAll('{store}', settings.storeName).replaceAll('{email}', email).replaceAll('{shippingLine}', shippingLine));
  let title, inner;
  if (slug === 'contact') {
    title = 'Contact';
    inner = `<p>Questions about a product, an order or a bulk quote? ${settings.supportEmail ? `Email <a href="mailto:${esc(settings.supportEmail)}">${esc(settings.supportEmail)}</a> and we reply within 2 business days.` : 'Our support email is being set up. Check back shortly.'}</p>
<h2>Bulk and project orders</h2><p>Send your materials list with quantities and a delivery ZIP code. We quote the whole order with combined shipping.</p>
<h2>Already ordered?</h2><p>Include your order number so we can find it quickly, or <a href="/track">track your order here</a>.</p>`;
  } else {
    const p = POLICIES[slug];
    if (!p) return null;
    title = p.title;
    inner = p.body.map(([h, t]) => `<h2>${esc(h)}</h2><p>${fill(t)}</p>`).join('');
  }
  const body = `<div class="wrap narrow page-head"><h1>${esc(title)}</h1></div><div class="wrap narrow prose section-tight">${inner}</div>`;
  return layout({ settings, title, body });
}

export function notFoundPage({ settings }) {
  const body = `<div class="wrap section"><div class="empty"><h1>That page is not on our shelves</h1><p>The link may be old, or the product may have been removed.</p><a class="btn btn-primary" href="/collections/all">Browse all products</a></div></div>`;
  return layout({ settings, title: 'Page not found', body, head: '<meta name="robots" content="noindex">' });
}
