import { tagSlug, type Post } from './posts';

/**
 * Rank related posts by shared tags, section, categories, and podcast show.
 * Excludes the current post and any siblings in the same multi-part series
 * (SeriesNav handles intra-series navigation).
 */
export function getRelatedPosts(current: Post, allPosts: Post[], limit = 3): Post[] {
  const currentSeriesId = current.data.series?.id;
  const currentTags = new Set(current.data.tags.map(tagSlug));
  const currentCategories = new Set(current.data.categories.map((c) => c.trim().toLowerCase()));
  const currentShow = current.data.podcast?.show;

  const scored: Array<{ post: Post; score: number }> = [];

  for (const candidate of allPosts) {
    if (candidate.id === current.id) continue;
    if (currentSeriesId && candidate.data.series?.id === currentSeriesId) continue;

    let score = 0;

    if (currentTags.size > 0 && candidate.data.tags.length > 0) {
      const candidateTags = new Set(candidate.data.tags.map(tagSlug));
      for (const slug of candidateTags) {
        if (currentTags.has(slug)) score += 4;
      }
    }

    if (candidate.data.section === current.data.section) {
      score += 2;
    }

    if (currentCategories.size > 0 && candidate.data.categories.length > 0) {
      const candidateCategories = new Set(
        candidate.data.categories.map((c) => c.trim().toLowerCase()),
      );
      for (const cat of candidateCategories) {
        if (currentCategories.has(cat)) score += 1;
      }
    }

    if (currentShow && candidate.data.podcast?.show === currentShow) {
      score += 1;
    }

    if (score > 0) {
      scored.push({ post: candidate, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.post.data.date.valueOf() - a.post.data.date.valueOf();
  });

  return scored.slice(0, limit).map((entry) => entry.post);
}
