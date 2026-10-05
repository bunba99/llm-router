import React, { useState, useEffect } from 'react'
import { Row, Col, Card, DatePicker, Space, Button, Select, Typography, Divider, Skeleton, Table, Tag } from 'antd'
import { ReloadOutlined, DollarOutlined, ThunderboltOutlined, InteractionOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import { statisticsApi, monitorAnalyticsApi } from '../services/api'
import InvocationList from './InvocationList'
import TimeSeriesChart from './TimeSeriesChart'
import type { StatisticsResponse, TimeSeriesResponse, ModelStatistics } from '../services/types'

const { RangePicker } = DatePicker
const { Title, Text } = Typography

interface ActivityDashboardProps {
  onTimeRangeChange?: (hours: number) => void
}

const ActivityDashboard: React.FC<ActivityDashboardProps> = ({ onTimeRangeChange }) => {
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null)
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesResponse | null>(null)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'month'),
    dayjs(),
  ])
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState<number>(24 * 30)
  const [selectedPreset, setSelectedPreset] = useState<number>(24 * 30)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [stats, timeSeries] = await Promise.all([
        statisticsApi.getStatistics(timeRange, 10),
        monitorAnalyticsApi.getTimeSeries({ granularity: 'day', time_range_hours: timeRange }),
      ])
      setStatistics(stats)
      setTimeSeriesData(timeSeries)
      setLastRefreshed(new Date())
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    onTimeRangeChange?.(timeRange)
  }, [timeRange])

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]])
      const hours = dates[1].diff(dates[0], 'hour')
      setTimeRange(hours)
      const presets = [24, 24 * 7, 24 * 30]
      const matched = presets.find(p => Math.abs(hours - p) / p < 0.02)
      setSelectedPreset(matched || 0)
    }
  }

  const hasStatsLoaded = statistics !== null
  const hasAnyData = hasStatsLoaded && statistics.overall.total_calls > 0

  const formatStatValue = (key: 'cost' | 'tokens' | 'calls'): { value: string; isPlaceholder: boolean } => {
    if (!hasStatsLoaded) return { value: '—', isPlaceholder: true }
    if (!hasAnyData) {
      if (key === 'cost') return { value: '$0.0000', isPlaceholder: true }
      return { value: '0', isPlaceholder: true }
    }
    if (key === 'cost') return { value: '$' + (statistics!.overall.total_cost?.toFixed(4) || '0.0000'), isPlaceholder: false }
    if (key === 'tokens') return { value: statistics!.overall.total_tokens?.toLocaleString() || '0', isPlaceholder: false }
    return { value: statistics!.overall.total_calls?.toLocaleString() || '0', isPlaceholder: false }
  }

  const days = Math.max(1, timeRange / 24)
  const avgDaySpend = statistics?.overall.total_cost
    ? (statistics.overall.total_cost / days).toFixed(4)
    : '0.0000'
  const avgDayTokens = statistics?.overall.total_tokens
    ? Math.round(statistics.overall.total_tokens / days).toLocaleString()
    : '0'
  const avgDayRequests = statistics?.overall.total_calls
    ? (statistics.overall.total_calls / days).toFixed(2)
    : '0.00'

  const prepareChartData = (type: 'spend' | 'tokens' | 'requests') => {
    if (!timeSeriesData || !timeSeriesData.data) return []
    const recentData = timeSeriesData.data.slice(-30)
    return recentData.map((point, index) => ({
      index,
      value: type === 'spend'
        ? (point.total_cost || 0)
        : type === 'tokens'
          ? (point.total_tokens || 0)
          : (point.total_calls || 0),
    }))
  }

  const MiniBarChart: React.FC<{ data: Array<{ index: number; value: number }>; color: string }> = ({ data, color }) => {
    if (!data || data.length === 0) return <div className="activity-mini-chart-empty" />
    return (
      <ResponsiveContainer width="100%" height={40}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fillOpacity={0.6 + (index / data.length) * 0.4} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  const statValueStyle = (key: 'cost' | 'tokens' | 'calls'): React.CSSProperties | undefined => {
    const { isPlaceholder } = formatStatValue(key)
    if (isPlaceholder && hasStatsLoaded && !hasAnyData) {
      return { color: 'var(--monitor-text-muted)', fontStyle: 'italic' }
    }
    return undefined
  }

  const renderStatCard = (
    key: 'cost' | 'tokens' | 'calls',
    label: string,
    icon: React.ReactNode,
    iconClass: string,
    chartType: 'spend' | 'tokens' | 'requests',
    chartColor: string,
    avgLabel: string,
    avgValue: string,
  ) => (
    <Card bordered={false} className="stat-card activity-stat-card">
      {loading && !hasStatsLoaded ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <div className="activity-stat-head">
            <Text type="secondary" strong>{label}</Text>
            <span className={iconClass}>{icon}</span>
          </div>
          <Title level={2} className="activity-stat-value" style={statValueStyle(key)}>
            {formatStatValue(key).value}
          </Title>
          <div className="activity-stat-chart">
            <MiniBarChart data={prepareChartData(chartType)} color={chartColor} />
          </div>
          <Divider className="activity-stat-divider" />
          <div className="activity-stat-foot">
            <Text type="secondary">{avgLabel}</Text>
            <Text strong>{avgValue}</Text>
          </div>
        </>
      )}
    </Card>
  )

  return (
    <div className="activity-dashboard">
      <div className="activity-dashboard-header">
        <Title level={4} className="activity-dashboard-title">活动概览</Title>
        <Space className="activity-dashboard-controls" wrap>
          <RangePicker
            showTime
            value={dateRange}
            onChange={handleDateRangeChange}
            format="YYYY/MM/DD HH:mm"
            size="small"
            className="activity-range-picker"
          />
          <Select<number>
            value={selectedPreset || undefined}
            size="small"
            className="activity-range-select"
            options={[
              { label: '30天', value: 24 * 30 },
              { label: '7天', value: 24 * 7 },
              { label: '24小时', value: 24 },
            ]}
            onChange={(value) => {
              if (typeof value === 'number') {
                setSelectedPreset(value)
                setTimeRange(value)
                if (value === 24 * 30) setDateRange([dayjs().subtract(1, 'month'), dayjs()])
                else if (value === 24 * 7) setDateRange([dayjs().subtract(7, 'day'), dayjs()])
                else setDateRange([dayjs().subtract(1, 'day'), dayjs()])
              }
            }}
          />
          <Space size={4}>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} size="small" shape="circle" />
            {lastRefreshed && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                更新于 {dayjs(lastRefreshed).format('HH:mm:ss')}
              </Text>
            )}
          </Space>
        </Space>
      </div>

      {hasStatsLoaded && !hasAnyData && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12, fontStyle: 'italic' }}>
          所选时间段内无活动数据 — 尝试调整时间范围或进行一些模型调用以生成数据
        </Text>
      )}

      {/* 顶部摘要卡片 */}
      <Row gutter={[16, 16]} className="activity-summary-row">
        <Col xs={24} sm={8}>
          {renderStatCard('cost', '总花费 (USD)', <DollarOutlined />, 'activity-stat-icon activity-stat-icon-spend', 'spend', '#14b8a6', '日均花费', `$${avgDaySpend}`)}
        </Col>
        <Col xs={24} sm={8}>
          {renderStatCard('tokens', '总令牌数 (Tokens)', <ThunderboltOutlined />, 'activity-stat-icon activity-stat-icon-token', 'tokens', '#10b981', '日均消耗', avgDayTokens)}
        </Col>
        <Col xs={24} sm={8}>
          {renderStatCard('calls', '总请求数 (Calls)', <InteractionOutlined />, 'activity-stat-icon activity-stat-icon-request', 'requests', '#f59e0b', '日均请求', avgDayRequests)}
        </Col>
      </Row>

      {/* 成功率/错误统计行 */}
      {hasStatsLoaded && (
        <Row gutter={[16, 8]} style={{ marginBottom: 26 }}>
          <Col span={24}>
            <Card bordered={false} className="stat-card activity-stat-card">
              <Space size="large" wrap>
                <div>
                  <Text type="secondary" strong>成功率</Text>
                  <div>
                    <Text strong style={{
                      color: (statistics!.overall.success_rate ?? 100) >= 95 ? 'var(--monitor-success)' : 'var(--monitor-warn)',
                      fontSize: 24,
                    }}>
                      {statistics!.overall.success_rate?.toFixed(1) ?? '—'}%
                    </Text>
                  </div>
                </div>
                <div>
                  <Text type="secondary" strong>成功调用</Text>
                  <div><Text strong style={{ color: 'var(--monitor-success)', fontSize: 20 }}>{statistics!.overall.success_calls?.toLocaleString() ?? '—'}</Text></div>
                </div>
                <div>
                  <Text type="secondary" strong>错误调用</Text>
                  <div><Text strong style={{ color: '#ef4444', fontSize: 20 }}>{statistics!.overall.error_calls?.toLocaleString() ?? '—'}</Text></div>
                </div>
                <div>
                  <Text type="secondary" strong>平均延迟</Text>
                  <div><Text strong style={{ fontSize: 20 }}>{statistics!.overall.avg_duration_ms ? `${statistics!.overall.avg_duration_ms.toFixed(0)}ms` : '—'}</Text></div>
                </div>
                {statistics!.recent_errors && statistics!.recent_errors.length > 0 && (
                  <div>
                    <Text type="secondary" strong>最近错误</Text>
                    <div><Text strong style={{ color: '#ef4444', fontSize: 16 }}>{statistics!.recent_errors.length} 条</Text></div>
                  </div>
                )}
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      <div className="activity-section">
        <Title level={5} className="activity-section-title">时间序列分析</Title>
        {loading && !timeSeriesData ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <TimeSeriesChart timeRangeHours={timeRange} />
        )}
      </div>

      {/* 模型成本明细 */}
      {statistics?.by_model && statistics.by_model.length > 0 && (
        <div className="activity-section">
          <Title level={5} className="activity-section-title">模型成本明细</Title>
          <Table<ModelStatistics>
            dataSource={statistics.by_model}
            rowKey="model_id"
            size="small"
            pagination={false}
            columns={[
              {
                title: '模型', key: 'name', render: (_: any, r: ModelStatistics) => (
                  <Space><Tag color="blue">{r.provider_name}</Tag>{r.model_name}</Space>
                ),
              },
              { title: '调用次数', dataIndex: 'total_calls', sorter: (a, b) => a.total_calls - b.total_calls },
              { title: '成功率', key: 'rate', render: (_: any, r: ModelStatistics) => `${r.success_rate}%` },
              { title: 'Tokens', dataIndex: 'total_tokens', render: (v: number) => v.toLocaleString() },
              { title: '缓存创建', dataIndex: 'cache_creation_input_tokens', render: (v: number | undefined) => v ? v.toLocaleString() : '-' },
              { title: '缓存读取', dataIndex: 'cache_read_input_tokens', render: (v: number | undefined) => v ? v.toLocaleString() : '-' },
              { title: '成本 (USD)', dataIndex: 'total_cost', render: (v: number | null) => v != null ? `$${v.toFixed(6)}` : '-', defaultSortOrder: 'descend', sorter: (a, b) => (a.total_cost ?? 0) - (b.total_cost ?? 0) },
              { title: '平均延迟', dataIndex: 'avg_duration_ms', render: (v: number | null) => v != null ? `${v.toFixed(0)}ms` : '-' },
            ]}
          />
        </div>
      )}

      <div className="activity-section">
        <Title level={5} className="activity-section-title">最近调用历史</Title>
        <InvocationList
          startTime={dateRange[0]?.toDate()}
          endTime={dateRange[1]?.toDate()}
        />
      </div>
    </div>
  )
}

export default ActivityDashboard
