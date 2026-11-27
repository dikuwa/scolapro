# Issue 1336 academic setup handback

STATUS: IN PROGRESS  
WORKSTREAM: Academic year and term configuration  
BRANCH: feat/1336-academic-year-term-setup  
BASE MAIN: 5f4d173db  
HEAD SHA: pending commit  
PR: NOT OPENED  
CI: Focused tests, TypeScript and ESLint pass locally; remote CI not run  
MIGRATIONS: NONE  
FILES/AREAS TOUCHED: `/school/setup`, governed academic-calendar read/actions/editor, contributions governed-year lookup, focused source-contract test  
ACCEPTANCE VERIFIED: School setup reads configured years/terms; school-admin mutation actions call canonical `configure_academic_year` and `configure_academic_term` RPCs; closed years are read-only; term dates are bounded and sequenced; successful saves toast, close and refresh; contributions use the governed academic year.  
NOT VERIFIED: Authenticated browser/device screenshots at 390/768/1440, live Supabase execution, production data, and remote CI.  
DEPENDENCIES: Existing academic calendar RPCs, RLS and pgTAP lifecycle coverage  
CONFLICT CHECK: Academic setup files are owned by this workstream; contributions page change came from the independent next-feature audit and is disjoint.  
SAFE TO MERGE: NO  
NEXT UNLOCKED WORK: Run remote application/database CI, then assess the separately confirmed next-year grade/class readiness and promotion-rule management gaps.

The candidate still has independent acceptance findings outside this slice: guardian notice duplicate-submission concurrency, migration lock/restore-readiness gates, and live visual/browser QA gaps. These are not silently folded into this implementation.
