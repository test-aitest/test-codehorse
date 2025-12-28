"use client";

import { stringify } from "yaml";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { YamlEditor } from "@/components/settings/yaml-editor";
import { saveRepositoryConfig } from "@/app/(dashboard)/dashboard/repositories/[id]/settings/actions";

interface Repository {
  id: string;
  fullName: string;
  config: unknown;
}

interface RepositorySettingsProps {
  repository: Repository;
}

export function RepositorySettings({ repository }: RepositorySettingsProps) {
  // JSON configをYAMLに変換
  const initialYaml = repository.config
    ? stringify(repository.config, { indent: 2 })
    : null;

  const handleSave = async (yamlContent: string) => {
    return saveRepositoryConfig(repository.id, yamlContent);
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/repositories">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Repositories
          </Link>
        </Button>
      </div>

      <YamlEditor
        initialConfig={initialYaml}
        onSave={handleSave}
      />
    </div>
  );
}
