# Leeys Build Supply

A construction supply dropshipping store that runs on one Cloudflare Worker. No Shopify, no database server.

- **Storefront**: home, 8 departments, product pages with options, search, cart, checkout, order tracking, policy pages, sitemap.
- **Checkout**: PayPal (PayPal balance or card). Prices, shipping and totals are always calculated on the server.
- **Admin** at `/admin`: orders and tracking numbers, add and edit products, import from CJ Dropshipping, shipping rates and store settings.
- **Storage**: Cloudflare KV (`STORE`), created automatically on first deploy.

## Deploy on Cloudflare

1. Cloudflare dashboard → Workers & Pages → Create → Import a repository → pick `constructions-supply`.
2. Keep the defaults (deploy command `npx wrangler deploy`). The KV namespace is created for you.
3. Open the Worker → Settings → Variables and Secrets and add these as **secrets**:

| Name | What it is |
| --- | --- |
| `ADMIN_PASSWORD` | Password for `/admin`. Use a long one. |
| `PAYPAL_CLIENT_ID` | From your PayPal app (developer.paypal.com → Apps & Credentials → Live). |
| `PAYPAL_CLIENT_SECRET` | Same PayPal app. |
| `CJ_API_KEY` | Optional. CJ Dropshipping → My CJ → Authorization → API. |
| `PAYPAL_ENV` | Optional. Set to `sandbox` to test with sandbox keys. Defaults to `live`. |

Until the PayPal secrets are set, checkout only places clearly labelled test orders and no money moves.

## Before launch

- The 32 products in the store are **samples** with placeholder artwork. In `/admin` → Products, add your real products, then use "Remove sample products".
- Set your support email and shipping rates in `/admin` → Settings.
- Read the policy text in `src/data/policies.js` (shipping times, returns) and change it to match what you actually offer.
- Departments live in `src/data/seed.js` (`CATEGORIES`).

## Fulfilling an order

1. A paid order shows in `/admin` → Orders with the customer's address and each item's SKU and CJ IDs.
2. Place the order with your supplier.
3. Paste the tracking number into the order and save. The status changes to Shipped and the customer sees the tracking number on their order page.

## Run locally

```
npm install
echo "ADMIN_PASSWORD=choose-something" > .dev.vars
npm run dev
```
