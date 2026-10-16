import { AskScreen } from "@/components/ask-screen";
import { HowItWorks } from "@/components/how-it-works";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/env";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <AskScreen visitorDailyLimit={env.VISITOR_DAILY_LIMIT} />
      <HowItWorks />
    </>
  );
}
