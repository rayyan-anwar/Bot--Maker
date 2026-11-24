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


Roman Hindi affection tokens are matched as complete words in both browser and server classifiers, preventing accidental matches inside unrelated words such as `dostana` or `yaadgar`. Regression tests cover both false-positive and intended positive cases.


Negation handling is applied before emotion matching in both browser and server classifiers. Common English forms (`not`, `don't`, `do not`, `isn't`, etc.), Roman Hindi forms (`nahi` / `nahin`) and common Devanagari emotion phrases are masked before matching. This is a conservative heuristic, not a full semantic or sarcasm model; mixed clauses still need broader real-world evaluation.
