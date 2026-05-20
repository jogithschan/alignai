import { getMatchJobs, getReviewJobs } from "./actions";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [matchJobs, reviewJobs] = await Promise.all([getMatchJobs(), getReviewJobs()]);
  return <DashboardClient initialMatchJobs={matchJobs} initialReviewJobs={reviewJobs} />;
}
