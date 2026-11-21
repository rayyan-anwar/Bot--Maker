# AI Budget Alert Message Format

This helper converts alert snapshot values into a structured, bounded summary for future admin UI, email, or notification adapters.

- Status names are mapped to fixed titles.
- Scope labels have markup characters and line breaks removed and are length-limited.
- Numeric values are validated before display; invalid values become `unavailable`.
- Currency is shown only when a valid currency code is provided.
- The helper does not send messages, persist alert events, or perform authorization. Callers must authorize access and use their own delivery adapter.
