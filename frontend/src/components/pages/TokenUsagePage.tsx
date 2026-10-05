import React, { useState, useEffect } from 'react'
import { Card, Select, Space, Spin, Typography, Segmented } from 'antd'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { monitorAnalyticsApi } from '../../services/api'
import type { TimeSeriesResponse, GroupedTimeSeriesResponse } from '../../services/types'
import dayjs from 'dayjs'

const { Text, Title } = Typography

type Granularity = 'day' | 'month' | 'year'
type ViewMode = 'overview' | 'model' | 'provider'

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#84cc16',
  '#eab308', '#a855f7', '#22d3ee', '#fb923c', '#34d399',
]

const getColor = (index: number) => COLORS[index % COLORS.length]

const TokenUsagePage: React.FC = () => {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [timeSeries, setTimeSeries] = useState<TimeSeriesResponse | null>(null)
  const [groupedData, setGroupedData] = useState<GroupedTimeSeriesResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const getTimeRangeHours = (gran: Granularity): number => {
    switch (gran) {
      case 'day': return 24 * 30
      case 'month': return 24 * 365
      case 'year': return 24 * 365 * 3
      default: return 24 * 30
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const rangeHours = getTimeRangeHours(granularity)
        if (viewMode === 'overview') {
          const series = await monitorAnalyticsApi.getTimeSeries({
            granularity,
            time_range_hours: rangeHours,
          })
          setTimeSeries(series)
          setGroupedData(null)
        } else {
          const gb = viewMode === 'model' ? 'model' : 'provider'
          const grouped = await monitorAnalyticsApi.getGroupedTimeSeries({
            group_by: gb,
            granularity,
            time_range_hours: rangeHours,
          })
          setGroupedData(grouped)
          setTimeSeries(null)
        }
      } catch (error) {
        console.error('Failed to load token usage data:', error)
        setTimeSeries(null)
        setGroupedData(null)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [granularity, viewMode])

  const formatTimeLabel = (timestamp: string) => {
    const ts = dayjs(timestamp)
    switch (granularity) {
      case 'day': return ts.format('MM-DD')
      case 'month': return ts.format('YYYY-MM')
      case 'year': return ts.format('YYYY')
      default: return ts.format('MM-DD')
    }
  }

  const renderOverview = () => {
    if (!timeSeries) return null
    const data = (timeSeries.data || []).map((point) => ({
      time: formatTimeLabel(point.timestamp),
      total_tokens: point.total_tokens || 0,
      cache_hit: point.cache_read_input_tokens || 0,
      cache_miss: point.cache_creation_input_tokens || 0,
    }))

    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number, name: string) => [value.toLocaleString(), name]}
          />
          <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
          <Line type="monotone" dataKey="total_tokens" name="总 Tokens" stroke="#6366f1" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
          <Line type="monotone" dataKey="cache_hit" name="缓存命中" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
          <Line type="monotone" dataKey="cache_miss" name="缓存未命中" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  const renderGrouped = () => {
    if (!groupedData) return null

    const MAX_GROUPS = 8
    const groups = groupedData.data.reduce((acc, point) => {
      const name = point.group_name
      if (!acc[name]) acc[name] = []
      acc[name].push({
        time: formatTimeLabel(point.timestamp),
        tokens: point.total_tokens || 0,
      })
      return acc
    }, {} as Record<string, Array<{ time: string; tokens: number }>>)

    const totalTokens = (name: string) =>
      groups[name]?.reduce((s, p) => s + p.tokens, 0) ?? 0

    const names = Object.keys(groups)
      .sort((a, b) => totalTokens(b) - totalTokens(a))
      .slice(0, MAX_GROUPS)

    const overflowCount = Object.keys(groups).length - MAX_GROUPS

    const allTimes = new Set<string>()
    names.forEach((name) => groups[name]?.forEach((p) => allTimes.add(p.time)))
    const sortedTimes = Array.from(allTimes).sort()

    const mergedData = sortedTimes.map((time) => {
      const point: Record<string, any> = { time }
      names.forEach((name) => {
        const p = groups[name]?.find((d) => d.time === time)
        point[name] = p?.tokens || 0
      })
      return point
    })

    return (
      <div>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={mergedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
            />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
            {names.map((name, i) => (
              <Line key={name} type="monotone" dataKey={name} stroke={getColor(i)} strokeWidth={2} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {overflowCount > 0 && (
          <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block', textAlign: 'center' }}>
            仅显示 Top {MAX_GROUPS} 个，另有 {overflowCount} 个未显示
          </Text>
        )}
      </div>
    )
  }

  return (
    <div className="token-usage-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>用量分析</Title>
        <Space wrap>
          <Segmented<ViewMode>
            value={viewMode}
            onChange={setViewMode}
            options={[
              { label: '总览', value: 'overview' },
              { label: '模型', value: 'model' },
              { label: 'Provider', value: 'provider' },
            ]}
          />
          <Select
            value={granularity}
            onChange={setGranularity}
            options={[
              { label: '每天', value: 'day' },
              { label: '每月', value: 'month' },
              { label: '每年', value: 'year' },
            ]}
            style={{ width: 100 }}
          />
        </Space>
      </div>

      <Card className="token-usage-card">
        <Spin spinning={loading}>
          {viewMode === 'overview' ? (
            timeSeries && timeSeries.data.length > 0 ? renderOverview() : !loading && <div className="timeseries-empty"><p>暂无数据</p></div>
          ) : (
            groupedData && groupedData.data.length > 0 ? renderGrouped() : !loading && <div className="timeseries-empty"><p>暂无数据</p></div>
          )}
        </Spin>
      </Card>
    </div>
  )
}

export default TokenUsagePage
