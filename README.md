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
| `RESEND_API_KEY` | Optional. From resend.com, to send order and shipping emails. |
| `EMAIL_FROM` | Needed with the Resend key, e.g. `Leeys Build Supply <orders@yourdomain.com>`. The domain must be verified in Resend. |
| `PAYPAL_ENV` | Optional. Set to `sandbox` to test with sandbox keys. Defaults to `live`. |

Until the PayPal secrets are set, checkout only places clearly labelled test orders and no money moves.

## Before launch

- The 32 products in the store are **samples** with placeholder artwork. In `/admin` → Products, add your real products, then use "Remove sample products".
- Set your support email and shipping rates in `/admin` → Settings.
- Read the policy text in `src/data/policies.js` (shipping times, returns) and change it to match what you actually offer.
- Departments live in `src/data/seed.js` (`CATEGORIES`).

## What runs by itself

- **After a payment**: the customer gets a confirmation email, you get a new-order email (sent to the support email in Settings), and the order is created in your CJ account with the cheapest shipping method (or your preferred one).
- **Paying CJ**: off by default, so CJ orders wait for you to pay them. Turn on "pay CJ from my CJ wallet balance" in Settings and orders ship with no action from you.
- **Every 3 hours**: tracking numbers are pulled from CJ, the order is marked Shipped, and the customer is emailed the tracking number.
- **Every day**: supplier files imported from a link are re-read, so prices and stock update, sold-out products are hidden and removed ones are taken down.

## Importing products

- **CJ Dropshipping**: `/admin` → Import products → search and import with a markup.
- **Any other supplier (VEVOR, Inventory Source, Wholesale2B ...)**: upload their CSV file or paste its direct link, match the columns, choose a markup. Importing the same supplier again updates products instead of duplicating them. Up to 3,000 rows per file and 4,000 products in total.

Orders for products that did not come from CJ are not forwarded automatically: place those with the supplier, then paste the tracking number into the order.

## Run locally

```
npm install
echo "ADMIN_PASSWORD=choose-something" > .dev.vars
npm run dev
```
