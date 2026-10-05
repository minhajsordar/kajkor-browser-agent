'use client'
import { updateBuilderState } from '@/store/builderActions';
import { updatePageContentState } from '@/store/builderActions';
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
const IframeState = () => {

  const [origin, setOrigin] = React.useState("")
  const dispatch = useDispatch()
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const { breakpoint, width, height } = pageBuilder;

  React.useEffect(() => {
    if (window?.location?.origin) {
      setOrigin(window.location.origin)
    }
  }, [])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!origin || event.origin !== origin) {
        return;
      }

      const data = event.data;
      if (data.type === "builder-setting-state") {
        dispatch(updateBuilderState(data.value));
      }
      if (data.type === "builder-content-state") {
        dispatch(updatePageContentState(data.value));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [origin, dispatch])
  return (
    <></>
    // <div className='text-black bg-white'>
    //   <button onClick={() => sendMessageToParent("Message to parent")}>Send message to parent</button>
    // </div>
  )
}

export default IframeState