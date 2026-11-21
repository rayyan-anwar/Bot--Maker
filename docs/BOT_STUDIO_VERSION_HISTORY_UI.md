# Bot Studio version history dashboard

Owners can open Version history from each bot card in the dashboard.

- Lists saved versions and their timestamp/summary.
- Shows the current version.
- Restore is offered only for non-current versions.
- Restore uses the authenticated owner API endpoint and creates a new version according to the server lifecycle; it does not erase history.
- Rendering uses DOM text APIs for summaries.
- The public/shared bot cards do not expose owner restore controls.

The server remains authoritative for ownership and version validation. This dashboard is only a UI for existing version APIs.
