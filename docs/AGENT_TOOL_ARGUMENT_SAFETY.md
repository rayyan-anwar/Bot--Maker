# Tool argument serialization safety regression tests

These tests exercise safe rejection of non-JSON argument payloads (cyclic values and BigInt), enforce serialized UTF-8 byte limits for multibyte text, reject unknown/unusable tool inputs, and confirm draft creation remains preview-only with bounded content.

Run with `npm test`. Tests have not been executed in this environment and should be confirmed by CI.
