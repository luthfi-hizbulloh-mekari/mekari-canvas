# Playwright Trace retention is based on validated compressed size

Canvas applies its Trace retention policy to the final validated compressed Playwright Trace Artifact size at the successful publish commit. Traces smaller than exactly 1,000,000 bytes have no automatic expiration. Traces at or above 1,000,000 bytes expire exactly 168 hours after commit. The threshold uses authoritative stored bytes and decimal units; exactly 1,000,000 bytes is in the expiring class.

On Replace, Canvas classifies the stored authoritative old size and the newly validated size. When both are in the same class, the existing optional Trace expiration is preserved verbatim, including legacy 30-day deadlines. Large → small clears expiration, while small → large sets a new seven-day deadline from replacement commit. Missing or invalid old size metadata rejects replacement rather than inferring a class from expiration. Existing Shares are not migrated.

**Why:** small diagnostic traces have modest storage cost and are useful as durable references, while larger traces need bounded public exposure and storage consumption. A decimal threshold makes the retention boundary exact and understandable. Preserving same-class deadlines avoids silently extending existing retention; resetting only on a class transition reflects the new Artifact's storage class.

**Consequences:** permanent trace metadata stores no `expiresAt`, while trace API responses materialize that absence as `null`. The expiry index must remove permanent traces as well as add expiring ones, and the irreversible cleanup sweep rechecks canonical metadata before deletion. Request-time expiration and daily physical cleanup remain separate enforcement layers.

This ADR supersedes ADR 0006's unconditional 30-day retention rule. ADR 0011's dual-enforcement decision remains in effect for Shares that have a Trace expiration.
