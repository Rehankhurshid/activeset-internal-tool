'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Project, ProjectLink, WidgetConfig } from '@/types';
import { projectsService } from '@/services/database';

interface WidgetEmbeddedProps {
  config?: WidgetConfig;
}

export function WidgetEmbedded({ config }: WidgetEmbeddedProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (config?.projectId) {
      // Subscribe to real-time updates for the specific project
      const unsubscribe = projectsService.subscribeToProject(
        config.projectId,
        (updatedProject) => {
          if (updatedProject) {
            setProject(updatedProject);
            setLinks(updatedProject.links.sort((a, b) => a.order - b.order));
          } else {
            setError('Project not found');
          }
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else if (config?.initialLinks) {
      // Use initial links from config
      const initialLinks: ProjectLink[] = config.initialLinks.map((link, index) => ({
        ...link,
        id: `link_${index}`,
        order: index,
      }));
      setLinks(initialLinks);
      setLoading(false);
    } else {
      setError('No project ID or initial links provided');
      setLoading(false);
    }
  }, [config]);

  const handleLinkClick = (link: ProjectLink) => {
    if (link.url) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) {
    return (
      <div className="project-links-widget">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center space-y-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-links-widget">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-sm text-red-500">
              {error}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="project-links-widget">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-sm text-muted-foreground">
              No links available
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="project-links-widget">
      <Card className="w-full max-w-md">
        {project && (
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{project.name}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-2">
          {links.map((link) => (
            <div key={link.id} className="flex items-center gap-2 p-2 rounded-md border transition-all hover:bg-muted/50">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => handleLinkClick(link)}
                  className="text-left w-full hover:text-primary transition-colors"
                >
                  <div className="font-medium text-sm truncate">{link.title}</div>
                  {link.url && (
                    <div className="text-xs text-muted-foreground truncate">{link.url}</div>
                  )}
                </button>
              </div>

              {/* Show modal button only on desktop and if showModal is enabled */}
              {!isMobile && config?.showModal !== false && link.url && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center justify-between">
                        <span>{link.title}</span>
                        <Button onClick={() => handleLinkClick(link)} size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in new tab
                        </Button>
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-[60vh]">
                      <iframe
                        src={link.url}
                        className="w-full h-full border rounded-md"
                        title={link.title}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Always show external link button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleLinkClick(link)}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
} 