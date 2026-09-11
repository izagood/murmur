// **이 테스트는 옛 경로를 잰다** — 스위치를 그 범위에서 끈다(2026-09-11).
//
// ## 왜 필요한가
//
// 이설이 끝나기 전까지 두 경로가 함께 산다. 그리고 CI 는 에이전트 스위트를 **양쪽에서**
// 돈다(`ci.yml` 의 `MURMUR_HARNESS_ADAPTERS=1` 단계) — 새 경로가 조용히 썩지 않게 하려는
// 장치다. 그런데 codex 의 실행 방식은 두 경로에서 **의도적으로 다르다**(옛 경로 `exec`,
// 새 경로 TUI). 그래서 "옛 동작"을 못 박은 테스트는 스위치가 켜진 런에서 반드시 빨개진다.
//
// 감추는 방법은 두 가지였는데 하나만 옳다:
// - ❌ 그 파일 전체에서 스위치를 끈다 → `mentionTurn.test.ts`(200여 개)가 새 경로에서
//   아예 안 돌게 되고, CI 가드가 지키려던 것이 사라진다.
// - ✅ **그 테스트들만** 끈다 → 나머지는 주위 환경을 그대로 따라 양쪽에서 돈다.
//
// ## 지울 시점
//
// 스위치가 기본 켜짐이 되고 옛 분기를 걷을 때, 이 헬퍼를 부르는 `describe` 들은 새 동작을
// 단언하도록 고쳐지고 이 파일은 사라진다. 남아 있는 동안은 **"여기는 옛 경로"** 라는
// 표시로 읽어라.
import { afterEach, beforeEach } from 'vitest';

/** 감싸는 `describe` 범위에서만 스위치를 끈다. 원래 값은 복구한다. */
export function pinOldPath(): void {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.MURMUR_HARNESS_ADAPTERS;
    delete process.env.MURMUR_HARNESS_ADAPTERS;
  });
  afterEach(() => {
    // 복구하지 않으면 이 describe 뒤에 도는 테스트가 옛 경로로 돈다 — 스위치가 켜진
    // 런에서 그것은 **가드가 통째로 무력해지는** 것이다.
    if (saved === undefined) delete process.env.MURMUR_HARNESS_ADAPTERS;
    else process.env.MURMUR_HARNESS_ADAPTERS = saved;
  });
}
