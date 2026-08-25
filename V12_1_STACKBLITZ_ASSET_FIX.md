# Wingman v12.1 StackBlitz asset fix

- Removed binary image imports from the review build.
- Embedded the approved suited Wingman mark directly as a data URI in source.
- This avoids StackBlitz direct-upload limits silently dropping PNG assets.
- Removed the unused 1.5 MB hero-photo asset from the review build.
- No feature/checklist changes from v12.
