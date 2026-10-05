"use client"
import React from 'react'
import { SearchParamsInterface } from "@/interfaces/product";
import { useDispatch, useSelector } from '@/store/builderHooks';
import { updateBuilderState } from '@/store/builderActions';
import PageBuilderElementRenderer from './PageBuilderElementRenderer';
import PageBuilderCssRenderer from './css-renderer/PageBuilderCssRenderer';
import SelectedElementIndicator from './SelectedElementIndicator';
import CanvasShortcuts from './CanvasShortcuts';
import CanvasDropZone from './CanvasDropZone';
import CanvasContextMenu from './CanvasContextMenu';

/**
 * Iframe document. Two modes:
 *  - ?editor=true: Canva-style workspace — the artboard is centered on a
 *    gray pasteboard and scaled via the --canvas-scale CSS var (fit/zoom
 *    from pageBuilder, synced by postMessage). Elements may spill onto the
 *    pasteboard; text never clips; nothing scrolls.
 *  - plain ?iframe=true: standalone preview (kajkor screenshot URL) — the
 *    artboard fills the viewport exactly, scale 1.
 */
const PageBuilderRendererEntryPoint = ({
  searchParams,
  builderData,
}: { searchParams: SearchParamsInterface, builderData?: any }) => {
  const dispatch = useDispatch();
  const pageContent = useSelector((state: any) => state.pageContent);
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const { draftPageContentSet } = pageContent;
  const contentSet = builderData || draftPageContentSet;
  const rootContent = contentSet?.body;
  const zoom = pageBuilder?.zoom;
  const pageBuilderRef = React.useRef(pageBuilder);
  pageBuilderRef.current = pageBuilder;

  React.useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    (document.documentElement.style as any).scrollbarWidth = 'none';
    document.body.style.overflow = 'hidden';
    const isEditor = new URLSearchParams(window.location.search).has('editor');
    document.documentElement.classList.toggle('editor-mode', isEditor);
    const style = document.createElement('style');
    style.textContent = `
      html.editor-mode, html.editor-mode body { background: #edeff2 !important; }
      /* The stage scales about the viewport centre, so the flex-centred
         artboard stays centred at any zoom. Scale lives on the stage —
         NOT on .banner-canvas — so html-to-image exports a clean node. */
      html.editor-mode .canvas-stage {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        transform: translate(var(--canvas-pan-x, 0px), var(--canvas-pan-y, 0px)) scale(var(--canvas-scale, 1));
        transform-origin: center center;
      }
      html.editor-mode .banner-canvas {
        flex: none;
        overflow: visible !important;
        box-shadow: 0 8px 40px rgba(15,23,42,0.25) !important;
      }
      /* Never clip text in the editor — a designer must see all of it,
         even past the element box. Containers keep their clipping. */
      html.editor-mode .banner-canvas h1, html.editor-mode .banner-canvas h2,
      html.editor-mode .banner-canvas h3, html.editor-mode .banner-canvas h4,
      html.editor-mode .banner-canvas h5, html.editor-mode .banner-canvas h6,
      html.editor-mode .banner-canvas p, html.editor-mode .banner-canvas span,
      html.editor-mode .banner-canvas button, html.editor-mode .banner-canvas a {
        overflow: visible !important;
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // Pan offsets (screen px) — shared by the zoom effect (fit resets pan)
  // and the wheel/drag handlers below.
  const setPan = (x: number, y: number) => {
    (window as any).__panX = x;
    (window as any).__panY = y;
    document.documentElement.style.setProperty('--canvas-pan-x', `${x}px`);
    document.documentElement.style.setProperty('--canvas-pan-y', `${y}px`);
  };

  // Fit/zoom → --canvas-scale + window.__canvasScale (used by drag/resize
  // handlers to convert viewport-px deltas back into canvas px).
  React.useEffect(() => {
    const apply = () => {
      const canvas = document.querySelector('.banner-canvas') as HTMLElement | null;
      if (!canvas) return;
      let scale: number;
      if (zoom === 'fit' || !zoom) {
        scale = Math.min(
          (window.innerWidth - 96) / (canvas.offsetWidth || 1),
          (window.innerHeight - 96) / (canvas.offsetHeight || 1),
          1,
        );
      } else {
        scale = (Number(zoom) || 100) / 100;
      }
      scale = Math.max(0.05, scale);
      document.documentElement.style.setProperty('--canvas-scale', String(scale));
      (window as any).__canvasScale = scale;
      // Fit recentres the canvas — drop any accumulated pan.
      if (zoom === 'fit' || !zoom) setPan(0, 0);
    };
    // Defer one tick so the canvas has laid out before measuring it.
    const raf = requestAnimationFrame(apply);
    window.addEventListener('resize', apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', apply);
    };
  }, [zoom, rootContent]);

  // Pan + zoom input, Canva-style (editor mode only):
  //   wheel = pan · shift+wheel = horizontal · ctrl+wheel = zoom
  //   Space+drag or middle-drag = pan
  React.useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('editor')) return;
    const isEditable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
    };

    let spaceDown = false;
    let panning = false, lastX = 0, lastY = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom — route through the store so the footer slider stays in sync.
        const cur = (window as any).__canvasScale || 1;
        const next = Math.min(4, Math.max(0.1, cur * (e.deltaY > 0 ? 0.9 : 1.1)));
        const pb = { ...pageBuilderRef.current, zoom: Math.round(next * 100) };
        dispatch(updateBuilderState(pb));
        window.parent?.postMessage({ type: 'builder-state-from-iframe', value: pb }, window.location.origin);
        return;
      }
      setPan(
        ((window as any).__panX || 0) - e.deltaX,
        ((window as any).__panY || 0) - e.deltaY,
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        spaceDown = true;
        document.body.style.cursor = 'grab';
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false;
        if (!panning) document.body.style.cursor = '';
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (spaceDown || e.button === 1) {
        panning = true;
        lastX = e.clientX; lastY = e.clientY;
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!panning) return;
      setPan(
        ((window as any).__panX || 0) + e.clientX - lastX,
        ((window as any).__panY || 0) + e.clientY - lastY,
      );
      lastX = e.clientX; lastY = e.clientY;
    };
    const onMouseUp = () => {
      panning = false;
      document.body.style.cursor = spaceDown ? 'grab' : '';
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <React.Suspense>
      <div className='canvas-stage'>
        <PageBuilderElementRenderer
          searchParams={searchParams}
          pageContentSet={contentSet}
          pageContentProp={rootContent}
          contentKey="body"
        />
      </div>
      <PageBuilderCssRenderer />
      <SelectedElementIndicator />
      <CanvasShortcuts />
      <CanvasDropZone />
      <CanvasContextMenu />
    </React.Suspense>
  )
}

export default PageBuilderRendererEntryPoint;
