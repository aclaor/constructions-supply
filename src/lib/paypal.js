// PayPal Orders v2. Totals always come from the server-side order, never from the browser.
export const paypalReady = (env) => Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
const base = (env) => (String(env.PAYPAL_ENV || 'live').toLowerCase() === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
const amt = (cents) => (cents / 100).toFixed(2);

async function accessToken(env) {
  const res = await fetch(base(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal sign-in failed (' + res.status + '). Check the client ID, secret and PAYPAL_ENV.');
  return (await res.json()).access_token;
}

export async function createPaypalOrder(env, order, settings) {
  const token = await accessToken(env);
  const cur = settings.currency;
  const t = order.totals;
  const a = order.address;
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: order.id,
      custom_id: order.id,
      invoice_id: order.id,
      description: (settings.storeName + ' order ' + order.id).slice(0, 127),
      amount: {
        currency_code: cur,
        value: amt(t.total),
        breakdown: {
          item_total: { currency_code: cur, value: amt(t.subtotal) },
          shipping: { currency_code: cur, value: amt(t.shipping) },
          tax_total: { currency_code: cur, value: amt(t.tax) },
        },
      },
      items: order.lines.map((l) => ({
        name: (l.title + (l.variantName ? ' – ' + l.variantName : '')).slice(0, 127),
        quantity: String(l.qty),
        unit_amount: { currency_code: cur, value: amt(l.unit) },
        category: 'PHYSICAL_GOODS',
      })),
      shipping: {
        name: { full_name: order.customer.name.slice(0, 300) },
        address: {
          address_line_1: a.line1, address_line_2: a.line2 || undefined,
          admin_area_2: a.city, admin_area_1: a.state || undefined,
          postal_code: a.zip, country_code: a.country,
        },
      },
    }],
    application_context: { brand_name: settings.storeName.slice(0, 127), shipping_preference: 'SET_PROVIDED_ADDRESS', user_action: 'PAY_NOW' },
  };
  const res = await fetch(base(env) + '/v2/checkout/orders', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'paypal-request-id': order.id },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const detail = data?.details?.[0]?.description || data?.message || 'PayPal could not start this payment.';
    throw new Error(detail);
  }
  return data.id;
}

/** Captures the payment and returns { ok, captureId, payerEmail } only when the full order total was paid. */
export async function capturePaypalOrder(env, paypalOrderId, order, settings) {
  const token = await accessToken(env);
  const res = await fetch(base(env) + '/v2/checkout/orders/' + encodeURIComponent(paypalOrderId) + '/capture', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'paypal-request-id': 'cap-' + order.id },
  });
  const data = await res.json().catch(() => ({}));
  const unit = data?.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  const paid = res.ok && data.status === 'COMPLETED' && cap?.status === 'COMPLETED'
    && cap.amount?.value === amt(order.totals.total) && cap.amount?.currency_code === settings.currency;
  if (!paid) {
    const pending = cap?.status === 'PENDING';
    return { ok: false, pending, error: data?.details?.[0]?.description || (pending ? 'Payment is pending review at PayPal.' : 'Payment was not completed.') };
  }
  return { ok: true, captureId: cap.id, payerEmail: data?.payer?.email_address || '' };
}
