/**
 * 全局事件定义。
 * 每个事件名映射到其载荷类型，保证事件分发类型安全。
 */
export interface GameEvents {
  /** 货币变化：金币、钻石 */
  currencyChanged: { gold: number; diamond: number }
  /** 玩家等级变化 */
  levelChanged: { level: number; exp: number }
  /** 作物种植成功 */
  cropPlanted: { tileIndex: number; cropId: number }
  /** 作物成熟 */
  cropMatured: { tileIndex: number; cropId: number }
  /** 作物收获 */
  cropHarvested: { tileIndex: number; cropId: number; amount: number }
  /** 仓库变化 */
  warehouseChanged: { items: ReadonlyMap<number, number> }
  /** 土地开垦 */
  tileTilled: { tileIndex: number }
  /** 存档已保存 */
  saved: { timestamp: number }
}

type EventName = keyof GameEvents
type EventPayload<K extends EventName> = GameEvents[K]
type Listener<K extends EventName> = (payload: EventPayload<K>) => void

/**
 * 类型安全事件总线。
 *
 * 系统间通过事件解耦通信：生产者 emit，消费者 on。
 * 采用 Map 存储监听器，支持单次监听与清理。
 */
export class EventBus {
  private static readonly listeners = new Map<EventName, Set<Listener<EventName>>>()

  private constructor() {}

  /** 订阅事件，返回取消订阅函数。 */
  static on<K extends EventName>(event: K, listener: Listener<K>): () => void {
    let set = EventBus.listeners.get(event)
    if (!set) {
      set = new Set()
      EventBus.listeners.set(event, set)
    }
    set.add(listener as Listener<EventName>)
    return () => EventBus.off(event, listener)
  }

  /** 订阅一次性事件，触发后自动取消。 */
  static once<K extends EventName>(event: K, listener: Listener<K>): () => void {
    const off = EventBus.on(event, (payload) => {
      off()
      listener(payload)
    })
    return off
  }

  /** 取消订阅。 */
  static off<K extends EventName>(event: K, listener: Listener<K>): void {
    EventBus.listeners.get(event)?.delete(listener as Listener<EventName>)
  }

  /** 触发事件，同步通知所有监听器。 */
  static emit<K extends EventName>(event: K, payload: EventPayload<K>): void {
    const set = EventBus.listeners.get(event)
    if (!set) return
    for (const listener of set) {
      listener(payload)
    }
  }

  /** 清空所有监听器（场景销毁时调用）。 */
  static clear(): void {
    EventBus.listeners.clear()
  }
}
