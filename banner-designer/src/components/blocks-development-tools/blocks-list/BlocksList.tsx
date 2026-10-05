"use client"
import React from 'react'
import { nanoid } from 'nanoid';
import { useDispatch, useSelector } from '@/store/builderHooks';
import { IoMdAdd } from "react-icons/io";
import { addPageBlock } from '@/store/builderActions';
import registeredBlocks, { BlockElementIdentifier, BlockElementIdentifierWithCategory } from './registeredBlocks';
import { setInsertIntoUid, setSelectedUid } from '@/store/builderActions';
import { IoCloseCircle } from 'react-icons/io5';
import "./BlocksList.css"

const BlocksList = () => {
  const dispatch = useDispatch()
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const { selectedUid, insertIntoUid } = pageBuilder;
  const pageContent = useSelector((state: any) => state.pageContent);
  const { draftPageContentSet } = pageContent;
  const handleClearSelection = () => {
    // console.log(d)
    if (selectedUid) {
      dispatch(setSelectedUid(null));
      dispatch(setInsertIntoUid(null));
    }
  };
  const handleCloseInserPannel = () => {
    // console.log(d)
    if (selectedUid) {
      dispatch(setInsertIntoUid(null));
    }
  };
  const dragStart = (e: React.DragEvent<HTMLDivElement>, data: any) => {
    e.dataTransfer.setData("text/plain", JSON.stringify(data))
  }
  const drop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    const data = e.dataTransfer.getData("text/plain");
    const dataInJson: BlockElementIdentifier = JSON.parse(data)
    const uniqueClass = "uid-" + nanoid()
    dataInJson.systemAddedClass = uniqueClass;
    dataInJson.parentId = String(insertIntoUid);
    // console.log("Drop", dataInJson, index);
    // update page content state
    dispatch(addPageBlock({
      uid: String(insertIntoUid),
      index,
      newElement: dataInJson
    }));
    // dropable area back to it's own height
    (e.target as HTMLDivElement).style.height = "20px";
    // clean selection
    handleClearSelection();
  }
  const dragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.target as HTMLDivElement;
    if (target) {
      target.style.height = "50px";
    }
  }
  const dragLeav = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    console.log("Drag over", e);
    (e.target as HTMLDivElement).style.height = "20px";
  }
  if (insertIntoUid) {
    const insertIntoElement = draftPageContentSet[`${insertIntoUid}`]
    if (!Object.hasOwn((insertIntoElement || {}), 'child')) {
      return <div className='fixed inset-x-0 bottom-0 top-[48px] z-[999999999]'>
        <div className='absolute right-0 top-0 h-full w-[264px] blocks-list-area border-l border-neutral-200 bg-white'>
          <div className='h-[40px] w-full blocks-list-area-header'>
            <button className='text-xs' title="Close left pannel."
              onClick={handleCloseInserPannel}
            >
              <IoCloseCircle />
            </button>
          </div>
          <div className='py-2'>
            <div>
              <p> Selected Element Dose not support insertion into it. because it is leaf element. Click {"\"Select Parent\""} button to insert element as sibling.</p>
            </div>
          </div>
        </div>
      </div>
    } else {
      return (
        <>
          <div className='fixed inset-x-0 bottom-0 top-[48px] z-[999999999]'>
            <div className='absolute right-0 top-0 h-full w-[264px] blocks-list-area border-l border-neutral-200 bg-white'>
              <div className='h-[20px] w-full blocks-list-area-header flex justify-end px-1'>
                <button className='text-xs' title="Close left pannel."
                  onClick={handleCloseInserPannel}
                >
                  <IoCloseCircle />
                </button>
              </div>
              <div className='p-0.5'>
                {/* <div className='px-1'>blocks list</div> */}
                {registeredBlocks.map((elem: BlockElementIdentifierWithCategory, index: number) => (
                  <div className='blocks-group-area' key={index}>
                    <div className='blocks-group-area-header'>
                      <p className=''>{elem?.category}</p>
                    </div>
                    <div className='blocks-group-area-content'>
                      <div className='flex -m-0.5 flex-wrap'>
                        {elem.blocks.map((element: BlockElementIdentifier, indexel: number) => (
                          <div className='w-1/2 p-0.5 cursor-grab' draggable
                            onDragStart={(e) => dragStart(e, element)}
                            key={index + "-" + indexel}
                          >
                            <div className='block-item p-1'>
                              {element?.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className='h-full w-full flex justify-center items-center'>
              <div className='block-drop-area'>
                <div className='block-drop-area-header'>
                  Drop Inbetween Blocks
                </div>
                <div className='h-[500px] overflow-auto'>
                  <div className='block-dropable-area'>
                    <div className='block-dropable-input'
                      onDrop={(event) => drop(event, 0)}
                      onDragOver={(event) =>
                        dragOver(event)
                      }
                      onDragLeave={(event) => dragLeav(event)}
                      title='Drag element from left pannel and drop here.'
                    >
                      <IoMdAdd />
                    </div>
                  </div>
                  {insertIntoElement?.child?.map((item: any, index: number) => (
                    <React.Fragment key={index}>
                      <div className='block-exisiting-elements'
                        title='Inner element of selected element.'
                      >
                        <p className=''>{"<"}{draftPageContentSet[`${item}`].tag}{" />"}</p>
                      </div>
                      <div className='block-dropable-area'>
                        <div className='block-dropable-input'
                          onDrop={(event) => drop(event, index + 1)}
                          onDragOver={(event) =>
                            dragOver(event)
                          }
                          onDragLeave={(event) => dragLeav(event)}
                          title='Drag element from left pannel and drop here.'
                        >
                          <IoMdAdd />
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )
    }
  } else {
    return <></>
  }
}

export default BlocksList