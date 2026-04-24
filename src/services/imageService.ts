import { config } from "../config";
import { cache } from "../utils/cache";

export interface ImageResult {
  imageUrl: string;
  thumbnailUrl: string;
  photographer: string;
  photographerUrl: string;
  unsplashId: string;
  downloadUrl: string;
  altDescription: string;
}

/**
 * Search Unsplash for relevant images.
 * Falls back to a placeholder if the API key is not configured.
 */
export async function searchImages(query: string, count: number = 1): Promise<ImageResult[]> {
  const cacheKey = `img_${query}_${count}`;
  const cached = cache.get<ImageResult[]>(cacheKey);
  if (cached) return cached;

  // If no Unsplash key, return placeholder images
  if (!config.unsplashAccessKey || config.unsplashAccessKey === "your_unsplash_access_key_here") {
    console.warn("[ImageService] No Unsplash API key configured. Using placeholders.");
    const placeholders: ImageResult[] = Array.from({ length: count }, (_, i) => ({
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(query + i)}/800/600`,
      thumbnailUrl: `https://picsum.photos/seed/${encodeURIComponent(query + i)}/200/150`,
      photographer: "Lorem Picsum",
      photographerUrl: "https://picsum.photos",
      unsplashId: `placeholder-${i}`,
      downloadUrl: `https://picsum.photos/seed/${encodeURIComponent(query + i)}/1200/900`,
      altDescription: query,
    }));
    return placeholders;
  }

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", count.toString());
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${config.unsplashAccessKey}`,
        "Accept-Version": "v1",
      },
    });

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    const results: ImageResult[] = (data.results || []).map((photo: any) => ({
      imageUrl: photo.urls?.regular || photo.urls?.small,
      thumbnailUrl: photo.urls?.thumb || photo.urls?.small,
      photographer: photo.user?.name || "Unknown",
      photographerUrl: photo.user?.links?.html || "https://unsplash.com",
      unsplashId: photo.id,
      downloadUrl: photo.urls?.full || photo.urls?.regular,
      altDescription: photo.alt_description || query,
    }));

    // Cache for 30 minutes (images don't change often)
    cache.set(cacheKey, results, 30);

    return results;
  } catch (err: any) {
    console.error(`[ImageService] Unsplash search failed: ${err.message}`);
    // Fallback to picsum
    return [
      {
        imageUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}/800/600`,
        thumbnailUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}/200/150`,
        photographer: "Lorem Picsum (fallback)",
        photographerUrl: "https://picsum.photos",
        unsplashId: "fallback",
        downloadUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}/1200/900`,
        altDescription: query,
      },
    ];
  }
}
