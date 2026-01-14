import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint to fetch external images (avoids CORS issues)
 * GET /api/proxy-image?url=<encoded-url>
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    // Validate URL
    const imageUrl = new URL(url);
    
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(imageUrl.protocol)) {
      return new NextResponse('Invalid protocol', { status: 400 });
    }

    // Fetch the image
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ActiveSet-ImageProxy/1.0',
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      return new NextResponse('Failed to fetch image', { status: response.status });
    }

    const contentType = response.headers.get('content-type');
    
    // Verify it's an image
    if (!contentType?.startsWith('image/')) {
      return new NextResponse('Not an image', { status: 400 });
    }

    const imageBuffer = await response.arrayBuffer();

    // Return the image with appropriate headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse('Failed to proxy image', { status: 500 });
  }
}
