"use client";

import Spinner1 from "@/components/spinner/Spinner1";
import { NextPage } from "next";

const LoadingPage: NextPage = () => {
    return <div className="h-screen w-screen">
        <Spinner1></Spinner1>
    </div>;
};

export default LoadingPage;