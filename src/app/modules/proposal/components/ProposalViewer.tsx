'use client';

import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Mail, X, Copy, ExternalLink, PenLine, MessageSquare, FileDown } from "lucide-react";
import { Proposal, ProposalSectionId } from "../types/Proposal";
import SignatureSection from "./SignatureSection";
import { proposalService } from "../services/ProposalService";
import { commentService } from "../services/CommentService";
import CommentSidebar from "./CommentSidebar";
import { downloadProposalPDF } from "../utils/pdfGenerator";

const DEFAULT_HERO = '/default-hero.png';

// Font family constants
const FONT_TITLE = "'Funnel Display', system-ui, sans-serif";
const FONT_BODY = "'Funnel Sans', system-ui, sans-serif";

// Convert plain text bullets (•) to proper HTML lists
const convertBulletsToHtmlLists = (html: string): string => {
  if (!html || !html.includes('•')) {
    return html;
  }

  // More flexible pattern: bullet followed by any whitespace (including newlines) and then a <p> tag
  // This handles cases like:
  // "• <p>", "•\n<p>", "• \n<p>", "•\n\n<p>", etc.
  const bulletItemPattern = /•[\s\n\r]*(<p[^>]*>[\s\S]*?<\/p>)/gi;

  const matches: Array<{ full: string; pTag: string; index: number }> = [];
  let match;

  // Reset regex lastIndex
  bulletItemPattern.lastIndex = 0;

  // Collect all matches
  while ((match = bulletItemPattern.exec(html)) !== null) {
    matches.push({
      full: match[0],
      pTag: match[1],
      index: match.index
    });
  }

  if (matches.length === 0) {
    return html;
  }

  // Build result by grouping consecutive bullets
  let result = '';
  let lastIndex = 0;
  let currentGroup: string[] = [];
  let groupStart = -1;

  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const prev = i > 0 ? matches[i - 1] : null;

    // Calculate distance from previous match
    const distance = prev
      ? curr.index - (prev.index + prev.full.length)
      : Infinity;

    // Consider consecutive if within 300 chars (to handle whitespace/newlines)
    const isConsecutive = distance < 300;

    if (!isConsecutive && currentGroup.length > 0) {
      // Close previous group
      const prevMatch = matches[i - 1];
      result += html.substring(lastIndex, groupStart);
      result += '<ul>' + currentGroup.map(p => `<li>${p}</li>`).join('') + '</ul>';
      lastIndex = prevMatch.index + prevMatch.full.length;
      currentGroup = [];
      groupStart = -1;
    }

    if (currentGroup.length === 0) {
      groupStart = curr.index;
    }

    currentGroup.push(curr.pTag);
  }

  // Handle the last group
  if (currentGroup.length > 0) {
    result += html.substring(lastIndex, groupStart);
    result += '<ul>' + currentGroup.map(p => `<li>${p}</li>`).join('') + '</ul>';
    lastIndex = matches[matches.length - 1].index + matches[matches.length - 1].full.length;
  }

  // Add remaining content
  result += html.substring(lastIndex);

  return result;
};

interface ProposalViewerProps {
  proposal: Proposal;
  onBack: () => void;
  isPublic?: boolean;
}

export default function ProposalViewer({ proposal, onBack, isPublic = false }: ProposalViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(794);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<Proposal>(proposal);
  // Comment sidebar state
  const [showCommentSidebar, setShowCommentSidebar] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [activeCommentSection, setActiveCommentSection] = useState<ProposalSectionId | undefined>(undefined);
  const [isDownloading, setIsDownloading] = useState(false);

  // Subscribe to comment count
  useEffect(() => {
    const unsubscribe = commentService.subscribeToComments(proposal.id, (comments) => {
      const openCount = comments.filter(c => !c.resolved && !c.parentId).length;
      setCommentCount(openCount);
    });
    return () => unsubscribe();
  }, [proposal.id]);

  // Check if proposal is locked
  const isLocked = currentProposal.isLocked || !!currentProposal.data.signatures.client.signedAt;

  // Get current user info for comments
  const currentUserName = isPublic
    ? currentProposal.data.signatures.client.name
    : currentProposal.data.signatures.agency.name;
  const currentUserEmail = isPublic
    ? currentProposal.data.signatures.client.email
    : currentProposal.data.signatures.agency.email;
  const currentUserType: 'agency' | 'client' = isPublic ? 'client' : 'agency';

  // Open comment sidebar for a specific section
  const openCommentsForSection = (sectionId: ProposalSectionId) => {
    setActiveCommentSection(sectionId);
    setShowCommentSidebar(true);
  };

  // Get highlight class for active section
  const getSectionHighlightClass = (sectionId: ProposalSectionId) => {
    if (activeCommentSection === sectionId && showCommentSidebar) {
      return 'ring-2 ring-blue-500 ring-offset-4 bg-blue-50/30 rounded-lg transition-all duration-300';
    }
    return '';
  };


  // Responsive Width Logic
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        // Constrain only by max-screen, but effectively use available width
        // We subtract padding (48px * 2 = 96px) roughly for the chart calculation later
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width > 794 ? width : 794);
      }
    };

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);
    updateWidth(); // Initial

    return () => resizeObserver.disconnect();
  }, []);

  // Get hero image with fallback to default
  const rawHeroImage = proposal.heroImage && proposal.heroImage.trim() ? proposal.heroImage : DEFAULT_HERO;
  const heroImage = rawHeroImage;




  const shareProposal = () => {
    const shareUrl = `${window.location.origin}/view/${proposal.id}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied to clipboard!');
  };

  // Email Template Functions
  const getShareUrl = () => {
    return typeof window !== 'undefined'
      ? `${window.location.origin}/view/${proposal.id}`
      : '';
  };

  const getEmailSubject = () => {
    // Use title directly with "by ActiveSet" to avoid redundancy
    // e.g., "Website Design & Development Proposal by ActiveSet"
    return `${proposal.title} by ${proposal.agencyName}`;
  };

  const getPlainTextBody = () => {
    const shareUrl = getShareUrl();
    const pricingLines = proposal.data.pricing.items
      .map(item => `  • ${item.name}: ${item.price}`)
      .join('\n');
    const timelinePhases = proposal.data.timeline.phases
      .map(p => p.title)
      .join(' → ');

    return `Hi ${proposal.data.signatures.client.name},

I hope this email finds you well. Please find our proposal for ${proposal.title}.

View the full proposal online:
${shareUrl}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRICING SUMMARY
${pricingLines}
  ──────────────
  Total: ${proposal.data.pricing.total}

TIMELINE
${proposal.data.timeline.phases.length} phase(s): ${timelinePhases}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Looking forward to discussing this with you.

Best regards,
${proposal.data.signatures.agency.name}
${proposal.agencyName}`;
  };

  const getRichTextEmailBody = () => {
    const shareUrl = getShareUrl();
    const pricingItems = proposal.data.pricing.items;
    const timelinePhases = proposal.data.timeline.phases.map(p => p.title).join(' → ');

    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
  <p>Hi ${proposal.data.signatures.client.name},</p>
  
  <p>I hope this email finds you well. Please find our proposal for <strong>${proposal.title}</strong>.</p>
  
  <br/>
  
  <p><strong>View the full proposal online:</strong><br/>
  <a href="${shareUrl}" style="color: #2563eb;">${shareUrl}</a></p>
  
  <hr style="border: none; border-top: 1px solid #ccc; margin: 16px 0;"/>
  
  <p><strong>💰 Pricing Summary</strong></p>
  <ul style="margin: 0; padding-left: 20px;">
    ${pricingItems.map(item => `<li><strong>${item.name}:</strong> ${item.price}</li>`).join('\n    ')}
  </ul>
  <p style="margin-top: 8px;"><strong>Total: ${proposal.data.pricing.total}</strong></p>
  
  <hr style="border: none; border-top: 1px solid #ccc; margin: 16px 0;"/>
  
  <p><strong>📅 Timeline</strong></p>
  <p>${proposal.data.timeline.phases.length} phase(s): ${timelinePhases}</p>
  
  <hr style="border: none; border-top: 1px solid #ccc; margin: 16px 0;"/>
  
  <p>Looking forward to discussing this with you.</p>
</div>`;
  };

  const openEmailClient = () => {
    const subject = encodeURIComponent(getEmailSubject());
    const body = encodeURIComponent(getPlainTextBody());
    const clientEmail = proposal.data.signatures.client.email;
    window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`, '_self');
  };

  const copyEmailBody = async () => {
    const html = getRichTextEmailBody();
    const plainText = getPlainTextBody();

    try {
      // Copy as rich text (HTML) so bold and bullets are preserved
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        })
      ]);
    } catch {
      // Fallback to plain text
      await navigator.clipboard.writeText(plainText);
    }

    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const filename = `proposal-${proposal.clientName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
      await downloadProposalPDF(currentProposal.id, filename);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background print:bg-white">
      {/* Fixed Header - Dark Theme */}
      <div className="sticky top-0 z-50 bg-[#1A1A1A] border-b border-[#333] px-6 py-4 text-white shadow-md no-print">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {!isPublic && (
              <Button
                onClick={onBack}
                className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            <div>
              <h1 className="text-lg font-semibold text-white leading-tight">{proposal.title}</h1>
              <p className="text-xs text-gray-400">Client: {proposal.clientName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!isPublic && (
              <Button
                onClick={shareProposal}
                className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
              >
                <Share2 className="w-4 h-4" />
                Share
              </Button>
            )}
            {!isPublic && (
              <Button
                onClick={() => setShowEmailModal(true)}
                className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
              >
                <Mail className="w-4 h-4" />
                Email
              </Button>
            )}
            <Button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
            >
              <FileDown className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
              {isDownloading ? 'Generating...' : 'Download'}
            </Button>
            {/* Comments Button */}
            <Button
              onClick={() => setShowCommentSidebar(true)}
              data-html2canvas-ignore
              className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4 relative"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Comments</span>
              {commentCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                  {commentCount}
                </span>
              )}
            </Button>
            {isPublic && !currentProposal.data.signatures.client.signedAt && (
              <Button
                onClick={() => document.getElementById('signature-section')?.scrollIntoView({ behavior: 'smooth' })}
                data-html2canvas-ignore
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white border-none h-9 px-4 shadow-sm animate-pulse"
              >
                <PenLine className="w-4 h-4" />
                Sign Contract
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Send Proposal via Email</h2>
                <p className="text-sm text-gray-500">Preview and send to {proposal.clientName}</p>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Email Preview */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">To</label>
                <p className="text-sm text-gray-900">{proposal.data.signatures.client.name} &lt;{proposal.data.signatures.client.email}&gt;</p>
              </div>
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Subject</label>
                <p className="text-sm text-gray-900">{getEmailSubject()}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Email Body Preview</label>
                <pre className="border border-gray-200 rounded-lg bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap font-sans overflow-x-auto">
                  {getPlainTextBody()}
                </pre>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={openEmailClient}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white h-11"
              >
                <ExternalLink className="w-4 h-4" />
                Open Email Client
              </Button>
              <Button
                onClick={copyEmailBody}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white h-11"
              >
                <Copy className="w-4 h-4" />
                {emailCopied ? 'Copied!' : 'Copy Email Body'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Proposal Content */}
      <div className="p-6 flex justify-center bg-gray-200 min-h-[calc(100vh-80px)] print:p-0 print:bg-white print:min-h-0">
        <div
          ref={containerRef}
          className="w-full max-w-4xl print:max-w-none print:w-full"
        >
          <div
            id="proposal-container"
            className="bg-white shadow-xl print:shadow-none"
          >
            {/* Header Section with Hero Image */}
            <div
              className="proposal-container-inner"
              style={{
                position: 'relative',
                height: '396px',
                width: '100%',
                overflow: 'hidden',
                backgroundImage: `url(${heroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              }}
            >

              {/* Header Content */}
              <div className="p-6 sm:p-8 md:p-12 h-full flex flex-col justify-between">
                <div style={{ color: '#ffffff' }}>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-white break-words" style={{ fontFamily: FONT_TITLE }}>{proposal.title}</h1>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-white">
                  <div>
                    <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', color: '#bfdbfe' }}>Agency</p>
                    <h3 className="text-lg sm:text-xl font-semibold mb-1 text-white break-words" style={{ fontFamily: FONT_TITLE }}>{proposal.agencyName}</h3>
                    <p className="text-sm text-blue-100 opacity-90 break-all">
                      {proposal.data.signatures.agency.name}
                    </p>
                    <p className="text-sm text-blue-100 opacity-90 break-all">
                      {proposal.data.signatures.agency.email}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', color: '#bfdbfe' }}>Client</p>
                    <h3 className="text-lg sm:text-xl font-semibold mb-1 text-white break-words" style={{ fontFamily: FONT_TITLE }}>{proposal.clientName}</h3>
                    <p className="text-sm text-blue-100 opacity-90 break-all">
                      {proposal.data.signatures.client.name}
                    </p>
                    <p className="text-sm text-blue-100 opacity-90 break-all">
                      {proposal.data.signatures.client.email}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Print Header - Only visible in PDF if we needed it, but jspdf will capture the hero */}

            {/* Content Sections */}
            <style dangerouslySetInnerHTML={{
              __html: `
              .proposal-container-inner {
                font-family: ${FONT_BODY};
              }
              .proposal-content {
                font-family: ${FONT_BODY};
              }
              .proposal-content ul {
                list-style-type: disc;
                list-style-position: outside;
                padding-left: 1.5rem;
                margin: 0.5rem 0;
              }
              .proposal-content ul li {
                display: list-item;
                margin-bottom: 0.5rem;
                line-height: 1.7;
              }
              .proposal-content ul li p {
                display: inline !important;
                margin: 0 !important;
                font-family: ${FONT_BODY};
              }
              .proposal-content ul li p span {
                display: inline;
                white-space: normal;
              }
              .proposal-content ol {
                list-style-type: decimal;
                list-style-position: outside;
                padding-left: 1.5rem;
                margin: 0.5rem 0;
              }
              .proposal-content ol li {
                display: list-item;
                margin-bottom: 0.5rem;
                line-height: 1.7;
              }
              .proposal-content ol li p {
                display: inline !important;
                margin: 0 !important;
                font-family: ${FONT_BODY};
              }
              .proposal-content ol li p span {
                display: inline;
                white-space: normal;
              }
              .proposal-content p {
                margin-bottom: 0.5rem;
                font-family: ${FONT_BODY};
              }
              @media print {
                html, body {
                  background-color: white !important;
                  color: black !important;
                  font-family: ${FONT_BODY};
                }
                .no-print {
                  display: none !important;
                }
                .proposal-content section {
                  page-break-inside: avoid;
                }
              }
            `}} />
            <div className="proposal-container-inner p-6 sm:p-8 md:p-12 flex flex-col gap-12 sm:gap-16">
              {/* Overview */}
              <section className={`grid grid-cols-1 md:grid-cols-[1fr_3fr] gap-8 group relative p-4 -m-4 ${getSectionHighlightClass('overview')}`}>
                <div className="flex items-start justify-between">
                  <h2 style={{ fontSize: '36px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>Overview</h2>
                  <button
                    onClick={() => openCommentsForSection('overview')}
                    data-html2canvas-ignore
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-blue-50 text-blue-500"
                    title="Add comment to Overview"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                </div>
                <div>
                  <div
                    className="proposal-content"
                    style={{ color: '#374151', lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: convertBulletsToHtmlLists(proposal.data.overview) }}
                  />
                </div>
              </section>

              {/* About Us */}
              <section className={`grid grid-cols-1 md:grid-cols-[1fr_3fr] gap-8 group relative p-4 -m-4 ${getSectionHighlightClass('aboutUs')}`}>
                <div className="flex items-start justify-between">
                  <h2 style={{ fontSize: '36px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>About Us</h2>
                  <button
                    onClick={() => openCommentsForSection('aboutUs')}
                    data-html2canvas-ignore
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-blue-50 text-blue-500"
                    title="Add comment to About Us"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                </div>
                <div>
                  <div
                    className="proposal-content"
                    style={{ color: '#374151', lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: convertBulletsToHtmlLists(proposal.data.aboutUs) }}
                  />
                </div>
              </section>

              {/* Pricing */}
              <section className={`grid grid-cols-1 md:grid-cols-[1fr_3fr] gap-8 group relative p-4 -m-4 ${getSectionHighlightClass('pricing')}`}>
                <div className="flex items-start justify-between">
                  <h2 style={{ fontSize: '36px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>Pricing for {proposal.clientName}</h2>
                  <button
                    onClick={() => openCommentsForSection('pricing')}
                    data-html2canvas-ignore
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-blue-50 text-blue-500"
                    title="Add comment to Pricing"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                </div>
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <p style={{ color: '#374151' }}>Here are the line items and pricing:</p>

                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#f9fafb', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Item</span>
                          <span style={{ fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Price</span>
                        </div>
                      </div>

                      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {proposal.data.pricing.items.map((item, index) => (
                          <div key={index} className="break-inside-avoid">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <h4 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{item.name}</h4>
                              </div>
                              <div style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{item.price}</div>
                            </div>
                            {item.description && (
                              <div
                                style={{
                                  fontSize: '14px',
                                  color: '#6b7280',
                                  marginTop: '8px',
                                  whiteSpace: 'pre-wrap'
                                }}
                                dangerouslySetInnerHTML={{ __html: item.description }}
                              />
                            )}
                            {index < proposal.data.pricing.items.length - 1 && (
                              <hr style={{ marginTop: '16px', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                            )}
                          </div>
                        ))}

                        <hr style={{ border: 'none', borderTop: '1px solid #d1d5db' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
                          <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>Total</h3>
                          <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>{proposal.data.pricing.total}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Timeline */}
              <section className={`group relative p-4 -m-4 ${getSectionHighlightClass('timeline')}`}>
                {/* Timeline Section */}
                <div style={{ marginBottom: '40px' }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: '24px', borderBottom: '2px solid #3b82f6', paddingBottom: '8px' }}>
                    <h2 style={{ fontSize: '36px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>Project Timeline</h2>
                    <button
                      onClick={() => openCommentsForSection('timeline')}
                      data-html2canvas-ignore
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-blue-50 text-blue-500"
                      title="Add comment to Timeline"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                  </div>

                  {/* List View */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {proposal.data.timeline.phases.map((phase, index) => (
                      <div key={index} style={{ display: 'flex', gap: '16px' }} className="break-inside-avoid">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '9999px',
                            backgroundColor: '#dbeafe',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: 700
                          }}>
                            {index + 1}
                          </div>
                          {index < proposal.data.timeline.phases.length - 1 && (
                            <div style={{ width: '2px', flexGrow: 1, backgroundColor: '#e5e7eb', margin: '8px 0' }}></div>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', fontFamily: FONT_TITLE }}>{phase.title}</h3>
                            <span style={{
                              fontSize: '12px',
                              fontWeight: 500,
                              padding: '2px 8px',
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                              borderRadius: '9999px',
                              border: '1px solid #dbeafe',
                              whiteSpace: 'nowrap'
                            }}>
                              {phase.duration}
                            </span>
                          </div>
                          <div
                            style={{ color: '#4b5563', lineHeight: 1.6 }}
                            dangerouslySetInnerHTML={{ __html: phase.description }}
                          />
                          {phase.startDate && (
                            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Starts: {phase.startDate}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Notion-style Gantt Chart */}
                  {proposal.data.timeline.phases.some(p => p.startDate && p.endDate) && (() => {
                    const phases = proposal.data.timeline.phases.filter(p => p.startDate && p.endDate);
                    if (phases.length === 0) return null;

                    // Get phase indices in original array for dependency mapping
                    const phaseIndices = proposal.data.timeline.phases
                      .map((p, i) => ({ phase: p, originalIndex: i }))
                      .filter(item => item.phase.startDate && item.phase.endDate);

                    const dates = phases.flatMap(p => [new Date(p.startDate!).getTime(), new Date(p.endDate!).getTime()]);
                    const minDate = Math.min(...dates);
                    const maxDate = Math.max(...dates);
                    const padding = 7 * 24 * 60 * 60 * 1000;
                    const start = minDate - padding;
                    const end = maxDate + padding;
                    const totalDuration = end - start;

                    // Layout Constants (Pixels)
                    // Dynamic TOTAL_WIDTH based on container (subtracting 48px * 2 padding)
                    const PADDING_X = 96;
                    const DYNAMIC_WIDTH = containerWidth - PADDING_X;
                    const TOTAL_WIDTH = Math.max(698, DYNAMIC_WIDTH);

                    const SIDEBAR_WIDTH = 260;
                    const TIMELINE_WIDTH = TOTAL_WIDTH - SIDEBAR_WIDTH;
                    const ITEM_HEIGHT = 64;
                    const HEADER_HEIGHT = 40;
                    const BAR_HEIGHT = 28;

                    const getPosition = (dateStr: string) => {
                      const date = new Date(dateStr).getTime();
                      return ((date - start) / totalDuration) * TIMELINE_WIDTH;
                    };

                    const getWidth = (startStr: string, endStr: string) => {
                      const s = new Date(startStr).getTime();
                      const e = new Date(endStr).getTime();
                      return ((e - s) / totalDuration) * TIMELINE_WIDTH;
                    };

                    const formatDate = (dateStr: string) => {
                      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    };

                    const colors = [
                      { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
                      { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
                      { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
                      { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
                      { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
                      { bg: '#fce7f3', text: '#be185d', border: '#fbcfe8' },
                    ];

                    const markers: Date[] = [];
                    const totalDays = totalDuration / (24 * 60 * 60 * 1000);
                    const markerInterval = totalDays > 60 ? 30 : totalDays > 30 ? 7 : 1;
                    const current = new Date(start);
                    current.setHours(0, 0, 0, 0);
                    while (current.getTime() <= end) {
                      markers.push(new Date(current));
                      current.setDate(current.getDate() + markerInterval);
                    }

                    const today = new Date();
                    const todayPosition = ((today.getTime() - start) / totalDuration) * TIMELINE_WIDTH;
                    const showTodayMarker = today.getTime() >= start && today.getTime() <= end;

                    // Interaction Handlers
                    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;

                      // Clamp x
                      if (x < 0 || x > TIMELINE_WIDTH) {
                        setHoverX(null);
                        setHoverDate(null);
                        return;
                      }

                      setHoverX(x);

                      // Calculate date from x
                      const time = start + (x / TIMELINE_WIDTH) * totalDuration;
                      setHoverDate(new Date(time));
                    };

                    const handleMouseLeave = () => {
                      setHoverX(null);
                      setHoverDate(null);
                    };

                    return (
                      <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-gray-100 hover:scrollbar-thumb-blue-300 transition-all duration-300 break-inside-avoid" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #f3f4f6', pageBreakInside: 'avoid' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2" style={{ fontFamily: FONT_TITLE }}>
                            <span className="text-lg">📅</span> Project Schedule
                          </h3>
                          <span className="text-xs text-gray-400 hidden sm:inline">
                            <span className="hidden md:inline">Hover to view dates • </span>
                            Scroll horizontally on mobile →
                          </span>
                        </div>

                        <div className="group hover:shadow-lg transition-all duration-300" style={{
                          display: 'flex',
                          width: `${TOTAL_WIDTH}px`,
                          minWidth: '800px',
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                          overflow: 'hidden',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                        }}>
                          {/* SIDEBAR */}
                          <div style={{
                            width: `${SIDEBAR_WIDTH}px`,
                            flexShrink: 0,
                            borderRight: '1px solid #e5e7eb',
                            backgroundColor: '#fafafa'
                          }}>
                            {/* Sidebar Header */}
                            <div style={{
                              height: `${HEADER_HEIGHT}px`,
                              borderBottom: '1px solid #e5e7eb',
                              padding: '0 12px',
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#6b7280',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em'
                            }}>
                              Tasks
                            </div>

                            {/* Sidebar Rows */}
                            <div>
                              {phases.map((phase, index) => (
                                <div key={index} style={{
                                  height: `${ITEM_HEIGHT}px`,
                                  padding: '0 12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'center',
                                  alignItems: 'flex-start',
                                  borderBottom: '1px solid #f3f4f6'
                                }}>
                                  <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
                                    Phase {index + 1}
                                  </div>
                                  <span style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: '#374151',
                                    lineHeight: '1.2',
                                    width: '100%',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {phase.title}
                                  </span>
                                  <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                                    {formatDate(phase.startDate!)} - {formatDate(phase.endDate!)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* TIMELINE */}
                          <div
                            style={{
                              width: `${TIMELINE_WIDTH}px`,
                              position: 'relative',
                              cursor: 'crosshair'
                            }}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                          >
                            {/* Date Header */}
                            <div style={{
                              height: `${HEADER_HEIGHT}px`,
                              borderBottom: '1px solid #e5e7eb',
                              backgroundColor: '#fafafa',
                              position: 'relative'
                            }}>
                              {markers.filter((_, i) => i % (markerInterval === 1 ? 7 : 1) === 0).map((date, i) => {
                                const left = ((date.getTime() - start) / totalDuration) * TIMELINE_WIDTH;
                                return (
                                  <div key={i} style={{
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    left: `${left}px`,
                                    paddingLeft: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontSize: '10px',
                                    color: '#9ca3af',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Grid Lines */}
                            <div style={{ position: 'absolute', top: `${HEADER_HEIGHT}px`, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                              {markers.map((date, i) => {
                                const left = ((date.getTime() - start) / totalDuration) * TIMELINE_WIDTH;
                                return (
                                  <div key={i} style={{
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    left: `${left}px`,
                                    borderLeft: '1px solid #f3f4f6'
                                  }} />
                                );
                              })}
                            </div>

                            {/* Today Marker */}
                            {showTodayMarker && (
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: `${todayPosition}px`,
                                width: '2px',
                                backgroundColor: '#ef4444',
                                zIndex: 15, // Lower than hover?
                                pointerEvents: 'none'
                              }}>
                                <div style={{
                                  position: 'absolute',
                                  top: '4px',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: '#ef4444'
                                }} />
                              </div>
                            )}

                            {/* Hover Cursor Line */}
                            {hoverX !== null && (
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: `${hoverX}px`,
                                width: '1px',
                                backgroundColor: '#3b82f6',
                                zIndex: 30,
                                pointerEvents: 'none'
                              }}>
                                <div style={{
                                  position: 'absolute',
                                  top: '-24px',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  backgroundColor: '#3b82f6',
                                  color: 'white',
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {hoverDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                            )}

                            {/* Dependency Lines (SVG) */}
                            <svg style={{
                              position: 'absolute',
                              top: `${HEADER_HEIGHT}px`,
                              left: 0,
                              width: '100%',
                              height: `${phases.length * ITEM_HEIGHT}px`,
                              pointerEvents: 'none',
                              zIndex: 5
                            }}>
                              {phaseIndices.map((item, displayIndex) => {
                                const phase = item.phase;
                                if (phase.dependsOn === undefined) return null;
                                const depPhaseItem = phaseIndices.find(p => p.originalIndex === phase.dependsOn);
                                if (!depPhaseItem) return null;
                                const depDisplayIndex = phaseIndices.indexOf(depPhaseItem);
                                const depPhase = depPhaseItem.phase;
                                const fromX = getPosition(depPhase.endDate!);
                                const fromY = depDisplayIndex * ITEM_HEIGHT + ITEM_HEIGHT / 2;
                                const toX = getPosition(phase.startDate!);
                                const toY = displayIndex * ITEM_HEIGHT + ITEM_HEIGHT / 2;
                                const midX = (fromX + toX) / 2;
                                return (
                                  <g key={displayIndex}>
                                    <path
                                      d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                                      fill="none"
                                      stroke="#9ca3af"
                                      strokeWidth="1.5"
                                      strokeDasharray="4,2"
                                    />
                                    <polygon
                                      points={`${toX},${toY} ${toX - 6},${toY - 4} ${toX - 6},${toY + 4}`}
                                      fill="#9ca3af"
                                    />
                                  </g>
                                );
                              })}
                            </svg>

                            {/* Bars Container */}
                            <div style={{ position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
                              {phases.map((phase, index) => {
                                const left = getPosition(phase.startDate!);
                                const width = getWidth(phase.startDate!, phase.endDate!);
                                const color = colors[index % colors.length];

                                return (
                                  <div key={index} style={{
                                    height: `${ITEM_HEIGHT}px`,
                                    borderBottom: '1px solid #f3f4f6',
                                    position: 'relative'
                                  }}>
                                    <div style={{
                                      position: 'absolute',
                                      top: `${(ITEM_HEIGHT - BAR_HEIGHT) / 2}px`,
                                      height: `${BAR_HEIGHT}px`,
                                      left: `${left}px`,
                                      width: `${Math.max(width, 40)}px`,
                                      backgroundColor: color.bg,
                                      border: `1px solid ${color.border}`,
                                      borderRadius: '6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '0 8px',
                                      overflow: 'hidden'
                                    }}>
                                      <span style={{
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        color: color.text,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                      }}>
                                        {formatDate(phase.startDate!)} – {formatDate(phase.endDate!)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>

              {/* Terms */}
              {proposal.data.terms && (
                <section className={`grid grid-cols-1 md:grid-cols-[1fr_3fr] gap-8 group relative p-4 -m-4 ${getSectionHighlightClass('terms')}`}>
                  <div className="flex items-start justify-between">
                    <h2 style={{ fontSize: '36px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>Terms</h2>
                    <button
                      onClick={() => openCommentsForSection('terms')}
                      data-html2canvas-ignore
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-blue-50 text-blue-500"
                      title="Add comment to Terms"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                  </div>
                  <div>
                    <div
                      className="proposal-content"
                      style={{ color: '#374151', lineHeight: 1.7 }}
                      dangerouslySetInnerHTML={{ __html: convertBulletsToHtmlLists(proposal.data.terms) }}
                    />
                  </div>
                </section>
              )}

              {/* Signatures */}
              <section className="grid grid-cols-1 md:grid-cols-[1fr_3fr] gap-8">
                <div>
                  <h2 style={{ fontSize: '36px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>Signature</h2>
                </div>
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 pt-12">
                    <div>
                      {/* Agency Signature if available - currently schema might not have it, but for completeness or if added later */}
                      <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end', marginBottom: '8px' }}>
                        {currentProposal.data.signatures.agency.signatureData ? (
                          <img
                            src={currentProposal.data.signatures.agency.signatureData}
                            alt="Agency Signature"
                            style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
                          />
                        ) : null}
                      </div>
                      <div style={{ borderBottom: '1px solid #d1d5db', paddingBottom: '8px', marginBottom: '8px' }}>
                        <p style={{ fontSize: '18px', fontWeight: 500, color: '#111827' }}>{currentProposal.data.signatures.agency.name}</p>
                      </div>
                      <p style={{ color: '#4b5563' }}>{currentProposal.data.signatures.agency.email}</p>
                    </div>
                    <div>
                      <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end', marginBottom: '8px' }}>
                        {currentProposal.data.signatures.client.signatureData ? (
                          <img
                            src={currentProposal.data.signatures.client.signatureData}
                            alt="Client Signature"
                            style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
                          />
                        ) : null}
                      </div>
                      <div style={{ borderBottom: '1px solid #d1d5db', paddingBottom: '8px', marginBottom: '8px' }}>
                        <p style={{ fontSize: '18px', fontWeight: 500, color: '#111827' }}>{currentProposal.data.signatures.client.name}</p>
                      </div>
                      <p style={{ color: '#4b5563' }}>{currentProposal.data.signatures.client.email}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Client Signature Section */}
            <div className={!currentProposal.data.signatures.client.signedAt ? 'no-print' : ''}>
              <SignatureSection
                clientName={currentProposal.data.signatures.client.name}
                existingSignature={currentProposal.data.signatures.client.signatureData}
                signedDocUrl={currentProposal.data.signatures.client.signedDocUrl}
                signedAt={currentProposal.data.signatures.client.signedAt}
                isPublic={isPublic}
                onSign={async (signatureData) => {
                  try {
                    await proposalService.signProposal(currentProposal.id, signatureData);
                    alert('Proposal signed successfully!');
                    // Refresh proposal data
                    const updated = await proposalService.getProposalById(currentProposal.id);
                    if (updated) setCurrentProposal(updated);
                  } catch (error) {
                    console.error('Error signing proposal:', error);
                    alert('Failed to save signature. Please try again.');
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Floating Mobile CTA for signing - only on mobile and when not signed */}
      {isPublic && !currentProposal.data.signatures.client.signedAt && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent md:hidden z-40 animate-slideUp no-print">
          <Button
            onClick={() => document.getElementById('signature-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold shadow-2xl flex items-center justify-center gap-3 rounded-xl animate-pulse-subtle"
          >
            <PenLine className="w-5 h-5" />
            Sign Proposal Now
          </Button>
        </div>
      )}

      {/* Comment Sidebar */}
      <CommentSidebar
        proposalId={proposal.id}
        isOpen={showCommentSidebar}
        onClose={() => {
          setShowCommentSidebar(false);
          setActiveCommentSection(undefined);
        }}
        isPublic={isPublic}
        isLocked={isLocked}
        currentUserName={currentUserName}
        currentUserEmail={currentUserEmail}
        currentUserType={currentUserType}
        activeSection={activeCommentSection}
      />
    </div>

  );
}