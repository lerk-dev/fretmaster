'use client'

import React, { useCallback, useMemo } from 'react'
import { FixedSizeList as List, ListChildComponentProps } from 'react-window'
import { cn } from '@/lib/utils'

// 虚拟列表项数据接口
export interface VirtualListItem {
  id: string
  [key: string]: unknown
}

// 虚拟列表组件属性
interface VirtualListProps<T extends VirtualListItem> {
  items: T[]
  itemHeight: number
  height: number
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode
  className?: string
  overscanCount?: number
  onItemsRendered?: (props: {
    overscanStartIndex: number
    overscanStopIndex: number
    visibleStartIndex: number
    visibleStopIndex: number
  }) => void
}

// 通用虚拟列表组件
export function VirtualList<T extends VirtualListItem>({
  items,
  itemHeight,
  height,
  renderItem,
  className,
  overscanCount = 5,
  onItemsRendered,
}: VirtualListProps<T>) {
  // 列表项渲染器
  const ItemRenderer = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const item = items[index]
      if (!item) return null
      return renderItem(item, index, style)
    },
    [items, renderItem]
  )

  // 如果没有数据，显示空状态
  if (items.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full text-muted-foreground', className)}>
        暂无数据
      </div>
    )
  }

  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      overscanCount={overscanCount}
      onItemsRendered={onItemsRendered}
      className={className}
    >
      {ItemRenderer}
    </List>
  )
}

// 分组虚拟列表组件属性
interface GroupedVirtualListProps<T extends VirtualListItem> {
  groups: { group: string; items: T[] }[]
  groupHeaderHeight: number
  itemHeight: number
  height: number
  renderGroupHeader: (group: string, index: number, style: React.CSSProperties) => React.ReactNode
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode
  className?: string
  overscanCount?: number
}

// 扁平化分组数据
interface FlattenedItem<T> {
  type: 'header' | 'item'
  group?: string
  item?: T
  groupIndex?: number
  itemIndex?: number
}

// 分组虚拟列表组件
export function GroupedVirtualList<T extends VirtualListItem>({
  groups,
  groupHeaderHeight,
  itemHeight,
  height,
  renderGroupHeader,
  renderItem,
  className,
  overscanCount = 5,
}: GroupedVirtualListProps<T>) {
  // 扁平化数据
  const flattenedItems = useMemo(() => {
    const result: FlattenedItem<T>[] = []
    groups.forEach((group, groupIndex) => {
      // 添加分组标题
      result.push({
        type: 'header',
        group: group.group,
        groupIndex,
      })
      // 添加分组内的项目
      group.items.forEach((item, itemIndex) => {
        result.push({
          type: 'item',
          item,
          groupIndex,
          itemIndex,
        })
      })
    })
    return result
  }, [groups])

  // 获取项目高度
  const getItemSize = useCallback(
    (index: number) => {
      const item = flattenedItems[index]
      return item?.type === 'header' ? groupHeaderHeight : itemHeight
    },
    [flattenedItems, groupHeaderHeight, itemHeight]
  )

  // 列表项渲染器
  const ItemRenderer = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const flattenedItem = flattenedItems[index]
      if (!flattenedItem) return null

      if (flattenedItem.type === 'header') {
        return renderGroupHeader(flattenedItem.group || '', index, style)
      }

      return flattenedItem.item ? renderItem(flattenedItem.item, index, style) : null
    },
    [flattenedItems, renderGroupHeader, renderItem]
  )

  // 如果没有数据，显示空状态
  if (groups.length === 0 || flattenedItems.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full text-muted-foreground', className)}>
        暂无数据
      </div>
    )
  }

  return (
    <List
      height={height}
      itemCount={flattenedItems.length}
      itemSize={getItemSize}
      overscanCount={overscanCount}
      className={className}
    >
      {ItemRenderer}
    </List>
  )
}

export default VirtualList
