import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/.vite/**', '**/coverage/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-empty': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
  {
    // Dependency direction: the domain layer stays framework-free.
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'electron*',
                'react*',
                'better-sqlite3',
                'drizzle-orm*',
                'node:*',
                'fs',
                'path',
                'child_process',
                'http',
                'https',
                'net',
              ],
              message:
                'The domain layer must not depend on frameworks, Node.js APIs, or infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    // Application layer: ports only, no concrete infrastructure.
    files: ['packages/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron*', 'react*', 'better-sqlite3', 'drizzle-orm*'],
              message: 'The application layer depends on ports, not concrete infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    // Renderer must never import Node.js or Electron main-process modules.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'electron*',
                'node:*',
                'fs',
                'path',
                'child_process',
                'better-sqlite3',
                'drizzle-orm*',
                '@ajnutrition/database*',
              ],
              message:
                'The renderer is unprivileged: talk to the main process through window.ajnutrition only.',
            },
          ],
        },
      ],
    },
  },
);
