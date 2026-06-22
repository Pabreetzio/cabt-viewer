export type AgentOption = {
  id: string;
  name: string;
  description?: string;
  path?: string;
  deckUrl?: string;
};

export type GameLogEntry = {
  id: string;
  name: string;
  file: string;
  source?: 'static' | 'local-engine';
  createdAt?: string;
  players?: string[];
  description?: string;
};

const FALLBACK_AGENT: AgentOption = {
  id: 'first-legal',
  name: 'First legal option',
  description: 'Uses the first legal CABT selection whenever the local engine controls the opponent.',
};

export async function loadAgentOptions(): Promise<AgentOption[]> {
  const agents = await loadJsonList<AgentOption>('/agents/agents.json', 'agents');
  const localAgents = await loadLocalEngineAgents();
  const merged = [
    ...agents,
    ...localAgents,
  ];
  return merged.length ? merged : [FALLBACK_AGENT];
}

export async function loadGameLogs(): Promise<GameLogEntry[]> {
  const staticLogs = await loadJsonList<GameLogEntry>('/game-logs/logs.json', 'logs');
  const localLogs = await loadLocalEngineLogs();
  return [
    ...localLogs,
    ...staticLogs.map((log) => ({ ...log, source: log.source ?? 'static' as const })),
  ];
}

async function loadLocalEngineLogs(): Promise<GameLogEntry[]> {
  try {
    const response = await fetch('/local-engine/replays');
    if (!response.ok) {
      return [];
    }
    const json = await response.json();
    if (!json?.ok) {
      throw new Error(json?.error ?? 'Unable to load local replay folder.');
    }
    if (!Array.isArray(json.replays)) {
      return [];
    }
    return json.replays
      .filter((item: unknown): item is GameLogEntry =>
        !!item
        && typeof item === 'object'
        && typeof (item as GameLogEntry).id === 'string'
        && typeof (item as GameLogEntry).file === 'string')
      .map((log: GameLogEntry) => ({ ...log, source: 'local-engine' }));
  } catch {
    return [];
  }
}

async function loadLocalEngineAgents(): Promise<AgentOption[]> {
  try {
    const response = await fetch('/local-engine/agents');
    if (!response.ok) {
      return [];
    }
    const json = await response.json();
    if (!json?.ok) {
      throw new Error(json?.error ?? 'Unable to load local agents.');
    }
    if (!Array.isArray(json.agents)) {
      return [];
    }
    return json.agents.filter((item: unknown): item is AgentOption =>
      !!item
      && typeof item === 'object'
      && typeof (item as AgentOption).id === 'string'
      && typeof (item as AgentOption).name === 'string');
  } catch {
    return [];
  }
}

async function loadJsonList<T extends { id?: unknown }>(url: string, key: string): Promise<T[]> {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`${url}: ${response.status}`);
  }

  const json = await response.json();
  const list = Array.isArray(json) ? json : json?.[key];
  if (!Array.isArray(list)) {
    throw new Error(`${url}: expected an array or { "${key}": [...] }`);
  }
  return list.filter((item): item is T => !!item && typeof item === 'object' && typeof item.id === 'string');
}
