/**
 * CSV serialization/parsing for the CMS ALT pipeline.
 * Stable schema so humans can edit the file in Excel / Sheets and re-import.
 */

import type { CmsImageEntry } from '@/types/webflow';

export const CSV_COLUMNS = [
  'collection_id',
  'collection_name',
  'item_id',
  'item_name',
  'field_slug',
  'field_type',
  'image_index',
  'image_url',
  'current_alt',
  'new_alt',
  'compressed_url',
  'status',
] as const;

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

function csvEscape(value: string): string {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function entriesToCsv(entries: CmsImageEntry[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = entries.map(e => {
    const row: CsvRow = {
      collection_id: e.collectionId,
      collection_name: e.collectionName,
      item_id: e.itemId,
      item_name: e.itemName,
      field_slug: e.fieldSlug,
      field_type: e.fieldType,
      image_index: String(e.imageIndex),
      image_url: e.imageUrl,
      current_alt: e.currentAlt,
      new_alt: e.currentAlt, // seed with current so untouched rows remain no-op
      compressed_url: '',
      status: e.isMissingAlt ? 'missing' : 'ok',
    };
    return CSV_COLUMNS.map(c => csvEscape(row[c])).join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

/** RFC-4180-ish CSV parser that handles quoted fields and embedded commas/newlines. */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        // finish row on newline (skip \r\n double)
        if (field !== '' || row.length > 0) {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else {
        field += c;
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj as CsvRow;
  });
}
