import { Card, Descriptions, Typography } from 'antd'

import type { WtxStats } from '../types/wtx-stats'

interface StatsDetailProps {
  stats: WtxStats
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function StatsDetail({ stats }: StatsDetailProps) {
  return (
    <Card className="wtx-stats-card" bordered={false}>
      <Descriptions
        title={`昨日统计 · ${stats.date}`}
        bordered
        size="middle"
        column={{ xs: 1, sm: 2 }}
      >
        <Descriptions.Item label="发布成功">{stats.successCount}</Descriptions.Item>
        <Descriptions.Item label="概览落盘">{stats.overviewCount}</Descriptions.Item>
        <Descriptions.Item label="成稿落盘">{stats.articleCount}</Descriptions.Item>
        <Descriptions.Item label="生图落盘">{stats.imageCount}</Descriptions.Item>
        <Descriptions.Item label="合集创建">{stats.collectionCount}</Descriptions.Item>
        <Descriptions.Item label="书籍完结">{stats.bookDoneCount}</Descriptions.Item>
      </Descriptions>

      <Typography.Text type="secondary" className="wtx-stats-generated">
        生成于 {formatGeneratedAt(stats.generatedAt)}
      </Typography.Text>
    </Card>
  )
}
