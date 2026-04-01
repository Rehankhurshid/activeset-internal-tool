'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ArrowRight, Loader2 } from 'lucide-react';
import { QueueItem } from '../types/seo';

interface QueueTabProps {
  queue: QueueItem[];
  publishingId: number | null;
  onPreview: (item: QueueItem) => void;
  onPublish: (item: QueueItem) => void;
  onNavigateGenerate: () => void;
}

export function QueueTab({ queue, publishingId, onPreview, onPublish, onNavigateGenerate }: QueueTabProps) {
  const queued = queue.filter(q => q.status === 'ready').length;
  const published = queue.filter(q => q.status === 'published').length;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Content Queue</h2>
        <span className="text-xs text-muted-foreground">
          {queue.length} total · {queued} ready · {published} published
        </span>
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm mb-3">No content generated yet</p>
            <Button variant="outline" className="text-teal-500 border-teal-500/20" onClick={onNavigateGenerate}>
              Generate your first post <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map(item => (
            <Card key={item.id} className="animate-in fade-in duration-300">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge
                        variant="outline"
                        className={
                          item.status === 'ready'
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            : 'bg-green-500/10 text-green-500 border-green-500/20'
                        }
                      >
                        {item.status === 'ready' ? 'Ready for Review' : 'Published'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold leading-snug mb-1.5">{item.title}</h3>

                    <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                      <span>{item.wordCount} words</span>
                      <span>{item.estimatedReadTime}</span>
                      <span>{item.seoScore || '—'}/100 SEO</span>
                      <span className="font-mono">/{item.slug}</span>
                    </div>

                    {item.secondaryKeywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.secondaryKeywords.slice(0, 6).map((kw, ki) => (
                          <Badge key={ki} variant="outline" className="text-[9px] py-0 bg-teal-500/5 text-teal-500 border-teal-500/20">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-purple-500 border-purple-500/20 hover:bg-purple-500/10"
                      onClick={() => onPreview(item)}
                    >
                      Preview
                    </Button>
                    {item.status === 'ready' && (
                      <Button
                        size="sm"
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        disabled={publishingId === item.id}
                        onClick={() => onPublish(item)}
                      >
                        {publishingId === item.id ? (
                          <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Publishing...</>
                        ) : (
                          <>Publish <ArrowRight className="h-3 w-3 ml-1" /></>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
