// 커뮤니티 목록이 **붙어 있는 서버의 버전**을 말한다(#693).
//
// 사람의 진단: *"서버가 잘 연결된 것은 보이는데 서버가 무슨 버전인지를 알 수 없어 …
// 재배포를 해야 되는지 아닌지 알 수가 없어."* 화면이 `Connected` 하나만 말하는 동안
// 배포는 조용히 낡는다 — 실제로 머지 10분 **전**에 빌드된 이미지가 34시간을 돌았다.
//
// **이 파일이 가장 신경 쓰는 것은 네 사정을 뭉개지 않는 것이다**(`docs/design.md` §4):
// ① 아직 못 받았다 ② 서버가 버전을 안 싣는 옛 판이다 ③ 앱과 같다 ④ 뒤처졌다.
// ①·② 를 같은 문구로 그리면 이 화면이 존재할 이유가 없어진다 — **②는 그 자체로
// "재배포하라"는 답**이기 때문이다.
import { describe, it, expect } from 'vitest';
import type { ServerVersion } from '@murmur/shared';
import { compareRelease, serverVersionLine } from '../src/lib/serverVersionLine';
import { translator } from '../src/i18n';

const ko = translator('ko');
/** '얼마나 전'은 화면의 일이라 주입된다 — 회귀선은 그것을 고정값으로 못 박는다. */
const ago = (): string => '3시간 전';

const server = (over: Partial<ServerVersion> = {}): ServerVersion => ({
  version: '0.1.174', commit: null, startedAt: '2026-09-10T09:00:00.000Z', ...over,
});

const line = (over: Partial<ServerVersion> | null, appVersion = '0.1.174') => serverVersionLine({
  server: over === null ? null : server(over), appVersion, ago, t: ko,
});

describe('compareRelease', () => {
  // **문자열 비교로 때우면 여기서 죽는다**: `'0.1.9' > '0.1.100'` 이 참이다. murmur 는
  // 이미 세 자리 patch 를 쓰므로(v0.1.174) 이것은 이론이 아니라 지금 일이다.
  it('세 자리 patch 를 숫자로 견준다', () => {
    expect(compareRelease('0.1.9', '0.1.100')).toBe(-1);
    expect(compareRelease('0.1.100', '0.1.9')).toBe(1);
    expect(compareRelease('0.1.174', '0.1.174')).toBe(0);
    expect(compareRelease('0.2.0', '0.1.999')).toBe(1);
  });
  // 견줄 수 없는 것을 `0`(같다)으로 눕히지 않는다 — 그러면 포크·자체 빌드가 전부
  // '최신'으로 보인다.
  it('X.Y.Z 가 아니면 null 이다', () => {
    expect(compareRelease('dev', '0.1.174')).toBeNull();
    expect(compareRelease('0.1.174', 'v0.1.174')).toBeNull();
  });
});

describe('serverVersionLine', () => {
  it('아직 못 받았으면 "확인 중"이지 "버전 없음"이 아니다', () => {
    const l = line(null);
    expect(l.testid).toBe('server-version-unknown');
    expect(l.text).toBe('서버 버전 확인 중');
    expect(l.tone).toBe('muted');
    // 못 받은 것에는 기동 시각도 커밋도 없다 — 지어내지 않는다.
    expect(l.started).toBeNull();
    expect(l.commit).toBeNull();
  });

  // 버전을 안 싣는 서버는 **그 사실이 곧 답이다.** 그래서 '모른다'와 다른 사정이고,
  // 유일하게 '아직 모르는 것'인데도 눈에 띄는 색을 받는다.
  it('버전을 안 싣는 옛 서버는 재배포하라고 말한다', () => {
    const l = line({ version: null });
    expect(l.testid).toBe('server-version-legacy');
    expect(l.tone).toBe('warning');
    expect(l.detail).toContain('재배포');
    // 옛 서버라도 기동 시각은 온다 — 그것만으로도 얼마나 낡았는지 짐작이 된다.
    expect(l.started).toBe('3시간 전');
  });

  it('앱과 같으면 숫자만 적고 색을 주지 않는다', () => {
    const l = line({});
    expect(l.testid).toBe('server-version-same');
    expect(l.text).toBe('서버 v0.1.174');
    expect(l.tone).toBe('muted');
    expect(l.detail).toBeNull();
  });

  // **이 줄이 이 기능의 이유다.** 뒤처졌을 때만 색이 붙고, 무엇과 견줬는지를 밝힌다 —
  // 숫자만 보여 주면 사람이 앱 버전을 따로 찾아야 한다.
  it('앱보다 뒤처지면 경고색과 함께 앱 버전을 밝힌다', () => {
    const l = line({ version: '0.1.120' }, '0.1.174');
    expect(l.testid).toBe('server-version-behind');
    expect(l.tone).toBe('warning');
    expect(l.text).toBe('서버 v0.1.120');
    expect(l.detail).toBe('이 앱(v0.1.174)보다 뒤처졌다 — 서버를 재배포해라.');
  });

  // 서버를 먼저 배포하는 것은 흔한 일이고 사람이 할 일이 없다 — 사실만 적는다.
  it('앞서면 사실만 적고 색을 주지 않는다', () => {
    const l = line({ version: '0.1.200' }, '0.1.174');
    expect(l.testid).toBe('server-version-ahead');
    expect(l.tone).toBe('muted');
    expect(l.detail).toBe('이 앱(v0.1.174)보다 앞선다.');
  });

  // 견줄 수 없는 모양(자체 빌드·포크)을 '같다'고도 '뒤처졌다'고도 말하지 않는다.
  it('견줄 수 없는 버전은 숫자만 적는다', () => {
    const l = line({ version: 'dev' }, '0.1.174');
    expect(l.text).toBe('서버 vdev');
    expect(l.tone).toBe('muted');
    expect(l.detail).toBeNull();
  });

  // 못 받은 기동 시각을 `Date.now()` 로 채우면 "방금 뜬 서버"라는 **거짓**이 된다.
  it('기동 시각이 없거나 깨졌으면 감춘다', () => {
    expect(line({ startedAt: '' }).started).toBeNull();
    expect(line({ startedAt: 'not-a-date' }).started).toBeNull();
  });

  it('빌드 커밋은 있으면 그대로 싣는다', () => {
    expect(line({ commit: 'bd06243' }).commit).toBe('bd06243');
    expect(line({ commit: null }).commit).toBeNull();
  });
});
