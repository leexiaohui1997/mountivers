import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'

import { THEME } from './constants/theme.ts'
import { router } from './router/index.tsx'
import './scss/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={THEME}>
      <App className="h-full">
        <RouterProvider router={router} />
      </App>
    </ConfigProvider>
  </StrictMode>,
)
