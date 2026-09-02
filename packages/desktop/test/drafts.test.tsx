import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useAppStore } from '../src/state/appStore';
import { Composer } from '../src/components/Composer';
import { Controller, setController } from '../src/state/controller';
import { acc, fakeApi } from './helpers/fakeApi';
import { draftsStorage } from '../src/lib/prefs';

const typeInto = (value: string) => {
  const box = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value, selectionStart: value.length } });
  return box;
};

beforeEach(() => {
  localStorage.clear();
  useAppStore.getState().reset();
  useAppStore.getState().set({
    me: acc('u1', 'me'),
    accounts: {
      u1: acc('u1', 'me'),
      a1: acc('a1', 'fizz', 'agent'),
      a2: acc('a2', 'fixit', 'agent'),
      u2: acc('u2', 'rusalka'),
    },
  });
  const c = new Controller(fakeApi());
  setController(c);
});
afterEach(() => {
  cleanup();
  setController(null as unknown as Controller);
});

describe('초안 보관', () => {
  it('채널 A 에 쓰고 B 로 옮기면 입력창이 비어 있다', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    
    typeInto('hello world');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello world');
    
    const current = draftsStorage.load();
    expect(current['channel-A']).toBe('hello world');
    
    cleanup();
    render(<Composer onSend={onSend} scopeKey="channel-B" />);
    
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });

  it('B 에서 A 로 돌아오면 A 의 초안이 그대로다', async () => {
    const onSend = vi.fn();
    
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    typeInto('hello from A');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello from A');
    
    cleanup();
    render(<Composer onSend={onSend} scopeKey="channel-B" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    
    cleanup();
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello from A');
  });

  it('A 초안과 스레드 초안이 서로 섞이지 않는다', async () => {
    const onSend = vi.fn();
    
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    typeInto('channel A draft');
    
    cleanup();
    render(<Composer onSend={onSend} scopeKey="thread:123" />);
    typeInto('thread draft');
    
    cleanup();
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('channel A draft');
    
    cleanup();
    render(<Composer onSend={onSend} scopeKey="thread:123" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('thread draft');
  });

  it('전송 성공 후 그 스코프의 초안이 사라진다', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    
    typeInto('hello world');
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    
    const current = draftsStorage.load();
    expect(current['channel-A']).toBeUndefined();
  });

  it('전송 실패 시 사용자가 친 본문이 남는다', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('fail'));
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    
    typeInto('hello world');
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    
    await waitFor(() => {
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello world');
    });
  });

  it('앱 재시작(보관소에서 복원)에도 초안이 남는다', async () => {
    const onSend = vi.fn();
    
    localStorage.setItem('murmur.drafts', JSON.stringify({ 'channel-A': 'persisted draft' }));
    
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('persisted draft');
  });

  it('로그아웃하면 보관된 초안이 전부 사라진다', async () => {
    const onSend = vi.fn();
    
    localStorage.setItem('murmur.drafts', JSON.stringify({ 
      'channel-A': 'draft A',
      'channel-B': 'draft B',
      'thread:123': 'thread draft'
    }));
    
    draftsStorage.clear();
    
    const current = draftsStorage.load();
    expect(Object.keys(current)).toHaveLength(0);
  });

  it('채널을 바꾸면 멘션 자동완성 목록이 닫힌다', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    
    typeInto('@fi');
    expect(screen.queryAllByRole('option')).toHaveLength(2);
    
    cleanup();
    render(<Composer onSend={onSend} scopeKey="channel-B" />);
    
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('초안을 비우면 보관소에 빈 값이 남지 않는다', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} scopeKey="channel-A" />);
    
    typeInto('some text');
    expect(draftsStorage.load()['channel-A']).toBe('some text');
    
    typeInto('');
    
    const current = draftsStorage.load();
    expect(current['channel-A']).toBeUndefined();
  });
});