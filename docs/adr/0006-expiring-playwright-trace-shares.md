# Playwright Trace Shares expire without reactivation

Playwright Trace Shares are retained for 30 days from first publish. Replacing an active trace keeps the same expiration date rather than extending it; a daily sweeper then deletes both the ZIP and Share metadata, making the Short link return 404 and preventing replacement or reactivation. A new upload creates a new Share.

**Why:** trace ZIPs are large and may contain sensitive diagnostic data, so they should not consume storage or remain publicly accessible indefinitely. Deleting metadata as well as the blob keeps the existing Replace authorization model truthful: a dead Share cannot be found or mutated.

**Considered option:** retain an expired Share tombstone so a later Replace could revive the slug — rejected because it preserves metadata for deleted content and makes expiration less final and predictable.

Superseded in part by ADR 0014
