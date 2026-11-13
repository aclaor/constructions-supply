// Customer and owner emails through Resend (https://resend.com). Optional: without the keys nothing is sent.
import { esc, money } from './util.js';

export const emailReady = (env) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

async function send(env, { to, subject, html, replyTo }) {
  if (!emailReady(env) || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) console.error('Email failed', res.status, await res.text());
    return res.ok;
  } catch (err) { console.error('Email failed', err); return false; }
}

function shell(settings, heading, inner) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#14212B;max-width:560px;margin:0 auto">
<div style="background:#FFC61A;padding:14px 20px;font-weight:bold;font-size:18px;border-bottom:3px solid #14212B">${esc(settings.storeName)}</div>
<div style="padding:22px 20px"><h1 style="font-size:22px;margin:0 0 14px">${esc(heading)}</h1>${inner}</div>
<div style="padding:14px 20px;color:#55636E;font-size:13px;border-top:1px solid #D3D9DD">${settings.supportEmail ? `Questions? Reply to this email or write to ${esc(settings.supportEmail)}.` : ''}</div></div>`;
}

function itemsTable(order) {
  const cur = order.currency;
  const row = (a, b, bold) => `<tr><td style="padding:6px 0;${bold ? 'font-weight:bold;border-top:2px solid #14212B' : ''}">${a}</td><td style="padding:6px 0;text-align:right;${bold ? 'font-weight:bold;border-top:2px solid #14212B' : ''}">${b}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:15px">
${order.lines.map((l) => row(`${esc(l.title)}${l.variantName ? ' (' + esc(l.variantName) + ')' : ''} × ${l.qty}`, money(l.total, cur))).join('')}
${row('Shipping', order.totals.shipping ? money(order.totals.shipping, cur) : 'Free')}${order.totals.tax ? row('Tax', money(order.totals.tax, cur)) : ''}
${row('Total', money(order.totals.total, cur), true)}</table>`;
}
const button = (href, label) => `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#14212B;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:bold">${label}</a></p>`;
const orderLink = (order) => `${order.origin || ''}/order/${order.id}?key=${order.accessKey}`;

export function sendOrderEmail(env, settings, order, kind) {
  const first = esc(order.customer.name.split(' ')[0]);
  const a = order.address;
  if (kind === 'shipped') {
    return send(env, {
      to: order.customer.email, replyTo: settings.supportEmail,
      subject: `Your ${settings.storeName} order ${order.id} has shipped`,
      html: shell(settings, 'Your order is on its way', `<p>Hi ${first}, order <b>${esc(order.id)}</b> has shipped.</p>
<p>${order.carrier ? esc(order.carrier) + ' ' : ''}tracking number: <b>${esc(order.tracking)}</b></p>${button(orderLink(order), 'Follow your delivery')}${itemsTable(order)}`),
    });
  }
  return send(env, {
    to: order.customer.email, replyTo: settings.supportEmail,
    subject: `${settings.storeName} order ${order.id} confirmed`,
    html: shell(settings, 'Thanks for your order', `<p>Hi ${first}, we received your order <b>${esc(order.id)}</b> and are getting it ready.</p>
${itemsTable(order)}<p style="margin-top:18px"><b>Shipping to</b><br>${esc(order.customer.name)}<br>${esc(a.line1)}${a.line2 ? '<br>' + esc(a.line2) : ''}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.zip)}, ${esc(a.country)}</p>
${button(orderLink(order), 'View your order')}<p>We email you again with a tracking number when it ships.</p>`),
  });
}

export function notifyOwner(env, settings, order, note) {
  if (!settings.supportEmail) return false;
  return send(env, {
    to: settings.supportEmail,
    subject: `New order ${order.id} for ${money(order.totals.total, order.currency)}`,
    html: shell(settings, 'New paid order', `<p><b>${esc(order.id)}</b> from ${esc(order.customer.name)} (${esc(order.customer.email)}).</p>${itemsTable(order)}
${note ? `<p style="background:#FFF6D6;padding:10px 12px;border-radius:4px">${esc(note)}</p>` : ''}${button((order.origin || '') + '/admin/', 'Open the admin')}`),
  });
}
