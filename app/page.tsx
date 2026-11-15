"use client";

import {
  Activity, ArrowUpRight, Bell, Braces, Check, CheckCircle2, ChevronDown,
  CircleDot, Database, FileCode2, Files, GitFork, GitBranch, GitPullRequest,
  LayoutDashboard, ListFilter, LockKeyhole, Moon, Play, RefreshCw, Route,
  Search, Settings, Shield, ShieldAlert, SquareFunction, Sun, TestTube2, X, Zap,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type NodeKind = "changed" | "affected" | "test" | "model";
type ImpactNode = {
  id: string; title: string; path: string; detail: string; kind: NodeKind;
  x: number; y: number; icon: typeof SquareFunction;
};

const nodes: ImpactNode[] = [
  { id: "update", title: "updateUserRole()", path: "src/services/roles.ts:48–76", detail: "Directly changed. The new implementation removes an authorization guard used by two public API routes.", kind: "changed", x: 50, y: 47, icon: SquareFunction },
  { id: "admin", title: "assertOrgAdmin()", path: "src/auth/policy.ts:22–38", detail: "Previously called by updateUserRole. The changed implementation no longer reaches this guard.", kind: "affected", x: 23, y: 17, icon: Shield },
  { id: "member", title: "updateMember()", path: "src/api/members.ts:73–112", detail: "Direct caller. Exposes role changes through the organization members API.", kind: "affected", x: 20, y: 73, icon: Route },
  { id: "invite", title: "acceptInvitation()", path: "src/api/invitations.ts:88–126", detail: "Direct caller. User-controlled invitation data can reach the changed role service.", kind: "affected", x: 76, y: 17, icon: Route },
  { id: "audit", title: "writeAuditEvent()", path: "src/audit/events.ts:14–31", detail: "New side effect introduced by this change. Error handling and retry behavior need review.", kind: "affected", x: 78, y: 73, icon: Database },
  { id: "roles-test", title: "roles.test.ts", path: "src/services/__tests__/roles.test.ts", detail: "Three related tests exist, but none exercise a non-admin actor changing another member.", kind: "test", x: 12, y: 45, icon: TestTube2 },
  { id: "invite-test", title: "invite.test.ts", path: "src/api/__tests__/invitations.test.ts", detail: "No assertion verifies that invitation acceptance cannot escalate a user's privileges.", kind: "test", x: 88, y: 47, icon: TestTube2 },
  { id: "role", title: "Role enum", path: "src/models/user.ts:9–17", detail: "The changed input can now fall back to organization.defaultRole, widening the behavior.", kind: "model", x: 50, y: 88, icon: Braces },
];

const edges = [["update", "admin"], ["update", "member"], ["update", "invite"], ["update", "audit"], ["admin", "roles-test"], ["invite", "invite-test"], ["member", "role"], ["audit", "role"]];

const findings = [
  { id: 1, severity: "High", tone: "danger", title: "Authorization guard removed", description: "updateUserRole() no longer verifies organization admin access.", file: "roles.ts:61", node: "update" },
  { id: 2, severity: "Medium", tone: "warning", title: "Invitation path may escalate role", description: "The affected caller accepts user-controlled invitation data.", file: "invitations.ts:104", node: "invite" },
  { id: 3, severity: "Medium", tone: "warning", title: "Missing negative test", description: "No test covers a non-admin modifying another member.", file: "roles.test.ts", node: "roles-test" },
  { id: 4, severity: "Low", tone: "success", title: "Public type widened", description: "RoleInput now accepts an additional nullable field.", file: "roles.ts:12", node: "role" },
];

const navItems = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Impact graph", icon: GitBranch },
  { label: "Findings", icon: ShieldAlert, count: 4 }, { label: "Changes", icon: FileCode2, count: 12 },
  { label: "Agent run", icon: Activity },
];

function Brand() {
  return <div className="brand"><span className="brand-mark"><GitPullRequest size={17} /></span><span>RepoScope</span></div>;
}

function RiskRing() {
  return <div className="risk-ring" aria-label="Risk score 82 out of 100"><span>82</span></div>;
}

function AnalysisDialog({ open, onClose, onAnalyze }: { open: boolean; onClose: () => void; onAnalyze: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(url)) {
      setError("Enter a GitHub pull request URL, for example github.com/acme/app/pull/42");
      return;
    }
    setError(""); onAnalyze(url);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-icon"><GitPullRequest size={19} /></div>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <p className="eyebrow">New analysis</p><h2 id="analysis-title">Review a pull request</h2>
        <p className="dialog-copy">Paste a public GitHub PR. RepoScope will map changed symbols, calculate their blast radius, and validate every finding against source evidence.</p>
        <form onSubmit={submit}>
          <label htmlFor="pr-url">GitHub pull request URL</label>
          <div className={`url-field ${error ? "field-error" : ""}`}><GitFork size={16} /><input id="pr-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/acme/web-platform/pull/482" autoFocus /></div>
          {error ? <p className="error-message">{error}</p> : null}
          <div className="scope-note"><LockKeyhole size={15} /><span>MVP supports public JavaScript and TypeScript repositories. No code is executed.</span></div>
          <button className="button button-primary button-wide" type="submit"><Zap size={15} /> Start analysis</button>
        </form>
      </section>
    </div>
  );
}

export default function Home() {
  const [dark, setDark] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [selectedNodeId, setSelectedNodeId] = useState("update");
  const [selectedFinding, setSelectedFinding] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("All");
  const [runState, setRunState] = useState<"complete" | "running">("complete");
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const filteredFindings = useMemo(() => severityFilter === "All" ? findings : findings.filter((finding) => finding.severity === severityFilter), [severityFilter]);

  function selectFinding(finding: (typeof findings)[number]) { setSelectedFinding(finding.id); setSelectedNodeId(finding.node); }
  function runAnalysis() { setRunState("running"); window.setTimeout(() => setRunState("complete"), 2200); }

  return (
    <main className="reposcope" data-theme={dark ? "dark" : "light"}>
      <header className="topbar">
        <Brand />
        <div className="project-crumb"><GitFork size={15} /><strong>acme/web-platform</strong><span>/</span><span>PR #482</span><ChevronDown size={13} /></div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="icon-button" aria-label="Notifications"><Bell size={16} /></button><span className="avatar" aria-label="Signed in as Maya Kapoor">MK</span>
        </div>
      </header>

      <div className="app-shell">
        <aside className="sidebar">
          <nav aria-label="Primary navigation">
            {navItems.map((item) => { const Icon = item.icon; const active = activeNav === item.label; return (
              <button key={item.label} className={`nav-item ${active ? "nav-active" : ""}`} onClick={() => setActiveNav(item.label)} aria-current={active ? "page" : undefined}>
                <Icon size={16} /><span>{item.label}</span>{item.count ? <small>{item.count}</small> : null}
              </button>
            ); })}
          </nav>
          <div className="sidebar-bottom">
            <div className="language-mode"><Braces size={15} /><span><strong>Deep mode</strong><small>TypeScript</small></span><CircleDot size={9} /></div>
            <button className="nav-item" onClick={() => setActiveNav("Settings")}><Settings size={16} /><span>Settings</span></button>
          </div>
        </aside>

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="analysis-status">{runState === "complete" ? <><CheckCircle2 size={13} /> Analysis complete · 2m 14s</> : <><RefreshCw className="spin" size={13} /> Rebuilding dependency graph…</>}</div>
              <h1>Refactor organization permissions</h1>
              <p>Opened by <strong>maya-k</strong><span>·</span><code>feature/role-policy</code><span>→</span><code>main</code></p>
            </div>
            <div className="heading-actions">
              <button className="button" onClick={() => setDialogOpen(true)}><Search size={15} /> Analyze another PR</button>
              <button className="button" onClick={runAnalysis} disabled={runState === "running"}><RefreshCw className={runState === "running" ? "spin" : ""} size={15} /> Re-run</button>
              <button className="button button-primary"><GitFork size={15} /> Publish check</button>
            </div>
          </div>

          <section className="metrics" aria-label="Pull request risk summary">
            <div className="metric risk-metric"><RiskRing /><span><small>Risk score</small><strong>High risk</strong><em>Authorization path changed</em></span></div>
            <div className="metric"><small>Blast radius</small><strong>23 modules</strong><em>7 direct · 16 indirect</em></div>
            <div className="metric"><small>Review findings</small><strong>4 findings</strong><em>1 high · 2 medium · 1 low</em></div>
            <div className="metric"><small>Test coverage</small><strong>2 gaps</strong><em>3 related tests found</em></div>
          </section>

          <div className="workspace-grid">
            <section className="panel graph-panel">
              <header className="panel-header"><div><h2>Impact graph</h2><p>Click a symbol to inspect why it is affected</p></div><div className="legend" aria-label="Graph legend"><span><i className="legend-dot dot-changed" />Changed</span><span><i className="legend-dot dot-affected" />Affected</span><span><i className="legend-dot dot-test" />Test</span></div></header>
              <div className="impact-graph" aria-label="Dependency impact graph">
                <svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {edges.map(([from, to]) => { const a = nodes.find((node) => node.id === from)!; const b = nodes.find((node) => node.id === to)!; return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
                </svg>
                {nodes.map((node) => { const Icon = node.icon; const selected = node.id === selectedNodeId; return (
                  <button key={node.id} className={`graph-node node-${node.kind} ${selected ? "node-selected" : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => setSelectedNodeId(node.id)} aria-pressed={selected}>
                    <span className="node-icon"><Icon size={13} /></span><span><strong>{node.title}</strong><small>{node.path.split("/").at(-1)}</small></span>
                  </button>
                ); })}
              </div>
              <footer className="selection-bar" aria-live="polite"><div><small>Selected symbol</small><strong>{selectedNode.title}</strong><code>{selectedNode.path}</code></div><p>{selectedNode.detail}</p><button className="text-button">Open source <ArrowUpRight size={12} /></button></footer>
            </section>

            <aside className="panel findings-panel">
              <header className="panel-header findings-heading"><div><h2>Findings</h2><p>{filteredFindings.length} evidence-validated results</p></div><div className="filter-wrap">
                <button className="icon-button" onClick={() => setFilterOpen(!filterOpen)} aria-label="Filter findings"><ListFilter size={15} /></button>
                {filterOpen ? <div className="filter-menu">{["All", "High", "Medium", "Low"].map((level) => <button key={level} onClick={() => { setSeverityFilter(level); setFilterOpen(false); }} className={severityFilter === level ? "filter-active" : ""}>{severityFilter === level ? <Check size={12} /> : <span />}{level}</button>)}</div> : null}
              </div></header>
              <div className="findings-list">
                {filteredFindings.map((finding) => <button key={finding.id} className={`finding ${selectedFinding === finding.id ? "finding-selected" : ""}`} onClick={() => selectFinding(finding)}><span className={`severity severity-${finding.tone}`}>{finding.severity}</span><strong>{finding.title}</strong><p>{finding.description}</p><small><FileCode2 size={11} /> {finding.file}</small></button>)}
                {!filteredFindings.length ? <div className="empty-findings">No findings match this filter.</div> : null}
              </div>
            </aside>
          </div>

          <section className="run-strip" aria-label="Agent analysis stages">
            <div className="run-intro"><span><Play size={13} /></span><div><strong>Analysis run</strong><small>run_8f12a · 6 stages</small></div></div>
            {[[Files, "Fetched PR", "12 files"], [GitBranch, "Built graph", "146 symbols"], [ShieldAlert, "Investigated", "4 findings"], [CheckCircle2, "Validated", "8 citations"]].map(([Icon, label, value], index) => { const StageIcon = Icon as typeof Files; return <div className="run-stage" key={label as string}><span><StageIcon size={13} /></span><div><strong>{label as string}</strong><small>{value as string}</small></div>{index < 3 ? <i /> : null}</div>; })}
            <button className="text-button">View trace <ArrowUpRight size={12} /></button>
          </section>
        </section>
      </div>

      <AnalysisDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onAnalyze={() => { setDialogOpen(false); runAnalysis(); }} />
    </main>
  );
}
