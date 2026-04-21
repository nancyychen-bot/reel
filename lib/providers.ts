export const STREAMING_PROVIDERS = [
  { id: 8,    name: "Netflix",    color: "#E50914" },
  { id: 9,    name: "Prime",      color: "#00A8E1" },
  { id: 337,  name: "Disney+",    color: "#113CCF" },
  { id: 2,    name: "Apple TV+",  color: "#A2AAAD" },
  { id: 1899, name: "Max",        color: "#002BE7" },
  { id: 15,   name: "Hulu",       color: "#1CE783" },
  { id: 386,  name: "Peacock",    color: "#F5A623" },
  { id: 531,  name: "Paramount+", color: "#0064FF" },
] as const;

export type ProviderId = typeof STREAMING_PROVIDERS[number]["id"];

export const PROVIDER_IDS = new Set(STREAMING_PROVIDERS.map(p => p.id));

export function providerById(id: number) {
  return STREAMING_PROVIDERS.find(p => p.id === id);
}
