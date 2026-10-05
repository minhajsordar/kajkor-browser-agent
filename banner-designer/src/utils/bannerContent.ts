/**
 * Banner canvas helpers. The builder keeps the CMS-era element model:
 * a flat uid -> element map where `body` is the artboard (fixed size,
 * position:relative, overflow:hidden) and direct children are absolutely
 * positioned via left/top styles. `systemAddedClass` is the CSS hook the
 * renderer emits styles under — it must equal the element's map key for
 * newly created elements.
 */

export const BANNER_PRESETS: Record<string, { label: string; width: number; height: number }> = {
  social: { label: 'Social post 1200×628', width: 1200, height: 628 },
  square: { label: 'Square 1080×1080', width: 1080, height: 1080 },
  story: { label: 'Story 1080×1920', width: 1080, height: 1920 },
  leaderboard: { label: 'Leaderboard 728×90', width: 728, height: 90 },
  mediumRect: { label: 'Medium rect 300×250', width: 300, height: 250 },
  wideSkyscraper: { label: 'Skyscraper 160×600', width: 160, height: 600 },
};

const emptyStyleBranch = () => ({
  styles: {},
  custom: '',
  hover: {},
});

const emptyTheme = () => ({
  default: emptyStyleBranch(),
  '478px': emptyStyleBranch(),
  '767px': emptyStyleBranch(),
  '991px': emptyStyleBranch(),
  '1280px': emptyStyleBranch(),
  '1440px': emptyStyleBranch(),
  '1920px': emptyStyleBranch(),
});

export function emptyBannerContent(width = 1200, height = 628) {
  return {
    body: {
      tag: 'main',
      id: '',
      classList: 'banner-canvas',
      systemAddedClass: 'banner-canvas',
      uid: 'body',
      parentId: '',
      child: [],
      style: {
        light: {
          ...emptyTheme(),
          default: {
            styles: {
              'background-color': '#ffffff',
              width: `${width}px`,
              height: `${height}px`,
              position: 'relative',
              overflow: 'hidden',
              'margin-left': 'auto',
              'margin-right': 'auto',
            },
            custom: '',
            hover: {},
          },
        },
      },
    },
  };
}
