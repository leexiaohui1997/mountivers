import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './scss/index.scss'
import { THEME } from './constants/theme.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={THEME}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
