'use client';
import { SearchParamsPageBuilderInterface } from '@/interfaces/product';
import React, { useEffect, useState, useRef } from 'react';
import { useSelector } from '@/store/builderHooks';

/**
 * The preview iframe fills the whole workspace. Zoom, fit and the
 * pasteboard are applied INSIDE the iframe document (canvas-stage +
 * --canvas-scale), so the DOM, the hit-testing and the selection chrome
 * all live in the same coordinate space — no cross-boundary scaling.
 */
const PageResponsivePreview = ({ searchParams }: { searchParams: SearchParamsPageBuilderInterface }) => {
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const pageContent = useSelector((state: any) => state.pageContent);
  const { draftPageContentSet } = pageContent;

  const [origin, setOrigin] = useState("");
  const [otherSearchParams, setOtherSearchParams] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendStateToIframe = () => {
    if (!origin || !iframeRef.current?.contentWindow) {
      return;
    }

    const iframeWindow = iframeRef.current.contentWindow;
    iframeWindow.postMessage({ type: 'builder-setting-state', value: pageBuilder }, origin);
    iframeWindow.postMessage({ type: 'builder-content-state', value: { draftPageContentSet } }, origin);
  };

  useEffect(() => {
    if (window?.location?.origin) {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (searchParams) {
      const params = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (key !== 'iframe') {
          params.append(key, String(value));
        }
      });
      setOtherSearchParams(params.toString());
    }
  }, [searchParams]);

  useEffect(() => {
    sendStateToIframe();
  }, [pageBuilder, draftPageContentSet, origin]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        background: '#edeff2',
      }}
    >
      {origin ? (
        <iframe
          ref={iframeRef}
          className="ui-builder-preview"
          src={`${origin}/?iframe=true&editor=true&${otherSearchParams}`}
          style={{
            border: 'none',
            display: 'block',
            width: '100%',
            height: '100%',
            background: 'transparent',
          }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-pointer-lock allow-orientation-lock allow-modals allow-forms"
          allow="geolocation 'self'"
          name="simulator"
          title="banner designer canvas"
          onLoad={sendStateToIframe}
        ></iframe>
      ) : (
        ""
      )}
    </div>
  );
};

export default PageResponsivePreview;
