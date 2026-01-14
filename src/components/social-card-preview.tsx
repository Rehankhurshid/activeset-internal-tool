"use client"

import { useState } from "react"
import { Facebook, Twitter, Linkedin } from "lucide-react"

interface SocialCardPreviewProps {
  platform: 'facebook' | 'twitter' | 'linkedin'
  title?: string
  description?: string
  image?: string
  url?: string
  siteName?: string
}

function extractDomain(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

function FacebookCard({ title, description, image, url, siteName }: Omit<SocialCardPreviewProps, 'platform'>) {
  const [imageError, setImageError] = useState(false)
  const domain = extractDomain(url)
  
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden max-w-[500px] shadow-sm">
      {/* Image */}
      {image && !imageError ? (
        <div className="aspect-[1.91/1] bg-neutral-100 dark:bg-neutral-800 relative">
          <img 
            src={`/api/proxy-image?url=${encodeURIComponent(image)}`}
            alt="Preview"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="aspect-[1.91/1] bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <Facebook className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
        </div>
      )}
      {/* Content */}
      <div className="p-3 bg-[#f0f2f5] dark:bg-neutral-800">
        <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">{domain}</div>
        <div className="font-semibold text-neutral-900 dark:text-white text-[15px] leading-tight line-clamp-2">
          {title || '(No title)'}
        </div>
        {description && (
          <div className="text-sm text-neutral-500 mt-1 line-clamp-1">
            {description}
          </div>
        )}
      </div>
    </div>
  )
}

function TwitterCard({ title, description, image, url }: Omit<SocialCardPreviewProps, 'platform'>) {
  const [imageError, setImageError] = useState(false)
  const domain = extractDomain(url)
  
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl overflow-hidden max-w-[500px] shadow-sm">
      {/* Image */}
      {image && !imageError ? (
        <div className="aspect-[2/1] bg-neutral-100 dark:bg-neutral-800 relative">
          <img 
            src={`/api/proxy-image?url=${encodeURIComponent(image)}`}
            alt="Preview"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="aspect-[2/1] bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <Twitter className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
        </div>
      )}
      {/* Content */}
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
        <div className="text-sm text-neutral-500 mb-0.5">{domain}</div>
        <div className="font-normal text-neutral-900 dark:text-white text-[15px] leading-tight line-clamp-2">
          {title || '(No title)'}
        </div>
        {description && (
          <div className="text-sm text-neutral-500 mt-1 line-clamp-2">
            {description}
          </div>
        )}
      </div>
    </div>
  )
}

function LinkedInCard({ title, description, image, url }: Omit<SocialCardPreviewProps, 'platform'>) {
  const [imageError, setImageError] = useState(false)
  const domain = extractDomain(url)
  
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg overflow-hidden max-w-[500px] shadow-sm">
      {/* Image */}
      {image && !imageError ? (
        <div className="aspect-[1.91/1] bg-neutral-100 dark:bg-neutral-800 relative">
          <img 
            src={`/api/proxy-image?url=${encodeURIComponent(image)}`}
            alt="Preview"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="aspect-[1.91/1] bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <Linkedin className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
        </div>
      )}
      {/* Content */}
      <div className="p-3 bg-white dark:bg-neutral-800">
        <div className="font-semibold text-neutral-900 dark:text-white text-sm leading-tight line-clamp-2">
          {title || '(No title)'}
        </div>
        <div className="text-xs text-neutral-500 mt-1">{domain}</div>
      </div>
    </div>
  )
}

export function SocialCardPreview({ platform, ...props }: SocialCardPreviewProps) {
  switch (platform) {
    case 'facebook':
      return <FacebookCard {...props} />
    case 'twitter':
      return <TwitterCard {...props} />
    case 'linkedin':
      return <LinkedInCard {...props} />
    default:
      return null
  }
}

interface SocialPreviewTabsProps {
  title?: string
  description?: string
  image?: string
  url?: string
  siteName?: string
  twitterTitle?: string
  twitterDescription?: string
  twitterImage?: string
}

export function SocialPreviewTabs({
  title,
  description,
  image,
  url,
  siteName,
  twitterTitle,
  twitterDescription,
  twitterImage
}: SocialPreviewTabsProps) {
  const [activeTab, setActiveTab] = useState<'facebook' | 'twitter' | 'linkedin'>('facebook')
  
  const tabs = [
    { id: 'facebook' as const, label: 'Facebook', icon: Facebook },
    { id: 'twitter' as const, label: 'Twitter', icon: Twitter },
    { id: 'linkedin' as const, label: 'LinkedIn', icon: Linkedin },
  ]
  
  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === id 
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      
      {/* Preview */}
      <div>
        {activeTab === 'facebook' && (
          <SocialCardPreview 
            platform="facebook" 
            title={title} 
            description={description} 
            image={image} 
            url={url}
            siteName={siteName}
          />
        )}
        {activeTab === 'twitter' && (
          <SocialCardPreview 
            platform="twitter" 
            title={twitterTitle || title} 
            description={twitterDescription || description} 
            image={twitterImage || image} 
            url={url}
          />
        )}
        {activeTab === 'linkedin' && (
          <SocialCardPreview 
            platform="linkedin" 
            title={title} 
            description={description} 
            image={image} 
            url={url}
          />
        )}
      </div>
    </div>
  )
}
