"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Github, ExternalLink, Shield } from "lucide-react";

interface SettingsFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
}

export function SettingsForm({ user }: SettingsFormProps) {
  const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "codehorse";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name || "User"}
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <div className="font-medium text-lg">{user.name || "User"}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GitHub Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">GitHub App</div>
              <div className="text-sm text-muted-foreground">
                Install the CodeHorse GitHub App to enable AI code reviews
              </div>
            </div>
            <Badge variant="default">Connected</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a
                href={`https://github.com/apps/${githubAppSlug}/installations/new`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Manage Repositories
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Keys Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            API Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="text-sm">
              <p className="font-medium mb-2">Current AI Model</p>
              <p className="text-muted-foreground">
                Gemini 1.5 Flash - Optimized for fast, cost-effective code
                reviews
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            API keys are managed through environment variables on the server.
            Contact your administrator to modify API settings.
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Delete Account</div>
              <div className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data
              </div>
            </div>
            <Button variant="destructive" disabled>
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
