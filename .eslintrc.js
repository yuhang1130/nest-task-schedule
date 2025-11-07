module.exports = {
  // 解析器配置 - 使用 TypeScript 解析器
  parser: '@typescript-eslint/parser',
  
  // 解析器选项
  parserOptions: {
    // 项目 TypeScript 配置文件路径
    project: 'tsconfig.json',
    // TypeScript 项目根目录
    tsconfigRootDir: __dirname,
    // 源码类型为模块
    sourceType: 'module',
  },
  
  // 插件配置
  plugins: [
    // TypeScript ESLint 插件
    '@typescript-eslint/eslint-plugin',
    // NestJS 专用插件
    '@darraghor/nestjs-typed',
  ],
  
  // 继承的配置
  extends: [
    // ESLint 推荐规则
    'eslint:recommended',
    // TypeScript ESLint 推荐规则
    '@typescript-eslint/recommended',
    // NestJS 推荐规则
    'plugin:@darraghor/nestjs-typed/recommended',
    // Prettier 配置（关闭与 Prettier 冲突的规则）
    'prettier',
  ],
  
  // 运行环境
  env: {
    // Node.js 环境
    node: true,
    // Jest 测试环境
    jest: true,
  },
  
  // 忽略的文件模式
  ignorePatterns: [
    // 忽略编译输出目录
    '.eslintrc.js',
    'dist',
    'node_modules',
  ],
  
  // 自定义规则
  rules: {
    // TypeScript 相关规则
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    
    // 一般代码质量规则
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    
    // NestJS 相关规则
    '@darraghor/nestjs-typed/injectable-should-be-provided': 'error',
    '@darraghor/nestjs-typed/controllers-should-supply-api-tags': 'warn',
  },
  
  // 针对特定文件的覆盖规则
  overrides: [
    {
      // 测试文件特殊配置
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
      rules: {
        // 测试文件中允许使用 any
        '@typescript-eslint/no-explicit-any': 'off',
        // 测试文件中允许使用 console
        'no-console': 'off',
      },
    },
  ],
};