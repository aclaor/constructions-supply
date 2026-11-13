// Checkout: collects the address, then pays through PayPal (or places a test order when PayPal is not connected).
(function () {
  const root = document.querySelector('[data-checkout]');
  if (!root) return;
  const form = document.getElementById('checkout-form');
  const errorBox = document.getElementById('checkout-error');
  const country = form.elements.country;

  window.checkoutCountry = country.value;
  window.renderCart(country.value);
  country.addEventListener('change', () => { window.checkoutCountry = country.value; window.renderCart(country.value); });

  function showError(msg) {
    errorBox.textContent = msg; errorBox.hidden = !msg;
    if (msg) errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function payload() {
    const v = (n) => form.elements[n].value.trim();
    return {
      items: window.Cart.read(),
      customer: { email: v('email'), name: v('name'), phone: v('phone') },
      address: { line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), zip: v('zip'), country: v('country') },
    };
  }

  function formOk() {
    if (!window.Cart.count()) { showError('Your cart is empty. Add a product before checking out.'); return false; }
    if (!form.checkValidity()) { form.reportValidity(); showError('Fill in your contact and shipping details first.'); return false; }
    showError('');
    return true;
  }

  async function post(path, data) {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Something went wrong. Try again.');
    return out;
  }

  const testBtn = document.getElementById('test-order');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      if (!formOk()) return;
      testBtn.disabled = true;
      try { location.href = (await post('/api/checkout/test', payload())).redirect; }
      catch (err) { showError(err.message); testBtn.disabled = false; }
    });
  }

  const clientId = root.dataset.paypal;
  if (clientId) {
    const s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) + '&currency=' + encodeURIComponent(root.dataset.currency) + '&intent=capture';
    s.onerror = () => showError('PayPal could not load. Turn off any ad blocker for this page and reload.');
    s.onload = () => {
      let orderId = '';
      window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'pay' },
        onClick: (data, actions) => (formOk() ? actions.resolve() : actions.reject()),
        createOrder: async () => {
          const out = await post('/api/checkout/paypal/create', payload());
          orderId = out.orderId;
          return out.paypalOrderId;
        },
        onApprove: async (data) => {
          try { location.href = (await post('/api/checkout/paypal/capture', { orderId, paypalOrderId: data.orderID })).redirect; }
          catch (err) { showError(err.message); }
        },
        onError: (err) => showError((err && err.message) || 'The payment did not go through. You have not been charged. Try again.'),
      }).render('#paypal-buttons');
    };
    document.head.appendChild(s);
  }
})();
