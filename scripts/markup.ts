/**
 * MarkUp, for an agent: see a client's MarkUps and create one per page.
 *
 *   npm run markup -- folders                                  every client folder in the workspace
 *   npm run markup -- show "<folder name or id>"              what is in one, with review links
 *   npm run markup -- create "<folder>" <page URL>… [--sub "<subfolder>"] [--write]
 *
 * MarkUp's API makes one MarkUp per URL; there is no adding a page to an
 * existing one. So a client is a folder (the workspace already has one per
 * client), each page is a MarkUp in it, and `create` skips a page that already
 * has one there. A missing client folder or `--sub` folder is made on --write.
 * Dry run unless --write: creating MarkUps is outward-facing, so the agent
 * shows the list and asks first (.claude/skills/update-checklist).
 *
 * Needs MARKUP_API_KEY in .env.local (MarkUp → Workspace settings → Developer
 * settings). API: https://developer.markup.io, version header 2023-02-22.
 */
import '@/lib/load-env';

const BASE = 'https://api.markup.io/api/v2';
const WRITE = process.argv.includes('--write');

interface Item {
  id: string;
  name: string;
  url?: string;
  markupUrl?: string;
  folderCount?: number;
  projectCount?: number;
  modifiedAt?: number | string;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const key = process.env.MARKUP_API_KEY;
  if (!key) throw new Error('MARKUP_API_KEY is not set: add it to .env.local.');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Markup-API-Version': '2023-02-22',
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: { data?: T; error?: { message?: string } } = {};
  try {
    json = JSON.parse(text);
  } catch {
    // MarkUp answers some unknown paths with an HTML page.
  }
  if (!res.ok) throw new Error(`MarkUp ${method} ${path} → ${res.status}: ${json.error?.message ?? text.slice(0, 200)}`);
  return json.data as T;
}

const workspace = () => call<{ id: string; name: string; rootFolderId: string }>('GET', '/workspace');
/** Folder contents. The API answers 500 when given a page size, so it is never passed. */
const contents = async (folderId: string) => (await call<{ items: Item[] }>('GET', `/items/${folderId}/items`)).items ?? [];
const isMarkup = (item: Item) => Boolean(item.url || item.markupUrl);

async function findFolder(parentId: string, ref: string): Promise<Item | undefined> {
  const items = (await contents(parentId)).filter((i) => !isMarkup(i));
  return items.find((i) => i.id === ref) ?? items.find((i) => i.name.trim().toLowerCase() === ref.trim().toLowerCase());
}

/** The review link for a MarkUp: listings leave it out, so ask for the MarkUp itself. */
async function reviewLink(item: Item): Promise<string> {
  if (item.markupUrl) return item.markupUrl;
  const full = await call<Item>('GET', `/markups/${item.id}`).catch(() => null);
  return full?.markupUrl ?? `https://app.markup.io/markup/${item.id}`;
}

const normalise = (url: string) => url.trim().replace(/^http:\/\//, 'https://').replace(/\/+$/, '').toLowerCase();

async function folders() {
  const ws = await workspace();
  const items = await contents(ws.rootFolderId);
  console.log(`${ws.name}: ${items.length} items at the top`);
  for (const item of items.filter((i) => !isMarkup(i)).sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${item.name} · ${item.projectCount ?? 0} MarkUps, ${item.folderCount ?? 0} folders · ${item.id}`);
  }
}

async function show(ref: string) {
  const ws = await workspace();
  const folder = await findFolder(ws.rootFolderId, ref);
  if (!folder) throw new Error(`No client folder "${ref}". Run: npm run markup -- folders`);
  const walk = async (id: string, depth: number) => {
    for (const item of await contents(id)) {
      const pad = '  '.repeat(depth);
      if (isMarkup(item)) console.log(`${pad}- ${item.name} · ${item.url ?? ''} · ${await reviewLink(item)}`);
      else {
        console.log(`${pad}+ ${item.name}/ · ${item.id}`);
        await walk(item.id, depth + 1);
      }
    }
  };
  console.log(`${folder.name} (${folder.id})`);
  await walk(folder.id, 1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function create(ref: string, urls: string[]) {
  if (urls.length === 0) throw new Error('Give at least one page URL.');
  for (const url of urls) if (!/^https?:\/\/[^/]+\./.test(url)) throw new Error(`Not a page URL: ${url}`);
  const ws = await workspace();
  const sub = arg('--sub');

  let parent = await findFolder(ws.rootFolderId, ref);
  if (!parent) {
    console.log(`${WRITE ? 'Creating' : 'Would create'} client folder "${ref}"`);
    parent = WRITE ? await call<Item>('POST', '/items', { parentFolderId: ws.rootFolderId, name: ref }) : undefined;
  }
  if (sub && parent) {
    const existing = await findFolder(parent.id, sub);
    if (!existing) console.log(`${WRITE ? 'Creating' : 'Would create'} subfolder "${sub}"`);
    parent = existing ?? (WRITE ? await call<Item>('POST', '/items', { parentFolderId: parent.id, name: sub }) : undefined);
  }

  const have = new Map<string, Item>();
  if (parent) for (const item of await contents(parent.id)) if (item.url) have.set(normalise(item.url), item);

  for (const url of urls) {
    // "/lp/crm-for-outlook" → "Crm for outlook": the last part of the path, as words.
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const words = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
    const name = words ? words[0].toUpperCase() + words.slice(1) : 'Home';
    const already = have.get(normalise(url));
    if (already) {
      console.log(`· ${name}: already has a MarkUp · ${await reviewLink(already)}`);
      continue;
    }
    if (!WRITE || !parent) {
      console.log(`· ${name}: would create a MarkUp of ${url}`);
      continue;
    }
    const made = await call<Item>('POST', '/markups/url', { url, name, workspaceId: ws.id, parentFolderId: parent.id });
    console.log(`✓ ${name}: ${made.markupUrl ?? (await reviewLink(made))}`);
  }
  if (!WRITE) console.log('\nDry run: pass --write to create them.');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--sub');
  if (command === 'folders') return folders();
  if (command === 'show' && rest[0]) return show(rest.join(' '));
  if (command === 'create' && rest[0]) return create(rest[0], rest.slice(1));
  console.log('Usage: npm run markup -- folders | show "<folder>" | create "<folder>" <url>… [--sub "<subfolder>"] [--write]');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
