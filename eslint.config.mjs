// ESLint 9 flat config —— 2026-10-04 由旧 `.eslintrc` 迁移而来（旧文件已删除）。
//
// 为什么要迁移：ESLint 9 只认 flat config，旧 `.eslintrc` 被完全忽略 ⇒
// `npm run lint` 长期以 "ESLint couldn't find an eslint.config.(js|mjs|cjs) file"
// 直接报错（见 2026-10-04 审计报告 P1-1），lint 门禁全程缺席。
//
// 迁移原则：
//  1) 忠实移植旧 .eslintrc 的规则集（eslint:recommended + react/recommended +
//     @typescript-eslint/recommended + 原有自定义覆盖），不多不少；
//  2) 补上**从未生效过**的 react-hooks 经典两条（rules-of-hooks=error /
//     exhaustive-deps=warn）——旧配置把 react-hooks 挂在 plugins 之外，这两条
//     在仓库历史上任何时期都没有被机器执行过；
//     ⚠️ 刻意不套用插件自带 recommended：eslint-plugin-react-hooks v7 的
//     recommended 已扩成「React Compiler 时代」19 条 error 级规则集，会大面积
//     误伤存量代码；只取与 2026-10-04 审计口径一致的经典两条；
//  3) 保持「0 error 可通过、warning 仅提示」：存量 exhaustive-deps 警告已在
//     审计中逐条分诊（绝大多数是 store 快照 / 一次性 effect / 前向引用的刻意
//     设计），不要为凑零而去关规则或批量 disable，要动逐条来。
import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tseslint from '@typescript-eslint/eslint-plugin'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    // 与旧 .eslintrc ignorePatterns 对应的忽略名单（+ ESLint 9 形态下的构建产物）
    ignores: [
      'dist/**',
      'node_modules/**',
      '.next/**',
      '.next-stale-*/**',
      'out/**',
      'dist-tauri/**',
      'coverage/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
      '.workbuddy/**',
      'local-only/**',
      'scripts/**',
      'public/js/**',
      '**/page_backup.tsx',
      '**/ios-compat.ts',
      // 纯 JS 不在 lint 管辖内（旧策略，保持一致）
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      // Next 自动生成
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      // ── 以下与旧 .eslintrc 的自定义覆盖逐条对应 ──
      'no-console': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-case-declarations': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'warn',
      // ── 本次补上的 react-hooks 经典两条 ──
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // 测试文件：沿用旧配置的 jest 环境 globals（vitest 与 jest 全局高度重叠）
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: { ...globals.jest } },
  },
]
