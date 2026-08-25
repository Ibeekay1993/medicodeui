# Guidelines

- Always verify imports. Whenever you add a new React hook (like `useEffect`, `useState`) or introduce a new variable into a file, you must explicitly check the top of the file to ensure it is imported correctly before you finish your work or deploy.
- Before deploying, always run a quick TypeScript check (like `npx tsc --noEmit`) to automatically catch any missing imports, syntax errors, or undefined variables before they ever reach production.
