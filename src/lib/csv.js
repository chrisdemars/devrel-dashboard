// Minimal CSV reader for the manual logs (handles quoted fields, commas and
// newlines inside quotes). Good enough for sheets exported from Google Sheets
// or Excel; no dependency needed.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])),
  );
}

// "$1,200" -> 1200, "" -> 0, "n/a" -> 0
export function num(value) {
  const n = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function sum(rows, column) {
  return rows.reduce((total, r) => total + num(r[column]), 0);
}
