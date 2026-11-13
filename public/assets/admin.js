// Store admin: orders, products, CJ Dropshipping import, settings.
(function () {
  const app = document.getElementById('app');
  const dlg = document.getElementById('dlg');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const usd = (cents) => '$' + ((cents || 0) / 100).toFixed(2);
  const toCents = (v) => Math.round(parseFloat(String(v).replace(/[^0-9.]/g, '')) * 100) || 0;
  const dollars = (cents) => (cents ? (cents / 100).toFixed(2) : '');
  const STATUS = { pending_payment: 'Awaiting payment', paid: 'Paid', processing: 'Being prepared', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', test: 'Test order' };
  const LOGO = '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="5" fill="#FFC61A"/><path d="M9 7v18h16v-5H14V7z" fill="#14212B"/></svg>';

  let state = { tab: 'orders', data: null, products: [], filter: '', sheet: null };
  const feedName = (id) => (state.data.feeds || []).find((f) => f.id === id)?.name || 'Imported';

  async function api(path, opts = {}) {
    const res = await fetch('/api/admin/' + path, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'login') { renderLogin(); throw new Error('Sign in to continue.'); }
    if (!res.ok) throw new Error(out.error || 'Request failed.');
    return out;
  }
  let toastTimer;
  function toast(msg) {
    const t = document.querySelector('.toast');
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }
  const fail = (err) => toast(err.message);

  /* ---------- Sign in ---------- */
  async function start() {
    const s = await api('session');
    if (!s.configured) {
      app.innerHTML = `<div class="wrap login panel"><h2>Set an admin password first</h2><p class="muted">In Cloudflare, open this Worker, go to Settings, then Variables and Secrets, and add a secret named <b>ADMIN_PASSWORD</b>. Reload this page after saving.</p></div>`;
      return;
    }
    if (!s.signedIn) return renderLogin();
    load();
  }
  function renderLogin(error) {
    app.innerHTML = `<form class="wrap login panel stack" id="login"><h2>Store admin</h2>
      ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
      <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
      <button class="btn btn-primary btn-lg">Sign in</button></form>`;
    document.getElementById('login').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('login', { method: 'POST', body: { password: e.target.password.value } }); load(); }
      catch (err) { renderLogin(err.message); }
    });
  }

  async function load() {
    try {
      const [overview, prod] = await Promise.all([api('overview'), api('products')]);
      state.data = overview; state.products = prod.products;
      render();
    } catch (err) { fail(err); }
  }

  /* ---------- Shell ---------- */
  function render() {
    const d = state.data;
    const tabs = [['orders', 'Orders'], ['products', 'Products'], ['import', 'Import products'], ['settings', 'Settings']];
    app.innerHTML = `<header class="adm-bar"><div class="wrap">
        <a class="logo" href="/admin/">${LOGO}<span>${esc(d.settings.storeName)}</span></a>
        <div class="adm-tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${label}</button>`).join('')}</div>
        <a href="/" target="_blank" rel="noopener">View store</a>
        <button class="link-btn" data-logout>Sign out</button>
      </div></header>
      <main class="wrap adm-main">${({ orders: ordersView, products: productsView, import: importView, settings: settingsView })[state.tab]()}</main>`;
  }

  function ordersView() {
    const d = state.data; const s = d.stats; const i = d.integrations;
    const check = (on, yes, no) => `<div class="check"><span class="dot${on ? ' on' : ''}"></span><span>${on ? yes : no}</span></div>`;
    const setupDone = i.paypal && i.cj && i.email && i.storage && d.settings.supportEmail && !s.samples;
    return `<div class="stats">
        <div class="stat"><b>${esc(s.revenue)}</b><span>Paid sales</span></div>
        <div class="stat"><b>${s.orderCount}</b><span>Paid orders</span></div>
        <div class="stat"><b>${s.toShip}</b><span>Waiting to ship</span></div>
        <div class="stat"><b>${s.products}</b><span>Products live</span></div>
      </div>
      ${setupDone ? '' : `<div class="panel"><h2>Before you take orders</h2><div class="checks">
        ${check(i.storage, 'Storage is connected.', 'Storage is not connected. Orders and edits will not be saved. Redeploy so Wrangler creates the STORE namespace.')}
        ${check(i.paypal, `PayPal is connected (${esc(i.paypalEnv)} mode).`, 'PayPal is not connected. Add the PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET secrets in Cloudflare. Checkout only places test orders until then.')}
        ${check(i.cj, 'CJ Dropshipping is connected.', 'CJ Dropshipping is not connected. Add the CJ_API_KEY secret to import products.')}
        ${check(i.email, 'Customer emails are connected.', 'Customer emails are off. Add the RESEND_API_KEY and EMAIL_FROM secrets to send order and shipping emails.')}
        ${check(Boolean(d.settings.supportEmail), 'Support email is set.', 'Add a support email in Settings so customers can reach you.')}
        ${check(!s.samples, 'No sample products left.', `${s.samples} sample products are still live. Replace them with real products before launch.`)}
      </div></div>`}
      <div class="panel"><h2>Orders</h2>
      ${d.orders.length ? `<div class="scroll"><table class="list"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Supplier</th></tr></thead><tbody>
        ${d.orders.map((o) => `<tr data-row data-order="${esc(o.id)}" tabindex="0"><td><b>${esc(o.id)}</b></td><td>${new Date(o.t).toLocaleDateString()}</td><td>${esc(o.name)}<br><span class="muted">${esc(o.email)}</span></td><td>${o.items}</td><td>${usd(o.total)}</td><td><span class="status status-${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span></td><td>${o.cj ? 'Sent to CJ' : o.cjErr ? '<b style="color:var(--hivis)">CJ failed</b>' : '<span class="muted">Not sent</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No orders yet. They appear here as soon as a customer checks out.</p>'}</div>`;
  }

  function productsView() {
    const cats = Object.fromEntries(state.data.categories.map((c) => [c.id, c.name]));
    const samples = state.products.filter((p) => p.sample).length;
    const f = (state.filter || '').toLowerCase();
    const matches = f ? state.products.filter((p) => (p.title + ' ' + (p.sku || '')).toLowerCase().includes(f)) : state.products;
    const shown = matches.slice(0, 150);
    return `<div class="panel"><div class="panel-head"><h2>Products (${state.products.length})</h2>
        <div class="row-actions">${samples ? `<button class="btn danger" data-remove-samples>Remove ${samples} sample products</button>` : ''}<button class="btn btn-primary" data-new-product>Add product</button></div></div>
      ${state.products.length > 12 ? `<label class="field" style="margin-bottom:12px"><span>Find a product</span><input id="product-filter" value="${esc(state.filter || '')}" placeholder="Type part of a title or SKU"></label>` : ''}
      ${shown.length < matches.length ? `<p class="muted">Showing the first ${shown.length} of ${matches.length}. Use the box above to narrow it down.</p>` : ''}
      ${state.products.length ? `<div class="scroll"><table class="list"><thead><tr><th></th><th>Product</th><th>Department</th><th>Price</th><th>Cost</th><th>Status</th></tr></thead><tbody>
        ${shown.map((p) => `<tr data-row data-product="${esc(p.id)}" tabindex="0"><td><img src="${esc(p.images?.[0] || '')}" alt=""></td><td><b>${esc(p.title)}</b>${p.sample ? '<br><span class="muted">Sample</span>' : ''}${p.cjPid ? '<br><span class="muted">From CJ</span>' : ''}${p.source ? `<br><span class="muted">${esc(feedName(p.source))}</span>` : ''}</td><td>${esc(cats[p.category] || '')}</td><td>${usd(p.price)}${p.variants?.length ? ' and up' : ''}</td><td>${p.cost ? usd(p.cost) : '<span class="muted">Not set</span>'}</td><td>${p.active === false ? 'Hidden' : 'Live'}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No products yet. Add one by hand or import from CJ Dropshipping.</p>'}</div>`;
  }

  function importView() {
    const on = state.data.integrations.cj;
    const feeds = state.data.feeds || [];
    const cats = state.data.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    return `<div class="panel"><h2>Import a supplier spreadsheet</h2>
      <p class="muted">Works with the product file from any supplier (VEVOR, Inventory Source, Wholesale2B and others): CSV, semicolon or tab separated. Importing the same supplier again updates prices and stock instead of adding duplicates.</p>
      <form id="sheet-form" class="form-grid" style="margin-top:14px">
        <label class="field"><span>Supplier name</span><input name="supplier" placeholder="VEVOR" required></label>
        <label class="field"><span>Product file</span><input name="file" type="file" accept=".csv,.tsv,.txt,text/csv"></label>
        <label class="field full"><span>Or a direct link to the file (https)</span><input name="url" type="url" placeholder="https://supplier.example/feed.csv"></label>
        <div class="full row-actions"><button class="btn btn-primary">Read file</button></div>
      </form>
      <div id="sheet-map"></div></div>
      ${feeds.length ? `<div class="panel"><h2>Suppliers</h2><div class="scroll"><table class="list"><thead><tr><th>Supplier</th><th>Products</th><th>Last update</th><th>Updates itself</th><th></th></tr></thead><tbody>
        ${feeds.map((f) => `<tr><td><b>${esc(f.name)}</b>${f.lastError ? `<br><span style="color:var(--hivis)">${esc(f.lastError)}</span>` : ''}</td>
          <td>${state.products.filter((p) => p.source === f.id).length}</td>
          <td>${f.lastRun ? new Date(f.lastRun).toLocaleString() : ''}${f.lastResult ? `<br><span class="muted">${f.lastResult.added} added, ${f.lastResult.updated} updated, ${f.lastResult.hidden} hidden</span>` : ''}</td>
          <td>${f.url ? 'Daily, from its link' : '<span class="muted">No, upload again to update</span>'}</td>
          <td><div class="row-actions">${f.url ? `<button class="btn" data-feed-sync="${esc(f.id)}">Update now</button>` : ''}<button class="btn danger" data-feed-remove="${esc(f.id)}">Remove</button></div></td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
      <div class="panel"><h2>Import from CJ Dropshipping</h2>
      ${on ? `<p class="muted">Search CJ's catalog, pick a department and a markup, and the product is added to your store with its photos, options and CJ cost.</p>
      <form id="cj-search" class="row-actions" style="margin-top:14px">
        <label class="field" style="flex:1;min-width:220px"><span>Search CJ</span><input name="q" placeholder="cordless drill, safety gloves" required></label>
        <label class="field"><span>Add to department</span><select name="category">${cats}</select></label>
        <label class="field" style="width:130px"><span>Price = cost ×</span><input name="markup" type="number" step="0.1" min="1" value="2.2"></label>
        <button class="btn btn-primary" style="align-self:end">Search</button>
      </form><div id="cj-results"></div>`
      : `<p>Add your CJ API key in Cloudflare as a secret named <b>CJ_API_KEY</b>, then reload.</p>`}</div>`;
  }

  const FIELDS = [['title', 'Product title', true], ['sku', 'SKU or item number'], ['cost', 'Your cost (what the supplier charges you)'], ['retail', 'Retail or list price'], ['images', 'Image link'], ['description', 'Description'], ['category', 'Supplier category (helps pick the department)'], ['stock', 'Stock quantity'], ['brand', 'Brand'], ['weight', 'Weight']];
  function renderMapping(pre) {
    const box = document.getElementById('sheet-map');
    const opts = (sel) => `<option value="-1">Not in this file</option>` + pre.headers.map((h, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('');
    box.innerHTML = `<form id="sheet-run" style="margin-top:22px;border-top:1px solid var(--line);padding-top:18px">
      <h2>Match the columns</h2>
      <p class="muted">${pre.rows} product rows found${pre.rows > pre.maxRows ? `. Only the first ${pre.maxRows} are imported per file` : ''}. We guessed the columns below. Fix any that are wrong.</p>
      <div class="form-grid" style="margin-top:14px">
        ${FIELDS.map(([f, label, req]) => `<label class="field"><span>${label}${req ? ' (required)' : ''}</span><select name="map-${f}">${opts(pre.mapping[f])}</select></label>`).join('')}
        <label class="field"><span>How to set your selling price</span><select name="priceMode"><option value="cost">Your cost × markup</option><option value="retail">Use the retail price column as is</option></select></label>
        <label class="field"><span>Markup (cost ×)</span><input name="markup" type="number" step="0.1" min="1" value="2"></label>
        <label class="field"><span>Department when we cannot tell</span><select name="category">${state.data.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        ${state.sheet.url ? `<label class="tick"><input type="checkbox" name="keepSynced" checked> Re-read this link every day to update prices and stock</label>` : ''}
      </div>
      <div class="scroll" style="margin-top:14px"><table class="list"><thead><tr>${pre.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${pre.sample.map((r) => `<tr>${pre.headers.map((_, i) => `<td>${esc(String(r[i] ?? '').slice(0, 60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="row-actions" style="margin-top:16px"><button class="btn btn-primary btn-lg">Import products</button></div></form>`;
  }

  function settingsView() {
    const s = state.data.settings;
    return `<form class="panel" id="settings"><h2>Store settings</h2><div class="form-grid">
        <label class="field"><span>Store name</span><input name="storeName" value="${esc(s.storeName)}" required></label>
        <label class="field"><span>Support email</span><input name="supportEmail" type="email" value="${esc(s.supportEmail)}"></label>
        <label class="field full"><span>Tagline</span><input name="tagline" value="${esc(s.tagline)}"></label>
        <label class="field full"><span>Announcement bar (leave empty to hide)</span><input name="announcement" value="${esc(s.announcement)}"></label>
        <label class="field"><span>US shipping, flat rate ($)</span><input name="domesticFlat" inputmode="decimal" value="${dollars(s.shipping.domesticFlat) || '0'}"></label>
        <label class="field"><span>Free US shipping over ($, 0 to turn off)</span><input name="freeOver" inputmode="decimal" value="${dollars(s.shipping.freeOver) || '0'}"></label>
        <label class="field"><span>International shipping, flat rate ($)</span><input name="internationalFlat" inputmode="decimal" value="${dollars(s.shipping.internationalFlat) || '0'}"></label>
        <label class="field"><span>Sales tax (%)</span><input name="taxRate" inputmode="decimal" value="${esc(s.taxRate)}"></label>
      </div>
      <h2 style="margin-top:26px">Automation</h2><div class="form-grid">
        <label class="tick full"><input type="checkbox" name="autoForwardCJ"${s.autoForwardCJ ? ' checked' : ''}> Send paid orders to CJ Dropshipping automatically</label>
        <label class="tick full"><input type="checkbox" name="cjPayFromBalance"${s.cjPayFromBalance ? ' checked' : ''}> Also pay CJ from my CJ wallet balance, so orders ship with no action from me</label>
        <p class="muted full">With the second box off, each order is created in your CJ account and waits for you to pay it there. With it on, CJ takes the product and shipping cost from your CJ balance as soon as a customer pays.</p>
        <label class="field"><span>CJ ships from (country code)</span><input name="cjFromCountry" value="${esc(s.cjFromCountry || 'CN')}" maxlength="2"></label>
        <label class="field"><span>Preferred CJ shipping method (empty = cheapest)</span><input name="cjLogistic" value="${esc(s.cjLogistic || '')}" placeholder="CJPacket Ordinary"></label>
      </div>
      <div class="row-actions" style="margin-top:18px"><button class="btn btn-primary">Save settings</button></div></form>`;
  }

  /* ---------- Order dialog ---------- */
  async function openOrder(id) {
    let o;
    try { o = (await api('orders/' + id)).order; } catch (err) { return fail(err); }
    const a = o.address;
    dlg.innerHTML = `<div class="dlg-head"><h2>Order ${esc(o.id)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="dlg-body" id="order-form">
        <div class="form-grid">
          <div><b>${esc(o.customer.name)}</b><br>${esc(o.customer.email)}<br>${esc(o.customer.phone)}</div>
          <div>${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.zip)}<br>${esc(a.country)}</div>
        </div>
        <div class="scroll"><table class="list"><thead><tr><th>Item</th><th>Qty</th><th>Paid</th><th>Supplier</th></tr></thead><tbody>
          ${o.lines.map((l) => `<tr><td>${esc(l.title)}${l.variantName ? `<br><span class="muted">${esc(l.variantName)}</span>` : ''}</td><td>${l.qty}</td><td>${usd(l.total)}</td><td>${l.sku ? 'SKU ' + esc(l.sku) : ''}${l.cjVid ? `<br><span class="muted">CJ variant ${esc(l.cjVid)}</span>` : l.cjPid ? `<br><span class="muted">CJ product ${esc(l.cjPid)}</span>` : ''}${l.supplierUrl ? `<br><a href="${esc(l.supplierUrl)}" target="_blank" rel="noopener">Open supplier page</a>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <p>Subtotal ${usd(o.totals.subtotal)}, shipping ${usd(o.totals.shipping)}${o.totals.tax ? ', tax ' + usd(o.totals.tax) : ''}. <b>Total ${usd(o.totals.total)}</b>${o.payment?.captureId ? `<br><span class="muted">PayPal capture ${esc(o.payment.captureId)}</span>` : ''}</p>
        ${o.status === 'test' || o.status === 'pending_payment' ? '' : `<div class="notice" style="margin:0">${o.cj?.orderId
          ? `<b>Sent to CJ</b> (CJ order ${esc(o.cj.orderId)}, ${esc(o.cj.status || '')}${o.cj.logistic ? ', ' + esc(o.cj.logistic) : ''}${o.cj.total ? ', ' + usd(o.cj.total) : ''}). ${o.cj.paid ? 'Paid from your CJ balance.' : 'Pay it in your CJ account so it ships.'}${o.cj.note ? ' ' + esc(o.cj.note) : ''} <button type="button" class="link-btn" data-cj-sync="${esc(o.id)}">Check CJ for tracking</button>`
          : `${o.cj?.error ? `<b>CJ did not accept this order:</b> ${esc(o.cj.error)} ` : 'Not sent to CJ yet. '}${o.lines.some((l) => l.cjVid) ? `<button type="button" class="link-btn" data-cj-send="${esc(o.id)}">Send to CJ now</button>` : 'None of these items are CJ products, so order them from their supplier.'}`}</div>`}
        <div class="form-grid">
          <label class="field"><span>Status</span><select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Carrier</span><input name="carrier" value="${esc(o.carrier)}" placeholder="USPS, UPS, YunExpress"></label>
          <label class="field full"><span>Tracking number (the customer sees this)</span><input name="tracking" value="${esc(o.tracking)}"></label>
          <label class="field full"><span>Private note</span><textarea name="note">${esc(o.note)}</textarea></label>
        </div>
        <div class="row-actions"><button class="btn btn-primary">Save order</button><a class="btn" target="_blank" rel="noopener" href="/order/${esc(o.id)}?key=${esc(o.accessKey)}">Open customer page</a></div>
      </form>`;
    dlg.showModal();
    document.getElementById('order-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      try {
        await api('orders/' + o.id, { method: 'PUT', body: { status: f.status.value, carrier: f.carrier.value, tracking: f.tracking.value, note: f.note.value } });
        dlg.close(); toast('Order saved'); load();
      } catch (err) { fail(err); }
    });
  }

  /* ---------- Product dialog ---------- */
  function openProduct(p) {
    const isNew = !p;
    p = p || { title: '', category: state.data.categories[0].id, price: 0, images: [], specs: [], variants: [], active: true };
    dlg.innerHTML = `<div class="dlg-head"><h2>${isNew ? 'Add product' : 'Edit product'}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <form class="dlg-body" id="product-form"><div class="form-grid">
        <label class="field full"><span>Title</span><input name="title" value="${esc(p.title)}" required></label>
        <label class="field"><span>Department</span><select name="category">${state.data.categories.map((c) => `<option value="${c.id}"${p.category === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Price ($)</span><input name="price" inputmode="decimal" value="${dollars(p.price)}"></label>
        <label class="field"><span>Compare-at price ($, optional)</span><input name="compareAt" inputmode="decimal" value="${dollars(p.compareAt)}"></label>
        <label class="field"><span>Your cost ($, private)</span><input name="cost" inputmode="decimal" value="${dollars(p.cost)}"></label>
        <label class="field full"><span>Image links, one per line (https)</span><textarea name="images">${esc((p.images || []).join('\n'))}</textarea></label>
        <label class="field full"><span>Description</span><textarea name="description" style="min-height:130px">${esc(p.description || '')}</textarea></label>
        <label class="field full"><span>Specifications, one per line as Name: value</span><textarea name="specs">${esc((p.specs || []).map((s) => s[0] + ': ' + s[1]).join('\n'))}</textarea></label>
        <label class="field full"><span>Options, one per line as Name | price | SKU (leave empty for a single-price product)</span><textarea name="variants">${esc((p.variants || []).map((v) => [v.name, dollars(v.price), v.sku || ''].join(' | ')).join('\n'))}</textarea></label>
        <label class="field"><span>SKU</span><input name="sku" value="${esc(p.sku || '')}"></label>
        <label class="field"><span>Supplier page link (private)</span><input name="supplierUrl" value="${esc(p.supplierUrl || '')}" placeholder="https://"></label>
        <label class="tick"><input type="checkbox" name="active"${p.active !== false ? ' checked' : ''}> Live on the store</label>
        <label class="tick"><input type="checkbox" name="featured"${p.featured ? ' checked' : ''}> Feature on the home page</label>
      </div>
      <div class="row-actions"><button class="btn btn-primary">Save product</button>${isNew ? '' : '<button type="button" class="btn danger" data-delete>Delete product</button>'}</div></form>`;
    dlg.showModal();
    const form = document.getElementById('product-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const lines = (name) => f[name].value.split('\n').map((l) => l.trim()).filter(Boolean);
      const old = p.variants || [];
      const body = {
        id: p.id, title: f.title.value, category: f.category.value, price: toCents(f.price.value), compareAt: toCents(f.compareAt.value), cost: toCents(f.cost.value),
        images: lines('images'), description: f.description.value,
        specs: lines('specs').map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(Boolean),
        variants: lines('variants').map((l, i) => { const [name, price, sku] = l.split('|').map((x) => (x || '').trim()); const prev = old.find((v) => v.name === name); return { id: prev?.id || 'v' + Date.now().toString(36) + i, name, price: toCents(price), sku, cjVid: prev?.cjVid || '' }; }),
        sku: f.sku.value, supplierUrl: f.supplierUrl.value, cjPid: p.cjPid || '', active: f.active.checked, featured: f.featured.checked,
      };
      try { await api('products', { method: 'POST', body }); dlg.close(); toast('Product saved'); load(); } catch (err) { fail(err); }
    });
    form.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
      try { await api('products/' + p.id, { method: 'DELETE' }); dlg.close(); toast('Product deleted'); load(); } catch (err) { fail(err); }
    });
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-logout],[data-order],[data-product],[data-new-product],[data-remove-samples],[data-close],[data-cj],[data-cj-send],[data-cj-sync],[data-feed-sync],[data-feed-remove]');
    if (!t) return;
    if (t.dataset.tab) { state.tab = t.dataset.tab; return render(); }
    if (t.matches('[data-close]')) return dlg.close();
    if (t.matches('[data-logout]')) { await api('logout', { method: 'POST' }); return renderLogin(); }
    if (t.dataset.order) return openOrder(t.dataset.order);
    if (t.dataset.product) return openProduct(state.products.find((p) => p.id === t.dataset.product));
    if (t.matches('[data-new-product]')) return openProduct(null);
    if (t.matches('[data-remove-samples]')) {
      if (!confirm('Remove every sample product from the store? Products you added or imported stay.')) return;
      try { await api('products/samples', { method: 'DELETE' }); toast('Sample products removed'); load(); } catch (err) { fail(err); }
      return;
    }
    if (t.dataset.cjSend || t.dataset.cjSync) {
      const id = t.dataset.cjSend || t.dataset.cjSync;
      t.disabled = true;
      try { await api('orders/' + id + (t.dataset.cjSend ? '/cj' : '/cj-sync'), { method: 'POST' }); toast(t.dataset.cjSend ? 'Order sent to CJ' : 'Checked CJ'); dlg.close(); await load(); openOrder(id); }
      catch (err) { t.disabled = false; fail(err); }
      return;
    }
    if (t.dataset.feedSync) {
      t.disabled = true; t.textContent = 'Updating…';
      try { await api('feeds/' + t.dataset.feedSync + '/sync', { method: 'POST' }); toast('Supplier updated'); load(); } catch (err) { t.disabled = false; t.textContent = 'Update now'; fail(err); }
      return;
    }
    if (t.dataset.feedRemove) {
      if (!confirm('Remove this supplier and every product imported from it? This cannot be undone.')) return;
      try { await api('feeds/' + t.dataset.feedRemove + '?products=1', { method: 'DELETE' }); toast('Supplier removed'); load(); } catch (err) { fail(err); }
      return;
    }
    if (t.dataset.cj) {
      const f = document.getElementById('cj-search');
      t.disabled = true; t.textContent = 'Importing…';
      try { await api('cj/import', { method: 'POST', body: { pid: t.dataset.cj, category: f.category.value, markup: f.markup.value } }); t.textContent = 'Imported'; toast('Product imported'); const prod = await api('products'); state.products = prod.products; }
      catch (err) { t.disabled = false; t.textContent = 'Import'; fail(err); }
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-row]')) e.target.click(); });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'product-filter') return;
    state.filter = e.target.value; render();
    const box = document.getElementById('product-filter'); box.focus(); box.setSelectionRange(box.value.length, box.value.length);
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'sheet-form') {
      e.preventDefault(); const f = e.target;
      const file = f.file.files[0]; const url = f.url.value.trim();
      if (!file && !url) return toast('Choose a file or paste a link first.');
      try {
        state.sheet = { supplier: f.supplier.value.trim(), url: file ? '' : url, csv: file ? await file.text() : '' };
        renderMapping(await api('import/preview', { method: 'POST', body: state.sheet.url ? { url: state.sheet.url } : { csv: state.sheet.csv } }));
      } catch (err) { fail(err); }
    }
    if (e.target.id === 'sheet-run') {
      e.preventDefault(); const f = e.target; const btn = f.querySelector('button');
      const mapping = Object.fromEntries(FIELDS.map(([k]) => [k, parseInt(f['map-' + k].value, 10)]));
      btn.disabled = true; btn.textContent = 'Importing…';
      try {
        const { result } = await api('import/run', { method: 'POST', body: { supplier: state.sheet.supplier, ...(state.sheet.url ? { url: state.sheet.url, keepSynced: f.keepSynced?.checked } : { csv: state.sheet.csv }), mapping, options: { priceMode: f.priceMode.value, markup: f.markup.value, category: f.category.value } } });
        toast(`${result.added} added, ${result.updated} updated, ${result.skipped} skipped`);
        state.sheet = null; await load();
      } catch (err) { btn.disabled = false; btn.textContent = 'Import products'; fail(err); }
    }
    if (e.target.id === 'settings') {
      e.preventDefault(); const f = e.target;
      try {
        await api('settings', { method: 'PUT', body: { storeName: f.storeName.value, supportEmail: f.supportEmail.value, tagline: f.tagline.value, announcement: f.announcement.value, taxRate: parseFloat(f.taxRate.value) || 0, autoForwardCJ: f.autoForwardCJ.checked, cjPayFromBalance: f.cjPayFromBalance.checked, cjFromCountry: f.cjFromCountry.value, cjLogistic: f.cjLogistic.value,
          shipping: { domesticFlat: toCents(f.domesticFlat.value), freeOver: toCents(f.freeOver.value), internationalFlat: toCents(f.internationalFlat.value) } } });
        toast('Settings saved'); load();
      } catch (err) { fail(err); }
    }
    if (e.target.id === 'cj-search') {
      e.preventDefault();
      const box = document.getElementById('cj-results');
      box.innerHTML = '<p class="muted" style="margin-top:14px">Searching CJ…</p>';
      try {
        const { results } = await api('cj/search?q=' + encodeURIComponent(e.target.q.value));
        const m = parseFloat(e.target.markup.value) || 2;
        box.innerHTML = results.length ? `<div class="cj-grid">${results.map((r) => `<div class="cj-item"><img src="${esc(r.image)}" alt="" loading="lazy"><b>${esc(r.title)}</b><span class="muted">Cost ${usd(r.cost)}, sells near ${usd(r.cost * m)}</span><button class="btn btn-line" data-cj="${esc(r.pid)}">Import</button></div>`).join('')}</div>`
          : '<p class="muted" style="margin-top:14px">CJ has no products matching that search. Try fewer words.</p>';
      } catch (err) { box.innerHTML = `<p class="form-error" style="margin-top:14px">${esc(err.message)}</p>`; }
    }
  });

  start().catch(fail);
})();
