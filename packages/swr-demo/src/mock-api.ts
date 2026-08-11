// 模拟后端接口，带有人为延迟以体现预加载优势

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

const NETWORK_DELAY = 800; // ms，模拟网络延迟

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 真实网络探测请求：产生一条 Resource Timing 条目，供性能监控采集
// 对应 boot.ts 中被单独监测耗时的 /member/checkAccess.json 请求
export function fetchPerfPing(): Promise<void> {
  return fetch("/perf-ping.json", { cache: "no-store" })
    .then(() => undefined)
    .catch(() => undefined); // 404 / 离线均忽略，只关心 timing 条目
}

export async function fetchStaff(): Promise<StaffItem[]> {
  await delay(NETWORK_DELAY + Math.random() * 200);
  return [
    { id: 1, name: "张三", role: "算法工程师" },
    { id: 2, name: "李四", role: "前端工程师" },
    { id: 3, name: "王五", role: "产品经理" },
  ];
}

export async function fetchAlgorithm(): Promise<AlgorithmItem[]> {
  await delay(NETWORK_DELAY + Math.random() * 200);
  return [
    { id: 1, name: "协同过滤 v2", description: "基于用户行为的协同过滤推荐" },
    { id: 2, name: "深度召回", description: "双塔模型深度召回" },
    { id: 3, name: "向量检索", description: "ANN 近似最近邻检索" },
  ];
}

export async function fetchVectorDB(): Promise<VectorDBItem[]> {
  await delay(NETWORK_DELAY + Math.random() * 200);
  return [
    { id: 1, name: "Milvus 集群 A", region: "cn-hangzhou" },
    { id: 2, name: "Milvus 集群 B", region: "cn-shanghai" },
    { id: 3, name: "Qdrant 实例", region: "cn-beijing" },
  ];
}
