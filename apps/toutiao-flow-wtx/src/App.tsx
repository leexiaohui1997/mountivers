import {
  Alert,
  App as AntdApp,
  Col,
  ConfigProvider,
  Empty,
  Layout,
  Row,
  Spin,
  Typography,
} from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useMemo, useState } from 'react'

import { WtxCard } from './components/WtxCard'
import { WtxDrawer } from './components/WtxDrawer'
import { useWtxReport } from './hooks/useWtxReport'

import type { WtxReportItem } from './types/wtx-report'

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

function ReportPage() {
  const { loading, report, error } = useWtxReport()
  const [selected, setSelected] = useState<WtxReportItem | null>(null)

  const generatedAt = useMemo(() => (report ? formatGeneratedAt(report.generatedAt) : ''), [report])

  return (
    <Layout className="wtx-layout">
      <Header className="wtx-header">
        <div>
          <Typography.Title level={2} className="wtx-title">
            今日微头条报表
          </Typography.Title>
          <Typography.Text type="secondary">
            {report ? `生成于 ${generatedAt} · 共 ${report.items.length} 条` : '等待报表数据'}
          </Typography.Text>
        </div>
      </Header>

      <Content className="wtx-content">
        {loading ? (
          <div className="wtx-center">
            <Spin size="large" />
          </div>
        ) : error ? (
          <Alert
            type="error"
            showIcon
            message="报表加载失败"
            description={error}
            className="wtx-alert"
          />
        ) : !report?.items.length ? (
          <Empty description="今天还没有生成微头条报表" className="wtx-empty" />
        ) : (
          <Row gutter={[16, 16]}>
            {report.items.map((item, index) => (
              <Col xs={24} lg={8} key={item.id}>
                <WtxCard item={item} index={index} onOpen={setSelected} />
              </Col>
            ))}
          </Row>
        )}
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
