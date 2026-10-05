"use client"
import React from 'react'
import BlockLayoutSetting from '@/components/blocks-development-tools/block-settings/sub-settings/layout-setting/BlockLayoutSetting';
import { useSelector } from '@/store/builderHooks';
import "./BlockSettingsGlobalCss.css";
import BlockSpacingSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/BlockSpacingSetting';
import BlockSizeSetting from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/BlockSizeSetting';
import BlockPositionSetting from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/BlockPositionSetting';
import BlockTypographySetting from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/BlockTypographySetting';
import CustomScrollArea from '@/components/custom-scroller/CustomScrollArea';
import BlockBackgroundSetting from '@/components/blocks-development-tools/block-settings/sub-settings/background-setting/BlockBackgroundSetting';
import BlockBorderSetting from './sub-settings/border-setting/BlockBorderSetting';
import QuickProps from './QuickProps';
import CanvasSizeSetting from './CanvasSizeSetting';
import LayersPanel from './LayersPanel';

const BlocksSettings = () => {
  const [client, setClient] = React.useState(false)
  const [tab, setTab] = React.useState<'design' | 'layers'>('design')
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const { selectedUid, insertIntoUid } = pageBuilder;
  const pageContent = useSelector((state: any) => state.pageContent);
  // Stale/empty selection guard: the settings panels read
  // draftPageContentSet[selectedUid].style unguarded, so they must only
  // render when that element actually exists.
  const selectionExists = !!pageContent?.draftPageContentSet?.[`${selectedUid}`];

  React.useEffect(() => {
    setClient(true)
  }, [])
  if (!client) {
    return <></>
  }

  const tabBtn = (t: 'design' | 'layers') =>
    `flex-1 h-full text-xs font-semibold uppercase tracking-wider ${tab === t ? 'text-neutral-800 border-b-2 border-indigo-500' : 'text-neutral-400 hover:text-neutral-600'}`;

  return (
    <>
      <div className='flex h-full w-[264px] shrink-0 flex-col border-l border-neutral-200 bg-white'>
        <div className='flex h-9 w-full shrink-0 border-b border-neutral-200'>
          <button className={tabBtn('design')} onClick={() => setTab('design')}>Design</button>
          <button className={tabBtn('layers')} onClick={() => setTab('layers')}>Layers</button>
        </div>
        <div className='min-h-0 flex-1 setting-area-bg'>
          <CustomScrollArea>
            {tab === 'design' ? (
              <>
                <CanvasSizeSetting />
                {selectionExists ? (
                  <>
                    <QuickProps />
                    <BlockLayoutSetting />
                    <BlockSpacingSetting />
                    <BlockSizeSetting />
                    <BlockPositionSetting />
                    <BlockTypographySetting />
                    <BlockBackgroundSetting />
                    <BlockBorderSetting />
                  </>
                ) : (
                  <div className='p-3 text-xs text-neutral-400'>No element selected.</div>
                )}
              </>
            ) : (
              <LayersPanel />
            )}
          </CustomScrollArea>
        </div>
      </div>
    </>
  )
}

export default BlocksSettings
