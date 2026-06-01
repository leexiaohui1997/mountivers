import { Button, Result, Space } from 'antd'
import { Link, useNavigate } from 'react-router'

import { HOME_PATH } from '@/constants/config'

export default function NotAdmin() {
  const navigate = useNavigate()

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <Result
        status={403}
        title="403"
        subTitle="暂无此页面访问权限"
        extra={
          <Space size="medium">
            <Link to={HOME_PATH} replace>
              <Button className="min-w-20" variant="solid" color="primary">
                首页
              </Button>
            </Link>

            <Button
              className="min-w-20"
              variant="filled"
              color="default"
              onClick={() => navigate(-1)}
            >
              返回
            </Button>
          </Space>
        }
      />
    </div>
  )
}
