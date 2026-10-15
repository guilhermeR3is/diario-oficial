import { AskScreen } from "@/components/ask-screen";
import { HowItWorks } from "@/components/how-it-works";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <AskScreen />
      <HowItWorks />
    </>
  );
}
