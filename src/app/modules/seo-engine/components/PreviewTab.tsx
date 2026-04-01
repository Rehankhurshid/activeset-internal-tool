'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, ArrowRight, Search, MessageSquare, Link2 } from 'lucide-react';
import { QueueItem } from '../types/seo';
import { RICH_ELEMENTS_CSS } from '../data/rich-elements';

interface PreviewTabProps {
  item: QueueItem;
  publishingId: number | null;
  onBack: () => void;
  onPublish: (item: QueueItem) => void;
}

export function PreviewTab({ item, publishingId, onBack, onPublish }: PreviewTabProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Inject rich elements JS after content renders
  useEffect(() => {
    if (!contentRef.current) return;

    // Run the rich elements JS initialization on the preview content
    const container = contentRef.current;

    // Table of Contents
    container.querySelectorAll('.as-toc').forEach((toc) => {
      if (toc.children.length > 0) return; // already initialized
      const headings = container.querySelectorAll('h2');
      if (headings.length === 0) return;
      const titleEl = document.createElement('div');
      titleEl.className = 'as-toc__title';
      titleEl.textContent = 'Table of Contents';
      toc.appendChild(titleEl);
      const ol = document.createElement('ol');
      headings.forEach((h, i) => {
        const id = h.id || `section-${i + 1}`;
        h.id = id;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${id}`;
        a.textContent = h.textContent;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        li.appendChild(a);
        ol.appendChild(li);
      });
      toc.appendChild(ol);
    });

    // FAQ Accordion
    container.querySelectorAll('.as-faq__question').forEach((btn) => {
      const handler = () => {
        const faqItem = btn.closest('.as-faq__item');
        const faqBlock = btn.closest('.as-faq');
        if (!faqItem || !faqBlock) return;
        const wasOpen = faqItem.classList.contains('as-faq--open');
        faqBlock.querySelectorAll('.as-faq__item').forEach((el) => el.classList.remove('as-faq--open'));
        if (!wasOpen) faqItem.classList.add('as-faq--open');
      };
      btn.removeEventListener('click', handler);
      btn.addEventListener('click', handler);
    });

    // Code copy buttons
    container.querySelectorAll('.as-code').forEach((block) => {
      if (block.querySelector('.as-code__header')) return; // already initialized
      const lang = block.getAttribute('data-lang') || 'code';
      const pre = block.querySelector('pre');
      if (!pre) return;
      const header = document.createElement('div');
      header.className = 'as-code__header';
      header.innerHTML = `<span class="as-code__lang">${lang}</span>`;
      const copyBtn = document.createElement('button');
      copyBtn.className = 'as-code__copy';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.textContent || '').then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      });
      header.appendChild(copyBtn);
      block.insertBefore(header, pre);
    });

    // Score bars
    container.querySelectorAll('.as-score').forEach((el) => {
      if (el.querySelector('.as-score__header')) return;
      const value = parseInt(el.getAttribute('data-value') || '0', 10);
      const label = el.getAttribute('data-label') || 'Score';
      el.innerHTML = `
        <div class="as-score__header">
          <span class="as-score__label">${label}</span>
          <span class="as-score__value">${value}%</span>
        </div>
        <div class="as-score__track">
          <div class="as-score__fill" style="width:${value}%"></div>
        </div>`;
    });

    // Step numbers
    container.querySelectorAll('.as-steps').forEach((stepsBlock) => {
      stepsBlock.querySelectorAll('.as-step').forEach((step, i) => {
        if (step.querySelector('.as-step__number')) return;
        const num = document.createElement('div');
        num.className = 'as-step__number';
        num.textContent = String(i + 1);
        step.insertBefore(num, step.firstChild);
      });
    });

    // Animate in all rich elements
    const selectors = '.as-callout, .as-stats, .as-comparison, .as-steps, .as-proscons, .as-faq, .as-cta, .as-timeline, .as-code, .as-pullquote, .as-score, .as-takeaway, .as-features, .as-toc, .as-divider';
    container.querySelectorAll(selectors).forEach((el) => {
      (el as HTMLElement).style.opacity = '1';
      el.classList.add('as-animate');
    });
  }, [item.id, item.body]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Inject rich elements CSS */}
      <style dangerouslySetInnerHTML={{ __html: RICH_ELEMENTS_CSS }} />

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Queue
        </Button>
        {item.status === 'ready' && (
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => onPublish(item)}
            disabled={publishingId === item.id}
          >
            Publish to Webflow <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        {/* Content Preview */}
        <Card>
          <CardContent className="p-6">
            <Badge
              variant="outline"
              className={
                item.status === 'ready'
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 mb-3'
                  : 'bg-green-500/10 text-green-500 border-green-500/20 mb-3'
              }
            >
              {item.status === 'ready' ? 'Ready for Review' : 'Published'}
            </Badge>

            <h1 className="text-xl font-extrabold leading-tight mb-4">{item.title}</h1>

            <div className="flex gap-4 mb-5 pb-4 border-b text-xs text-muted-foreground">
              <span>{item.wordCount} words</span>
              <span>{item.estimatedReadTime}</span>
              <span>SEO Score: {item.seoScore || '—'}/100</span>
            </div>

            <ScrollArea className="h-[700px]">
              <div
                ref={contentRef}
                className="w-richtext prose prose-sm dark:prose-invert max-w-none
                  prose-headings:font-bold prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3
                  prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                  prose-p:mb-3 prose-p:leading-relaxed
                  prose-strong:text-foreground prose-em:text-teal-500
                  prose-blockquote:border-l-teal-500 prose-blockquote:bg-teal-500/5 prose-blockquote:rounded-r-lg prose-blockquote:py-3 prose-blockquote:px-4
                  prose-ul:my-3 prose-li:my-1"
                dangerouslySetInnerHTML={{ __html: item.body }}
              />
            </ScrollArea>
          </CardContent>
        </Card>

        {/* SEO Sidebar */}
        <div className="space-y-3">
          {/* Metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-teal-500 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="h-3 w-3" /> SEO Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground font-semibold uppercase">Meta Title</label>
                <p className="text-xs font-medium mt-0.5">{item.metaTitle}</p>
                <Progress
                  value={Math.min((item.metaTitle?.length || 0) / 60 * 100, 100)}
                  className="mt-1 h-1"
                />
                <span className="text-[10px] text-muted-foreground">{item.metaTitle?.length || 0}/60 chars</span>
              </div>
              <Separator />
              <div>
                <label className="text-[10px] text-muted-foreground font-semibold uppercase">Meta Description</label>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.metaDescription}</p>
                <span className="text-[10px] text-muted-foreground">{item.metaDescription?.length || 0}/155 chars</span>
              </div>
              <Separator />
              <div>
                <label className="text-[10px] text-muted-foreground font-semibold uppercase">Slug</label>
                <p className="text-xs font-mono text-teal-500 mt-0.5">/{item.slug}</p>
              </div>
            </CardContent>
          </Card>

          {/* Keywords */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                Target Keywords
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className="bg-teal-500/10 text-teal-500 border-teal-500/20 mb-2" variant="outline">
                {item.primaryKeyword}
              </Badge>
              <div className="flex flex-wrap gap-1 mt-2">
                {(item.secondaryKeywords || []).map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] py-0">
                    {kw}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* FAQ Schema */}
          {item.faqSchema?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-purple-500 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3" /> FAQ Schema
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {item.faqSchema.map((faq, i) => (
                  <div key={i} className="pb-2.5 border-b border-border/50 last:border-0 last:pb-0">
                    <p className="text-xs font-semibold">{faq.question}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      {faq.answer?.substring(0, 120)}...
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Internal Links */}
          {item.internalLinks?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-orange-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 className="h-3 w-3" /> Internal Links
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {item.internalLinks.map((link, i) => (
                  <div key={i}>
                    <p className="text-xs text-teal-500">{link.text}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{link.suggestedUrl}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
