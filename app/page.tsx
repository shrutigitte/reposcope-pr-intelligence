"use client";

import {
  Activity, ArrowUpRight, Bell, Braces, Check, CheckCircle2, ChevronDown,
  CircleDot, Database, FileCode2, Files, GitFork, GitBranch, GitPullRequest,
  LayoutDashboard, ListFilter, LockKeyhole, Moon, Play, RefreshCw, Search,
  Settings, ShieldAlert, SquareFunction, Sun, TestTube2, X, Zap,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type NodeKind = "changed" | "affected" | "test" | "model";
type FindingTone = "danger" | "warning" | "success";

type ImpactNode = {
  id: string;
  title: string;
  path: string;
  detail: string;
  kind: NodeKind;
  x: number;
  y: number;
  url: string;
};

type Finding = {
  id: number;
  severity: "High" | "Medium" | "Low";
  tone: FindingTone;
  title: string;
  description: string;
  file: string;
  node: string;
};

type Analysis = {
  sourceUrl: string | null;
  repository: { owner: string; name: string };
  pullRequest: {
    number: number; title: string; author: string; base: string; head: string; url: string;
  };
  mode: string;
  metrics: {
    riskScore: number; riskLabel: string; riskReason: string; changedFiles: number;
    additions: number; deletions: number; direct: number; indirect: number;
    findingCount: number; findingSummary: string; testGaps: number; testsChanged: number;
  };
  nodes: ImpactNode[];
  edges: string[][];
  findings: Finding[];
  run: { filesFetched: number; graphNodes: number; citations: number };
};

const initialAnalysis: Analysis = {
  sourceUrl: null,
  repository: { owner: "acme", name: "web-platform" },
  pullRequest: {
    number: 482, title: "Refactor organization permissions", author: "maya-k",
    base: "main", head: "feature/role-policy", url: "#",
  },
  mode: "TypeScript demo",
  metrics: {
    riskScore: 82, riskLabel: "High risk", riskReason: "Authorization path changed",
    changedFiles: 12, additions: 214, deletions: 89, direct: 7, indirect: 16,
    findingCount: 4, findingSummary: "1 high · 2 medium · 1 low", testGaps: 2, testsChanged: 3,
  },
  nodes: [
    { id: "update", title: "roles.ts", path: "src/services/roles.ts:48–76", detail: "Directly changed. The new implementation removes an authorization guard used by two public API routes.", kind: "changed", x: 50, y: 47, url: "#" },
    { id: "admin", title: "policy.ts", path: "src/auth/policy.ts:22–38", detail: "Previously called by updateUserRole. The changed implementation no longer reaches this guard.", kind: "affected", x: 23, y: 17, url: "#" },
    { id: "member", title: "members.ts", path: "src/api/members.ts:73–112", detail: "Direct caller. Exposes role changes through the organization members API.", kind: "affected", x: 20, y: 73, url: "#" },
    { id: "invite", title: "invitations.ts", path: "src/api/invitations.ts:88–126", detail: "Direct caller. User-controlled invitation data can reach the changed role service.", kind: "affected", x: 76, y: 17, url: "#" },
    { id: "audit", title: "events.ts", path: "src/audit/events.ts:14–31", detail: "New side effect introduced by this change. Error handling and retry behavior need review.", kind: "affected", x: 78, y: 73, url: "#" },
    { id: "roles-test", title: "roles.test.ts", path: "src/services/__tests__/roles.test.ts", detail: "Three related tests exist, but none exercise a non-admin actor changing another member.", kind: "test", x: 12, y: 45, url: "#" },
    { id: "invite-test", title: "invite.test.ts", path: "src/api/__tests__/invitations.test.ts", detail: "No assertion verifies that invitation acceptance cannot escalate a user's privileges.", kind: "test", x: 88, y: 47, url: "#" },
    { id: "role", title: "user.ts", path: "src/models/user.ts:9–17", detail: "The changed input can now fall back to organization.defaultRole, widening the behavior.", kind: "model", x: 50, y: 88, url: "#" },
  ],
  edges: [["update", "admin"], ["update", "member"], ["update", "invite"], ["update", "audit"], ["admin", "roles-test"], ["invite", "invite-test"], ["member", "role"], ["audit", "role"]],
  findings: [
    { id: 1, severity: "High", tone: "danger", title: "Authorization guard removed", description: "updateUserRole() no longer verifies organization admin access.", file: "roles.ts:61", node: "update" },
    { id: 2, severity: "Medium", tone: "warning", title: "Invitation path may escalate role", description: "The affected caller accepts user-controlled invitation data.", file: "invitations.ts:104", node: "invite" },
    { id: 3, severity: "Medium", tone: "warning", title: "Missing negative test", description: "No test covers a non-admin modifying another member.", file: "roles.test.ts", node: "roles-test" },
    { id: 4, severity: "Low", tone: "success", title: "Public type widened", description: "RoleInput now accepts an additional nullable field.", file: "roles.ts:12", node: "role" },
  ],
  run: { filesFetched: 12, graphNodes: 146, citations: 8 },
};

const navItems = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Impact graph", icon: GitBranch },
  { label: "Findings", icon: ShieldAlert }, { label: "Changes", icon: FileCode2 },
  { label: "Agent run", icon: Activity },
];

function nodeIcon(kind: NodeKind) {
  if (kind === "changed") return SquareFunction;
  if (kind === "test") return TestTube2;
  if (kind === "model") return Database;
  return FileCode2;
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><GitPullRequest size={17} /></span><span>RepoScope</span></div>;
}

function RiskRing({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "var(--danger)" : score >= 40 ? "var(--warning)" : "var(--success)";
  return (
    <div className="risk-ring" aria-label={`Risk score ${score} out of 100, ${label}`} style={{ color, background: `conic-gradient(${color} 0 ${score}%, var(--surface-2) ${score}% 100%)` }}>
      <span>{score}</span>
    </div>
  );
}

function AnalysisDialog({
  open, onClose, onAnalyze,
}: {
  open: boolean; onClose: () => void; onAnalyze: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?(?:[?#].*)?$/.test(url.trim())) {
      setError("Enter a GitHub pull request URL, for example github.com/acme/app/pull/42");
      return;
    }
    setError(""); setSubmitting(true);
    try { await onAnalyze(url.trim()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The pull request could not be analyzed."); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={submitting ? undefined : onClose}>
      <section className="analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-icon"><GitPullRequest size={19} /></div>
        <button className="icon-button dialog-close" onClick={onClose} disabled={submitting} aria-label="Close"><X size={16} /></button>
        <p className="eyebrow">Live GitHub analysis</p><h2 id="analysis-title">Review a pull request</h2>
        <p className="dialog-copy">Paste a public GitHub PR. RepoScope will fetch its metadata and changed files, calculate a deterministic risk score, and surface review evidence.</p>
        <form onSubmit={submit}>
          <label htmlFor="pr-url">GitHub pull request URL</label>
          <div className={`url-field ${error ? "field-error" : ""}`}><GitFork size={16} /><input id="pr-url" value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} placeholder="https://github.com/owner/repository/pull/123" disabled={submitting} autoFocus /></div>
          {error ? <p className="error-message" role="alert">{error}</p> : null}
          <div className="scope-note"><LockKeyhole size={15} /><span>Public repositories only. RepoScope reads PR metadata and changed-file information; it does not execute repository code.</span></div>
          <button className="button button-primary button-wide" type="submit" disabled={submitting}>{submitting ? <><RefreshCw className="spin" size={15} /> Fetching from GitHub…</> : <><Zap size={15} /> Start analysis</>}</button>
        </form>
      </section>
    </div>
  );
}

export default function Home() {
  const [dark, setDark] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [analysis, setAnalysis] = useState<Analysis>(initialAnalysis);
  const [selectedNodeId, setSelectedNodeId] = useState(initialAnalysis.nodes[0].id);
  const [selectedFinding, setSelectedFinding] = useState(initialAnalysis.findings[0].id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("All");
  const [runState, setRunState] = useState<"complete" | "running">("complete");
  const [pageError, setPageError] = useState("");

  const selectedNode = analysis.nodes.find((node) => node.id === selectedNodeId) ?? analysis.nodes[0];
  const filteredFindings = useMemo(() => severityFilter === "All" ? analysis.findings : analysis.findings.filter((finding) => finding.severity === severityFilter), [analysis.findings, severityFilter]);

  function selectFinding(finding: Finding) { setSelectedFinding(finding.id); setSelectedNodeId(finding.node); }

  async function analyzeUrl(url: string) {
    setRunState("running"); setPageError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      const result = await response.json() as Analysis & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The pull request could not be analyzed.");
      setAnalysis(result); setSelectedNodeId(result.nodes[0].id); setSelectedFinding(result.findings[0].id);
      setSeverityFilter("All"); setRunState("complete");
    } catch (cause) {
      setRunState("complete");
      throw cause;
    }
  }

  async function rerun() {
    if (!analysis.sourceUrl) { setDialogOpen(true); return; }
    try { await analyzeUrl(analysis.sourceUrl); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : "The analysis could not be refreshed."); }
  }

  const findingCount = analysis.metrics.findingCount;
  const navCount = (label: string) => label === "Findings" ? findingCount : label === "Changes" ? analysis.metrics.changedFiles : undefined;

  return (
    <main className="reposcope" data-theme={dark ? "dark" : "light"}>
      <header className="topbar">
        <Brand />
        <a className="project-crumb" href={analysis.pullRequest.url} target="_blank" rel="noreferrer"><GitFork size={15} /><strong>{analysis.repository.owner}/{analysis.repository.name}</strong><span>/</span><span>PR #{analysis.pullRequest.number}</span><ChevronDown size={13} /></a>
        <div className="top-actions"><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button><button className="icon-button" aria-label="Notifications"><Bell size={16} /></button><span className="avatar" aria-label="RepoScope visitor">RS</span></div>
      </header>

      <div className="app-shell">
        <aside className="sidebar">
          <nav aria-label="Primary navigation">
            {navItems.map((item) => { const Icon = item.icon; const active = activeNav === item.label; const count = navCount(item.label); return <button key={item.label} className={`nav-item ${active ? "nav-active" : ""}`} onClick={() => setActiveNav(item.label)} aria-current={active ? "page" : undefined}><Icon size={16} /><span>{item.label}</span>{typeof count === "number" ? <small>{count}</small> : null}</button>; })}
          </nav>
          <div className="sidebar-bottom"><div className="language-mode"><Braces size={15} /><span><strong>{analysis.mode}</strong><small>{analysis.sourceUrl ? "Live analysis" : "Sample data"}</small></span><CircleDot size={9} /></div><button className="nav-item" onClick={() => setActiveNav("Settings")}><Settings size={16} /><span>Settings</span></button></div>
        </aside>

        <section className="content">
          {pageError ? <div className="page-error" role="alert"><span>{pageError}</span><button onClick={() => setPageError("")} aria-label="Dismiss error"><X size={14} /></button></div> : null}
          <div className="page-heading">
            <div><div className="analysis-status">{runState === "complete" ? <><CheckCircle2 size={13} /> {analysis.sourceUrl ? "Live analysis complete" : "Interactive demo"}</> : <><RefreshCw className="spin" size={13} /> Fetching pull request from GitHub…</>}</div><h1>{analysis.pullRequest.title}</h1><p>Opened by <strong>{analysis.pullRequest.author}</strong><span>·</span><code>{analysis.pullRequest.head}</code><span>→</span><code>{analysis.pullRequest.base}</code><span>·</span><strong className="diff-add">+{analysis.metrics.additions}</strong><strong className="diff-del">−{analysis.metrics.deletions}</strong></p></div>
            <div className="heading-actions"><button className="button" onClick={() => setDialogOpen(true)}><Search size={15} /> Analyze another PR</button><button className="button" onClick={() => void rerun()} disabled={runState === "running"}><RefreshCw className={runState === "running" ? "spin" : ""} size={15} /> Re-run</button><button className="button button-primary"><GitFork size={15} /> Publish check</button></div>
          </div>

          <section className="metrics" aria-label="Pull request risk summary">
            <div className="metric risk-metric"><RiskRing score={analysis.metrics.riskScore} label={analysis.metrics.riskLabel} /><span><small>Risk score</small><strong>{analysis.metrics.riskLabel}</strong><em>{analysis.metrics.riskReason}</em></span></div>
            <div className="metric"><small>Change surface</small><strong>{analysis.metrics.changedFiles} files</strong><em>{analysis.metrics.direct} graphed · {analysis.metrics.indirect} additional</em></div>
            <div className="metric"><small>Review findings</small><strong>{findingCount} finding{findingCount === 1 ? "" : "s"}</strong><em>{analysis.metrics.findingSummary}</em></div>
            <div className="metric"><small>Test signal</small><strong>{analysis.metrics.testGaps ? `${analysis.metrics.testGaps} gap` : "Tests included"}</strong><em>{analysis.metrics.testsChanged} test file{analysis.metrics.testsChanged === 1 ? "" : "s"} changed</em></div>
          </section>

          <div className="workspace-grid">
            <section className="panel graph-panel">
              <header className="panel-header"><div><h2>Changed-file graph</h2><p>Click a file to inspect GitHub’s change metadata</p></div><div className="legend" aria-label="Graph legend"><span><i className="legend-dot dot-changed" />Primary</span><span><i className="legend-dot dot-affected" />Changed</span><span><i className="legend-dot dot-test" />Test</span></div></header>
              <div className="impact-graph" aria-label="Changed-file relationship graph">
                <svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{analysis.edges.map(([from, to]) => { const a = analysis.nodes.find((node) => node.id === from); const b = analysis.nodes.find((node) => node.id === to); return a && b ? <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null; })}</svg>
                {analysis.nodes.map((node) => { const Icon = nodeIcon(node.kind); const selected = node.id === selectedNodeId; return <button key={node.id} className={`graph-node node-${node.kind} ${selected ? "node-selected" : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => setSelectedNodeId(node.id)} aria-pressed={selected}><span className="node-icon"><Icon size={13} /></span><span><strong>{node.title}</strong><small>{node.path}</small></span></button>; })}
              </div>
              <footer className="selection-bar" aria-live="polite"><div><small>Selected file</small><strong>{selectedNode?.title}</strong><code>{selectedNode?.path}</code></div><p>{selectedNode?.detail}</p>{selectedNode?.url && selectedNode.url !== "#" ? <a className="text-button" href={selectedNode.url} target="_blank" rel="noreferrer">Open on GitHub <ArrowUpRight size={12} /></a> : <span />}</footer>
            </section>

            <aside className="panel findings-panel">
              <header className="panel-header findings-heading"><div><h2>Findings</h2><p>{filteredFindings.length} deterministic review signal{filteredFindings.length === 1 ? "" : "s"}</p></div><div className="filter-wrap"><button className="icon-button" onClick={() => setFilterOpen(!filterOpen)} aria-label="Filter findings"><ListFilter size={15} /></button>{filterOpen ? <div className="filter-menu">{["All", "High", "Medium", "Low"].map((level) => <button key={level} onClick={() => { setSeverityFilter(level); setFilterOpen(false); }} className={severityFilter === level ? "filter-active" : ""}>{severityFilter === level ? <Check size={12} /> : <span />}{level}</button>)}</div> : null}</div></header>
              <div className="findings-list">{filteredFindings.map((finding) => <button key={finding.id} className={`finding ${selectedFinding === finding.id ? "finding-selected" : ""}`} onClick={() => selectFinding(finding)}><span className={`severity severity-${finding.tone}`}>{finding.severity}</span><strong>{finding.title}</strong><p>{finding.description}</p><small><FileCode2 size={11} /> {finding.file}</small></button>)}{!filteredFindings.length ? <div className="empty-findings">No findings match this filter.</div> : null}</div>
            </aside>
          </div>

          <section className="run-strip" aria-label="Analysis stages">
            <div className="run-intro"><span><Play size={13} /></span><div><strong>{analysis.sourceUrl ? "Live GitHub run" : "Sample analysis"}</strong><small>{analysis.repository.owner}/{analysis.repository.name}#{analysis.pullRequest.number}</small></div></div>
            {[[Files, "Fetched PR", `${analysis.run.filesFetched} files`], [GitBranch, "Built graph", `${analysis.run.graphNodes} nodes`], [ShieldAlert, "Investigated", `${findingCount} findings`], [CheckCircle2, "Evidence", `${analysis.run.citations} citations`]].map(([Icon, label, value], index) => { const StageIcon = Icon as typeof Files; return <div className="run-stage" key={label as string}><span><StageIcon size={13} /></span><div><strong>{label as string}</strong><small>{value as string}</small></div>{index < 3 ? <i /> : null}</div>; })}
            <a className="text-button" href={analysis.pullRequest.url === "#" ? undefined : analysis.pullRequest.url} target="_blank" rel="noreferrer">View PR <ArrowUpRight size={12} /></a>
          </section>
        </section>
      </div>

      <AnalysisDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onAnalyze={async (url) => { await analyzeUrl(url); setDialogOpen(false); }} />
    </main>
  );
}
