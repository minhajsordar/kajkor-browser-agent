"use client"
import React, { useId } from 'react'
import { SearchParamsInterface } from "@/interfaces/product";
import './PageBuilderElementRenderer.css'
import { pageBlocksMap } from './pageBlocksMap';
import { useDispatch, useSelector } from '@/store/builderHooks';
import { setSelectedUid, updatePageContentState } from '@/store/builderActions';
import { cleanAttributes } from '@/utils/normalizeBanner';

const PageBuilderElementRenderer = ({
  searchParams,
  pageContentSet,
  pageContentProp,
  contentKey,
}: { searchParams: SearchParamsInterface, pageContentSet: any, pageContentProp: any, contentKey: string }) => {
  const containerUid = useId();
  const dispatch = useDispatch()
  const pageContent = useSelector((state: any) => state.pageContent);
  const { draftPageContentSet } = pageContent;
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const { selectedUid } = pageBuilder;
  const sendMessageToParent = (message: any) => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, window.location.origin);
    }
  };
  const clickedOnElement = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    const pageBuilderStateObject = JSON.parse(JSON.stringify(pageBuilder))
    pageBuilderStateObject.selectedUid = contentKey
    sendMessageToParent({ type: "builder-state-from-iframe", value: pageBuilderStateObject })
    // Also update the iframe-local store so the selection indicator + drag
    // work even when the parent hasn't echoed the state back yet.
    dispatch(setSelectedUid(contentKey))
  }

  // Drag-to-move: only when the element is already selected and it is a
  // direct child of the artboard (absolute positioned). Updates the iframe
  // store live; the full content set is pushed to the parent on mouseup.
  const dragState = React.useRef<{
    startX: number; startY: number; left: number; top: number; moved: boolean;
  } | null>(null);

  // Double-click inline text editing: only for leaf elements that carry a
  // `text` field. Edits the DOM directly, commits to the store on blur
  // (Esc restores the original), then pushes to the parent.
  const onDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    const element = draftPageContentSet?.[contentKey];
    if (!element || !Object.hasOwn(element, 'text')) return;
    if (Array.isArray(element.child) && element.child.length) return;
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    if (el.isContentEditable) return;
    const original = el.innerText;
    el.contentEditable = 'true';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const finish = (commit: boolean) => {
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      el.contentEditable = 'false';
      const text = commit ? el.innerText : original;
      el.innerText = text;
      if (text !== element.text) {
        const next = JSON.parse(JSON.stringify(pageContentRef.current));
        next.draftPageContentSet[contentKey].text = text;
        dispatch(updatePageContentState(next));
        sendMessageToParent({
          type: 'builder-content-from-iframe',
          value: { draftPageContentSet: next.draftPageContentSet },
        });
      }
    };
    const onBlur = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    };
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  };

  // Right-click: select the element and open the custom context menu
  // (suppresses the browser's default menu).
  const onContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    clickedOnElement(event);
    window.dispatchEvent(new CustomEvent('banner-context-menu', {
      detail: { x: event.clientX, y: event.clientY, uid: contentKey },
    }));
  };

  const onMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.currentTarget as HTMLElement).isContentEditable) return;
    if (selectedUid !== contentKey) return;
    if (draftPageContentSet?.[contentKey]?.locked) return;
    const element = draftPageContentSet?.[contentKey];
    if (!element || element.parentId !== 'body') return;
    const styles = element.style?.light?.default?.styles || {};
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: parseFloat(styles.left) || 0,
      top: parseFloat(styles.top) || 0,
      moved: false,
    };
    // Snap candidates: canvas edges/centres plus each sibling's
    // left/center/right and top/middle/bottom (parent-relative px, same
    // space as the dragged element's left/top).
    const canvasEl = document.querySelector('.banner-canvas') as HTMLElement | null;
    const canvasW = canvasEl?.offsetWidth || 0;
    const canvasH = canvasEl?.offsetHeight || 0;
    const SNAP = 6;
    const linesX: number[] = [0, canvasW / 2, canvasW];
    const linesY: number[] = [0, canvasH / 2, canvasH];
    for (const sibUid of draftPageContentSet?.body?.child || []) {
      if (sibUid === contentKey) continue;
      const s = draftPageContentSet[sibUid]?.style?.light?.default?.styles || {};
      const l = parseFloat(s.left), t = parseFloat(s.top), w = parseFloat(s.width), h = parseFloat(s.height);
      if (!Number.isNaN(l)) {
        linesX.push(l);
        if (!Number.isNaN(w)) linesX.push(l + w / 2, l + w);
      }
      if (!Number.isNaN(t)) {
        linesY.push(t);
        if (!Number.isNaN(h)) linesY.push(t + h / 2, t + h);
      }
    }
    const elW = (event.currentTarget as HTMLElement).offsetWidth;
    const elH = (event.currentTarget as HTMLElement).offsetHeight;

    const guideCss = 'position:absolute;pointer-events:none;background:#818cf8;z-index:2147483647;';
    let guideV: HTMLDivElement | null = null;
    let guideH: HTMLDivElement | null = null;
    const showGuides = (x: number | null, y: number | null) => {
      if (!canvasEl) return;
      if (x !== null) {
        if (!guideV) { guideV = document.createElement('div'); canvasEl.appendChild(guideV); }
        guideV.style.cssText = `${guideCss}left:${x}px;top:0;width:1px;height:${canvasH}px;`;
      } else { guideV?.remove(); guideV = null; }
      if (y !== null) {
        if (!guideH) { guideH = document.createElement('div'); canvasEl.appendChild(guideH); }
        guideH.style.cssText = `${guideCss}left:0;top:${y}px;width:${canvasW}px;height:1px;`;
      } else { guideH?.remove(); guideH = null; }
    };
    const snapTo = (anchor: number, extent: number, lines: number[]) => {
      let best = { pos: anchor, line: null as number | null, dist: SNAP + 1 };
      for (const off of [0, extent / 2, extent]) {
        for (const line of lines) {
          const dist = Math.abs(anchor + off - line);
          if (dist <= SNAP && dist < best.dist) best = { pos: line - off, line, dist };
        }
      }
      return best;
    };

    const onMove = (e: MouseEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      drag.moved = true;
      // Viewport px → canvas px (the stage is visually scaled).
      const sc = (window as any).__canvasScale || 1;
      const sx = snapTo(drag.left + (e.clientX - drag.startX) / sc, elW, linesX);
      const sy = snapTo(drag.top + (e.clientY - drag.startY) / sc, elH, linesY);
      showGuides(sx.line, sy.line);
      const next = JSON.parse(JSON.stringify(pageContentRef.current));
      const s = next.draftPageContentSet?.[contentKey]?.style?.light?.default?.styles;
      if (!s) return;
      s.left = `${Math.round(sx.pos)}px`;
      s.top = `${Math.round(sy.pos)}px`;
      dispatch(updatePageContentState(next));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      guideV?.remove();
      guideH?.remove();
      if (dragState.current?.moved) {
        sendMessageToParent({
          type: 'builder-content-from-iframe',
          value: { draftPageContentSet: pageContentRef.current.draftPageContentSet },
        });
      }
      dragState.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Keep a ref of the latest content so drag closures don't go stale.
  const pageContentRef = React.useRef(pageContent);
  pageContentRef.current = pageContent;

  const currentContentSet = pageContentSet || draftPageContentSet;
  const currentElement = pageContentProp || currentContentSet?.[contentKey];

  return (
    <React.Fragment>
      {
        currentElement &&
        <TagsWrapper
          tagname={currentElement.tag}
          searchParams={searchParams}
          node={currentElement}
          key={`${containerUid}`}
          props={{
            key: `${containerUid}sr`,
            className: `${currentElement.systemAddedClass} ${String(currentElement.classList)} ${selectedUid === contentKey ? 'builder-selected-element-indicator' : ''}`,
            onClick: clickedOnElement,
            onDoubleClick,
            onContextMenu,
            onMouseDown,
            // cleanAttributes strips props React owns (string `style`
            // crashes it, `children` crashes void tags) — needed for
            // drafts saved before the normalizer filtered them.
            ...(cleanAttributes(currentElement.attributes) || {}),
          }}
        >
          {Object.hasOwn(currentElement, 'text') &&
            currentElement.text
          }
          {
            typeof (currentElement) === 'object' && Object.hasOwn(currentElement, 'child') ?
              currentElement.child.map((elmKey: any, elmindex: number) => {
                const childElement = currentContentSet?.[`${elmKey}`];
                if (typeof (childElement) === 'object') {
                  return <React.Fragment
                    key={String(containerUid) + "-elmfr" + String(elmindex)}
                  >
                    <PageBuilderElementRenderer
                      key={String(containerUid) + "-elm" + String(elmindex)}
                      searchParams={searchParams}
                      pageContentSet={currentContentSet}
                      pageContentProp={childElement}
                      contentKey={`${elmKey}`}
                    />
                  </React.Fragment>
                }
              })
              : ""
          }

        </TagsWrapper>
      }
    </React.Fragment>

  )
}

export default PageBuilderElementRenderer;

// Void elements can never take children — passing any crashes React's
// createElement ("img is a void element tag..."). AI output occasionally
// gives <img> a text or children, so guard at render time too.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const TagsWrapper = ({ searchParams, tagname, props, children, node }: { tagname: string, searchParams: SearchParamsInterface, props: any, children: React.ReactNode, node?: any }) => {
  const otherProps: any = { ...props };
  if (props.className.trim()) {
    otherProps.className = props.className.trim()
  }

  // Prebuild blocks renderer
  // render elements which is imported in pageBlocksMap js file
  if (Object.keys(pageBlocksMap).includes(tagname)) {
    otherProps.searchParams = searchParams
    otherProps.node = node
    const Component = pageBlocksMap[tagname];
    return React.createElement(Component, otherProps, children)
  }
  else if (VOID_TAGS.has(tagname)) {
    return React.createElement(tagname, otherProps)
  }
  else {
    return React.createElement(tagname, otherProps, children)
  }
}
