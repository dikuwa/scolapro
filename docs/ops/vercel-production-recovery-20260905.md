# Vercel production recovery — 2026-09-05

Observed production state from the Vercel dashboard:

- Project: `scolapro`
- Git source: `dikuwa/scolapro`
- Production branch: `main`
- Current production commit: `1ad800f` (`ScolaPro: bind LTSM loan actor provenance (#280)`)
- Production alias shown: `scola-pro.vercel.app`
- Project default domain shown elsewhere: `scolapro-jet.vercel.app`
- Recent ScolaPro preview deployments are failing/blocked while the Hobby account reports exceeded free resources.

Recovery checklist:

1. Keep the Git integration on `dikuwa/scolapro` and Production Branch on `main`.
2. Rename the Vercel project to `scola-pro` when available. Keep `scola-pro.vercel.app` as the canonical production domain and remove/stop advertising `scolapro-jet.vercel.app` after the rename is confirmed.
3. Ensure Production environment variables match the working local Supabase environment:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - plus any worker secrets required by enabled production jobs.
4. Current `main` throws on Vercel when the required public Supabase variables are missing instead of silently using synthetic preview data.
5. Resolve the Hobby-plan deployment/resource block before expecting pushes to `main` to promote to Production. After capacity is available, redeploy the latest `main` and verify the production source SHA matches GitHub `main`.
6. Validate `/`, `/learners`, `/attendance`, `/reports/report-cards`, and learner photo upload after promotion.

No credentials belong in this repository.
