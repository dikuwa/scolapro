# GitHub Copilot Instructions — ScolaPro

Read and follow `/AGENTS.md` before proposing or changing code.

For frontend/UI work, the canonical style rules are:
- `/docs/08-ui-ux/DESIGN-PRINCIPLES.md`
- `/docs/08-ui-ux/DESIGN-SYSTEM.md`
- `/docs/08-ui-ux/MOTION-INTERACTION.md`
- `/docs/08-ui-ux/COMPONENT-INVENTORY.md`
- `/docs/09-architecture/FRONTEND-ARCHITECTURE.md`

Do not generate generic dashboard UI that conflicts with these documents. Reuse approved components and tokens, preserve responsive/accessibility/loading states, and do not introduce browser-native product controls where ScolaPro components are required.