# Vercel production recovery

This note records the production deployment recovery state for ScolaPro.

## Canonical production expectations

- Repository: `dikuwa/scolapro`
- Production branch: `main`
- Canonical project/domain target: `scola-pro` / `scola-pro.vercel.app`
- Production must use the configured Supabase environment and must not silently fall back to synthetic demonstration data.
- The project requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production.

## Current recovery rule

When Vercel Hobby build limits block newer `main` deployments, do not promote an older feature-branch Preview or redeploy a stale Production commit. Trigger a fresh deployment from the latest `main` once the build limit permits it, then verify the production alias advances to that commit.

## Document assets

`watermark-A4.svg` is a universal ScolaPro A4 document watermark. It is not school-specific and should be reusable across governed system documents. School logos and identity remain school-scoped settings/snapshot data.
