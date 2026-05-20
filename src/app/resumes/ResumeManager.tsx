"use client";

import { useState, useTransition } from "react";
import { addResume, setActiveResume, deleteResume, updateResumePreferences } from "./actions";
import { PageHeader } from "@/components/PageHeader";
import { PreferenceFields } from "@/components/PreferenceFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, Trash2 } from "lucide-react";
import {
  formatExperienceLevels,
  formatLocations,
  parsePreferences,
  type JobPreferences,
} from "@/lib/preferences";

type Resume = {
  id: string;
  name: string;
  content: string;
  experienceLevels: string;
  locations: string;
  targetRoles: string;
  avoidKeywords: string;
  isActive: boolean;
};

export function ResumeManager({ initialResumes }: { initialResumes: Resume[] }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [experienceLevels, setExperienceLevels] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [avoidKeywords, setAvoidKeywords] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!name || !content) return;
    startTransition(async () => {
      await addResume(name, content, experienceLevels, locations, targetRoles, avoidKeywords);
      window.location.reload();
    });
  };

  const handleSetActive = (id: string) => {
    startTransition(async () => {
      await setActiveResume(id);
      window.location.reload();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteResume(id);
      window.location.reload();
    });
  };

  const handleUpdatePreferences = (id: string, prefs: JobPreferences) => {
    startTransition(async () => {
      await updateResumePreferences(
        id,
        prefs.experienceLevels,
        prefs.locations,
        prefs.targetRoles,
        prefs.avoidKeywords,
      );
      window.location.reload();
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumes"
        description="Manage resume profiles and targeting preferences for smarter job selection."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add resume</CardTitle>
          <CardDescription>
            Your resume plus targeting preferences. The active profile drives scoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Input
            placeholder="Profile name (e.g. AI Engineer 2026)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder="Paste your full resume text here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[200px] text-sm"
          />
          <PreferenceFields
            experienceLevels={experienceLevels}
            locations={locations}
            targetRoles={targetRoles}
            avoidKeywords={avoidKeywords}
            onExperienceChange={setExperienceLevels}
            onLocationsChange={setLocations}
            onTargetRolesChange={setTargetRoles}
            onAvoidKeywordsChange={setAvoidKeywords}
          />
          <Button onClick={handleAdd} disabled={isPending || !name || !content} className="w-full">
            {isPending ? "Saving..." : "Save resume"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {initialResumes.map((resume) => {
          const prefs = parsePreferences(
            resume.experienceLevels,
            resume.locations,
            resume.targetRoles,
            resume.avoidKeywords,
          );
          return (
            <ResumeCard
              key={resume.id}
              resume={resume}
              prefs={prefs}
              isPending={isPending}
              onSetActive={handleSetActive}
              onDelete={handleDelete}
              onUpdatePreferences={handleUpdatePreferences}
            />
          );
        })}
      </div>
    </div>
  );
}

function ResumeCard({
  resume,
  prefs,
  isPending,
  onSetActive,
  onDelete,
  onUpdatePreferences,
}: {
  resume: Resume;
  prefs: JobPreferences;
  isPending: boolean;
  onSetActive: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdatePreferences: (id: string, prefs: JobPreferences) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [experienceLevels, setExperienceLevels] = useState(prefs.experienceLevels);
  const [locations, setLocations] = useState(prefs.locations);
  const [targetRoles, setTargetRoles] = useState(prefs.targetRoles);
  const [avoidKeywords, setAvoidKeywords] = useState(prefs.avoidKeywords);

  const savePreferences = () => {
    onUpdatePreferences(resume.id, {
      experienceLevels,
      locations,
      targetRoles,
      avoidKeywords,
    });
    setEditing(false);
  };

  return (
    <Card className={resume.isActive ? "border-foreground/20" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {resume.name}
          </CardTitle>
          {resume.isActive && <Badge variant="secondary">Active</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="line-clamp-3 text-sm text-muted-foreground">{resume.content}</p>

        {!editing ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Levels:</span>{" "}
              {formatExperienceLevels(prefs.experienceLevels)}
            </p>
            <p>
              <span className="font-medium text-foreground">Locations:</span>{" "}
              {formatLocations(prefs.locations)}
            </p>
            {prefs.targetRoles.length > 0 && (
              <p>
                <span className="font-medium text-foreground">Target roles:</span>{" "}
                {prefs.targetRoles.join(", ")}
              </p>
            )}
            {prefs.avoidKeywords.length > 0 && (
              <p>
                <span className="font-medium text-foreground">Avoid:</span>{" "}
                {prefs.avoidKeywords.join(", ")}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setEditing(true)}
            >
              Edit preferences
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-md border border-border p-3">
            <PreferenceFields
              experienceLevels={experienceLevels}
              locations={locations}
              targetRoles={targetRoles}
              avoidKeywords={avoidKeywords}
              onExperienceChange={setExperienceLevels}
              onLocationsChange={setLocations}
              onTargetRolesChange={setTargetRoles}
              onAvoidKeywordsChange={setAvoidKeywords}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={savePreferences} disabled={isPending}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setExperienceLevels(prefs.experienceLevels);
                  setLocations(prefs.locations);
                  setTargetRoles(prefs.targetRoles);
                  setAvoidKeywords(prefs.avoidKeywords);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {!resume.isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSetActive(resume.id)}
            disabled={isPending}
            className="flex-1"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Set active
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(resume.id)}
          disabled={isPending || resume.isActive}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
