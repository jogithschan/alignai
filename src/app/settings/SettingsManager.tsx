"use client";

import { useState, useTransition } from "react";
import { updateSettings } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Globe } from "lucide-react";

type Settings = {
  id: string;
  targetUrls: string;
};

export function SettingsManager({ initialSettings }: { initialSettings: Settings }) {
  const [urls, setUrls] = useState<string[]>(() => {
    try {
      return JSON.parse(initialSettings.targetUrls);
    } catch {
      return [];
    }
  });
  const [newUrl, setNewUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  const save = (updatedUrls: string[]) => {
    startTransition(async () => {
      await updateSettings(initialSettings.id, JSON.stringify(updatedUrls));
    });
  };

  const handleAddUrl = () => {
    if (!newUrl) return;
    try {
      new URL(newUrl);
      const updated = [...urls, newUrl];
      setUrls(updated);
      setNewUrl("");
      save(updated);
    } catch {
      alert("Please enter a valid URL");
    }
  };

  const handleRemoveUrl = (index: number) => {
    const updated = urls.filter((_, i) => i !== index);
    setUrls(updated);
    save(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target URLs</CardTitle>
        <CardDescription>
          Base LinkedIn jobs search URL. Search titles are derived automatically from your active resume — keywords in this URL are replaced on each scrape.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="https://www.linkedin.com/jobs/search/"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
          />
          <Button onClick={handleAddUrl} disabled={isPending || !newUrl}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>

        {urls.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No target URLs configured.</p>
        ) : (
          <div className="space-y-2">
            {urls.map((url, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{url}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveUrl(i)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
