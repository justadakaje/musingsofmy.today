// Shared word counting, used by the importer (WordPress side) and by
// check-wordcount.mjs (built-site side). Both sides MUST use this one function,
// otherwise the ±2% comparison measures the tokenizers instead of the content.
import { parseHTML } from 'linkedom';

const BLOCK_TAGS =
  /<\/?(p|div|li|ul|ol|h[1-6]|br|hr|figure|figcaption|blockquote|tr|td|th|thead|tbody|tfoot|table|caption|pre|section|article|aside|details|summary|dt|dd|dl|cite|header|footer|nav|main)\b[^>]*>/gi;

/** Elements that are not reading text: players, scripts, inline SVG, forms. */
const IGNORE = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'form',
  'audio',
  'video',
  '.wp-block-embed__wrapper',
  '[data-wc-ignore]',
];

export function htmlToText(html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const sel of IGNORE) document.querySelectorAll(sel).forEach((n) => n.remove());
  // WordPress turns emoji into <img class="wp-smiley" alt="😎">; count the emoji, not the image.
  document.querySelectorAll('img.wp-smiley, img.emoji').forEach((img) => {
    img.replaceWith(document.createTextNode(img.getAttribute('alt') || ''));
  });
  const flat = document.body.innerHTML.replace(BLOCK_TAGS, ' ').replace(/<[^>]+>/g, '');
  const { document: d2 } = parseHTML(`<!doctype html><html><body><p>${flat}</p></body></html>`);
  return (d2.querySelector('p')?.textContent ?? '').replace(/￼/g, '');
}

export function countWords(html) {
  return htmlToText(html)
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
