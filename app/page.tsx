import { FinalCta } from "@/components/landing/cta";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Integrations } from "@/components/landing/integrations";
import { Nav } from "@/components/landing/nav";
import { Trust } from "@/components/landing/trust";
import { Walkthrough } from "@/components/landing/walkthrough";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Walkthrough />
        <Integrations />
        <Trust />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
