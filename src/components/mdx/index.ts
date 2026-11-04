// Components available inside every post's MDX without an import line.
// Pass to <Content components={mdxComponents} />.
import Figure from './Figure.astro';
import Gallery from './Gallery.astro';
import YouTube from './YouTube.astro';
import Spotify from './Spotify.astro';
import ApplePodcasts from './ApplePodcasts.astro';
import AppleMusic from './AppleMusic.astro';
import Video from './Video.astro';
import Audio from './Audio.astro';
import Buttons from './Buttons.astro';
import LinkCard from './LinkCard.astro';
import Verse from './Verse.astro';

export const mdxComponents = {
  Figure,
  Gallery,
  YouTube,
  Spotify,
  ApplePodcasts,
  AppleMusic,
  Video,
  Audio,
  Buttons,
  LinkCard,
  Verse,
};
