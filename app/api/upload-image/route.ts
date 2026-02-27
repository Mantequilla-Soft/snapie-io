import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route to proxy image uploads with fallback support
 * 
 * This route handles image uploads to both images.hive.blog and images.3speak.tv
 * with automatic fallback when the primary service fails.
 * 
 * Benefits:
 * - Keeps API keys server-side (secure)
 * - Avoids CORS issues in development
 * - Provides automatic fallback between services
 */

// Upload to images.hive.blog
async function uploadToHive(file: File, username: string, signature: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`https://images.hive.blog/${username}/${signature}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hive upload failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.url;
}

// Upload to images.3speak.tv as fallback
async function uploadTo3Speak(file: File): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_IMAGE_SERVER_API_KEY;
  
  if (!apiKey) {
    throw new Error('IMAGE_SERVER_API_KEY is not configured');
  }

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('https://images.3speak.tv/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`3Speak upload failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.success || !data.url) {
    throw new Error('Invalid response from 3Speak server');
  }

  return data.url;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const username = formData.get('username') as string;
    const signature = formData.get('signature') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Try primary upload to images.hive.blog
    if (username && signature) {
      try {
        console.log('📤 Attempting Hive.blog upload for:', file.name);
        const url = await uploadToHive(file, username, signature);
        console.log('✅ Hive.blog upload successful:', url);
        return NextResponse.json({ success: true, url });
      } catch (hiveError) {
        console.warn('⚠️ Hive.blog upload failed:', hiveError);
        // Continue to fallback
      }
    }

    // Fallback to 3Speak
    try {
      console.log('📤 Attempting 3Speak fallback upload for:', file.name);
      const url = await uploadTo3Speak(file);
      console.log('✅ 3Speak upload successful:', url);
      return NextResponse.json({ success: true, url, source: '3speak' });
    } catch (fallbackError) {
      console.error('❌ 3Speak upload failed:', fallbackError);
      throw fallbackError;
    }

  } catch (error) {
    console.error('❌ Image upload failed:', error);
    return NextResponse.json(
      { 
        error: 'Image upload failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
