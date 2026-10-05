'use client'
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { updatePageContentSetByKey } from '@/store/builderActions';

const useSelectedStyle = ({ styleKeys = [] }: { styleKeys?: string[] }) => {
    // other display Css dropdown open
    const [stateObject, setStateObject] = React.useState<any>({})
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const updateStyle = (key: string, value: any) => {
        const target = draftPageContentSet[`${selectedUid}`];
        if (!target) return; // stale selection (element deleted)
        const plainStyle = JSON.parse(JSON.stringify(target))
        if (!value || value === null || value === "" || value === "delete") {
            delete plainStyle['style'][pageBuilder.theme][pageBuilder.cssHelperMediaQuery]["styles"][key]
        } else {
            plainStyle['style'][pageBuilder.theme][pageBuilder.cssHelperMediaQuery]["styles"][key] = value
        }
        // console.log(plainStyle)
        dispatch(updatePageContentSetByKey({ key: String(selectedUid), value: plainStyle }))
    }
    const exist = (key: string) => {
        return Object.hasOwn(draftPageContentSet[selectedUid]?.['style']?.[pageBuilder.theme]?.[pageBuilder.cssHelperMediaQuery]?.["styles"] || {}, `${key}`)
    }
    const get = (key: string) => {
        return draftPageContentSet[selectedUid]?.['style']?.[pageBuilder.theme]?.[pageBuilder.cssHelperMediaQuery]?.["styles"]?.[key]
    }
    React.useEffect(() => {
        if (selectedUid && styleKeys.length > 0) {
            const initialStateObject: any = {}
            for (const styleKey of styleKeys) {
                if (exist(`${styleKey}`)) {
                    initialStateObject[`${styleKey}`] = String(get(`${styleKey}`))
                } else {
                    initialStateObject[`${styleKey}`] = ""
                }

            }
        }
    }, [pageBuilder, draftPageContentSet])
    return { update: updateStyle, stateObject}
}

export default useSelectedStyle