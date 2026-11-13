#!/usr/bin/env node
// 切换小程序接口环境：改写 config/env.js 里的 ACTIVE_ENV 一行。
//
//   pnpm run build:dev    本地开发   http://127.0.0.1:18080/api/v1
//   pnpm run build:test   体验版
//   pnpm run build:prod   正式版
//   pnpm run build:auto   清掉手动选择，回到按小程序版本自动判断
//   pnpm run env:status   只打印当前环境，不改文件
//
// 只改一个常量、不生成任何构建产物：小程序由开发者工具直接编译源码，
// 文件变更后工具会自己重编译，控制台会打印 [env] 当前环境。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, "config/env.js");

const MODES = {
  dev: { value: "dev", key: "develop", label: "本地开发" },
  test: { value: "test", key: "trial", label: "体验版" },
  prod: { value: "prod", key: "release", label: "正式版" },
  auto: { value: "", key: "", label: "按版本自动" },
};

// 只匹配这一行，其余内容一字不动：手写的注释、地址都不要被脚本碰
const ACTIVE_LINE = /^const ACTIVE_ENV = "[^"]*";.*$/m;
const ACTIVE_LINE_NEW = (v) => `const ACTIVE_ENV = "${v}"; // dev | test | prod | 空 = 按版本自动`;

function apiBaseOf(src, key) {
  if (!key) return "";
  const m = src.match(new RegExp(`\\b${key}:\\s*\\{[\\s\\S]*?apiBase:\\s*"([^"]+)"`));
  return m ? m[1] : "";
}

function devLanIpOf(src) {
  const m = src.match(/devLanIp:\s*"([^"]*)"/);
  return m ? m[1].trim() : "";
}

function report(src, mode) {
  if (mode.key) {
    console.log(`✔ 已切到 ${mode.label}（${mode.key}）`);
    console.log(`  ${apiBaseOf(src, mode.key) || "地址见 config/env.js"}`);
    if (mode.key === "develop") {
      const ip = devLanIpOf(src);
      console.log(
        ip
          ? `  真机将走局域网 http://${ip}:18080/api/v1（devLanIp）`
          : "  真机调试先在 config/env.js 填 devLanIp，或 Console 执行 setApiBase(...)",
      );
    }
  } else {
    console.log("✔ 已回到自动模式：按小程序版本选地址");
    console.log(`  开发/真机调试 → ${apiBaseOf(src, "develop")}`);
    console.log(`  体验版        → ${apiBaseOf(src, "trial")}`);
    console.log(`  正式版        → ${apiBaseOf(src, "release")}`);
  }
  console.log("  开发者工具会自动重编译，控制台会打印一行 [env] 确认。");
  console.log("  正式版始终用正式地址，忘了切回来也不会把内网地址带上线。");
}

const mode = process.argv[2];

if (!MODES[mode] && mode !== "status") {
  console.error("用法: node scripts/set-env.mjs <dev|test|prod|auto|status>");
  process.exit(1);
}

const src = readFileSync(ENV_FILE, "utf8");

if (mode === "status") {
  const m = src.match(ACTIVE_LINE);
  if (!m) {
    console.error("config/env.js 里找不到 ACTIVE_ENV 那一行，文件结构可能被改过");
    process.exit(1);
  }
  const current = m[0].match(/"([^"]*)"/)[1];
  if (!current) {
    console.log("当前: 自动模式（未手动指定，按小程序版本选地址）");
  } else {
    const hit = Object.values(MODES).find((v) => v.value === current);
    console.log(`当前手动环境: ${current}${hit ? `（${hit.label} / ${hit.key}）` : ""}`);
  }
  console.log("解析结果见开发者工具控制台的 [env] 行。");
  process.exit(0);
}

if (!ACTIVE_LINE.test(src)) {
  console.error("config/env.js 里找不到 ACTIVE_ENV 那一行，文件结构可能被改过");
  process.exit(1);
}

const next = src.replace(ACTIVE_LINE, ACTIVE_LINE_NEW(MODES[mode].value));
if (next !== src) {
  writeFileSync(ENV_FILE, next);
}

report(next, MODES[mode]);
