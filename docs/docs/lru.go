// Package lru 实现 lru 内存缓存, 支持指定 entry 的 evictTime
//
// 淘汰策略有两层:
// 1. 容量淘汰: 缓存条目数超过 capacity 时, 淘汰最久未使用 (least recently used) 的 entry
// 2. 时间淘汰: 每个 entry 可以单独指定 evictTime (过期的绝对时间),
// 到期的 entry 在读取时惰性删除
//
// 数据结构: 哈希表 + 双向链表
// - 哈希表提供 O(1) 的 key 定位
// - 双向链表维护访问顺序, 头部是最近使用, 尾部是最久未使用,
// 命中时把节点移到头部, 容量超限时从尾部淘汰
package lru

import (
	"sync"
	"time"
)

type entry[K comparable, V any] struct {
	key   K
	value V
	// 过期的绝对时间, 零值表示永不过期
	evictTime  time.Time
	prev, next *entry[K, V]
}

// Cache 是并发安全的 lru 缓存
type Cache[K comparable, V any] struct {
	mu       sync.Mutex
	capacity int
	items    map[K]*entry[K, V]
	// 哨兵节点, 避免插入/删除时处理 nil 边界
	head, tail *entry[K, V]
}

func New[K comparable, V any](capacity int) *Cache[K, V] {
	if capacity <= 0 {
		panic("lru: capacity must be positive")
	}
	head := &entry[K, V]{}
	tail := &entry[K, V]{}
	head.next = tail
	tail.prev = head
	return &Cache[K, V]{
		capacity: capacity,
		items:    make(map[K]*entry[K, V]),
		head:     head,
		tail:     tail,
	}
}

// Get 读取 key, 命中时把 entry 移到链表头部;
// 如果 entry 已到 evictTime, 惰性删除并视为未命中
func (c *Cache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.items[key]
	if !ok {
		var zero V
		return zero, false
	}
	if c.isExpired(e) {
		c.removeEntry(e)
		delete(c.items, key)
		var zero V
		return zero, false
	}
	c.moveToHead(e)
	return e.value, true
}

// Set 写入 key, evictTime 是该 entry 过期的绝对时间,
// 传入零值 time.Time{} 表示永不过期
func (c *Cache[K, V]) Set(key K, value V, evictTime time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if e, ok := c.items[key]; ok {
		// 已存在: 原地更新值和过期时间, 并移到头部
		e.value = value
		e.evictTime = evictTime
		c.moveToHead(e)
		return
	}
	e := &entry[K, V]{key: key, value: value, evictTime: evictTime}
	c.items[key] = e
	c.addToHead(e)
	// 容量超限: 淘汰尾部 (最久未使用) 的 entry
	if len(c.items) > c.capacity {
		lru := c.tail.prev
		c.removeEntry(lru)
		delete(c.items, lru.key)
	}
}

// SetWithTTL 是 Set 的便捷封装, 用相对时长指定过期时间
func (c *Cache[K, V]) SetWithTTL(key K, value V, ttl time.Duration) {
	c.Set(key, value, time.Now().Add(ttl))
}

// Delete 删除 key, 返回是否存在
func (c *Cache[K, V]) Delete(key K) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.items[key]
	if !ok {
		return false
	}
	c.removeEntry(e)
	delete(c.items, key)
	return true
}

// Len 返回当前缓存条目数
func (c *Cache[K, V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items)
}

func (c *Cache[K, V]) isExpired(e *entry[K, V]) bool {
	return !e.evictTime.IsZero() && time.Now().After(e.evictTime)
}

func (c *Cache[K, V]) addToHead(e *entry[K, V]) {
	e.prev = c.head
	e.next = c.head.next
	c.head.next.prev = e
	c.head.next = e
}

func (c *Cache[K, V]) removeEntry(e *entry[K, V]) {
	e.prev.next = e.next
	e.next.prev = e.prev
	e.prev = nil
	e.next = nil
}

func (c *Cache[K, V]) moveToHead(e *entry[K, V]) {
	c.removeEntry(e)
	c.addToHead(e)
}
