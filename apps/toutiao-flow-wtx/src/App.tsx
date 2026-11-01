import {
  Alert,
  App as AntdApp,
  Col,
  ConfigProvider,
  Empty,
  Layout,
  Row,
  Spin,
  Tabs,
  Typography,
} from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useMemo, useState } from 'react'

import { StatsDetail } from './components/StatsDetail'
import { WtxCard } from './components/WtxCard'
import { WtxDrawer } from './components/WtxDrawer'
import { useWtxReport } from './hooks/useWtxReport'
import { useWtxStats } from './hooks/useWtxStats'

import type { WtxReport, WtxReportItem } from './types/wtx-report'
import type { WtxStats } from './types/wtx-stats'

import './index.css'

const { Header, Content } = Layout

function formatGeneratedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

interface TodayTabProps {
  loading: boolean
  error: string | null
  report: WtxReport | null
  onOpen: (item: WtxReportItem) => void
}

function TodayTab({ loading, error, report, onOpen }: TodayTabProps) {
  if (loading) {
    return (
      <div className="wtx-center">
        <Spin size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="微头条报表加载失败"
        description={error}
        className="wtx-alert"
      />
    )
  }

  if (!report?.items.length) {
    return <Empty description="今天还没有生成微头条报表" className="wtx-empty" />
  }

  return (
    <Row gutter={[16, 16]}>
      {report.items.map((item, index) => (
        <Col xs={24} lg={8} key={item.id}>
          <WtxCard item={item} index={index} onOpen={onOpen} />
        </Col>
      ))}
    </Row>
  )
}

interface StatsTabProps {
  loading: boolean
  error: string | null
  stats: WtxStats | null
}

function StatsTab({ loading, error, stats }: StatsTabProps) {
  if (loading) {
    return (
      <div className="wtx-center">
        <Spin size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="昨日统计加载失败"
        description={error}
        className="wtx-alert"
      />
    )
  }

  if (!stats) {
    return <Empty description="暂无昨日统计" className="wtx-empty" />
  }

  return <StatsDetail stats={stats} />
}

function ReportPage() {
  const { loading, report, error } = useWtxReport()
  const { loading: statsLoading, stats, error: statsError } = useWtxStats()
  const [selected, setSelected] = useState<WtxReportItem | null>(null)

  const generatedAt = useMemo(() => (report ? formatGeneratedAt(report.generatedAt) : ''), [report])

  return (
    <Layout className="wtx-layout">
      <Header className="wtx-header">
        <div>
          <Typography.Title level={2} className="wtx-title">
            微头条报表
          </Typography.Title>
          <Typography.Text type="secondary">
            {report
              ? `今日报表生成于 ${generatedAt} · 共 ${report.items.length} 条`
              : '等待今日报表数据'}
          </Typography.Text>
        </div>
      </Header>

      <Content className="wtx-content">
        <Tabs
          className="wtx-tabs"
          defaultActiveKey="today"
          items={[
            {
              key: 'today',
              label: '今日微头条',
              children: (
                <TodayTab loading={loading} error={error} report={report} onOpen={setSelected} />
              ),
            },
            {
              key: 'yesterday',
              label: '昨日统计',
              children: <StatsTab loading={statsLoading} error={statsError} stats={stats} />,
            },
          ]}
        />
      </Content>

      <WtxDrawer item={selected} onClose={() => setSelected(null)} />
    </Layout>
  )
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 12,
        },
      }}
    >
      <AntdApp>
        <ReportPage />
      </AntdApp>
    </ConfigProvider>
  )
}
