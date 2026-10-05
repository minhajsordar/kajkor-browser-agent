'use client'
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { updatePageContentSetByKey } from '@/store/builderActions';

const useInitialCssValue = () => {
    // other display Css dropdown open
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const stylesAt = (media: string) =>
        draftPageContentSet?.[selectedUid]?.['style']?.[pageBuilder.theme]?.[media]?.["styles"] || {};

    const exist = (key: string) => {
        if (Object.hasOwn(stylesAt(pageBuilder.cssHelperMediaQuery), `${key}`)) {
            // if other media property exist including default
            return true
        } else {
            // if other media property not exist return inherited from default
            return Object.hasOwn(stylesAt("default"), `${key}`)
        }
    }
    const get = (key: string) => {
        if (Object.hasOwn(stylesAt(pageBuilder.cssHelperMediaQuery), `${key}`)) {
            // if other media property exist including default
            return { value: stylesAt(pageBuilder.cssHelperMediaQuery)[key], inheritedFromDefault: false }
        } else {
            // if other media property not exist return inherited from default
            return { value: stylesAt("default")[key], inheritedFromDefault: true }
        }
    }
    return { exist, get }
}

export default useInitialCssValue