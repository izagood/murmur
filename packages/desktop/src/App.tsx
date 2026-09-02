import { useEffect, useState } from 'react';
import { ApiClient } from './lib/api';
import { connectWs } from './lib/ws';
import { createNotifier } from './lib/notify';
import { sessionStore, type StoredCommunity } from './lib/session';
import { Controller, getController, setController } from './state/controller';
import { ConnectScreen } from './screens/ConnectScreen';
import { Workspace } from './components/Workspace';
import { SettingsScreen } from './screens/SettingsScreen';
import type { SectionId } from './components/settings/sections';

async function startSession(
  community: StoredCommunity,
  onSessionLost: (message: string, accountId: string) => void,
): Promise<{ controller: Controller; accountId: string }> {
  const api = new ApiClient(community.baseUrl, community.token);
  const controller = new Controller(api, connectWs, createNotifier(), (message: string, accountId: string) => onSessionLost(message, accountId));
  setController(controller);
  await controller.start();
  return { controller, accountId: community.accountId };
}

export default function App() {
  const [phase, setPhase] = useState<'boot' | 'connect' | 'ready'>('boot');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ section?: SectionId } | null>(null);

  const handleSessionLost = (message: string, accountId: string) => {
    if (accountId === activeId) {
      setConnectError(message);
      setPhase('connect');
    }
  };

  useEffect(() => {
    void (async () => {
      const stored = await sessionStore.load();
      if (!stored || !stored.communities.length) {
        setPhase('connect');
        return;
      }

      const active = stored.active
        ? stored.communities.find((c) => c.accountId === stored.active) ?? stored.communities[0]
        : stored.communities[0];

      if (!active) {
        setPhase('connect');
        return;
      }

      try {
        const { accountId } = await startSession(active, handleSessionLost);
        setActiveId(accountId);
        setPhase('ready');
      } catch {
        await sessionStore.clear();
        setConnectError('Your saved session could not be resumed — it expired, or the server was unreachable. Please sign in again.');
        setPhase('connect');
      }
    })();
  }, []);

  if (phase === 'boot') return <div className="p-4 text-zinc-400">Connecting…</div>;
  if (phase === 'connect') {
    return (
      <ConnectScreen
        initialError={connectError}
        onConnected={async (baseUrl, token, accountId, handle) => {
          const stored = (await sessionStore.load()) ?? { active: null, communities: [] };
          const existing = stored.communities.findIndex((c) => c.accountId === accountId);
          if (existing >= 0) {
            stored.communities[existing] = { accountId, baseUrl, token, handle };
          } else {
            stored.communities.push({ accountId, baseUrl, token, handle });
          }
          stored.active = accountId;
          await sessionStore.save(stored);
          try {
            const { accountId: newActiveId } = await startSession(stored.communities.find((c) => c.accountId === accountId)!, handleSessionLost);
            setActiveId(newActiveId);
            setPhase('ready');
          } catch {
            await sessionStore.clear();
            setConnectError('Signed in, but starting the session failed. Please try again.');
            setPhase('connect');
          }
        }}
      />
    );
  }
  const signOut = () => {
    getController().logout();
    setSettings(null);
    setPhase('connect');
  };

  if (settings) {
    return (
      <SettingsScreen
        initialSection={settings.section}
        onBack={() => setSettings(null)}
        onSignOut={signOut}
      />
    );
  }
  return (
    <Workspace
      onLogout={() => setPhase('connect')}
      onOpenSettings={(section) => setSettings({ section })}
    />
  );
}