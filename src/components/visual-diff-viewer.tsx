"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, AlertCircle, Plus, Minus, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface VisualDiffViewerProps {
  projectId: string;
  linkId: string;
}

interface DiffResponse {
  diffHtml: string;
  stats: {
    additions: number;
    deletions: number;
  };
  baseUrl: string;
  currentTimestamp?: string;
  previousTimestamp?: string;
  isFirstScan?: boolean;
}

export function VisualDiffViewer({ projectId, linkId }: VisualDiffViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<DiffResponse | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchDiff = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/visual-diff?projectId=${encodeURIComponent(projectId)}&linkId=${encodeURIComponent(linkId)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch diff");
      }

      const data = await response.json();
      setDiffData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load visual diff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiff();
  }, [projectId, linkId]);

  // Write diff HTML to iframe
  useEffect(() => {
    if (diffData?.diffHtml && iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(diffData.diffHtml);
        doc.close();
      }
    }
  }, [diffData?.diffHtml]);

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin mb-3 text-neutral-400" />
        <p className="text-sm">Loading visual diff...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
        <AlertCircle className="h-8 w-8 mb-3 text-red-400" />
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchDiff}>
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!diffData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
        <AlertCircle className="h-8 w-8 mb-3 text-neutral-400" />
        <p className="text-sm">No diff data available</p>
      </div>
    );
  }

  const { stats, isFirstScan, currentTimestamp, previousTimestamp } = diffData;
  const hasChanges = stats.additions > 0 || stats.deletions > 0;

  return (
    <div ref={containerRef} className={`space-y-3 ${isFullscreen ? "bg-white p-4" : ""}`}>
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFirstScan ? (
            <Badge variant="secondary" className="text-xs">
              First Scan
            </Badge>
          ) : hasChanges ? (
            <>
              {stats.additions > 0 && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  {stats.additions} addition{stats.additions !== 1 ? "s" : ""}
                </Badge>
              )}
              {stats.deletions > 0 && (
                <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                  <Minus className="h-3 w-3 mr-1" />
                  {stats.deletions} deletion{stats.deletions !== 1 ? "s" : ""}
                </Badge>
              )}
            </>
          ) : (
            <Badge variant="secondary" className="text-xs">
              No visual changes
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {previousTimestamp && currentTimestamp && (
            <span className="text-xs text-neutral-400">
              Comparing {formatTimestamp(previousTimestamp)} → {formatTimestamp(currentTimestamp)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchDiff} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Diff legend */}
      {hasChanges && !isFirstScan && (
        <div className="flex items-center gap-4 text-xs text-neutral-500 pb-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-300" />
            <span>Removed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-green-200 border border-green-300" />
            <span>Added</span>
          </div>
        </div>
      )}

      {/* Iframe container */}
      <div
        className={`border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white ${
          isFullscreen ? "h-[calc(100vh-120px)]" : "h-[500px]"
        }`}
      >
        <iframe
          ref={iframeRef}
          className="w-full h-full"
          sandbox="allow-same-origin"
          title="Visual Diff"
        />
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timestamp;
  }
}
