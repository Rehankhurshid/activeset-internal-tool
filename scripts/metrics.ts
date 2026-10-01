/**
 * The project's Metrics Tracker, kept by the agent (Rehan, 2026-10-01: build
 * the Metrics tab the Dreamteam Website Plan has). Values come from GA4,
 * Search Console, PageSpeed, CrUX and the monthly AI retrieval re-test; every
 * value records where it came from. Dry run unless --write; a write rewrites
 * the project sheet.
 *
 *   npm run -s metrics -- show "<project>"
 *   npm run -s metrics -- init "<project>" 2026-09 [--write]               # the default metrics, baseline month
 *   npm run -s metrics -- set "<project>" <metric key> 2026-10 1500 --source "GA4, 1-31 Oct" [--write]
 */
import '@/lib/load-env';
import { db } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { DEFAULT_METRICS, sheetMetrics, type ProjectMetric } from '@/modules/client-portal/domain/project-metrics';
import { writeManagedSheet } from '@/lib/project-sheet-writer';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--source')));

async function findProject(ref: string): Promise<{ id: string; name: string }> {
  const direct = await db.collection(COLLECTIONS.PROJECTS).doc(ref).get();
  if (direct.exists) return { id: direct.id, name: direct.get('name') };
  const all = await db.collection(COLLECTIONS.PROJECTS).get();
  const hits = all.docs.filter((d) => String(d.get('name') ?? '').toLowerCase() === ref.toLowerCase());
  if (hits.length !== 1) throw new Error(`"${ref}" matches ${hits.length} projects`);
  return { id: hits[0].id, name: hits[0].get('name') };
}

const col = (projectId: string) => db.collection(COLLECTIONS.PROJECTS).doc(projectId).collection('metrics');

async function load(projectId: string): Promise<ProjectMetric[]> {
  const snap = await col(projectId).get();
  return snap.docs.map((d) => ({ ...(d.data() as ProjectMetric), key: d.id }));
}

async function refreshSheet(projectId: string) {
  const sheet = await db.collection(COLLECTIONS.PROJECT_SHEETS).doc(projectId).get();
  if (sheet.get('managed')) {
    await writeManagedSheet(projectId, { force: true });
    console.log('Project sheet updated.');
  }
}

async function main() {
  const [command, ref, ...rest] = positional;
  if (!command || !ref) throw new Error('usage: show | init <project> <YYYY-MM> | set <project> <key> <YYYY-MM> <value> --source "…"');
  const project = await findProject(ref);

  if (command === 'show') {
    const table = sheetMetrics(await load(project.id));
    if (!table) return console.log(`${project.name}: no metrics yet. Run init.`);
    console.log(`${project.name}\n${['key'.padEnd(18), ...table.header].join(' | ')}`);
    const metrics = (await load(project.id)).sort((a, b) => a.order - b.order);
    table.rows.forEach((r, i) => console.log([metrics[i].key.padEnd(18), r.metric, r.source, ...r.values.map(String), r.change].join(' | ')));
    return;
  }

  if (command === 'init') {
    const month = rest[0];
    if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new Error('init needs the baseline month, YYYY-MM');
    const have = new Set((await load(project.id)).map((m) => m.key));
    const missing = DEFAULT_METRICS.filter((m) => !have.has(m.key));
    console.log(`${project.name}: ${missing.length} metric(s) to add, baseline ${month}${missing.length ? `: ${missing.map((m) => m.key).join(', ')}` : ''}`);
    if (WRITE && missing.length) {
      const batch = db.batch();
      missing.forEach((m, i) => batch.set(col(project.id).doc(m.key), JSON.parse(JSON.stringify({ ...m, order: have.size + i, baselineMonth: month, values: {} }))));
      await batch.commit();
      await refreshSheet(project.id);
    }
    if (!WRITE) console.log('Dry run: pass --write to apply.');
    return;
  }

  if (command === 'set') {
    const [key, month, raw] = rest;
    const source = flag('--source');
    const value = Number(raw);
    if (!key || !/^\d{4}-\d{2}$/.test(month ?? '') || !Number.isFinite(value)) throw new Error('set needs <key> <YYYY-MM> <number>');
    if (!source?.trim()) throw new Error('every value needs --source, e.g. "GA4, 1-31 Oct"');
    const ref = col(project.id).doc(key);
    const current = await ref.get();
    if (!current.exists) throw new Error(`no metric "${key}" (run show for the keys)`);
    const before = (current.get('values') ?? {})[month];
    console.log(`${project.name} · ${current.get('name')} · ${month}: ${before ?? '-'} → ${value} (${source})`);
    if (WRITE) {
      await ref.update({ [`values.${month}`]: value, [`sources.${month}`]: source.trim() });
      await refreshSheet(project.id);
    } else console.log('Dry run: pass --write to apply.');
    return;
  }
  throw new Error(`unknown command ${command}`);
}

main().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });
