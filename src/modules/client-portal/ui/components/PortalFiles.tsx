import { Globe } from 'lucide-react';
import type { PortalFileView } from '../../domain/client-portal.types';
import { PortalFileList } from './PortalFileList';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalFilesProps {
  files: PortalFileView[];
  websiteUrl?: string;
}

/** "Files & links": the live site, when known, and files for the whole project. Nothing when there are none. */
export function PortalFiles({ files, websiteUrl }: PortalFilesProps) {
  const rows = [
    ...(websiteUrl ? [{ id: '__site', title: 'Your website', url: websiteUrl, icon: Globe }] : []),
    ...files,
  ];
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="portal-files-heading" className="space-y-5">
      <PortalSectionHeading id="portal-files-heading">Files &amp; links</PortalSectionHeading>
      <PortalFileList files={rows} />
    </section>
  );
}
