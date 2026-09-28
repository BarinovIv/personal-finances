/**
 * Границы модулей (deep modules, grey-box).
 * У каждого пакета packages/<name> открытая точка входа — index.ts в корне пакета.
 * Реализация лежит в src/, тесты — в test/.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-foreign-internals",
      comment: "Чужой пакет импортируется только через его точку входа (index.ts), не через src/ или test/.",
      severity: "error",
      from: { path: "^packages/([^/]+)/" },
      to: { path: "^packages/[^/]+/(src|test)/", pathNot: "^packages/$1/" }
    },
    {
      name: "tests-through-entry",
      comment: "Тесты пакета обращаются к нему только через его точку входа (index.ts).",
      severity: "error",
      from: { path: "^packages/([^/]+)/test/" },
      to: { path: "^packages/$1/src/" }
    },
    {
      name: "no-importing-tests",
      comment: "Код не зависит от тестов.",
      severity: "error",
      from: { pathNot: "^packages/[^/]+/test/" },
      to: { path: "^packages/[^/]+/test/" }
    },
    {
      name: "effect-only-in-sync-and-server",
      comment: "На клиенте Effect используется только внутри модуля синхронизации (и общих схем протокола).",
      severity: "error",
      from: { path: "^packages/(domain|entry-line|ledger|web)/" },
      to: { path: "node_modules/(effect|@effect)/" }
    },
    {
      name: "client-core-offline",
      comment: "Расчёты клиента не зависят от сервера и синхронизации (ADR-0001).",
      severity: "error",
      from: { path: "^packages/(domain|entry-line|ledger)/" },
      to: { path: "^packages/(server|sync|protocol|web)/" }
    },
    {
      name: "server-not-client",
      comment: "Сервер не зависит от клиентских модулей.",
      severity: "error",
      from: { path: "^packages/server/" },
      to: { path: "^packages/(entry-line|ledger|sync|web)/" }
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^packages/[^/]+/dist/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]
    }
  }
}
