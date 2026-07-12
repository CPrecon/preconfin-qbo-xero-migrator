# Supabase Storage

Create a private bucket named `migration-artifacts`.

Recommended lifecycle policy:

- Delete generated ZIP/PDF/JSON objects after 14 days.
- Keep object access private.
- Serve downloads only through API-generated signed URLs.
