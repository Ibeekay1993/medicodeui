# Archived infrastructure and maintenance material

Everything under this directory is reference material only. It is excluded from active build, deployment and function paths. Do not copy archived files into a running service or use their old endpoints/secrets. Historical copies remain in Git history as well.

- `legacy-meta-firebase/`: retired Meta Cloud API webhook source. The production Meta webhook subscription could not be inspected from this repository, so the source is retained until an operator confirms it is detached.
- `legacy-maintenance/`: one-off scripts that target retired infrastructure or perform direct historical-data writes. They are not runnable from the active scripts directory.

The current request path is AWS ECS Evolution API → self-hosted Supabase Edge Functions → application database. Keep AWS ECS running. The separate AWS Lambda/SQS worker remains paused.
