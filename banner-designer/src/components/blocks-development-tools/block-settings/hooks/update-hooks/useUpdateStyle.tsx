'use client'
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { updatePageContentSetByKey } from '@/store/builderActions';

const useUpdateStyle = () => {
    // other display Css dropdown open
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const updateStyle = (payloadArray: Array<{ key: string, value: any }>) => {
        if(payloadArray.length === 0){
            return;
        }
        const target = draftPageContentSet[`${selectedUid}`];
        if (!target) return; // stale selection (element deleted)
        const plainStyle = JSON.parse(JSON.stringify(target))
        for (const payload of payloadArray) {
            if (!payload.value || payload.value === null || payload.value === "" || payload.value === "delete") {
                delete plainStyle['style'][pageBuilder.theme][pageBuilder.cssHelperMediaQuery]["styles"][payload.key]
            } else {
                plainStyle['style'][pageBuilder.theme][pageBuilder.cssHelperMediaQuery]["styles"][payload.key] = payload.value
            }
        }
        // console.log("plainStyle ",plainStyle)
        dispatch(updatePageContentSetByKey({ key: String(selectedUid), value: plainStyle }))
    }
    return { update: updateStyle }
}

export default useUpdateStyle