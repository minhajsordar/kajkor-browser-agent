"use client"
import { use } from "react";
import { SearchParamsPageBuilderInterface } from "@/interfaces/product";
import BannerDraftLoader from "@/components/blocks-development-tools/BuilderDraftLoader";
import BlocksList from "@/components/blocks-development-tools/blocks-list/BlocksList";
import BlocksSettings from "@/components/blocks-development-tools/block-settings/BlocksSettings";
import DevActionHeader from "@/components/blocks-development-tools/dev-actions-header/DevActionHeader";
import PageResponsivePreview from "@/components/blocks-development-tools/dev-responsive-page-preview/PageResponsivePreview";
import ParentState from "@/components/blocks-development-tools/ParentState";
import IframeState from "@/components/blocks-development-tools/IframeState";
import PageBuilderRendererEntryPoint from "@/components/blocks-renderer/builder/PageBuilderRendererEntryPoint";
import FooterBar from "@/components/blocks-development-tools/FooterBar";
import LeftToolbar from "@/components/blocks-development-tools/left-toolbar/LeftToolbar";

export default function Page({
    searchParams,
}: { searchParams: Promise<SearchParamsPageBuilderInterface> }) {
    const resolvedSearchParams = use(searchParams);

    // Bare-canvas mode: rendered inside the designer iframe AND usable
    // standalone for previews/screenshots (kajkor agent opens this URL).
    if (resolvedSearchParams?.iframe === 'true') {
        return (
            <main className="relative min-h-screen bg-white">
                <IframeState />
                <BannerDraftLoader />
                <PageBuilderRendererEntryPoint searchParams={resolvedSearchParams} />
            </main>
        );
    }

    return (
        <main className="fixed flex h-screen w-screen flex-col">
            <BannerDraftLoader />
            <ParentState />
            <DevActionHeader />
            <div className="flex min-h-0 flex-1">
                <LeftToolbar />
                <div id="banner-workspace" className="flex min-w-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1">
                        <PageResponsivePreview searchParams={resolvedSearchParams} />
                    </div>
                    <FooterBar />
                </div>
                <BlocksSettings />
            </div>
            <BlocksList />
        </main>
    );
}
