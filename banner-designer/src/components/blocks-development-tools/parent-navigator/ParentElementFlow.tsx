"use client"
import React from 'react'
import { setInsertIntoUid, setSelectedUid, updatePageBreakPointPreview } from '@/store/builderActions';
import { useDispatch, useSelector } from '@/store/builderHooks';
const ParentElementFlow = () => {
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;
    const [parentList, setParentList] = React.useState<any[]>([])
    const getParentObject = (id: string) => {
        const parentObjects = [];
        let currentId = id;
        while (currentId) {
            const raw = draftPageContentSet[currentId];
            // Element may be gone (deleted while still selected) — stop.
            if (!raw) break;
            const obj = JSON.parse(JSON.stringify(raw));
            obj.uid = currentId;
            parentObjects.unshift(obj);
            currentId = obj.parentId;
        }
        return parentObjects;
    }
    const selectElementFromParentFlow = (id: string) => {
        if(id){
            dispatch(setSelectedUid(id))
        }
    }
    React.useEffect(() => {
        if (selectedUid) {
            if (getParentObject(selectedUid)) {
                setParentList(getParentObject(selectedUid))
            } else {
                setParentList([])
            }
        }

    }, [selectedUid, draftPageContentSet])
    return (
        <div className='flex gap-1 items-center h-full px-2'>
            {
                parentList.map((element: any, index: number) => (
                    <button
                        className='bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200 px-2 py-1 rounded-md text-xs'
                        onClick={() => selectElementFromParentFlow(element?.uid)}
                        key={index}
                    >
                        {element?.tag}
                    </button>
                ))
            }
        </div>
    )
}

export default ParentElementFlow