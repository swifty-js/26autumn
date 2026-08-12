// lru 内存缓存, 支持指定 entry 的 evictTime
//
// 淘汰策略有两层:
// 1. 容量淘汰: 缓存条目数超过 capacity 时, 淘汰最久未使用 (least recently used) 的 entry
// 2. 时间淘汰: 每个 entry 可以单独指定 evictTime (过期的绝对时间戳),
//    到期的 entry 在读取时惰性删除
//
// 数据结构: 哈希表 + 双向链表
// - 哈希表 (Map) 提供 O(1) 的 key 定位
// - 双向链表维护访问顺序, 头部是最近使用, 尾部是最久未使用,
//   命中时把节点移到头部, 容量超限时从尾部淘汰

class Node<K, V> {
  key: K;
  value: V;
  // 过期的绝对时间戳 (ms), Infinity 表示永不过期
  evictTime: number;
  prev: Node<K, V> | null = null;
  next: Node<K, V> | null = null;

  constructor(key: K, value: V, evictTime: number) {
    this.key = key;
    this.value = value;
    this.evictTime = evictTime;
  }
}

export class LruCache<K, V> {
  private readonly capacity: number;
  private readonly map = new Map<K, Node<K, V>>();
  // 哨兵节点, 避免插入/删除时处理 null 边界
  private readonly head: Node<K, V>;
  private readonly tail: Node<K, V>;

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error("capacity must be positive");
    this.capacity = capacity;
    this.head = new Node<K, V>(null as K, null as V, Infinity);
    this.tail = new Node<K, V>(null as K, null as V, Infinity);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    // 惰性过期: 读取时发现已到期, 直接删除, 视为未命中
    if (this.isExpired(node)) {
      this.removeNode(node);
      this.map.delete(key);
      return undefined;
    }
    this.moveToHead(node);
    return node.value;
  }

  // evictTime 是该 entry 过期的绝对时间戳 (ms), 缺省为永不过期
  set(key: K, value: V, evictTime: number = Infinity): void {
    const node = this.map.get(key);
    if (node) {
      // 已存在: 原地更新值和过期时间, 并移到头部
      node.value = value;
      node.evictTime = evictTime;
      this.moveToHead(node);
      return;
    }
    const fresh = new Node(key, value, evictTime);
    this.map.set(key, fresh);
    this.addToHead(fresh);
    // 容量超限: 淘汰尾部 (最久未使用) 的 entry
    if (this.map.size > this.capacity) {
      const lru = this.tail.prev as Node<K, V>;
      this.removeNode(lru);
      this.map.delete(lru.key);
    }
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.map.delete(key);
    return true;
  }

  get size(): number {
    return this.map.size;
  }

  private isExpired(node: Node<K, V>): boolean {
    return Date.now() >= node.evictTime;
  }

  private addToHead(node: Node<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    (this.head.next as Node<K, V>).prev = node;
    this.head.next = node;
  }

  private removeNode(node: Node<K, V>): void {
    (node.prev as Node<K, V>).next = node.next;
    (node.next as Node<K, V>).prev = node.prev;
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: Node<K, V>): void {
    this.removeNode(node);
    this.addToHead(node);
  }
}

// 备注: JS 的 Map 本身按插入顺序迭代, 也可以用 "delete + 重新 set" 把 key
// 挪到最新位置, 用 Map 迭代器的第一个 key 做淘汰, 实现更短的 LRU;
// 但双向链表版本是面试中的标准答案, 且淘汰逻辑与语言 Map 实现解耦
