# Supabase Security Results

Status: not executed in this session.
Reason: no staging Supabase project credentials were available.
Starting commit: e0e7058413876dfa0fd1dd41a732ff7c9676dfad

## Infrastructure checks

| Check                                       | Result                |
| ------------------------------------------- | --------------------- |
| Empty database migration applied            | Not run               |
| RLS enabled on sensitive tables             | Not run live          |
| Private storage bucket created              | Not run               |
| Two isolated test subjects created          | Not run               |
| Separate migration jobs created             | Not run               |
| Cross-job access denied                     | Fixture-verified only |
| Unauthorized signed URL creation denied     | Not run live          |
| Signed URL expiration                       | Not run live          |
| Job deletion removes DB records             | Not run live          |
| Job deletion removes storage objects        | Not run live          |
| Deletion failure recovery                   | Not run live          |
| Artifact expiration cleanup                 | Not run live          |
| Tokens encrypted at rest                    | Not run live          |
| Logs inspected for token/accounting leakage | Not run live          |

## Evidence rules

- Commit only object counts, status codes, and redacted IDs.
- Do not commit service role keys, access tokens, refresh tokens, signed URLs, raw source snapshots, or accounting payloads.
