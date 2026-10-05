'use client'
import { setSelectedUid, updateBuilderState, updatePageContentState, undo, redo } from '@/store/builderActions';
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
const ParentState = () => {

  const [origin, setOrigin] = React.useState("")
  const dispatch = useDispatch()
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const pageContent = useSelector((state: any) => state.pageContent);
  const { breakpoint, width, height } = pageBuilder;
  // Inside the iframe's JavaScript

  React.useEffect(() => {
    // Inside the iframe's JavaScript
    const sendMessageToIframeBuilder = (message: any) => {
      const iframe = document.querySelector('.ui-builder-preview') as HTMLIFrameElement;
      const iframeWindow = iframe?.contentWindow;
      iframeWindow?.postMessage(message, origin); // Send message to iframe
    };
    if (pageBuilder) {
      sendMessageToIframeBuilder({ type: "builder-setting-state", value: pageBuilder })
    }
  }, [pageBuilder])
  React.useEffect(() => {
    // Inside the iframe's JavaScript
    const sendMessageToIframeBuilder = (message: any) => {
      const iframe = document.querySelector('.ui-builder-preview') as HTMLIFrameElement;
      const iframeWindow = iframe?.contentWindow;
      iframeWindow?.postMessage(message, origin); // Send message to iframe
    };
    if (pageContent) {
      sendMessageToIframeBuilder({ type: "builder-content-state", value: pageContent })
    }
  }, [pageContent])
  React.useEffect(() => {
    // console.log(window.location.origin)
    if (window?.location?.origin) {
      setOrigin(window.location.origin)
    }
  }, [])
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === origin) { // Ensure the message is from the expected origin
        console.log('Message received from iframe:', event.data, window.location.href);
        // dispatch(updateBuilderState(event.data));
        if (event.data?.type === "builder-state-from-iframe") {
          dispatch(updateBuilderState(event.data.value));
        }
        if (event.data?.type === "builder-content-from-iframe") {
          dispatch(updatePageContentState(event.data.value));
        }
        if (event.data?.type === "builder-undo-request") {
          dispatch(undo());
        }
        if (event.data?.type === "builder-redo-request") {
          dispatch(redo());
        }
        // Update your state here based on event.data
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [origin]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y in the parent window (iframe forwards
  // its own presses as undo-request messages above).
  React.useEffect(() => {
    const isEditable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch(undo());
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        dispatch(redo());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);
  return (
    <></>
    // <div className='text-black bg-white'>
    //   <button onClick={() => sendMessageToIframe("Message from parent log")}>Send message to Iframe</button>
    // </div>
  )
}

export default ParentState