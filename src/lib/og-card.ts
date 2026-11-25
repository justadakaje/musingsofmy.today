import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { fmtDate, readMinutes, type Post } from './posts';
import { SHOWS, SITE, sectionById, type SectionId } from '../site';

const require = createRequire(import.meta.url);

const SECTION_COLORS: Record<SectionId, string> = {
  engineering: '#22d3ee',
  'history-politics': '#c4b5fd',
  'science-nature': '#34d399',
  signal: '#f0abfc',
  'field-notes': '#e0a93b',
};

interface CachedAssets {
  fonts: {
    name: string;
    data: Buffer;
    weight: 400 | 500 | 700 | 800 | 900;
    style: 'normal';
  }[];
  avatarDataUri: string;
}

let cachedAssetsPromise: Promise<CachedAssets> | null = null;

function readFont(pkg: string, file: string): Buffer {
  const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  return fs.readFileSync(path.join(pkgDir, 'files', file));
}

async function loadAssets(): Promise<CachedAssets> {
  if (!cachedAssetsPromise) {
    cachedAssetsPromise = (async () => {
      const avatarPath = path.resolve(process.cwd(), 'src/assets/avatar.png');
      const avatarPng = await sharp(avatarPath).resize(88, 88).png().toBuffer();
      return {
        fonts: [
          {
            name: 'Montserrat',
            data: readFont('@fontsource/montserrat', 'montserrat-latin-800-normal.woff'),
            weight: 800,
            style: 'normal',
          },
          {
            name: 'Montserrat',
            data: readFont('@fontsource/montserrat', 'montserrat-latin-900-normal.woff'),
            weight: 900,
            style: 'normal',
          },
          {
            name: 'Inter',
            data: readFont('@fontsource/inter', 'inter-latin-400-normal.woff'),
            weight: 400,
            style: 'normal',
          },
          {
            name: 'JetBrains Mono',
            data: readFont('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff'),
            weight: 500,
            style: 'normal',
          },
          {
            name: 'JetBrains Mono',
            data: readFont('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff'),
            weight: 700,
            style: 'normal',
          },
        ],
        avatarDataUri: `data:image/png;base64,${avatarPng.toString('base64')}`,
      };
    })();
  }
  return cachedAssetsPromise;
}

function titleFontSize(length: number): number {
  if (length <= 52) return 52;
  if (length <= 85) return 44;
  if (length <= 120) return 38;
  return 33;
}

function truncateDescription(desc: string, max = 145): string {
  const clean = desc.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export async function renderPostOgPng(post: Post): Promise<Buffer> {
  const { fonts, avatarDataUri } = await loadAssets();
  const d = post.data;
  const section = sectionById(d.section);
  const laneColor = SECTION_COLORS[d.section] ?? '#22d3ee';
  const minutes = readMinutes(post.body);
  const titleSize = titleFontSize(d.title.length);
  const showDesc = Boolean(d.description?.trim()) && d.title.length <= 95;
  const desc = showDesc ? truncateDescription(d.description) : '';

  let rightBadge: { text: string; color: string; border: string } | null = null;
  if (d.podcast) {
    const showName = SHOWS[d.podcast.show].name.toUpperCase();
    const ep = d.podcast.episode ? ` · ${d.podcast.episode}` : '';
    rightBadge = {
      text: `PODCAST · ${showName}${ep}`,
      color: '#f5c95f',
      border: 'rgba(224, 169, 59, 0.55)',
    };
  } else if (d.series) {
    rightBadge = {
      text: `SERIES · PART ${d.series.part}`,
      color: '#67e8f9',
      border: 'rgba(34, 211, 238, 0.5)',
    };
  }

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          boxSizing: 'border-box',
          padding: '44px',
          backgroundColor: '#05070a',
          backgroundImage: `radial-gradient(circle at 86% 14%, ${laneColor}22, transparent 48%), radial-gradient(circle at 12% 92%, rgba(34, 211, 238, 0.14), transparent 52%)`,
          color: '#ffffff',
          fontFamily: 'Inter',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '1112px',
                height: '542px',
                display: 'flex',
                boxSizing: 'border-box',
                flexDirection: 'column',
                justifyContent: 'space-between',
                backgroundColor: '#0a1218',
                border: '2px solid rgba(34, 211, 238, 0.3)',
                borderTop: `4px solid ${laneColor}`,
                padding: '40px 52px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontFamily: 'JetBrains Mono',
                            fontSize: '20px',
                            fontWeight: 700,
                            color: laneColor,
                          },
                          children: [
                            {
                              type: 'span',
                              props: {
                                style: {
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '999px',
                                  backgroundColor: laneColor,
                                },
                              },
                            },
                            `// ${section.label}`,
                          ],
                        },
                      },
                      rightBadge
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                padding: '6px 14px',
                                border: `1px solid ${rightBadge.border}`,
                                backgroundColor: 'rgba(17, 29, 38, 0.9)',
                                fontFamily: 'JetBrains Mono',
                                fontSize: '16px',
                                fontWeight: 700,
                                color: rightBadge.color,
                              },
                              children: rightBadge.text,
                            },
                          }
                        : null,
                    ].filter(Boolean),
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '18px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontFamily: 'Montserrat',
                            fontWeight: 800,
                            fontSize: `${titleSize}px`,
                            lineHeight: 1.14,
                            letterSpacing: '-0.02em',
                            color: '#ffffff',
                          },
                          children: d.title,
                        },
                      },
                      desc
                        ? {
                            type: 'div',
                            props: {
                              style: {
                                fontFamily: 'Inter',
                                fontWeight: 400,
                                fontSize: '21px',
                                lineHeight: 1.45,
                                color: '#9bb0bd',
                              },
                              children: desc,
                            },
                          }
                        : null,
                    ].filter(Boolean),
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '22px',
                      borderTop: '1px solid rgba(34, 211, 238, 0.18)',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px',
                          },
                          children: [
                            {
                              type: 'img',
                              props: {
                                src: avatarDataUri,
                                width: 44,
                                height: 44,
                                style: { borderRadius: '999px' },
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  fontFamily: 'JetBrains Mono',
                                  fontSize: '20px',
                                  fontWeight: 700,
                                },
                                children: [
                                  {
                                    type: 'span',
                                    props: { style: { color: '#ffffff' }, children: 'musingsofmy' },
                                  },
                                  {
                                    type: 'span',
                                    props: { style: { color: '#22d3ee' }, children: '.today_' },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'span',
                              props: {
                                style: {
                                  fontFamily: 'JetBrains Mono',
                                  fontSize: '18px',
                                  fontWeight: 500,
                                  color: '#9bb0bd',
                                },
                                children: `· ${SITE.author}`,
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            fontFamily: 'JetBrains Mono',
                            fontSize: '18px',
                            fontWeight: 500,
                            color: '#9bb0bd',
                          },
                          children: `${fmtDate(d.date)}  ·  ${minutes} min read`,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    } as never,
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
