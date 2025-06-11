'use client';

import { useState, useEffect } from 'react';
import { projectsService } from '@/services/database';

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
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Check domain visibility
    if (showOnDomains && showOnDomains.length > 0) {
      const currentDomain = window.location.hostname;
      const shouldShow = showOnDomains.some(domain => currentDomain.includes(domain));
      setIsVisible(shouldShow);
      if (!shouldShow) return;
    }

    // If we have a projectId, subscribe to real-time updates
    if (projectId) {
      const unsubscribe = projectsService.subscribeToProject(projectId, (updatedProject) => {
        if (updatedProject) {
          setLinks(updatedProject.links.sort((a, b) => a.order - b.order));
        }
      });

      return () => unsubscribe();
    }
  }, [projectId, showOnDomains]);

  if (!isVisible || links.length === 0) {
    return null;
  }

  const positionStyles = {
    'bottom-right': { bottom: '0', right: '20px' },
    'bottom-left': { bottom: '0', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          zIndex: 9999,
          paddingTop: '10px',
          ...positionStyles[position]
        }}
        className="dropdown-widget-container"
      >
        <button className="dropdown-widget-button">
          <svg width="16" height="16" viewBox="0 0 547 367" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M183.01 366.66H6.78001C5.48149 366.66 4.21044 366.286 3.11833 365.584C2.02623 364.881 1.15919 363.88 0.620591 362.698C0.0819888 361.517 -0.105462 360.205 0.080613 358.92C0.266688 357.635 0.818414 356.43 1.67003 355.45L301.06 9.69001C303.691 6.64561 306.948 4.20417 310.608 2.53199C314.268 0.859824 318.246 -0.0037835 322.27 1.24596e-05H498.49C499.787 -0.000107337 501.058 0.372636 502.149 1.07387C503.241 1.77509 504.108 2.77528 504.648 3.95533C505.187 5.13539 505.376 6.44559 505.192 7.72999C505.008 9.01439 504.459 10.2189 503.61 11.2L204.22 356.96C201.59 360.006 198.333 362.45 194.673 364.124C191.013 365.797 187.035 366.663 183.01 366.66Z" fill="white"/>
            <path d="M452.63 366.66C427.7 366.66 403.79 356.756 386.162 339.128C368.534 321.5 358.63 297.59 358.63 272.66V178.66H452.63C477.56 178.66 501.47 188.564 519.098 206.192C536.727 223.82 546.63 247.73 546.63 272.66C546.63 297.59 536.727 321.5 519.098 339.128C501.47 356.756 477.56 366.66 452.63 366.66Z" fill="white"/>
          </svg>
          <span>Project Links</span>
          <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: '16px', height: '16px' }}>
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
          </svg>
        </button>
        
        <div className="dropdown-widget-content">
          {links.map((link, index) => (
            <a
              key={`${link.title}-${index}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="dropdown-widget-link"
            >
              {link.title}
            </a>
          ))}
        </div>
      </div>

      <style jsx>{`
        .dropdown-widget-button,
        .dropdown-widget-link {
          color: #fff;
          font-size: 14px;
          transition: background-color 0.2s;
        }
        
        .dropdown-widget-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: #1f2937;
          padding: 10px 16px;
          border: none;
          cursor: pointer;
          border-radius: 6px 6px 0 0;
          font-weight: 500;
        }
        
        .dropdown-widget-button:hover,
        .dropdown-widget-link:hover {
          background-color: #374151;
        }
        
        .dropdown-widget-content {
          display: none;
          position: absolute;
          ${position.includes('bottom') ? 'bottom: 100%;' : 'top: 100%;'}
          right: 0;
          background-color: #1f2937;
          min-width: 160px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
          z-index: 1;
          border-radius: 6px;
          overflow: hidden;
        }
        
        .dropdown-widget-link {
          padding: 12px 16px;
          text-decoration: none;
          display: block;
        }
        
        .dropdown-widget-container:hover .dropdown-widget-content {
          display: block;
        }
      `}</style>
    </>
  );
} 