import { defineConfig } from 'tsup';

/**
 * tsup 构建配置（三个构建）
 *
 * 注意：配置数组会被 tsup 并行执行，因此这里都不使用 clean，
 * dist 的清理由 package.json 的 prebuild 脚本统一完成，避免互相清掉对方的产物。
 *
 * 1. 库产物：src/index.ts → dist/index.cjs + dist/index.mjs + .d.ts
 *    - 代码压缩，双格式输出，供 npm 包 main/module/exports 使用
 * 2. CLI 产物：src/cli/index.ts → dist/cli/index.js（CJS，含 shebang）
 *    - 不压缩（便于排查问题）
 * 3. MCP Server 产物：src/mcp/server.ts → dist/mcp/server.js（CJS，含 shebang）
 *    - 不压缩，MCP SDK 依赖打包进产物（无 zod/SDK 版本漂移问题）
 */
export default defineConfig([
    {
        entry: ['src/index.ts'],
        format: ['cjs', 'esm'],
        dts: true,
        minify: true,
        clean: false,
        target: 'node18',
        sourcemap: false,
        outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' })
    },
    {
        entry: { 'cli/index': 'src/cli/index.ts' },
        format: ['cjs'],
        dts: false,
        minify: false,
        clean: false,
        target: 'node18',
        sourcemap: false,
        outExtension: () => ({ js: '.js' })
    },
    {
        entry: { 'mcp/server': 'src/mcp/server.ts' },
        format: ['cjs'],
        dts: false,
        minify: false,
        clean: false,
        target: 'node18',
        sourcemap: false,
        // MCP Server 独立分发，把 @modelcontextprotocol/sdk 与 zod 打进单文件
        noExternal: [/@modelcontextprotocol/, /zod/],
        outExtension: () => ({ js: '.js' })
    }
]);
