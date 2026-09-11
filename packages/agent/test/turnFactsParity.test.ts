// **새 경로가 옛 경로와 무엇이 같고 무엇이 달라야 하는가** — 턴의 세 사실(2026-09-11 개정).
//
// `mentionTurn` 4자리 + `interactiveTurn` 3자리가 실은 **세 질문**이었다:
//
//   1. 멘션 턴을 TUI 로 띄우는가        (`usesTuiForMention`)
//   2. 계정 풀 표면이 있는가            (`hasAccountPool`)
//   3. 첫 턴 뒤 세션 id 를 발견하는가   (`discoversSessionIdAfterTurn`)
//
// 세 함수가 스위치를 품고 있으므로 **그 함수들이 곧 갈림길**이다.
//
// ## 전환 기준은 "같음"이 아니라 "claude 는 같고 codex 는 TUI"다 (2026-09-11 정정)
//
// 앞 판본은 두 경로가 **모든 하네스에서** 같은 답을 내는 것을 재고 있었다. 그것은 이설의
// 중간 상태였을 뿐이고 목표가 아니다 — TUI 캡슐화가 murmur 의 전제이므로 새 경로의 값은
// **claude 에 대해 같고(회귀 없음), codex 에 대해 올라간다(exec → tui)**. 그래서 이 파일은
// 하네스별로 다른 것을 잰다:
//
//   claude-code  세 답이 두 경로에서 **같다**            ← 회귀가 없다는 증거
//   codex        `usesTui` 만 다르고 나머지는 **같다**   ← 올라간 것이 그 하나뿐이라는 증거
//
// 아래 것이 더 강한 주장이다: "달라진 자리가 **정확히 하나**"를 재므로, 실수로 다른 사실이
// 함께 움직이면(예: 계정 풀이 열리거나 세션 발견이 꺼지면) 그것이 드러난다.
//
// ## 값을 맞추는 것만으로는 부족하다
//
// 두 경로가 같은 답을 낸다는 것과 **그 답이 옳다**는 것은 다른 문제다. 표의 값을 잘못
// 적으면 양쪽이 나란히 틀리는 것은 아니지만(옛 경로는 이름을 보므로), 새 경로만 틀린 채
// "같다" 를 재면 그 차이가 드러난다 — 그래서 하네스별 기대값을 따로 못 박는다. 그 표가
// 곧 "지금 프로덕션이 이렇게 돈다"의 기록이다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RUNNABLE_HARNESSES, type AgentHarness } from '@murmur/shared';

import {
  discoversSessionIdAfterTurn,
  hasAccountPool,
  usesTuiForMention,
} from '../src/adapters/index.js';

const RUNNABLE = RUNNABLE_HARNESSES as readonly AgentHarness[];

let savedFlag: string | undefined;
beforeEach(() => { savedFlag = process.env.MURMUR_HARNESS_ADAPTERS; });
afterEach(() => {
  // 플래그를 되돌린다 — 남기면 이 파일 뒤에 도는 테스트가 새 경로로 돈다.
  if (savedFlag === undefined) delete process.env.MURMUR_HARNESS_ADAPTERS;
  else process.env.MURMUR_HARNESS_ADAPTERS = savedFlag;
});

function facts(harness: AgentHarness, enabled: boolean) {
  if (enabled) process.env.MURMUR_HARNESS_ADAPTERS = '1';
  else delete process.env.MURMUR_HARNESS_ADAPTERS;
  return {
    usesTui: usesTuiForMention(harness),
    pooled: hasAccountPool(harness),
    discovers: discoversSessionIdAfterTurn(harness),
  };
}

describe('턴의 세 사실 — claude 는 같고 codex 는 TUI 로 올라간다', () => {
  it('claude-code: 세 답이 두 경로에서 같다 — 회귀가 없다', () => {
    expect(facts('claude-code', true)).toEqual(facts('claude-code', false));
  });

  it('codex: usesTui **만** 달라진다 — 올라간 것이 그 하나뿐이다', () => {
    const old = facts('codex', false);
    const now = facts('codex', true);
    // 실행 방식은 올라간다.
    expect(old.usesTui).toBe(false);
    expect(now.usesTui).toBe(true);
    // 나머지는 그대로다. 이 단언이 "함께 움직이면 안 되는 것"을 지킨다 — 계정 풀이
    // 열리거나 세션 발견이 꺼지면 codex 턴이 조용히 다른 하네스처럼 돈다.
    expect({ pooled: now.pooled, discovers: now.discovers })
      .toEqual({ pooled: old.pooled, discovers: old.discovers });
  });

  /**
   * 지금 프로덕션이 도는 모양. **새 경로 기준**이다(스위치를 켠 뒤의 값).
   *
   * codex 를 TUI 로 올린 것이 이 표의 `usesTui: true` 로 나타난다. 되돌릴 일이 생기면 이
   * 기대값의 diff 가 리뷰에 보인다.
   */
  const EXPECTED_NEW: Record<string, { usesTui: boolean; pooled: boolean; discovers: boolean }> = {
    'claude-code': { usesTui: true, pooled: true, discovers: false },
    codex: { usesTui: true, pooled: false, discovers: true },
  };

  for (const harness of RUNNABLE) {
    it(`${harness}: 새 경로의 답이 옳다`, () => {
      expect(facts(harness, true)).toEqual(EXPECTED_NEW[harness]);
    });
  }

  it('세 사실이 서로 독립이다 — 셋이 같은 값이면 이 테스트가 헐렁하다', () => {
    // 새 경로에서 claude 는 (true,true,false), codex 는 (true,false,true) 다. 실수로 한
    // 함수를 다른 함수로 부르면 값이 겹쳐 드러난다.
    const claude = facts('claude-code', true);
    const codex = facts('codex', true);
    expect(claude.pooled).not.toBe(codex.pooled);
    expect(claude.discovers).not.toBe(codex.discovers);
  });

  it('opencode 는 셋 다 표에서 나온다 — 새 경로에서만 뜻이 있는 값이다', () => {
    // RUNNABLE 이 아니라 러너가 그 턴을 만들지 않는다 — 갈려도 안전하다.
    expect(facts('opencode', false).discovers).toBe(false);
    expect(facts('opencode', true).discovers).toBe(true);
  });
});
