export interface ReviewComment {
  id: string;
  filePath: string;
  lineNumber: number;
  body: string;
  severity: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK";
  suggestion: string | null;
  category: string | null;
}

export interface ReviewData {
  review: {
    id: string;
    prNumber: number;
    prTitle: string;
    commitSha: string;
    summary: string | null;
    walkthrough: Array<{
      path: string;
      summary: string;
      changeType: string;
    }> | null;
    diagram: string | null;
    repository: {
      fullName: string;
      owner: string;
      name: string;
      htmlUrl: string;
    };
    prDescription?: string; // PR description from GitHub (for extracting Google Sheets URL)
  };
  comments: ReviewComment[];
}

export interface Config {
  repoMappings: Record<string, string>; // fullName -> local path
}

export interface ApplyParams {
  reviewId: string;
  token: string;
  apiUrl: string;
  folderPath?: string;
}
