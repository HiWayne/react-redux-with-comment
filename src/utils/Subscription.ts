import { getBatch } from './batch'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

type VoidFunc = () => void

type Listener = {
  callback: VoidFunc
  next: Listener | null
  prev: Listener | null
}

function createListenerCollection() {
  const batch = getBatch()
  // 对listener的收集，listener是一个双向链表
  let first: Listener | null = null
  let last: Listener | null = null

  return {
    clear() {
      first = null
      last = null
    },

    // 触发链表所有节点的回调
    notify() {
      batch(() => {
        let listener = first
        while (listener) {
          listener.callback()
          listener = listener.next
        }
      })
    },

    // 以数组的形式返回所有节点
    get() {
      let listeners: Listener[] = []
      let listener = first
      while (listener) {
        listeners.push(listener)
        listener = listener.next
      }
      return listeners
    },

    // 向链表末尾添加节点，并返回一个删除该节点的undo函数
    subscribe(callback: () => void) {
      let isSubscribed = true

      let listener: Listener = (last = {
        callback,
        next: null,
        prev: last,
      })

      if (listener.prev) {
        listener.prev.next = listener
      } else {
        first = listener
      }

      // unsubscribe就是个双向链表的删除指定节点操作
      return function unsubscribe() {
        // 阻止无意义执行
        if (!isSubscribed || first === null) return
        isSubscribed = false

        // 如果添加的这个节点已经有了后续节点
        if (listener.next) {
          // next的prev应该为该节点的prev
          listener.next.prev = listener.prev
        } else {
          // 没有则说明该节点是最后一个，将prev节点作为last节点
          last = listener.prev
        }
        // 如果有前节点prev
        if (listener.prev) {
          // prev的next应该为该节点的next
          listener.prev.next = listener.next
        } else {
          // 否则说明该节点是第一个，把它的next给first
          first = listener.next
        }
      }
    },
  }
}

type ListenerCollection = ReturnType<typeof createListenerCollection>

export interface Subscription {
  addNestedSub: (listener: VoidFunc) => VoidFunc
  notifyNestedSubs: VoidFunc
  handleChangeWrapper: VoidFunc
  isSubscribed: () => boolean
  onStateChange?: VoidFunc | null
  trySubscribe: VoidFunc
  tryUnsubscribe: VoidFunc
  getListeners: () => ListenerCollection
}

const nullListeners = ({
  notify() {},
  get: () => [],
} as unknown) as ListenerCollection

export function createSubscription(store: any, parentSub?: Subscription) {
  // 自己是否被订阅的标志
  let unsubscribe: VoidFunc | undefined
  // 负责收集订阅的收集器
  let listeners: ListenerCollection = nullListeners

  // 收集订阅
  function addNestedSub(listener: () => void) {
    // 只会执行一次
    // 如果有parentSub，即父级的监听实例，那么会把本实例中的 触发订阅方法 订阅给父实例。父实例如果没有向它的父示例注册过，也会同样如此递归下去
    // 如果没有parentSub，说明是根实例，则把 触发订阅方法 注册给redux subscribe，将来redux state更新后会被调用
    trySubscribe()
    return listeners.subscribe(listener)
  }

  // 通知订阅。遍历调用 listeners 中的回调，即触发所有嵌套的子订阅
  function notifyNestedSubs() {
    listeners.notify()
  }

  // 自己的订阅回调。最外层的触发订阅方法，实际上是调用notifyNestedSubs或checkForUpdates
  function handleChangeWrapper() {
    if (subscription.onStateChange) {
      subscription.onStateChange()
    }
  }

  // 判断自己是否被订阅
  function isSubscribed() {
    return Boolean(unsubscribe)
  }

  // 让自己被父级订阅
  function trySubscribe() {
    if (!unsubscribe) {
      // 如果有父级的监听实例，那么会把本实例的 触发订阅方法 交给父实例
      // 如果没有，则把 触发订阅方法 注册给redux subscribe，将来redux state更新后会被调用
      // 返回一个undo，放在this.unsubscribe里
      unsubscribe = parentSub
        ? parentSub.addNestedSub(handleChangeWrapper)
        : store.subscribe(handleChangeWrapper)

      // 初始化一个listener收集器
      listeners = createListenerCollection()
    }
  }

  // 从父级注销自己的订阅
  function tryUnsubscribe() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = undefined
      listeners.clear()
      listeners = nullListeners
    }
  }

  const subscription: Subscription = {
    addNestedSub,
    notifyNestedSubs,
    handleChangeWrapper,
    isSubscribed,
    trySubscribe,
    tryUnsubscribe,
    getListeners: () => listeners,
  }

  return subscription
}
