/**
 * 源码级护栏：`noUnusedLocals` 必须在岗（「无死局部」不变量唯一的执行者）。
 *
 * 背景：2026-10-04 清掉 47 处死局部（`tsc --noUnusedLocals` 的权威诊断，
 * 其中 app/page.tsx 40 处）后，才把 tsconfig 的 noUnusedLocals 打开 ——
 * 在那之前它一直没开，这类残留只能靠「全仓 audit」人工发现。
 * 「死导入」那半由 no-dead-imports.test.ts 守着；本文件只守这一个开关：
 * 把它关回去，tsc 就回归静默，死局部会重新无声累积。
 *
 * 刻意不开 `noUnusedParameters`（会引出 `_` 前缀参数等一大批无关改动），
 * 故此处只断言 noUnusedLocals，不对 noUnusedParameters 做任何断言。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('源码卫生：noUnusedLocals 在岗', () => {
  it('tsconfig.json 必须开启 noUnusedLocals', () => {
    const cfg = JSON.parse(readFileSync('tsconfig.json', 'utf8')) as {
      compilerOptions?: { noUnusedLocals?: boolean }
    }
    expect(cfg.compilerOptions?.noUnusedLocals).toBe(true)
  })
})
