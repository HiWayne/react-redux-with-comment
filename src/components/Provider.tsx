import React, { Context, ReactNode, useMemo } from 'react'
import { ReactReduxContext, ReactReduxContextValue } from './Context'
import { createSubscription } from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import { Action, AnyAction, Store } from 'redux'

export interface ProviderProps<A extends Action = AnyAction, S = any> {
  /**
   * The single Redux store in your application.
   */
  store: Store<S, A>

  /**
   * An optional server state snapshot. Will be used during initial hydration render if available, to ensure that the UI output is consistent with the HTML generated on the server.
   */
  serverState?: S

  /**
   * Optional context to be used internally in react-redux. Use React.createContext() to create a context to be used.
   * If this is used, you'll need to customize `connect` by supplying the same context provided to the Provider.
   * Initial value doesn't matter, as it is overwritten with the internal state of Provider.
   */
  context?: Context<ReactReduxContextValue<S, A>>
  children: ReactNode
}

function Provider<A extends Action = AnyAction>({
  store,
  context,
  children,
  serverState,
}: ProviderProps<A>) {
  /* 将{
        store,
        subscription,
        getServerState
       }
      作为context provider的value透传下去
  */
  const contextValue = useMemo(() => {
    const subscription = createSubscription(store)
    return {
      store,
      subscription,
      getServerState: serverState ? () => serverState : undefined,
    }
  }, [store, serverState])

  // 获取store的state作为上一次state
  const previousState = useMemo(() => store.getState(), [store])

  // useIsomorphicLayoutEffect是一个facade，在server环境是useEffect，在浏览器环境是useLayoutEffect。
  // 首次mount或者store发生变化时触发：
  // subscription订阅
  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue
    subscription.onStateChange = subscription.notifyNestedSubs
    subscription.trySubscribe()

    // 如果store的state变了，则触发一次更新订阅
    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = undefined
    }
  }, [contextValue, previousState])

  const Context = context || ReactReduxContext

  // @ts-ignore 'AnyAction' is assignable to the constraint of type 'A', but 'A' could be instantiated with a different subtype
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

export default Provider
