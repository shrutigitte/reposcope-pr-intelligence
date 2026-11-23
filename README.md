# RepoScope — Pull Request Intelligence

RepoScope turns a public GitHub pull request into a fast, visual risk review. Paste a PR URL and the app fetches live GitHub metadata, maps the highest-impact files, and highlights security-sensitive changes, schema changes, missing tests, dependency movement, and infrastructure risk.

## Live product

[Open RepoScope on Vercel](https://reposcope-dusky-six.vercel.app)

The application is designed for anonymous use: visitors do not need an OpenAI or GitHub account. A server-side `GITHUB_TOKEN` can be added by the deployer to increase GitHub API limits without exposing credentials to users.

## What it demonstrates

- Full-stack TypeScript with Next.js App Router and React
- Server-side integration with the GitHub REST API
- URL validation, error handling, rate-limit handling, and live loading states
- Deterministic risk scoring and explainable findings
- Interactive dependency graph with severity and category filters
- Responsive product UI with dark mode
- Serverless deployment on Vercel

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste a public GitHub pull-request URL.

## Environment variables

Copy `.env.example` to `.env.local` if you want higher GitHub API limits:

```bash
GITHUB_TOKEN=your_fine_grained_token
```

The token is optional and is used only by the server route. For public repositories, grant read-only access to repository metadata and pull requests. Never expose it through a `NEXT_PUBLIC_` variable.

## Production checks

```bash
npm run lint
npm run build
```

## Deploy to Vercel

Import this repository in Vercel. The framework preset is detected as Next.js and no custom build configuration is required. Optionally add `GITHUB_TOKEN` in Project Settings → Environment Variables.

## Current limitations

- Public GitHub pull requests only
- GitHub returns at most the first 100 changed files in the current analysis
- Findings are deterministic heuristics, not a substitute for human code review

## Architecture

The browser sends only the PR URL to `POST /api/analyze`. The server validates it, calls GitHub for pull-request and file metadata, scores recognizable risk patterns, and returns a compact graph plus explainable findings. Secrets remain server-side.
