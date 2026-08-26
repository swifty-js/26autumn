// Mock backend APIs with artificial latency to demonstrate preload advantages

export interface StaffItem {
  id: number;
  name: string;
  role: string;
}

export interface AlgorithmItem {
  id: number;
  name: string;
  description: string;
}

export interface VectorDBItem {
  id: number;
  name: string;
  region: string;
}

const NETWORK_DELAY = 800; // ms, simulated network latency

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real network probe: produces a Resource Timing entry for perf monitoring.
// Mirrors the /member/checkAccess.json request monitored in boot.ts.
export function fetchPerfPing(): Promise<void> {
  return fetch("/perf-ping.json", { cache: "no-store" })
    .then(() => undefined)
    .catch(() => undefined); // 404 / offline both ignored; only the timing entry matters
}

export async function fetchStaff(): Promise<StaffItem[]> {
  await delay(NETWORK_DELAY + Math.random() * 200);
  return [
    { id: 1, name: "Alice Zhang", role: "ML Engineer" },
    { id: 2, name: "Bob Li", role: "Frontend Engineer" },
    { id: 3, name: "Carol Wang", role: "Product Manager" },
  ];
}

export async function fetchAlgorithm(): Promise<AlgorithmItem[]> {
  await delay(NETWORK_DELAY + Math.random() * 200);
  return [
    {
      id: 1,
      name: "Collaborative Filtering v2",
      description: "User-behavior-based collaborative filtering",
    },
    {
      id: 2,
      name: "Deep Retrieval",
      description: "Two-tower model deep retrieval",
    },
    {
      id: 3,
      name: "Vector Search",
      description: "ANN approximate nearest neighbor search",
    },
  ];
}

export async function fetchVectorDB(): Promise<VectorDBItem[]> {
  await delay(NETWORK_DELAY + Math.random() * 200);
  return [
    { id: 1, name: "Milvus Cluster A", region: "cn-hangzhou" },
    { id: 2, name: "Milvus Cluster B", region: "cn-shanghai" },
    { id: 3, name: "Qdrant Instance", region: "cn-beijing" },
  ];
}
