"use client";

import { useState } from "react";
import { EXPERIENCE_LEVELS, SUGGESTED_LOCATIONS } from "@/lib/preferences";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type PreferenceFieldsProps = {
  experienceLevels: string[];
  locations: string[];
  targetRoles: string[];
  avoidKeywords: string[];
  onExperienceChange: (levels: string[]) => void;
  onLocationsChange: (locations: string[]) => void;
  onTargetRolesChange: (roles: string[]) => void;
  onAvoidKeywordsChange: (keywords: string[]) => void;
};

function TagInput({
  label,
  description,
  placeholder,
  tags,
  onChange,
}: {
  label: string;
  description: string;
  placeholder: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag(input))}
        />
        <Button type="button" variant="outline" onClick={() => addTag(input)} disabled={!input.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="rounded-sm p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function PreferenceFields({
  experienceLevels,
  locations,
  targetRoles,
  avoidKeywords,
  onExperienceChange,
  onLocationsChange,
  onTargetRolesChange,
  onAvoidKeywordsChange,
}: PreferenceFieldsProps) {
  const [locationInput, setLocationInput] = useState("");

  const toggleLevel = (id: string) => {
    if (experienceLevels.includes(id)) {
      onExperienceChange(experienceLevels.filter((l) => l !== id));
    } else {
      onExperienceChange([...experienceLevels, id]);
    }
  };

  const addLocation = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    onLocationsChange([...locations, trimmed]);
    setLocationInput("");
  };

  const removeLocation = (location: string) => {
    onLocationsChange(locations.filter((l) => l !== location));
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Experience levels</Label>
        <p className="text-xs text-muted-foreground">
          Applied to LinkedIn search filters, pre-screening, and alignment scoring.
        </p>
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE_LEVELS.map((level) => {
            const selected = experienceLevels.includes(level.id);
            return (
              <button
                key={level.id}
                type="button"
                onClick={() => toggleLevel(level.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                  selected
                    ? "border-foreground/30 bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground/30",
                )}
              >
                {level.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Search locations</Label>
        <p className="text-xs text-muted-foreground">
          Each location runs its own independent LinkedIn search. Remote enables LinkedIn&apos;s remote filter.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_LOCATIONS.map((location) => {
            const selected = locations.includes(location);
            return (
              <button
                key={location}
                type="button"
                onClick={() =>
                  selected ? removeLocation(location) : onLocationsChange([...locations, location])
                }
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                  selected
                    ? "border-foreground/30 bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground/30",
                )}
              >
                {location}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Or type a custom location..."
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLocation(locationInput))}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => addLocation(locationInput)}
            disabled={!locationInput.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {locations.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {locations.map((location) => (
              <Badge key={location} variant="secondary" className="gap-1 pr-1">
                {location}
                <button
                  type="button"
                  onClick={() => removeLocation(location)}
                  className="rounded-sm p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <TagInput
        label="Target roles"
        description="Critical for alignment — titles like AI Engineer, ML Engineer. Generic Software Engineer jobs are filtered out unless they match these."
        placeholder="Add a role keyword..."
        tags={targetRoles}
        onChange={onTargetRolesChange}
      />

      <TagInput
        label="Avoid keywords"
        description="Skip listings whose title or company contains these (e.g. Sales, Intern, Clearance)."
        placeholder="Add a keyword to avoid..."
        tags={avoidKeywords}
        onChange={onAvoidKeywordsChange}
      />
    </div>
  );
}
