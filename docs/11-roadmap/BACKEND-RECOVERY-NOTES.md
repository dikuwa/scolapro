# Backend recovery notes

The recovery branch is intentionally limited to database integrity and regression-test alignment. It does not add UI work and does not change Sports & Houses product scope. Once the full database workflow is green, merge this recovery first, then refresh the Sports & Houses branch against the new `main` and re-run its full validation.
