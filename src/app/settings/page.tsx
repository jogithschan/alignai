import { getSettings } from "./actions";
import { SettingsManager } from "./SettingsManager";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Configure where to scrape. Search titles are picked from your active resume automatically."
      />
      <SettingsManager initialSettings={settings} />
    </div>
  );
}
