# Fortisni Hinglish recognition

Fortisni's browser companion and server-side reaction engine now recognize additional Roman Hindi / Hinglish signals alongside existing English and Devanagari Hindi phrases.

Covered examples include:
- Sadness: `dukhi`, `udaas`, `akela`, `pareshan hoon`
- Concern: `dar lag raha hai`, `ghabra`, `tension ho rahi hai`
- Frustration: `gussa`, `naraz`, `bakwas`
- Gratitude: `shukriya`, `dhanyawad`
- Positive mood: `zabardast`, `accha laga`, `bahut badhiya`
- Confusion and curiosity: `samajh nahi`, `kaise`, `kyun`, `batao`

The browser and server engines keep their own lightweight deterministic classifiers. This is a best-effort signal for expressive UI and response guidance, not a clinical assessment or a substitute for interpreting the actual conversation. Unknown or unrelated text remains neutral. Existing safe state allowlists and reduced-motion styling remain in place.

Tests cover representative Roman Hindi/Hinglish cases and neutral fallback behavior.
