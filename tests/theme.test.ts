/// <reference types="node" />

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { cssToReactNativeRuntime } from "react-native-css-interop/dist/css-to-rn/index.js";
import tailwindcss from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig.js";
import resolveConfig from "tailwindcss/resolveConfig.js";

import { colors, typography } from "../src/constants/theme.ts";

process.env.NATIVEWIND_OS = "ios";

const config = loadConfig(fileURLToPath(new URL("../tailwind.config.ts", import.meta.url)));
const palette = new Map(Object.entries(resolveConfig(config).theme.colors));
const compiled = readFile(new URL("../global.css", import.meta.url), "utf8")
  .then((css) =>
    postcss([tailwindcss(config)]).process(css, {
      from: fileURLToPath(new URL("../global.css", import.meta.url)),
    }),
  )
  .then(({ css }) => cssToReactNativeRuntime(css, { inlineRem: 16 }));

test("Tailwind uses the same semantic palette as native component props", () => {
  assert.equal(config.darkMode, "class");
  assert.equal(palette.get("background"), colors.background);
  assert.equal(palette.get("surface"), colors.surface);
  assert.equal(palette.get("ink"), colors.ink);
  assert.equal(palette.get("muted"), colors.muted);
  assert.equal(palette.get("line"), colors.line);
  assert.deepEqual(palette.get("primary"), {
    DEFAULT: colors.primary,
    dark: colors.primaryDark,
    light: colors.primaryLight,
  });
  assert.deepEqual(palette.get("secondary"), {
    DEFAULT: colors.secondary,
    light: colors.secondaryLight,
  });
  assert.deepEqual(palette.get("danger"), {
    DEFAULT: colors.red,
    light: colors.redLight,
  });
});

test("native utility output preserves spacing, typography and content width", async () => {
  const { rules } = await compiled;
  assert.deepEqual(rules?.["p-4"]?.n?.[0].d, [[{ padding: 16 }]]);
  assert.deepEqual(rules?.["text-[13px]"]?.n?.[0].d, [[{ fontSize: 13 }]]);
  assert.deepEqual(rules?.["leading-4"]?.n?.[0].d, [[{ lineHeight: 16 }]]);
  assert.deepEqual(rules?.["max-w-content"]?.n?.[0].d, [[{ maxWidth: 680 }]]);
  assert.deepEqual(typography.numeric.fontVariant, ["tabular-nums"]);
});

test("screen utilities and pressed states are supported in native styles", async () => {
  const { rules } = await compiled;
  for (const name of [
    "bg-background",
    "bg-surface",
    "bg-primary",
    "bg-primary-light",
    "bg-secondary",
    "bg-secondary-light",
    "bg-danger-light",
    "text-primary-dark",
    "text-secondary",
    "text-danger",
    "border-scanner-border",
    "border-scanner-corner",
    "border-success-border",
    "rounded-[13px]",
    "rounded-3xl",
    "border-y",
    "leading-[15px]",
    "text-[35px]",
    "tracking-[-1.3px]",
    "shrink",
    "flex-row",
    "gap-3.5",
    "-mt-1.5",
    "min-h-[53px]",
    "opacity-50",
    "active:opacity-50",
    "active:opacity-80",
    "active:scale-[0.99]",
  ]) {
    const rule = rules?.[name];
    assert.ok(rule?.n?.length, `Missing native utility: ${name}`);
    assert.deepEqual(rule.warnings ?? [], [], `Unsupported native utility: ${name}`);
  }
  assert.deepEqual(rules?.["bg-primary"]?.n?.[0].d, [
    [{ backgroundColor: colors.primary }],
  ]);
  assert.deepEqual(rules?.["active:opacity-80"]?.n?.[0].pseudoClasses, {
    active: true,
  });
});
