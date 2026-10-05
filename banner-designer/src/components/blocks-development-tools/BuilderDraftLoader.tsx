'use client'
import React, { useEffect } from 'react';
import { siteFetch } from '@/store/siteFetch';
import { useSearchParams } from 'next/navigation';
import { useDispatch } from '@/store/builderHooks';
import { updatePageContentState, updateBuilderState } from '@/store/builderActions';
import { toast } from 'react-toastify';

/**
 * Loads the banner named by `?bannerId=` into the builder store.
 * Runs in both the designer shell and the bare iframe preview, so
 * `/?iframe=true&bannerId=X` renders a saved banner with no parent bridge
 * (that URL is what the kajkor agent screenshots).
 */
const BannerDraftLoader = () => {
  const searchParams = useSearchParams();
  const bannerId = searchParams?.get('bannerId');
  const isIframe = searchParams?.get('iframe') === 'true';
  const dispatch = useDispatch();

  useEffect(() => {
    if (!bannerId) {
      return;
    }

    const load = async () => {
      try {
        const response = await siteFetch(`/api/banners/${bannerId}`);
        const payload = await response.json();

        if (response.ok && payload?.draft?.builderData) {
          dispatch(updatePageContentState({ draftPageContentSet: payload.draft.builderData }));
        } else if (response.ok) {
          const publishedResponse = await siteFetch(`/api/banners/${bannerId}/published`);
          const publishedPayload = await publishedResponse.json();
          if (publishedResponse.ok && publishedPayload?.publishedVersion?.builderData) {
            dispatch(updatePageContentState({ draftPageContentSet: publishedPayload.publishedVersion.builderData }));
          }
        } else {
          toast.error(payload?.msg || 'Unable to load banner');
          return;
        }

        // In standalone preview mode there is no parent to set canvas size,
        // so adopt the banner's stored dimensions here.
        const banner = payload?.banner;
        if (isIframe && banner?.width && banner?.height) {
          dispatch(updateBuilderState({
            breakpoint: 'banner',
            cssHelperMediaQuery: 'default',
            theme: 'light',
            width: `${banner.width}px`,
            height: `${banner.height}px`,
            selectedUid: null,
            insertIntoUid: null,
            dropUid: null,
            dropIndex: null,
          }));
        }
      } catch (error) {
        console.error('BannerDraftLoader load error', error);
        toast.error('Unable to load banner');
      }
    };

    load();
  }, [dispatch, bannerId, isIframe]);

  return null;
};

export default BannerDraftLoader;
