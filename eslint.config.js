import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'coverage', '.claude'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    // AGENTS.md rules 1 and 2: the sim (and the screen flow) is pure, deterministic TypeScript.
    files: ['src/sim/**/*.ts', 'src/flow/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message: 'src/sim and src/flow must not depend on Phaser.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts.' },
        { object: 'Date', property: 'now', message: 'The sim advances only via tick().' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/sim and src/flow must not touch the DOM.' },
        { name: 'document', message: 'src/sim and src/flow must not touch the DOM.' },
        { name: 'performance', message: 'The sim advances only via tick().' },
      ],
    },
  },
  prettier,
);
