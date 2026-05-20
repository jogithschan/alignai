# AlignAI

AI-powered job discovery that scrapes LinkedIn listings, scores them against your resume, and surfaces the best matches — with a separate review queue for borderline opportunities worth a manual look.

Built with **Next.js**, **Playwright**, **OpenAI**, **Prisma**, and **SQLite**.

## Features

- **Resume-aware scraping** — derives search titles from your resume, searches each location independently, and filters by target roles and avoid keywords
- **Two-stage AI pipeline** — cheap pre-screen on listing metadata, then deep alignment scoring (skills, experience, location, role fit)
- **Strong matches vs. deep eval review** — qualified jobs land in Pending; below-threshold and manual-review jobs go to a toggleable review queue
- **Live incremental updates** — scraping runs in the background; jobs appear in the UI as they are evaluated (with an "Evaluating" state)
- **API cost tracking** — token usage and estimated spend per operation, with a 14-day chart and per-scrape breakdown
- **Job workflow** — pending, applied, dismissed; promote from review to matches; fit analysis modal with score breakdown

## Prerequisites

- Node.js 20+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- Playwright browsers (installed automatically via `playwright` npm package)

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env   # or create .env manually
```

Add to `.env`:

```env
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="sk-..."
```

```bash
# Create database and generate Prisma client
npx prisma db push

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Resumes** — upload or paste your resume, set target roles, locations, experience levels, and avoid keywords. Mark one resume as active.
2. **Settings** — add LinkedIn job search URLs (e.g. `https://www.linkedin.com/jobs/search/?keywords=AI+Engineer`).
3. **Dashboard** — click **Run scraper**. Progress shows in the sidebar; switch between **Strong matches** and **Deep eval review** at the top.
4. **API Usage** — monitor OpenAI token spend by operation and scrape run.

## Architecture

```
LinkedIn search pages
        │
        ▼
  Playwright scraper          ← per-location × keyword searches
        │
        ▼
  Pre-screen (gpt-4o-mini)    ← quick interest score on listings
        │
        ▼
  Deep eval (top ~20)         ← fetch description + full alignment
        │
        ├── MATCH  → Dashboard Pending tab
        └── REVIEW → Deep eval review tab
```

**Background scraping** — `POST /api/scrape` starts a server-side job and returns immediately. The UI subscribes to `GET /api/scrape/events` (SSE) for progress and new jobs. Navigating away does not cancel the scrape.

### Key paths

| Path | Purpose |
|------|---------|
| `src/lib/scraper.ts` | Main scrape orchestration |
| `src/lib/scrape-runner.ts` | Singleton background job runner |
| `src/lib/evaluator.ts` | OpenAI: keywords, profile, pre-screen, alignment |
| `src/lib/selection.ts` | Thresholds, title relevance, selection gates |
| `src/lib/linkedin.ts` | DOM extraction + guest API description fetch |
| `src/lib/api-cost.ts` | Token/cost recording and dashboard data |

### Selection thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `QUICK_SCREEN_THRESHOLD` | 55 | Min pre-screen score to enter deep eval |
| `QUALIFYING_MIN_SCORE` | 68 | Min overall score for MATCH tier |
| `MIN_SKILLS_SCORE` | 58 | Min skills dimension |
| `MIN_ROLE_SCORE` | 58 | Min role fit dimension |
| `MAX_JOBS_TO_EVALUATE` | 20 | Deep eval cap per run |
| `MAX_LISTINGS_TO_COLLECT` | 40 | Total listings cap per run |

## Scripts

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

## GitHub (personal account)

This repo uses a dedicated SSH host alias. Add the public key to GitHub → Settings → SSH keys:

```bash
cat ~/.ssh/github-personal.pub
```

Clone or set remote:

```bash
git remote add origin git@github-personal:YOUR_USER/alignai.git
git push -u origin main
```

## Notes

- LinkedIn may serve thin descriptions without login; the scraper tries the guest API first, then falls back to listing metadata for manual review.
- Cost estimates use gpt-4o-mini pricing ($0.15/1M input, $0.60/1M output); actual billing may differ.
- SQLite (`dev.db`) is gitignored; run `npx prisma db push` on a fresh clone.
