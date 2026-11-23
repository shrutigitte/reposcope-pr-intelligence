type GitHubPullRequest = {
  number: number;
  title: string;
  html_url: string;
  user: { login: string };
  base: { ref: string };
  head: { ref: string };
  changed_files: number;
  additions: number;
  deletions: number;
};

type GitHubFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  patch?: string;
};

export const runtime = "nodejs";
export const maxDuration = 30;

const graphPositions = [
  [50, 47], [23, 17], [20, 73], [76, 17],
  [78, 73], [12, 45], [88, 47], [50, 88],
] as const;

function parsePullRequestUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?(?:[?#].*)?$/,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

function buildAnalysis(
  sourceUrl: string,
  owner: string,
  repo: string,
  pull: GitHubPullRequest,
  files: GitHubFile[],
) {
  const authPattern = /(auth|permission|role|security|session|token|policy|access)/i;
  const databasePattern = /(migration|schema|prisma|database|models?\/|entities?\/)/i;
  const dependencyPattern = /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i;
  const testPattern = /(^|\/)(__tests__|tests?|specs?)(\/|\.)|\.(test|spec)\.[^.]+$/i;
  const configPattern = /(^|\/)(\.github|docker|config|infra|terraform|\.env)/i;

  const authFiles = files.filter((file) => authPattern.test(file.filename));
  const databaseFiles = files.filter((file) => databasePattern.test(file.filename));
  const dependencyFiles = files.filter((file) => dependencyPattern.test(file.filename));
  const testFiles = files.filter((file) => testPattern.test(file.filename));
  const configFiles = files.filter((file) => configPattern.test(file.filename));
  const sourceFiles = files.filter((file) => /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(file.filename));
  const tsFiles = files.filter((file) => /\.(ts|tsx)$/i.test(file.filename));

  let riskScore = 14;
  riskScore += Math.min(22, pull.changed_files * 2);
  riskScore += authFiles.length ? 20 : 0;
  riskScore += databaseFiles.length ? 13 : 0;
  riskScore += dependencyFiles.length ? 7 : 0;
  riskScore += configFiles.length ? 7 : 0;
  riskScore += testFiles.length === 0 && sourceFiles.length > 0 ? 12 : 0;
  riskScore += pull.additions + pull.deletions > 500 ? 8 : 0;
  riskScore = Math.max(5, Math.min(95, riskScore));

  const riskLabel = riskScore >= 70 ? "High risk" : riskScore >= 40 ? "Medium risk" : "Low risk";
  const riskReason = authFiles.length
    ? "Security-sensitive paths changed"
    : databaseFiles.length
      ? "Data model or migration changed"
      : testFiles.length === 0 && sourceFiles.length > 0
        ? "Source changed without tests"
        : "Change surface and file types";

  const priority = (file: GitHubFile) =>
    (authPattern.test(file.filename) ? 100 : 0) +
    (databasePattern.test(file.filename) ? 70 : 0) +
    (testPattern.test(file.filename) ? 10 : 30) +
    Math.min(file.changes, 50);
  const graphFiles = [...files].sort((a, b) => priority(b) - priority(a)).slice(0, 8);

  const nodes = graphFiles.map((file, index) => {
    const isTest = testPattern.test(file.filename);
    const isModel = databasePattern.test(file.filename);
    const [x, y] = graphPositions[index];
    return {
      id: `file-${index}`,
      title: basename(file.filename),
      path: file.filename,
      detail: `${file.status[0].toUpperCase()}${file.status.slice(1)} with +${file.additions} and −${file.deletions}. ${file.changes} changed lines were reported by GitHub.`,
      kind: index === 0 ? "changed" : isTest ? "test" : isModel ? "model" : "affected",
      x,
      y,
      url: file.blob_url,
    };
  });
  const edges = nodes.slice(1).map((node) => [nodes[0]?.id, node.id]).filter((edge) => edge[0]);

  const findings: Array<{
    id: number; severity: "High" | "Medium" | "Low"; tone: "danger" | "warning" | "success";
    title: string; description: string; file: string; node: string;
  }> = [];

  if (authFiles[0]) findings.push({
    id: findings.length + 1, severity: "High", tone: "danger",
    title: "Security-sensitive code changed",
    description: "Authentication, authorization, role, or access-control paths should receive focused human review.",
    file: authFiles[0].filename,
    node: nodes.find((node) => node.path === authFiles[0].filename)?.id ?? nodes[0]?.id,
  });
  if (databaseFiles[0]) findings.push({
    id: findings.length + 1, severity: "Medium", tone: "warning",
    title: "Data contract may have changed",
    description: "A schema, migration, model, or persistence-layer file is included in this pull request.",
    file: databaseFiles[0].filename,
    node: nodes.find((node) => node.path === databaseFiles[0].filename)?.id ?? nodes[0]?.id,
  });
  if (sourceFiles.length > 0 && testFiles.length === 0) findings.push({
    id: findings.length + 1, severity: "Medium", tone: "warning",
    title: "No tests changed with source code",
    description: `${sourceFiles.length} source file${sourceFiles.length === 1 ? "" : "s"} changed, but GitHub reported no matching test-file change.`,
    file: sourceFiles[0].filename,
    node: nodes.find((node) => node.path === sourceFiles[0].filename)?.id ?? nodes[0]?.id,
  });
  if (dependencyFiles[0]) findings.push({
    id: findings.length + 1, severity: "Low", tone: "success",
    title: "Dependency manifest changed",
    description: "Review dependency additions, removals, version movement, and lockfile consistency.",
    file: dependencyFiles[0].filename,
    node: nodes.find((node) => node.path === dependencyFiles[0].filename)?.id ?? nodes[0]?.id,
  });
  if (configFiles[0] && findings.length < 4) findings.push({
    id: findings.length + 1, severity: "Low", tone: "success",
    title: "Runtime or infrastructure config changed",
    description: "Confirm that configuration changes remain backward compatible with the deployed environment.",
    file: configFiles[0].filename,
    node: nodes.find((node) => node.path === configFiles[0].filename)?.id ?? nodes[0]?.id,
  });
  if (findings.length === 0 && files[0]) findings.push({
    id: 1, severity: "Low", tone: "success",
    title: "No high-risk file pattern detected",
    description: "RepoScope found a limited change surface. Human review is still required for behavioral correctness.",
    file: files[0].filename,
    node: nodes[0]?.id,
  });

  const cappedFindings = findings.slice(0, 4);
  const high = cappedFindings.filter((finding) => finding.severity === "High").length;
  const medium = cappedFindings.filter((finding) => finding.severity === "Medium").length;
  const low = cappedFindings.filter((finding) => finding.severity === "Low").length;

  return {
    sourceUrl,
    repository: { owner, name: repo },
    pullRequest: {
      number: pull.number, title: pull.title, author: pull.user.login,
      base: pull.base.ref, head: pull.head.ref, url: pull.html_url,
    },
    mode: tsFiles.length > 0 ? "TypeScript preview" : "Universal mode",
    metrics: {
      riskScore, riskLabel, riskReason,
      changedFiles: pull.changed_files,
      additions: pull.additions,
      deletions: pull.deletions,
      direct: Math.max(0, nodes.length - 1),
      indirect: Math.max(0, pull.changed_files - nodes.length),
      findingCount: cappedFindings.length,
      findingSummary: `${high} high · ${medium} medium · ${low} low`,
      testGaps: sourceFiles.length > 0 && testFiles.length === 0 ? 1 : 0,
      testsChanged: testFiles.length,
    },
    nodes,
    edges,
    findings: cappedFindings,
    run: { filesFetched: files.length, graphNodes: nodes.length, citations: cappedFindings.length },
  };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const sourceUrl =
      typeof body === "object" && body !== null && "url" in body
        ? (body as { url?: unknown }).url
        : undefined;
    const parsed = parsePullRequestUrl(sourceUrl);
    if (!parsed) return Response.json({ error: "Enter a valid GitHub pull request URL." }, { status: 400 });

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "RepoScope-PR-Intelligence",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const base = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`;
    const [pullResponse, filesResponse] = await Promise.all([
      fetch(base, { headers, cache: "no-store" }),
      fetch(`${base}/files?per_page=100`, { headers, cache: "no-store" }),
    ]);

    if (pullResponse.status === 404 || filesResponse.status === 404) {
      return Response.json({ error: "That public pull request could not be found. Private repositories are not supported yet." }, { status: 404 });
    }
    if (pullResponse.status === 403 || filesResponse.status === 403) {
      return Response.json({ error: "GitHub's anonymous API limit is temporarily exhausted. Try again later." }, { status: 429 });
    }
    if (!pullResponse.ok || !filesResponse.ok) {
      return Response.json({ error: "GitHub could not return this pull request right now." }, { status: 502 });
    }

    const pull = await pullResponse.json() as GitHubPullRequest;
    const files = await filesResponse.json() as GitHubFile[];
    if (!files.length) return Response.json({ error: "This pull request has no changed files to analyze." }, { status: 422 });

    return Response.json(buildAnalysis(sourceUrl as string, parsed.owner, parsed.repo, pull, files));
  } catch {
    return Response.json({ error: "RepoScope could not analyze this pull request." }, { status: 500 });
  }
}
