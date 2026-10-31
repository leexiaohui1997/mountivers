import { CopyOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Col,
  Divider,
  Drawer,
  Image,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd'

import { copyText } from '../utils/clipboard'

import { resolveAssetUrl } from './WtxCard'

import type { WtxReportItem } from '../types/wtx-report'

interface WtxDrawerProps {
  item: WtxReportItem | null
  onClose: () => void
}

export function WtxDrawer({ item, onClose }: WtxDrawerProps) {
  const { message } = AntdApp.useApp()

  const copyContent = async () => {
    if (!item) return
    const copied = await copyText(item.content)
    if (copied) {
      void message.success('文案已复制')
    } else {
      void message.warning('自动复制失败，请打开详情后长按文案复制')
    }
  }

  return (
    <Drawer title="微头条详情" placement="right" width={560} open={Boolean(item)} onClose={onClose}>
      {item ? (
        <Space direction="vertical" size={16} className="wtx-detail">
          <Space size={8} wrap>
            <Tag color="blue">{item.topic}</Tag>
            <Typography.Text type="secondary">{item.bookTitle}</Typography.Text>
          </Space>

          <Typography.Paragraph className="wtx-detail-content">{item.content}</Typography.Paragraph>

          <Divider />

          <Image.PreviewGroup>
            <Row gutter={[8, 8]}>
              {item.images.map((image, index) => (
                <Col span={8} key={`${item.id}-detail-${index}`}>
                  <div className="wtx-detail-image">
                    <Image
                      src={resolveAssetUrl(image)}
                      alt={`${item.topic} 配图 ${index + 1}`}
                      width="100%"
                    />
                  </div>
                </Col>
              ))}
            </Row>
          </Image.PreviewGroup>

          <Button type="primary" icon={<CopyOutlined />} onClick={() => void copyContent()}>
            复制文案
          </Button>
        </Space>
      ) : null}
    </Drawer>
  )
}
