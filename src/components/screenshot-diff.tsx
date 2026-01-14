"use client"

import { useState, useEffect, useMemo } from "react"
import { Layers, ArrowLeftRight, Minus, RefreshCw } from "lucide-react"

interface ScreenshotDiffProps {
  before?: string // Base64 PNG
  after?: string // Base64 PNG
  beforeLabel?: string
  afterLabel?: string
  onGenerateDiff?: () => Promise<{ diffImage: string; diffPercentage: number } | null>
}

type ViewMode = 'before' | 'after' | 'diff' | 'side-by-side'

export function ScreenshotDiff({
  before,
  after,
  beforeLabel = "Previous",
  afterLabel = "Current",
  onGenerateDiff
}: ScreenshotDiffProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side')
  const [diffImage, setDiffImage] = useState<string | null>(null)
  const [diffPercentage, setDiffPercentage] = useState<number | null>(null)
  const [isGeneratingDiff, setIsGeneratingDiff] = useState(false)
  const [sliderPosition, setSliderPosition] = useState(50)

  const hasBefore = !!before
  const hasAfter = !!after
  const hasBoth = hasBefore && hasAfter

  // Generate diff when both images are available
  useEffect(() => {
    if (hasBoth && onGenerateDiff && !diffImage) {
      generateDiff()
    }
  }, [hasBoth, onGenerateDiff])

  const generateDiff = async () => {
    if (!onGenerateDiff || isGeneratingDiff) return
    
    setIsGeneratingDiff(true)
    try {
      const result = await onGenerateDiff()
      if (result) {
        setDiffImage(result.diffImage)
        setDiffPercentage(result.diffPercentage)
      }
    } catch (error) {
      console.error('Failed to generate diff:', error)
    } finally {
      setIsGeneratingDiff(false)
    }
  }

  const modes = useMemo(() => {
    const available: { id: ViewMode; label: string; icon: React.ReactNode }[] = []
    
    if (hasBoth) {
      available.push({ id: 'side-by-side', label: 'Side by Side', icon: <ArrowLeftRight className="h-3.5 w-3.5" /> })
    }
    if (hasBefore) {
      available.push({ id: 'before', label: beforeLabel, icon: <Minus className="h-3.5 w-3.5" /> })
    }
    if (hasAfter) {
      available.push({ id: 'after', label: afterLabel, icon: <Minus className="h-3.5 w-3.5" /> })
    }
    if (hasBoth && diffImage) {
      available.push({ id: 'diff', label: 'Diff', icon: <Layers className="h-3.5 w-3.5" /> })
    }
    
    return available
  }, [hasBefore, hasAfter, hasBoth, diffImage, beforeLabel, afterLabel])

  if (!hasBefore && !hasAfter) {
    return (
      <div className="flex items-center justify-center h-48 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
        <p className="text-sm text-neutral-500">No screenshots available</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          {modes.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === id 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Diff stats */}
        {diffPercentage !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className={`font-medium ${
              diffPercentage > 10 
                ? 'text-red-600' 
                : diffPercentage > 1 
                  ? 'text-amber-600' 
                  : 'text-green-600'
            }`}>
              {diffPercentage.toFixed(2)}% changed
            </span>
          </div>
        )}

        {/* Regenerate diff button */}
        {hasBoth && onGenerateDiff && (
          <button
            onClick={generateDiff}
            disabled={isGeneratingDiff}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            <RefreshCw className={`h-3 w-3 ${isGeneratingDiff ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
        )}
      </div>

      {/* View content */}
      <div className="relative overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
        {viewMode === 'side-by-side' && hasBoth && (
          <div className="grid grid-cols-2 gap-0.5">
            <div className="relative">
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                {beforeLabel}
              </div>
              <img 
                src={`data:image/png;base64,${before}`}
                alt={beforeLabel}
                className="w-full h-auto"
              />
            </div>
            <div className="relative">
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                {afterLabel}
              </div>
              <img 
                src={`data:image/png;base64,${after}`}
                alt={afterLabel}
                className="w-full h-auto"
              />
            </div>
          </div>
        )}

        {viewMode === 'before' && hasBefore && (
          <img 
            src={`data:image/png;base64,${before}`}
            alt={beforeLabel}
            className="w-full h-auto"
          />
        )}

        {viewMode === 'after' && hasAfter && (
          <img 
            src={`data:image/png;base64,${after}`}
            alt={afterLabel}
            className="w-full h-auto"
          />
        )}

        {viewMode === 'diff' && diffImage && (
          <div>
            <img 
              src={`data:image/png;base64,${diffImage}`}
              alt="Visual diff"
              className="w-full h-auto"
            />
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
              <span className="text-red-400">Red</span> = Changed pixels
            </div>
          </div>
        )}

        {isGeneratingDiff && viewMode === 'diff' && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-800/80">
            <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        )}
      </div>
    </div>
  )
}

interface ResponsivePreviewProps {
  mobile?: string // Base64 PNG
  tablet?: string // Base64 PNG  
  desktop?: string // Base64 PNG
  url?: string
}

type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function ResponsivePreview({
  mobile,
  tablet,
  desktop,
  url
}: ResponsivePreviewProps) {
  const [activeDevice, setActiveDevice] = useState<DeviceType>('desktop')

  const devices = [
    { id: 'mobile' as const, label: 'Mobile', width: '375px', icon: '📱', screenshot: mobile },
    { id: 'tablet' as const, label: 'Tablet', width: '768px', icon: '📱', screenshot: tablet },
    { id: 'desktop' as const, label: 'Desktop', width: '1280px', icon: '🖥️', screenshot: desktop },
  ]

  const currentDevice = devices.find(d => d.id === activeDevice)
  const hasAnyScreenshot = mobile || tablet || desktop

  if (!hasAnyScreenshot) {
    return (
      <div className="flex items-center justify-center h-48 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
        <p className="text-sm text-neutral-500">No responsive screenshots available</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Device tabs */}
      <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit">
        {devices.map(({ id, label, width, icon, screenshot }) => (
          <button
            key={id}
            onClick={() => setActiveDevice(id)}
            disabled={!screenshot}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeDevice === id 
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                : screenshot
                  ? 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  : 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            <span className="text-xs text-neutral-400">({width})</span>
          </button>
        ))}
      </div>

      {/* Device frame mockup */}
      <div className={`flex justify-center p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg ${
        activeDevice === 'mobile' ? 'max-w-[400px] mx-auto' : 
        activeDevice === 'tablet' ? 'max-w-[600px] mx-auto' : ''
      }`}>
        <div className={`relative ${
          activeDevice === 'mobile' 
            ? 'rounded-[2rem] border-[8px] border-neutral-800 dark:border-neutral-600 shadow-xl' 
            : activeDevice === 'tablet'
              ? 'rounded-[1.5rem] border-[6px] border-neutral-800 dark:border-neutral-600 shadow-xl'
              : 'rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-lg'
        }`}>
          {/* Device notch for mobile */}
          {activeDevice === 'mobile' && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-neutral-800 dark:bg-neutral-600 rounded-b-xl z-10" />
          )}
          
          {currentDevice?.screenshot ? (
            <img 
              src={`data:image/png;base64,${currentDevice.screenshot}`}
              alt={`${currentDevice.label} preview`}
              className={`w-full h-auto ${
                activeDevice === 'mobile' ? 'rounded-[1.5rem]' : 
                activeDevice === 'tablet' ? 'rounded-xl' : 'rounded-lg'
              }`}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-neutral-400">
              No screenshot
            </div>
          )}
        </div>
      </div>

      {url && (
        <p className="text-xs text-neutral-500 text-center font-mono">{url}</p>
      )}
    </div>
  )
}
