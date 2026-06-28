# Training Wiki

`resources/training_wiki` is the source of truth for user-facing training option explanations.

The launcher learning center and WebUI field help both consume the same JSON shape. The Vite configs copy this folder into each frontend build as `/training-wiki/*`, so UI code should not duplicate wiki text.

When a field has no dedicated entry, WebUI falls back to the schema `label` and `desc` so every training option still has a short explanation.
