import { BackgroundVideo } from "@/components/sections/BackgroundVideo";
import { CreationLater } from "@/components/sections/CreationLater";
import { EarlySignal } from "@/components/sections/EarlySignal";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";
import { Header } from "@/components/sections/Header";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { InProduct } from "@/components/sections/InProduct";
import { LiveReasoning } from "@/components/sections/LiveReasoning";
import { Pricing } from "@/components/sections/Pricing";
import { Principle } from "@/components/sections/Principle";
import { Problem } from "@/components/sections/Problem";
import { Trust } from "@/components/sections/Trust";
import { WhoItsFor } from "@/components/sections/WhoItsFor";

export default function Home() {
  return (
    <>
      <BackgroundVideo />
      <div className="relative z-1 max-w-full overflow-x-clip">
        <Header />
        <Hero />
        <LiveReasoning />
        <Problem />
        <Principle />
        <HowItWorks />
        <InProduct />
        <WhoItsFor />
        <Trust />
        <EarlySignal />
        <CreationLater />
        <Pricing />
        <FinalCta />
        <Footer />
      </div>
    </>
  );
}
