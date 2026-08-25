# Wingman v11.2 StackBlitz hotfix

- Fixed The Action quick-tool crash: `FlameIcon` was referenced even though the imported Lucide component is `Flame`.
- This was the runtime error shown by StackBlitz: `FlameIcon is not defined`.
- Preserves all v11.1 StackBlitz/API compatibility changes and v11 acceptance criteria.
