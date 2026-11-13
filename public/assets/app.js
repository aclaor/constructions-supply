// Storefront behaviour: cart (kept in this browser), cart drawer, product page controls.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const Cart = {
    read() { try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; } },
    write(items) { try { localStorage.setItem('cart', JSON.stringify(items)); } catch {} updateCount(); },
    add(id, variant, qty) {
      const items = Cart.read();
      const line = items.find((i) => i.id === id && (i.variant || '') === (variant || ''));
      if (line) line.qty = Math.min(99, line.qty + qty); else items.push({ id, variant: variant || '', qty });
      Cart.write(items);
    },
    set(id, variant, qty) {
      let items = Cart.read();
      if (qty <= 0) items = items.filter((i) => !(i.id === id && (i.variant || '') === variant));
      else items.forEach((i) => { if (i.id === id && (i.variant || '') === variant) i.qty = Math.min(99, qty); });
      Cart.write(items);
    },
    count() { return Cart.read().reduce((s, i) => s + i.qty, 0); },
  };
  window.Cart = Cart;

  function updateCount() { $$('[data-cart-count]').forEach((el) => { el.textContent = Cart.count(); }); }

  let toastTimer;
  function toast(msg) {
    const t = $('.toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  async function priced(country) {
    const res = await fetch('/api/cart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: Cart.read(), country: country || '' }) });
    if (!res.ok) throw new Error('cart');
    return res.json();
  }

  function totalsHtml(c, mode) {
    return `<dl class="totals"><dt>Subtotal</dt><dd>${esc(c.subtotal)}</dd>
      <dt>Shipping</dt><dd>${mode === 'summary' ? esc(c.shipping) : 'Calculated at checkout'}</dd>
      ${mode === 'summary' && c.tax ? `<dt>Tax</dt><dd>${esc(c.tax)}</dd>` : ''}
      ${mode === 'summary' ? `<dt class="grand">Total</dt><dd class="grand">${esc(c.total)}</dd>` : ''}</dl>`;
  }

  async function renderCart(country) {
    const views = $$('[data-cart-view]');
    if (!views.length) return;
    let c;
    try { c = await priced(country); } catch {
      views.forEach((v) => { v.innerHTML = '<p class="form-error">The cart could not load. Check your connection and reload the page.</p>'; });
      return;
    }
    // Drop anything the store no longer sells.
    const valid = Cart.read().filter((i) => c.lines.some((l) => l.id === i.id));
    if (valid.length !== Cart.read().length) Cart.write(valid);
    views.forEach((v) => {
      const mode = v.dataset.cartView;
      if (!c.lines.length) {
        v.innerHTML = `<div class="cart-empty"><p>Your cart is empty.</p><a class="btn btn-primary" href="/collections/all">Browse products</a></div>`;
        return;
      }
      const lines = c.lines.map((l) => `<li>
        <img src="${esc(l.image)}" alt="" width="64" height="64">
        <div><a href="/products/${esc(l.slug)}">${esc(l.title)}</a>${l.variantName ? `<small>${esc(l.variantName)}</small>` : ''}
          ${mode === 'summary' ? `<small>Qty ${l.qty}</small>` : `<div class="line-tools"><div class="qty" role="group" aria-label="Quantity for ${esc(l.title)}">
            <button type="button" data-line="${esc(l.id)}" data-variant="${esc(l.variant)}" data-set="${l.qty - 1}" aria-label="Decrease quantity">−</button><span>${l.qty}</span>
            <button type="button" data-line="${esc(l.id)}" data-variant="${esc(l.variant)}" data-set="${l.qty + 1}" aria-label="Increase quantity">+</button></div>
            <button type="button" class="link-btn" data-line="${esc(l.id)}" data-variant="${esc(l.variant)}" data-set="0">Remove</button></div>`}
        </div><b>${esc(l.total)}</b></li>`).join('');
      v.innerHTML = `<ul class="lines">${lines}</ul>
        ${c.freeShippingGap && mode !== 'summary' ? `<p class="ship-gap">Add ${esc(c.freeShippingGap)} more for free US shipping.</p>` : ''}
        ${totalsHtml(c, mode)}
        ${mode === 'summary' ? '' : `<div class="cart-actions"><a class="btn btn-primary btn-lg" href="/checkout">Check out</a>${mode === 'drawer' ? '<a class="btn" href="/cart">View cart</a>' : '<a class="btn" href="/collections/all">Keep shopping</a>'}</div>`}`;
    });
    document.dispatchEvent(new CustomEvent('cart:rendered', { detail: c }));
  }
  window.renderCart = renderCart;

  const drawer = $('#cart-drawer');
  const backdrop = $('.drawer-backdrop');
  let lastFocus;
  function openDrawer() {
    if (location.pathname === '/cart' || location.pathname === '/checkout') { location.href = '/cart'; return; }
    lastFocus = document.activeElement;
    drawer.hidden = false; backdrop.hidden = false;
    renderCart();
    $('.icon-btn', drawer).focus();
  }
  function closeDrawer() { drawer.hidden = true; backdrop.hidden = true; if (lastFocus) lastFocus.focus(); }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.matches('[data-cart-open]')) return openDrawer();
    if (t.matches('[data-cart-close]')) return closeDrawer();
    if (t.dataset.add) { Cart.add(t.dataset.add, '', 1); toast('Added to cart'); return openDrawer(); }
    if (t.dataset.line) { Cart.set(t.dataset.line, t.dataset.variant || '', parseInt(t.dataset.set, 10)); return renderCart(window.checkoutCountry); }
    if (t.dataset.qty) { const q = $('#qty'); q.value = Math.min(99, Math.max(1, (parseInt(q.value, 10) || 1) + parseInt(t.dataset.qty, 10))); return; }
    if (t.dataset.thumb) {
      $('#main-image').src = t.dataset.thumb;
      $$('[data-thumb]').forEach((b) => b.removeAttribute('aria-current')); t.setAttribute('aria-current', 'true');
    }
  });
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer && !drawer.hidden) closeDrawer(); });

  const buy = $('.buy-form');
  if (buy) {
    const addFromForm = () => {
      const qty = Math.min(99, Math.max(1, parseInt($('#qty').value, 10) || 1));
      Cart.add(buy.dataset.product, $('#variant')?.value || '', qty);
    };
    buy.addEventListener('submit', (e) => { e.preventDefault(); addFromForm(); toast('Added to cart'); openDrawer(); });
    $('[data-buy-now]', buy).addEventListener('click', () => { addFromForm(); location.href = '/checkout'; });
    $('#variant')?.addEventListener('change', (e) => { $('#price').textContent = e.target.selectedOptions[0].dataset.price; });
  }

  updateCount();
  if ($('[data-cart-view="page"]')) renderCart();
  window.addEventListener('storage', updateCount);
})();
