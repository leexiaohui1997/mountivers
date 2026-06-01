import { UserSchema } from '@mountivers/ai-team-shared'
import { useRequest } from 'ahooks'
import { App, Button, Card, Checkbox, Form, Input, Space, Typography, type CheckboxRef } from 'antd'
import { createSchemaFieldRule } from 'antd-zod'
import { useMemo, useRef } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'

import { getRememberState, removeRememberState, setRememberState } from './remember-helper'

import type z from 'zod'

import { login } from '@/api/user'
import { LOGIN_FALLBACK_PATH, REGIST_PATH } from '@/constants/config'
import { useInitContext } from '@/guards/Init/context'
import { setTokens } from '@/utils/token'

const formRule = createSchemaFieldRule(UserSchema)

export default function Login() {
  const { message } = App.useApp()
  const rememberPasswordRef = useRef<CheckboxRef>(null)
  const location: Location<{ from?: Location }> = useLocation()
  const navigate = useNavigate()
  const { refreshMe } = useInitContext()

  const initialValues: z.infer<typeof UserSchema> = useMemo(() => {
    const rememberState = getRememberState()
    return {
      username: rememberState?.username || '',
      password: rememberState?.password || '',
    }
  }, [])

  const { loading, runAsync: submit } = useRequest(
    async (values: z.infer<typeof UserSchema>) => {
      const rememberChecked = !!rememberPasswordRef.current?.input?.checked
      const tokens = await login(values)
      setTokens(tokens)
      await refreshMe()
      if (rememberChecked) {
        setRememberState(values)
      } else {
        removeRememberState()
      }
      navigate(location.state.from || LOGIN_FALLBACK_PATH, { replace: true })
    },
    {
      manual: true,
      debounceWait: 100,
      onError: (err) => {
        message.error(err.message)
      },
    },
  )

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50">
      <div className="p-6 w-120">
        <Card title="登录">
          <Form layout="vertical" initialValues={initialValues} onFinish={submit}>
            <Form.Item name="username" label="账号" rules={[formRule]}>
              <Input placeholder="请输入账号" />
            </Form.Item>

            <Form.Item name="password" label="密码" rules={[formRule]}>
              <Input.Password placeholder="请输入密码" />
            </Form.Item>

            <Form.Item label={null}>
              <div className="flex flex-col gap-4">
                <Space>
                  <Checkbox ref={rememberPasswordRef} defaultChecked>
                    记住密码
                  </Checkbox>
                </Space>

                <Button type="primary" htmlType="submit" loading={loading} block>
                  登录
                </Button>

                <div className="flex justify-center">
                  <Typography.Text>没有账号？</Typography.Text>
                  <Typography.Link href={REGIST_PATH}>去注册</Typography.Link>
                </div>
              </div>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  )
}
