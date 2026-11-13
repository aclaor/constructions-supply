// Bulk product import from any supplier spreadsheet (CSV, semicolon or tab separated).
import { slugify, clean } from './util.js';
import { CATEGORIES } from '../data/seed.js';

export const MAX_ROWS = 3000;
export const MAX_CATALOG = 4000;

export function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const delim = [',', ';', '\t', '|'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  const headers = (rows.shift() || []).map((h) => h.trim());
  return { headers, rows };
}

// Which spreadsheet column feeds which product field. First matching header wins.
const FIELD_PATTERNS = {
  title: /^(title|name|product[ _-]?(name|title)|item[ _-]?name|description[ _-]?short)$/i,
  sku: /^(sku|item[ _-]?(number|no|code|sku)|product[ _-]?(id|code|sku)|model|mpn|part[ _-]?(number|no)|id)$/i,
  cost: /(cost|wholesale|dropship[ _-]?price|dealer|your[ _-]?price|net[ _-]?price|^price$|unit[ _-]?price)/i,
  retail: /(msrp|rrp|retail|list[ _-]?price|map|suggested|selling[ _-]?price)/i,
  images: /(image|img|photo|picture|thumbnail)/i,
  description: /^(description|long[ _-]?description|details|body|body[ _-]?html|product[ _-]?description|features)$/i,
  category: /(categor|department|product[ _-]?type|^type$)/i,
  stock: /(stock|qty|quantity|inventory|available)/i,
  brand: /^(brand|manufacturer|vendor|make)$/i,
  weight: /weight/i,
};
export function guessMapping(headers) {
  const map = {};
  for (const [field, re] of Object.entries(FIELD_PATTERNS)) {
    const i = headers.findIndex((h) => re.test(h.trim()));
    map[field] = i; // -1 when the sheet has no such column
  }
  return map;
}

const CATEGORY_WORDS = [
  ['measuring', /\b(tape measure|measur\w*|level|laser|square|caliper|ruler|gauge|chalk line|stud finder|protractor)\b/i],
  ['safety', /\b(gloves?|helmet|hard hat|goggles?|safety|vest|respirator|mask|harness|work boots?|ear ?muffs?|knee pads?|hi-?vis)\b/i],
  ['power-tools', /\b(drill|saw|grinder|sander|cordless|impact|rotary|router|welder|welding|compressor|generator|nailer|heat gun|polisher|jack ?hammer|demolition|mixer|planer|winch|hoist)\b/i],
  ['hand-tools', /\b(hammer|wrench|pliers?|screwdrivers?|sockets?|ratchet|knife|chisel|clamps?|trowel|crowbar|pry bar|vise|shovel|tool ?(set|kit|box|bag)|cutter)\b/i],
  ['plumbing', /\b(pipe|valve|faucet|fittings?|hose|drain|pump|plumb\w*|pex|toilet|tap|shower|sink)\b/i],
  ['electrical', /\b(lights?|lamp|led|cord|cable|wire|outlet|switch|tester|multimeter|breaker|conduit|electrical|battery|charger|inverter)\b/i],
  ['paint', /\b(paint\w*|roller|brush\w*|masking|caulk\w*|spray\w*|sealant|primer|sandpaper|putty)\b/i],
  ['fasteners', /\b(screws?|bolts?|nuts?|anchors?|nails?|rivets?|washers?|staples?|fasteners?|hooks?|hinges?)\b/i],
];
export function guessCategory(text, fallback) {
  for (const [id, re] of CATEGORY_WORDS) if (re.test(text)) return id;
  return fallback;
}

function toCents(v) {
  let s = String(v ?? '').replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (/,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  return Math.max(0, Math.round(parseFloat(s) * 100) || 0);
}
const stripHtml = (s) => String(s || '').replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Merges spreadsheet rows into the catalog. Rows are matched to existing products by source + SKU,
 * so running the same sheet again updates prices and stock instead of creating duplicates.
 */
export function importRows(catalog, parsed, mapping, opts) {
  const source = opts.source || 'csv';
  const markup = Math.max(1, Number(opts.markup) || 2);
  const fallbackCat = CATEGORIES.some((c) => c.id === opts.category) ? opts.category : CATEGORIES[0].id;
  const col = (row, field) => (mapping[field] >= 0 ? String(row[mapping[field]] ?? '').trim() : '');
  // Any other column whose header looks like an image column also contributes pictures.
  const imageCols = parsed.headers.map((h, i) => (FIELD_PATTERNS.images.test(h) ? i : -1)).filter((i) => i >= 0);
  const retailPrice = (cost) => Math.max(99, Math.ceil((cost * markup) / 100) * 100 - 5);

  const bySku = new Map(catalog.filter((p) => p.source === source && p.sku).map((p) => [p.sku, p]));
  const slugs = new Set(catalog.map((p) => p.slug));
  const seen = new Set();
  const result = { added: 0, updated: 0, skipped: 0, hidden: 0, total: parsed.rows.length };
  const room = () => catalog.length < MAX_CATALOG;

  for (const row of parsed.rows.slice(0, MAX_ROWS)) {
    const title = clean(stripHtml(col(row, 'title')), 140);
    const cost = toCents(col(row, 'cost'));
    const retail = toCents(col(row, 'retail'));
    const sku = clean(col(row, 'sku'), 60) || slugify(title).slice(0, 60);
    let price, compareAt = null;
    if (opts.priceMode === 'retail') price = retail || cost;
    else { price = cost ? retailPrice(cost) : 0; if (retail > price) compareAt = retail; }
    if (!title || !price || seen.has(sku)) { result.skipped++; continue; }
    seen.add(sku);

    const images = [...new Set([mapping.images, ...imageCols].filter((i) => i >= 0)
      .flatMap((i) => String(row[i] || '').split(/[|,;\s]+/)).filter((u) => /^https:\/\/\S+$/.test(u)))].slice(0, 8);
    const stockRaw = col(row, 'stock');
    const inStock = mapping.stock < 0 || stockRaw === '' ? true : !/^(0|no|false|out.*|n)$/i.test(stockRaw);
    const brand = clean(col(row, 'brand'), 60);
    const weight = clean(col(row, 'weight'), 30);
    const fields = {
      price, compareAt, cost: opts.priceMode === 'retail' ? 0 : cost, sku,
      ...(images.length ? { images } : {}),
    };

    const existing = bySku.get(sku);
    if (existing) {
      Object.assign(existing, fields);
      if (!inStock && existing.active !== false) { existing.active = false; existing.autoHidden = true; result.hidden++; }
      if (inStock && existing.autoHidden) { existing.active = true; existing.autoHidden = false; }
      result.updated++;
      continue;
    }
    if (!room()) { result.skipped++; continue; }
    let slug = slugify(title) || 'product';
    if (slugs.has(slug)) slug = (slug.slice(0, 66) + '-' + slugify(sku).slice(0, 12)).replace(/-+$/, '');
    while (slugs.has(slug)) slug += '-' + Math.random().toString(36).slice(2, 5);
    slugs.add(slug);
    const description = stripHtml(col(row, 'description')).slice(0, 5000);
    const product = {
      id: 'c' + Date.now().toString(36) + result.added.toString(36), slug, title,
      category: guessCategory(title + ' ' + col(row, 'category'), fallbackCat),
      images: [], description,
      specs: [brand ? ['Brand', brand] : null, weight ? ['Weight', weight] : null].filter(Boolean),
      variants: [], featured: false, active: inStock, autoHidden: !inStock, sample: false,
      supplierUrl: '', cjPid: '', source, createdAt: Date.now(), ...fields,
    };
    catalog.unshift(product);
    bySku.set(sku, product);
    result.added++;
  }
  // On a scheduled feed sync, anything the supplier dropped from the sheet is hidden.
  if (opts.hideMissing) {
    for (const p of catalog) {
      if (p.source === source && p.sku && !seen.has(p.sku) && p.active !== false) { p.active = false; p.autoHidden = true; result.hidden++; }
    }
  }
  return result;
}

export async function fetchFeed(url) {
  if (!/^https:\/\//.test(url)) throw new Error('The feed link must start with https://');
  const res = await fetch(url, { headers: { accept: 'text/csv,text/plain,*/*' } });
  if (!res.ok) throw new Error('The feed link answered with error ' + res.status + '.');
  const text = await res.text();
  if (text.length > 8_000_000) throw new Error('That feed is larger than 8 MB. Split it into smaller files.');
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('That link opens a web page, not a CSV file. Use the direct download link.');
  return text;
}
