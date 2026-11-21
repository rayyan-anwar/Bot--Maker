# Agent Lab plan validation

Plan parsing is intentionally strict and bounded. The plan root must be an object with a title, summary and between one and twelve steps. Only the explicit step types research, analyze, draft, review and decide are accepted. Text fields are trimmed and order is normalized by the parser.

Run the regression tests with `npm test`. This document describes the current parser behavior; it does not assert that plan steps are autonomously executed.
