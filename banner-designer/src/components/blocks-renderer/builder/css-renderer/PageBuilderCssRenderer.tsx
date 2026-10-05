"use client"
import React from 'react'
import * as changeCase from "change-case";
import { useDispatch, useSelector } from '@/store/builderHooks';
import { specialCssHandlers } from './specialCssHandlers';

const PageBuilderCssRenderer = () => {
  const dispatch = useDispatch()
  const pageContent = useSelector((state: any) => state.pageContent);
  const { draftPageContentSet } = pageContent;
  const screensList: [
    "default",
    // min-width
    "1280px",
    "1440px",
    "1920px",
    // max-width
    "991px",
    "767px",
    "478px",
  ] = [
      "default",
      // min-width
      "1280px",
      "1440px",
      "1920px",
      // max-width
      "991px",
      "767px",
      "478px",
    ]
  const addWebkitFor: any = {
    "text-stroke-width": ["-webkit-text-stroke-width"],
    "text-stroke-color": ["-webkit-text-stroke-color"]
  }
  const getstyles = (elementObject: any) => {
    let styles = ``;
    for (const key in elementObject) {
      if (Object.prototype.hasOwnProperty.call(elementObject, key)) {
        const data = elementObject[key];
        if (data?.style && data?.style?.light) {
          for (const lightMediaQuerys of screensList) {
            if (lightMediaQuerys in data?.style?.light && data?.systemAddedClass.trim() && Object.keys(data?.style?.light[lightMediaQuerys]).length > 0) {
              // console.log(`${lightMediaQuerys}:`);
              // console.log(data?.style?.light[lightMediaQuerys])
              // getFormattedCss function created for getting hovered css and styles css key
              // structure of styles object and hovered object is same that's why getFormattedCss function has been created
              const getFormattedCss = (keyofstyle: 'styles' | 'hover') => {
                let localstyle = ``
                // keyofstyle would be either styles or hover
                if (data?.style?.light[lightMediaQuerys][keyofstyle] && Object.keys(data?.style?.light[lightMediaQuerys][keyofstyle]).length > 0) {
                  for (const cssParameterkey in data?.style?.light[lightMediaQuerys][keyofstyle]) {
                    if (data?.style?.light[lightMediaQuerys][keyofstyle][cssParameterkey]) {
                      const cssKey = changeCase.kebabCase(cssParameterkey)
                      if (Object.keys(specialCssHandlers).includes(`${cssKey}`)) {
                        localstyle += specialCssHandlers[`${cssKey}`](data?.style?.light[lightMediaQuerys][keyofstyle][`${cssParameterkey}`])
                      } else {
                        localstyle += `${cssKey}: ${data?.style?.light[lightMediaQuerys][keyofstyle][`${cssParameterkey}`]};\n`
                        if (addWebkitFor[cssKey]) {
                          for (const singleCssKey in addWebkitFor[cssKey]) {
                            localstyle += `${addWebkitFor[cssKey][singleCssKey]}: ${data?.style?.light[lightMediaQuerys][keyofstyle][`${cssParameterkey}`]};\n`
                          }
                        }
                      }
                    }
                  }
                }
                return localstyle
              }
              // defined new variable to store css and to remove empty media querys
              let cssStylesInner = ``;
              // conditional rendering for css selector start
              if (data?.style?.light[lightMediaQuerys]["styles"] && Object.keys(data?.style?.light[lightMediaQuerys]["styles"]).length > 0) {
                cssStylesInner += `\n.${data?.systemAddedClass}{\n`
                cssStylesInner += `${getFormattedCss("styles")}`
                cssStylesInner += ` }\n`
              }
              // conditional rendering for css selector close
              // conditional rendering for css selector hover start
              if (data?.style?.light[lightMediaQuerys]["hover"] && Object.keys(data?.style?.light[lightMediaQuerys]["hover"]).length > 0) {
                cssStylesInner += `\n.${data?.systemAddedClass}:hover{\n`
                cssStylesInner += `${getFormattedCss("hover")}`
                cssStylesInner += ` }\n`
              }
              // conditional rendering for css selector hover close

              // conditional rendering for custom css open
              if (data?.style?.light[lightMediaQuerys]["custom"]) {
                cssStylesInner += `\n`
                cssStylesInner += `${data?.style?.light[lightMediaQuerys]["custom"]}`
                cssStylesInner += `\n`
              }
              // conditional rendering for custom css close

              // conditional rendering for media query start
              if (lightMediaQuerys.trim() !== 'default') {
                // check if cssStylesInner is empty or not
                if (cssStylesInner.trim()) {
                  if (['1920px', '1440px', '1280px'].includes(`${lightMediaQuerys.trim()}`)) {
                    styles += `\n@media screen and (min-width: ${lightMediaQuerys.trim()}) {\n`
                  } else {
                    styles += `\n@media screen and (max-width: ${lightMediaQuerys.trim()}) {\n`
                  }
                  styles += `${cssStylesInner}`
                  styles += `\n}\n`
                }
              } else {
                // update for default css 
                styles += `${cssStylesInner}`
              }
              // conditional rendering for media query close

            }
          }
        }
      }
    }
    return styles
  }
  return (
    <React.Suspense>
      <style dangerouslySetInnerHTML={{ __html: getstyles(draftPageContentSet) }}></style>
    </React.Suspense>
  )
}

export default PageBuilderCssRenderer;

