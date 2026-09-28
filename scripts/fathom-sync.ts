/**
 * Pull a project's Fathom calls from this machine, the same as the Client
 * tab's "Check Fathom now".
 *
 *   FATHOM_API_KEY=… npm run fathom:sync -- <projectId> [<projectId>…] [--days 180]
 *
 * Vercel keeps FATHOM_API_KEY as a Secret, which `vercel env pull` cannot
 * read, so the key comes from the shell: read it with `read -rs` rather than
 * typing it into a command line that lands in history. New calls arrive
 * pending, exactly as the hourly sync files them; nothing reaches a client
 * until someone shares it in the Client tab.
 */
import '@/lib/load-env';
import { syncFathomMeetings } from '@/lib/fathom';
import { db } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type { ProjectMeeting } from '@/types';

async function main() {
  const args = process.argv.slice(2);
  const daysAt = args.indexOf('--days');
  const days = daysAt >= 0 ? Number(args[daysAt + 1]) : 180;
  const projectIds = args.filter((arg, i) => !arg.startsWith('--') && !(daysAt >= 0 && i === daysAt + 1));
  if (projectIds.length === 0 || !Number.isFinite(days) || days <= 0) {
    console.error('Usage: npm run fathom:sync -- <projectId> [<projectId>…] [--days 180]');
    process.exit(1);
  }

  const createdAfter = new Date(Date.now() - days * 86_400_000).toISOString();
  for (const projectId of projectIds) {
    const result = await syncFathomMeetings({ createdAfter, projectIds: [projectId] });
    const name = Object.keys(result.filed)[0] ?? projectId;
    console.log(`\n${name}: ${result.added} new, ${Object.values(result.filed)[0] ?? 0} filed (Fathom returned ${result.seen})`);
    const snap = await db
      .collection(COLLECTIONS.PROJECTS)
      .doc(projectId)
      .collection(COLLECTIONS.PROJECT_MEETINGS)
      .get();
    for (const doc of snap.docs.sort((a, b) => (b.data().startedAt ?? '').localeCompare(a.data().startedAt ?? ''))) {
      const meeting = doc.data() as ProjectMeeting;
      console.log(
        `  ${meeting.startedAt.slice(0, 10)}  ${meeting.status.padEnd(7)}  ${meeting.summary ? 'summary' : 'no summary yet'}  ${meeting.title}`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
