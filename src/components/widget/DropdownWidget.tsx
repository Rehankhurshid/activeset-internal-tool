'use client';

import { useState, useEffect } from 'react';
import { projectsService } from '@/services/database';
import { ChevronDown, ExternalLink } from 'lucide-react';

interface DropdownWidgetProps {
  projectId?: string;
  initialLinks?: Array<{ title: string; url: string }>;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  showOnDomains?: string[];
}

export function DropdownWidget({
  projectId,
  initialLinks = [],
  position = 'bottom-right',
  showOnDomains
}: DropdownWidgetProps) {
  const [links, setLinks] = useState(initialLinks);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // If we have a projectId, subscribe to real-time updates
    if (projectId) {
      const unsubscribe = projectsService.subscribeToProject(projectId, (updatedProject) => {
        if (updatedProject) {
          setLinks(updatedProject.links.sort((a, b) => a.order - b.order));
        }
      });

      return () => unsubscribe();
    }
  }, [projectId]);

  // For internal preview, we might just show it.
  if (links.length === 0) {
    return null;
  }

  const positionStyles = {
    'bottom-right': { bottom: '24px', right: '24px' },
    'bottom-left': { bottom: '24px', left: '24px' },
    'top-right': { top: '24px', right: '24px' },
    'top-left': { top: '24px', left: '24px' },
  };

  // Convert React style config to CSS string-like logic handled by JSX
  const dropdownPositionStyle = position.includes('bottom')
    ? { bottom: '100%', marginBottom: '8px' }
    : { top: '100%', marginTop: '8px' };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          zIndex: 9999,
          ...positionStyles[position]
        }}
        className="project-links-widget"
      >
        {/* Trigger Button */}
        <button
          className="widget-trigger"
          onClick={() => setIsOpen(!isOpen)}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="trigger-content">
            <div className="trigger-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15.9v.1" />
                <path d="M12 15.9v.1" />
                <path d="M3 15.9v.1" />
              </svg>
            </div>
            <span className="trigger-text">Project Links</span>
            <ChevronDown className={`trigger-chevron ${isOpen ? 'open' : ''}`} size={14} />
          </div>
        </button>

        {/* Dropdown Content */}
        {isOpen && (
          <div
            className="widget-dropdown"
            style={dropdownPositionStyle}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
          >
            <div className="dropdown-header">
              <span className="dropdown-title">Quick Links</span>
              <div className="dropdown-badge">
                <div className="status-dot"></div>
                Live
              </div>
            </div>
            <div className="dropdown-links">
              {links.map((link, index) => (
                <a
                  key={`${link.title}-${index}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-link"
                >
                  <span className="link-title">{link.title}</span>
                  <ExternalLink size={12} className="link-icon" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .project-links-widget {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
        }

        .widget-trigger {
          display: flex;
          align-items: center;
          background: hsl(0 0% 3.9%);
          border: 1px solid hsl(217.2 32.6% 17.5%);
          border-radius: 8px;
          padding: 8px 12px;
          color: hsl(210 40% 98%);
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .widget-trigger:hover {
          background: hsl(217.2 32.6% 17.5%);
          border-color: hsl(215 20.2% 65.1%);
          transform: translateY(-1px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }

        .trigger-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .trigger-icon {
          display: flex;
          align-items: center;
          color: hsl(215 20.2% 65.1%);
        }

        .trigger-text {
          font-weight: 500;
          font-size: 13px;
          white-space: nowrap;
        }

        .trigger-chevron {
          transition: transform 0.2s ease;
          color: hsl(215 20.2% 65.1%);
        }

        .trigger-chevron.open {
          transform: rotate(180deg);
        }

        .widget-dropdown {
          position: absolute;
          right: 0;
          background: hsl(0 0% 3.9%);
          border: 1px solid hsl(217.2 32.6% 17.5%);
          border-radius: 8px;
          min-width: 220px;
          backdrop-filter: blur(10px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          animation: slideIn 0.2s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px 8px;
          border-bottom: 1px solid hsl(217.2 32.6% 17.5%);
        }

        .dropdown-title {
          font-weight: 600;
          color: hsl(210 40% 98%);
          font-size: 13px;
        }

        .dropdown-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          background: hsl(217.2 32.6% 17.5%);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          color: hsl(215 20.2% 65.1%);
          font-weight: 500;
        }

        .status-dot {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .dropdown-links {
          padding: 4px;
        }

        .dropdown-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          color: hsl(210 40% 98%);
          text-decoration: none;
          border-radius: 4px;
          transition: all 0.15s ease;
          margin-bottom: 1px;
        }

        .dropdown-link:hover {
          background: hsl(217.2 32.6% 17.5%);
          color: hsl(210 40% 98%);
          transform: translateX(2px);
        }

        .link-title {
          font-weight: 500;
          font-size: 13px;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .link-icon {
          color: hsl(215 20.2% 65.1%);
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .dropdown-link:hover .link-icon {
          opacity: 1;
        }
      `}</style>
    </>
  );
}