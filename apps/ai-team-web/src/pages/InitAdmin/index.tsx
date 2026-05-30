import { SaveOutlined } from '@ant-design/icons'
import { RegistSchema } from '@mountivers/ai-team-shared'
import { useRequest } from 'ahooks'
import { Alert, App, Button, Card, Form, Input } from 'antd'
import { createSchemaFieldRule } from 'antd-zod'
import z from 'zod'

import { initAdmin } from '@/api/user'
import { useEnsureAdminContext } from '@/router/guards/ensure-admin/context'

const formRule = createSchemaFieldRule(RegistSchema)

export default function InitAdmin() {
  const { message } = App.useApp()
  const { refresh: refreshAdminContext } = useEnsureAdminContext()

  const { loading, runAsync } = useRequest(
    async (values: z.infer<typeof RegistSchema>) => {
      await initAdmin(values)
      message.success('设置成功')
    },
    {
      manual: true,
      onError: (err) => message.error(err.message),
      onSuccess: () => refreshAdminContext(),
    },
  )

  return (
    <div className="h-full overflow-auto flex flex-col items-center justify-center bg-gray-50">
      <div className="w-150 p-6">
        <Card title="设置管理员" classNames={{ body: 'flex flex-col gap-4' }}>
          <Alert title="请设置首个管理员帐号以开始使用系统" type="info" showIcon />
          <Form
            colon={false}
            labelCol={{ flex: '90px' }}
            onFinish={runAsync}
            initialValues={{ username: '', password: '', confirmPassword: '' }}
          >
            <Form.Item name="username" label="设置帐号" rules={[formRule]} required>
              <Input placeholder="请设置管理员账号" />
            </Form.Item>
            <Form.Item name="password" label="设置密码" rules={[formRule]} required>
              <Input.Password placeholder="请设置管理员密码" />
            </Form.Item>
            <Form.Item name="confirmPassword" label="确认密码" rules={[formRule]}>
              <Input.Password />
            </Form.Item>
            <Form.Item className="flex justify-center">
              <Button
                color="primary"
                variant="solid"
                htmlType="submit"
                loading={loading}
                icon={<SaveOutlined />}
              >
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  )
}
