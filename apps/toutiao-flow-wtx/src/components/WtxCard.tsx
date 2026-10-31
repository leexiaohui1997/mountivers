import { CopyOutlined, EyeOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Card, Col, Image, Row, Space, Tag, Typography } from 'antd'

import { copyText } from '../utils/clipboard'

import type { WtxReportItem } from '../types/wtx-report'

interface WtxCardProps {
  item: WtxReportItem
  index: number
  onOpen: (item: WtxReportItem) => void
}

export function WtxCard({ item, index, onOpen }: WtxCardProps) {
  const { message } = AntdApp.useApp()

  const copyContent = async () => {
    const copied = await copyText(item.content)
    if (copied) {
      void message.success('文案已复制')
    } else {
      void message.warning('自动复制失败，已打开详情，请长按文案复制')
      onOpen(item)
    }
  }

  return (
    <Card className="wtx-card" variant="outlined">
      <div className="wtx-card-top">
        <span className="wtx-index">{String(index + 1).padStart(2, '0')}</span>
        <Tag color="blue" className="wtx-topic">
          {item.topic}
        </Tag>
      </div>

      <Typography.Paragraph className="wtx-excerpt" ellipsis={{ rows: 2, tooltip: item.content }}>
        {item.content}
      </Typography.Paragraph>

      <Image.PreviewGroup>
        <Row gutter={[8, 8]} className="wtx-image-grid">
          {item.images.map((image, imageIndex) => (
            <Col span={8} key={`${item.id}-${imageIndex}`}>
              <div className="wtx-image-cell">
                <Image
                  src={resolveAssetUrl(image)}
                  alt={`${item.topic} 配图 ${imageIndex + 1}`}
                  preview={{ mask: '预览' }}
                />
              </div>
            </Col>
          ))}
        </Row>
      </Image.PreviewGroup>

      <Space className="wtx-actions" size={8} wrap>
        <Button type="link" icon={<EyeOutlined />} onClick={() => onOpen(item)}>
          详情
        </Button>
        <Button type="primary" icon={<CopyOutlined />} onClick={() => void copyContent()}>
          复制文案
        </Button>
      </Space>
    </Card>
  )
}

export function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}/${url.replace(/^\//, '')}`
}
